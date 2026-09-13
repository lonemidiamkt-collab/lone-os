import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { execucaoAtual, contarEscrita } from "@/lib/obs/correlacao";
import { asciiSeguro } from "@/lib/obs/ator";

// Lazy server-side Supabase admin client (bypasses RLS).
// Must be lazy because env vars aren't available at Docker build time — only at runtime.
// Evaluating createClient at module import fails the Next.js "collect page data" step.

let _client: SupabaseClient | null = null;

/**
 * Todo request do client admin passa aqui (Fase 0A, 13/09/2026). Três coisas, nenhuma delas
 * muda o resultado da chamada:
 *   1. x-correlation-id / x-actor / x-actor-role → o PostgREST expõe em request.headers e o
 *      trigger de auditoria grava QUEM e em QUAL execução. Dentro de comExecucao() vem da execução;
 *      fora, do JWT que a própria request do painel trouxe (lib/obs/ator.ts).
 *   2. escrita (POST/PATCH/DELETE) conta na execução.
 *   3. status ≥ 400 do /rest/v1 vira console.error + Sentry mesmo que quem chamou ignore `error`
 *      (LONE-023, lib/obs/erro-postgrest.ts).
 */
async function fetchInstrumentado(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const metodo = (init?.method ?? "GET").toUpperCase();
  const e = execucaoAtual();
  try {
    if (e) {
      headers.set("x-correlation-id", e.id);
      if (e.ator) headers.set("x-actor", asciiSeguro(e.ator));
      if (e.papel) headers.set("x-actor-role", asciiSeguro(e.papel));
      if (metodo !== "GET" && metodo !== "HEAD") contarEscrita();
    } else if (/\/rest\/v1\//.test(url)) {
      const { atorDaRequest } = await import("@/lib/obs/ator");
      const a = await atorDaRequest();
      if (a) {
        headers.set("x-actor", asciiSeguro(a.email));
        if (a.papel) headers.set("x-actor-role", asciiSeguro(a.papel));
      }
    }
  } catch { /* instrumentação nunca impede a chamada */ }

  const res = await fetch(input, { ...init, headers });
  if (res.status >= 400) {
    try {
      const { deveReportar, reportarErroPostgrest } = await import("@/lib/obs/erro-postgrest");
      if (deveReportar(url, res.status)) void reportarErroPostgrest(url, metodo, res.clone());
    } catch { /* idem */ }
  }
  return res;
}


function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder";
  _client = createClient(url, key, { global: { fetch: fetchInstrumentado } });
  return _client;
}

// Proxy preserves the existing `import { supabaseAdmin } from "@/lib/supabase/server"`
// call sites without requiring any change — method access goes through getClient() on demand.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
