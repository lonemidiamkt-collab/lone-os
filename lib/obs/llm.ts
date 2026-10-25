// lib/obs/llm.ts — cada chamada de modelo deixa um recibo: modelo, tokens, custo, quanto demorou,
// de onde veio e em qual execução. Alimenta a execução aberta (agent_runs) e a tabela llm_calls,
// que existe mesmo sem execução — nem todo ponto que chama a OpenAI roda dentro de um comExecucao().
//
// ETIQUETA OBRIGATÓRIA (25/10/2026). Até aqui, chamada sem rótulo ganhava o nome do arquivo que
// aparecia na pilha. No servidor de produção a pilha é a do código COMPILADO, então o nome saía como
// "app/.next/server/app/api/ai/morning-briefing/route" — ~1.400 chamadas por mês com o nome de uma
// tela que nem está montada (eram, por exemplo, a Releitura de domingo). Agora `origem` é a etiqueta
// do agente no catálogo (lib/agentes/catalogo.ts): o tipo não aceita outra e
// tests/agentes-etiqueta.test.ts quebra se alguma chamada sair sem.

import { execucaoAtual, registrarUsoLlm } from "@/lib/obs/correlacao";
import { custoUsd, precoDe, type UsageOpenAi } from "@/lib/obs/preco-llm";
import type { OrigemIa } from "@/lib/agentes/catalogo";

export interface ChamadaLlm {
  modelo: string;
  usage?: UsageOpenAi | null;
  ms: number;
  ok: boolean;
  erro?: string | null;
  /** Quem chamou: a etiqueta do agente no catálogo ("cs:classificador", "radar:candidatos"). */
  origem: OrigemIa;
  /** Endpoint: chat | responses | transcription | vision. */
  tipo?: string;
}

/** O que vai para llm_calls quando, mesmo assim, a etiqueta chega vazia (só por código sem tipo). */
export const SEM_ETIQUETA = "sem-etiqueta";

/** Custo por chamada de modelos cobrados por unidade, não por token (US$). Estimativa. */
// gpt-4o-mini-tts: ~US$ 0,015 por minuto de áudio; um aviso falado tem 5–10 s (lib/avisos/audio-server.ts).
const CUSTO_FIXO: Record<string, number> = { "gpt-image-1": 0.063, "gpt-image-1:high": 0.25, "whisper-1": 0.006, "gpt-4o-mini-tts": 0.002 };

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
    origem: etiquetaDa(c.origem),
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

function etiquetaDa(origem: string | null | undefined): string {
  const o = (origem ?? "").trim();
  if (o) return o;
  console.error("[llm] chamada de IA sem etiqueta — toda chamada precisa da etiqueta do agente (lib/agentes/catalogo.ts)");
  return SEM_ETIQUETA;
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
