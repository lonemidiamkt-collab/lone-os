// lib/obs/llm.ts — cada chamada de modelo deixa um recibo: modelo, tokens, custo, quanto demorou,
// de onde veio e em qual execução. Alimenta a execução aberta (agent_runs) e a tabela llm_calls,
// que existe mesmo sem execução — 47 pontos chamam a OpenAI e nem todos rodam dentro de um
// comExecucao() ainda.

import { execucaoAtual, registrarUsoLlm } from "@/lib/obs/correlacao";
import { custoUsd, precoDe, type UsageOpenAi } from "@/lib/obs/preco-llm";

export interface ChamadaLlm {
  modelo: string;
  usage?: UsageOpenAi | null;
  ms: number;
  ok: boolean;
  erro?: string | null;
  /** Quem chamou ("cs:classificar", "radar:descoberta"). Sem isso, a origem da execução, ou "?". */
  origem?: string | null;
  /** Endpoint: chat | responses | transcription | vision. */
  tipo?: string;
}

// ORIGEM PELA PILHA (16/09): 66 chamadas de gpt-4o em 3 dias chegaram sem origem nem execução —
// a fatia mais cara ficou anônima. Sem rótulo, o arquivo que chamou vira a origem ("lib/cs/cobranca").
function origemDaPilha(): string | null {
  const pilha = new Error().stack ?? "";
  for (const linha of pilha.split("\n").slice(1)) {
    const m = linha.match(/\/(lib|app|tests|stores|components)\/([^:)]+?)\.(?:ts|tsx|js)/);
    if (m && !m[2].startsWith("obs/") && !m[2].startsWith("ai/openai")) return `${m[1]}/${m[2]}`;
  }
  return null;
}

/** Custo por chamada de modelos cobrados por unidade, não por token (US$). Estimativa. */
const CUSTO_FIXO: Record<string, number> = { "gpt-image-1": 0.063, "gpt-image-1:high": 0.25, "whisper-1": 0.006 };

export function registrarChamadaLlm(c: ChamadaLlm): void {
  const e = execucaoAtual();
  const custo = c.usage ? custoUsd(c.modelo, c.usage) : (CUSTO_FIXO[c.modelo] ?? custoUsd(c.modelo, c.usage));
  const preco = precoDe(c.modelo);
  const u = c.usage ?? {};
  registrarUsoLlm({
    modelo: c.modelo,
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
    custoUsd: custo,
    ms: c.ms,
    ok: c.ok,
  });
  void gravar({
    run_id: e?.id ?? null,
    origem: c.origem ?? e?.origem ?? origemDaPilha(),
    tipo: c.tipo ?? "chat",
    modelo: c.modelo,
    tokens_prompt: u.prompt_tokens ?? 0,
    tokens_completion: u.completion_tokens ?? 0,
    tokens_cached: u.prompt_tokens_details?.cached_tokens ?? 0,
    custo_usd: custo,
    custo_estimado: !!preco?.estimado || (!c.usage && c.modelo in CUSTO_FIXO),
    duracao_ms: Math.round(c.ms),
    ok: c.ok,
    erro: c.erro ? String(c.erro).slice(0, 300) : null,
  });
}

async function gravar(linha: Record<string, unknown>): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const { error } = await supabaseAdmin.from("llm_calls").insert(linha);
    if (error) console.error("[llm] não gravei llm_calls:", error.message);
  } catch (err) {
    console.error("[llm] não gravei llm_calls:", err instanceof Error ? err.message : err);
  }
}
