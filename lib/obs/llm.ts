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

export function registrarChamadaLlm(c: ChamadaLlm): void {
  const e = execucaoAtual();
  const custo = custoUsd(c.modelo, c.usage);
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
    origem: c.origem ?? e?.origem ?? null,
    tipo: c.tipo ?? "chat",
    modelo: c.modelo,
    tokens_prompt: u.prompt_tokens ?? 0,
    tokens_completion: u.completion_tokens ?? 0,
    tokens_cached: u.prompt_tokens_details?.cached_tokens ?? 0,
    custo_usd: custo,
    custo_estimado: !!preco?.estimado,
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
