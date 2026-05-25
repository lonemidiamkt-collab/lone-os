// AI response cache — hash-keyed, TTL-based.
//
// Uso:
//   const { response, hit } = await aiCache.getOrFetch({
//     category: "analyze-ads",
//     model: "gpt-4o",
//     payload: { clientId, campaigns, dateRange },
//     ttlMinutes: 60 * 24,          // 24h pra analyses
//     bucketGranularity: "day",      // key inclui data atual → invalida ao virar o dia
//     fetcher: async () => { ... chamada real pra OpenAI ... },
//   });
//
// Miss na cache = chama fetcher e persiste. Hit = devolve direto.
// Errors no fetcher propagam. Errors no cache (DB down) são logados mas não quebram a call.

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface AICacheParams<T> {
  category: string;
  model: string;
  payload: unknown;
  ttlMinutes: number;
  bucketGranularity?: "hour" | "day" | "none";
  fetcher: () => Promise<{ response: T; tokensPrompt?: number; tokensCompletion?: number }>;
}

export interface AICacheResult<T> {
  response: T;
  hit: boolean;
  key: string;
}

function stableStringify(value: unknown): string {
  // JSON.stringify com chaves ordenadas recursivamente (pra hash estável).
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function bucketSuffix(granularity: "hour" | "day" | "none"): string {
  if (granularity === "none") return "";
  const now = new Date();
  if (granularity === "day") return now.toISOString().slice(0, 10);
  if (granularity === "hour") return now.toISOString().slice(0, 13);
  return "";
}

function computeKey(category: string, model: string, payload: unknown, bucket: string): { key: string; promptHash: string } {
  const payloadStr = stableStringify(payload);
  const promptHash = crypto.createHash("sha256").update(payloadStr).digest("hex").slice(0, 16);
  const keyRaw = `${category}|${model}|${promptHash}|${bucket}`;
  const key = crypto.createHash("sha256").update(keyRaw).digest("hex");
  return { key, promptHash };
}

export const aiCache = {
  async getOrFetch<T>(params: AICacheParams<T>): Promise<AICacheResult<T>> {
    const bucket = bucketSuffix(params.bucketGranularity ?? "day");
    const { key, promptHash } = computeKey(params.category, params.model, params.payload, bucket);

    // 1. Lookup
    try {
      const { data, error } = await supabaseAdmin
        .from("ai_cache")
        .select("response, expires_at")
        .eq("key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!error && data) {
        return { response: data.response as T, hit: true, key };
      }
    } catch (err) {
      console.warn("[aiCache] lookup failed, falling through to fetcher:", err);
    }

    // 2. Miss → chama fetcher
    const { response, tokensPrompt, tokensCompletion } = await params.fetcher();

    // 3. Persiste (fire-and-forget — não bloqueia resposta pro usuário)
    const expiresAt = new Date(Date.now() + params.ttlMinutes * 60 * 1000).toISOString();
    supabaseAdmin.from("ai_cache").upsert({
      key,
      category: params.category,
      model: params.model,
      prompt_hash: promptHash,
      response,
      tokens_prompt: tokensPrompt ?? null,
      tokens_completion: tokensCompletion ?? null,
      expires_at: expiresAt,
    }, { onConflict: "key" }).then(({ error }) => {
      if (error) console.warn("[aiCache] upsert failed:", error.message);
    });

    return { response, hit: false, key };
  },

  async invalidate(category: string, payloadMatcher: (payload: unknown) => boolean): Promise<number> {
    // Uso raro: pra invalidar quando um dado-fonte muda (ex: campanha editada).
    // Simples: apaga tudo de uma categoria. Refinamento futuro: busca por payload match.
    const { error, count } = await supabaseAdmin
      .from("ai_cache")
      .delete({ count: "exact" })
      .eq("category", category);
    if (error) {
      console.warn("[aiCache] invalidate failed:", error.message);
      return 0;
    }
    void payloadMatcher; // reservado pra refinamento futuro
    return count ?? 0;
  },
};
