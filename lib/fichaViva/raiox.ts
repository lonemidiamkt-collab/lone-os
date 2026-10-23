// lib/fichaViva/raiox.ts — o Raio-X que o cliente responde pelo link não pode se perder. Módulo PURO.
//
// O PROBLEMA (auditoria de erro recuperável, 21/10/2026, item 1.3): as respostas moravam dentro da
// aba — trocar para "Meu Crescimento" e voltar, ou recarregar, apagava tudo. Quem já tinha enviado e
// voltava para "atualizar" achava o formulário VAZIO; respondia só o que lembrava, e cada envio virava
// uma linha nova — a mais recente (a única que o time lê) ficava com metade das respostas.
//
// Agora: (1) o estado fica no componente de cima, (2) rascunho no aparelho (não há rascunho no
// servidor para a Ficha Viva), (3) o link do dono abre com a última resposta enviada, e (4) o envio
// ATUALIZA a resposta que o time ainda não analisou em vez de criar outra linha.

import { DIAG_QUESTIONS } from "@/lib/fichaViva/questions";

export type Respostas = Record<string, string>;
export const MAX_RESPOSTA = 1500;
const IDS = new Set(DIAG_QUESTIONS.map((q) => q.id));

/** Só ids conhecidos, só texto, aparado e com teto. Resposta vazia não entra. */
export function normalizarRespostas(raw: unknown): Respostas {
  const out: Respostas = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!IDS.has(id) || typeof val !== "string") continue;
    const limpo = val.trim().slice(0, MAX_RESPOSTA);
    if (limpo) out[id] = limpo;
  }
  return out;
}

export function respostasIguais(a: Respostas | null | undefined, b: Respostas | null | undefined): boolean {
  const x = normalizarRespostas(a ?? {});
  const y = normalizarRespostas(b ?? {});
  const kx = Object.keys(x);
  if (kx.length !== Object.keys(y).length) return false;
  return kx.every((k) => x[k] === y[k]);
}

export interface UltimaResposta { id: string; respostas: Respostas | null; status: string | null }

export type Gravacao =
  | { acao: "vazio" }
  | { acao: "igual"; id: string }
  | { acao: "atualizar"; id: string; respostas: Respostas }
  | { acao: "inserir"; respostas: Respostas };

/**
 * O que gravar quando o cliente envia.
 *  - Link do DONO ("full"): o formulário abriu com a última resposta, então o que chega é o estado
 *    inteiro que ele quer — substitui (e apagar um campo apaga mesmo).
 *  - Link do VENDEDOR ("raiox", sem PIN): ele não vê a resposta anterior (pode ter meta de
 *    faturamento do dono), então o que chega COMPLETA a anterior — campo em branco não apaga nada.
 *  - A resposta que o time ainda não analisou é ATUALIZADA (nada de linha duplicada). Já analisada,
 *    entra como versão nova: a análise antiga continua presa às respostas que ela leu.
 */
export function decidirGravacao(ultima: UltimaResposta | null, novasBrutas: unknown, scope: "full" | "raiox"): Gravacao {
  const novas = normalizarRespostas(novasBrutas);
  const anteriores = normalizarRespostas(ultima?.respostas ?? {});
  const finais = scope === "raiox" ? { ...anteriores, ...novas } : novas;
  if (!Object.keys(novas).length || !Object.keys(finais).length) return { acao: "vazio" };
  if (ultima && respostasIguais(anteriores, finais)) return { acao: "igual", id: ultima.id };
  if (ultima && ultima.status !== "analisado") return { acao: "atualizar", id: ultima.id, respostas: finais };
  return { acao: "inserir", respostas: finais };
}

// ── Rascunho no aparelho ───────────────────────────────────────────────────────
// localStorage pode não existir, estar cheio ou lançar (aba anônima, Safari com bloqueio): tudo
// aqui engole o erro e diz se conseguiu, para a tela avisar "envie antes de fechar".

export interface Armazenamento {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
export interface Rascunho { respostas: Respostas; salvoEm: string }

export const chaveRascunho = (token: string) => `fichaviva:raiox:${token}`;

export function lerRascunho(arm: Armazenamento | null | undefined, token: string): Rascunho | null {
  if (!arm) return null;
  try {
    const raw = arm.getItem(chaveRascunho(token));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<Rascunho>;
    const respostas = normalizarRespostas(j?.respostas);
    if (!Object.keys(respostas).length || typeof j?.salvoEm !== "string") return null;
    return { respostas, salvoEm: j.salvoEm };
  } catch { return null; }
}

/** true = guardou. Respostas vazias apagam o rascunho (não deixa lixo). */
export function salvarRascunho(arm: Armazenamento | null | undefined, token: string, respostas: Respostas, agora = new Date()): boolean {
  if (!arm) return false;
  try {
    const limpas = normalizarRespostas(respostas);
    if (!Object.keys(limpas).length) { arm.removeItem(chaveRascunho(token)); return true; }
    arm.setItem(chaveRascunho(token), JSON.stringify({ respostas: limpas, salvoEm: agora.toISOString() }));
    return true;
  } catch { return false; }
}

export function apagarRascunho(arm: Armazenamento | null | undefined, token: string): void {
  try { arm?.removeItem(chaveRascunho(token)); } catch { /* sem armazenamento: nada a apagar */ }
}

export type OrigemRespostas = "rascunho" | "enviadas" | "vazio";

/**
 * Com o que o formulário abre. Rascunho só vence se for MAIS NOVO que o último envio e diferente
 * dele — rascunho velho de antes de um envio feito em outro aparelho não pode apagar o enviado.
 */
export function escolherInicio(params: {
  rascunho: Rascunho | null;
  enviadas: Respostas | null | undefined;
  enviadasEm: string | null | undefined;
}): { respostas: Respostas; origem: OrigemRespostas } {
  const enviadas = normalizarRespostas(params.enviadas ?? {});
  const temEnviadas = Object.keys(enviadas).length > 0;
  const r = params.rascunho;
  if (r && Object.keys(r.respostas).length) {
    const maisNovo = !params.enviadasEm || new Date(r.salvoEm).getTime() > new Date(params.enviadasEm).getTime();
    if (maisNovo && !respostasIguais(r.respostas, temEnviadas ? enviadas : {})) {
      return { respostas: r.respostas, origem: "rascunho" };
    }
  }
  if (temEnviadas) return { respostas: enviadas, origem: "enviadas" };
  return { respostas: {}, origem: "vazio" };
}
