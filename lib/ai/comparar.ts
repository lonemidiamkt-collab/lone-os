// lib/ai/comparar.ts — reenvia amostras reais (lib/ai/amostra.ts) a um modelo candidato e mede.
//
// POR QUE (leva 1-M, 26/11/2026). A troca do gpt-4o/4o-mini (saem em 14/01/2027) é por agente, com a
// saída comparada. Aqui: mesmo pedido, modelo trocado, contrato de parâmetros ajustado (o candidato pode
// ser de raciocínio: max_completion_tokens, sem temperature). Mede JSON válido, campos de primeiro
// nível iguais à resposta atual, tempo e custo. Roda no servidor; o texto fica no banco.
// Julgamento de tom/qualidade é humano: a tela mostra lado a lado.

import { randomUUID } from "node:crypto";
import { limiteDeSaida } from "@/lib/ai/modelos";
import { registrarChamadaLlm } from "@/lib/obs/llm";
import { custoUsd } from "@/lib/obs/preco-llm";

export const MAX_POR_LOTE = 50;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const AO_MESMO_TEMPO = 3;

/** O mesmo pedido, para o candidato: troca o modelo e refaz o limite no contrato dele. */
export function corpoParaCandidato(corpo: Record<string, unknown>, candidato: string): Record<string, unknown> {
  const { max_tokens, max_completion_tokens, temperature, ...resto } = corpo;
  const limite = Number(max_completion_tokens ?? max_tokens ?? 2048) || 2048;
  const temp = typeof temperature === "number" ? temperature : 0;
  return { ...resto, model: candidato, ...limiteDeSaida(candidato, limite, temp) };
}

function jsonOuNull(t: string | null | undefined): unknown {
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** json_valido: o candidato devolveu JSON. campos_iguais: fração dos campos da resposta atual iguais no candidato. */
export function compararSaidas(atual: string | null, candidato: string | null): { json_valido: boolean; campos_iguais: number | null } {
  const b = jsonOuNull(candidato);
  const a = jsonOuNull(atual);
  const json_valido = b !== null;
  if (!a || typeof a !== "object" || Array.isArray(a) || !b || typeof b !== "object") return { json_valido, campos_iguais: null };
  const chaves = Object.keys(a as object);
  if (!chaves.length) return { json_valido, campos_iguais: null };
  const iguais = chaves.filter((k) => JSON.stringify((a as Record<string, unknown>)[k]) === JSON.stringify((b as Record<string, unknown>)[k])).length;
  return { json_valido, campos_iguais: Math.round((iguais / chaves.length) * 10_000) / 10_000 };
}

interface LinhaAmostra { id: string; corpo: Record<string, unknown>; resposta: string | null }

async function reenviar(a: LinhaAmostra, candidato: string, lote: string, key: string): Promise<void> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const t0 = Date.now();
  let ok = false, resposta: string | null = null, erro: string | null = null;
  let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined;
  try {
    const r = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(corpoParaCandidato(a.corpo, candidato)),
      signal: AbortSignal.timeout(120_000),
    });
    const j = await r.json().catch(() => null) as { choices?: { message?: { content?: string; refusal?: string } }[]; usage?: typeof usage; error?: { message?: string } } | null;
    usage = j?.usage;
    const msg = j?.choices?.[0]?.message;
    ok = r.ok && !!msg?.content;
    resposta = msg?.content ?? null;
    erro = r.ok ? (msg?.refusal ? `refusal: ${msg.refusal}` : msg?.content ? null : "resposta vazia (limite gasto no raciocínio?)") : (j?.error?.message ?? `HTTP ${r.status}`);
  } catch (e) {
    erro = e instanceof Error ? e.message : "erro de conexão";
  }
  const ms = Date.now() - t0;
  registrarChamadaLlm({ modelo: candidato, usage, ms, ok, erro, origem: "ia:comparar-modelos", tipo: "chat" });
  const { json_valido, campos_iguais } = compararSaidas(a.resposta, resposta);
  const { error } = await supabaseAdmin.from("llm_comparacoes").insert({
    lote, amostra_id: a.id, candidato, ok, resposta, erro: erro ? erro.slice(0, 300) : null, duracao_ms: ms,
    tokens_prompt: usage?.prompt_tokens ?? 0, tokens_completion: usage?.completion_tokens ?? 0,
    custo_usd: custoUsd(candidato, usage ?? null), json_valido: ok ? json_valido : false, campos_iguais,
  });
  if (error) console.error("[comparar] não gravei:", error.message);
}

/** Começa um lote: devolve o id já, e reenvia em segundo plano (3 de cada vez). */
export async function iniciarLote(p: { origem: string; candidato: string; limite: number }): Promise<{ ok: true; lote: string; amostras: number } | { ok: false; erro: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, erro: "OPENAI_API_KEY ausente" };
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data, error } = await supabaseAdmin.from("llm_amostras").select("id, corpo, resposta")
    .eq("origem", p.origem).eq("ok", true).eq("reenviavel", true)
    .order("created_at", { ascending: false }).limit(Math.min(MAX_POR_LOTE, Math.max(1, p.limite)));
  if (error) return { ok: false, erro: `Não li as amostras: ${error.message}` };
  const fila = (data ?? []) as LinhaAmostra[];
  if (!fila.length) return { ok: false, erro: "Nenhuma amostra reenviável desse agente ainda (o interruptor ia_amostra está ligado?)." };
  const lote = randomUUID();
  void (async () => {
    for (let i = 0; i < fila.length; i += AO_MESMO_TEMPO) {
      await Promise.all(fila.slice(i, i + AO_MESMO_TEMPO).map((a) => reenviar(a, p.candidato, lote, key).catch((e) => console.error("[comparar]", e))));
    }
  })();
  return { ok: true, lote, amostras: fila.length };
}

export interface ResumoDoLote { lote: string; candidato: string | null; feitas: number; responderam: number; jsonValido: number; camposIguaisMedia: number | null; msMedio: number | null; custoUsd: number }

/** Números do lote — sem texto. */
export function resumir(lote: string, linhas: { candidato: string; ok: boolean; json_valido: boolean | null; campos_iguais: number | string | null; duracao_ms: number | null; custo_usd: number | string | null }[]): ResumoDoLote {
  const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000 : null);
  const campos = linhas.map((l) => (l.campos_iguais === null ? null : Number(l.campos_iguais))).filter((x): x is number => x !== null);
  return {
    lote, candidato: linhas[0]?.candidato ?? null, feitas: linhas.length,
    responderam: linhas.filter((l) => l.ok).length, jsonValido: linhas.filter((l) => l.json_valido).length,
    camposIguaisMedia: media(campos), msMedio: media(linhas.map((l) => l.duracao_ms ?? 0)),
    custoUsd: Math.round(linhas.reduce((s, l) => s + Number(l.custo_usd ?? 0), 0) * 1e6) / 1e6,
  };
}
