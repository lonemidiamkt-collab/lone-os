// lib/obs/correlacao.ts — UMA EXECUÇÃO, UM ID, e tudo que ela tocou responde por ele. Fase 0A.
//
// Até 13/09/2026 não havia como responder "por que o agente fez isso?": a mensagem que entrou, a
// chamada à OpenAI, a linha gravada no banco e a mensagem que saiu eram quatro registros soltos,
// em quatro tabelas, sem nada que os ligasse. E "quanto o Loninho custa?" era uma conta de
// cabeça sobre a fatura da OpenAI.
//
// Agora: comExecucao() abre um contexto (AsyncLocalStorage) com um id. Enquanto a execução roda,
//   · o client admin do Supabase manda x-correlation-id (e x-actor) em toda request → o trigger
//     de auditoria grava o id na linha (lib/supabase/server.ts);
//   · o helper da OpenAI soma tokens e custo aqui (lib/ai/openai.ts);
//   · o envio de WhatsApp grava o id em cs_outbound (lib/cs/notify.ts).
// No fim, a execução inteira vira UMA linha em agent_runs: origem, quem disparou, duração,
// chamadas, tokens, custo, o que saiu e o que foi anotado.
//
// Fora de um comExecucao() nada disso quebra: os helpers checam `execucaoAtual()` e seguem.

import { AsyncLocalStorage } from "async_hooks";

// Este módulo chega ao bundle do NAVEGADOR por tabela: lib/supabase/queries.ts importa
// lib/supabase/server.ts (LONE-004), que importa este. Lá, "async_hooks" resolve para vazio
// (next.config: fallback) e AsyncLocalStorage é undefined — o contexto vira no-op e nada quebra.
// No servidor, é o AsyncLocalStorage de verdade.
const als: AsyncLocalStorage<Execucao> | null =
  typeof AsyncLocalStorage === "function" ? new AsyncLocalStorage<Execucao>() : null;
const novoId = () => globalThis.crypto.randomUUID();

export interface UsoLlm {
  modelo: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  custoUsd: number | null;
  ms: number;
  ok: boolean;
}

export interface Execucao {
  /** correlation id — chave de agent_runs, e o que o resto grava para apontar de volta. */
  id: string;
  /** "inbound", "cron:status-clientes", "api:clients/update"… */
  origem: string;
  /** Quem disparou: nome/e-mail de quem é do time, ou "agente"/"cron" quando não há pessoa. */
  ator: string | null;
  papel: string | null;
  iniciadoEm: number;
  llm: UsoLlm[];
  envios: number;
  escritas: number;
  notas: string[];
  extra: Record<string, unknown>;
}

export function execucaoAtual(): Execucao | null { return als?.getStore() ?? null; }
export function idCorrelacao(): string | null { return als?.getStore()?.id ?? null; }

/** Anota o que aconteceu, em uma linha ("demanda criada p/ Quero Tintas"). Sem execução, ignora. */
export function anotar(nota: string): void {
  const e = als?.getStore();
  if (e && e.notas.length < 40) e.notas.push(nota.slice(0, 200));
}

/** Define quem está por trás da execução, quando só se descobre no meio (inbound: depois de resolver o remetente). */
export function definirAtor(ator: string | null, papel?: string | null): void {
  const e = als?.getStore();
  if (!e) return;
  e.ator = ator;
  if (papel !== undefined) e.papel = papel;
}

export function registrarUsoLlm(u: UsoLlm): void { als?.getStore()?.llm.push(u); }
export function contarEnvio(): void { const e = als?.getStore(); if (e) e.envios++; }
export function contarEscrita(): void { const e = als?.getStore(); if (e) e.escritas++; }

export interface AberturaDeExecucao {
  origem: string;
  ator?: string | null;
  papel?: string | null;
  /** Reaproveita um id vindo de fora (ex.: header x-correlation-id de quem chamou). */
  id?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Roda `fn` dentro de uma execução e, ao final (sucesso ou erro), grava agent_runs.
 * Se `fn` devolve um Response com JSON, o corpo entra em `resultado` — o inbound tem ~40 returns
 * com {ok, skip|classified…}, e é exatamente o resumo que se quer sem tocar em cada um.
 */
export async function comExecucao<T>(p: AberturaDeExecucao, fn: (e: Execucao) => Promise<T>): Promise<T> {
  const e: Execucao = {
    id: p.id && /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : novoId(),
    origem: p.origem, ator: p.ator ?? null, papel: p.papel ?? null,
    iniciadoEm: Date.now(), llm: [], envios: 0, escritas: 0, notas: [], extra: p.extra ?? {},
  };
  let erro: string | null = null;
  let resultado: unknown = null;
  try {
    const r = als ? await als.run(e, () => fn(e)) : await fn(e);
    resultado = await resumoDoRetorno(r);
    return r;
  } catch (err) {
    erro = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 500) : String(err).slice(0, 500);
    throw err;
  } finally {
    // Fora do als.run: este insert não é "escrita da execução", e não deve levar o header dela.
    void gravar(e, erro, resultado);
  }
}

async function resumoDoRetorno(r: unknown): Promise<unknown> {
  if (r instanceof Response) {
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return { status: r.status };
    try { return { status: r.status, ...(await r.clone().json()) }; } catch { return { status: r.status }; }
  }
  if (r === undefined || r === null) return null;
  if (typeof r === "object") return r;
  return { valor: r };
}

export function totais(e: Execucao) {
  const t = { chamadas: e.llm.length, prompt: 0, completion: 0, cached: 0, custo: 0, custoConhecido: true, modelos: new Set<string>() };
  for (const u of e.llm) {
    t.prompt += u.promptTokens; t.completion += u.completionTokens; t.cached += u.cachedTokens;
    if (u.custoUsd === null) t.custoConhecido = false; else t.custo += u.custoUsd;
    t.modelos.add(u.modelo);
  }
  return t;
}

async function gravar(e: Execucao, erro: string | null, resultado: unknown): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const t = totais(e);
    const { error } = await supabaseAdmin.from("agent_runs").insert({
      id: e.id, origem: e.origem, ator: e.ator, papel: e.papel,
      iniciado_em: new Date(e.iniciadoEm).toISOString(), duracao_ms: Date.now() - e.iniciadoEm,
      chamadas_llm: t.chamadas, tokens_prompt: t.prompt, tokens_completion: t.completion, tokens_cached: t.cached,
      custo_usd: t.chamadas ? Number(t.custo.toFixed(6)) : 0, custo_completo: t.custoConhecido,
      modelos: [...t.modelos], envios: e.envios, escritas: e.escritas,
      notas: e.notas.length ? e.notas : null, resultado: resultado ?? null, extra: Object.keys(e.extra).length ? e.extra : null,
      erro,
    });
    if (error) console.error("[execucao] não gravei agent_runs:", error.message);
  } catch (err) {
    console.error("[execucao] não gravei agent_runs:", err instanceof Error ? err.message : err);
  }
}
