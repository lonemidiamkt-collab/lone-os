// lib/conteudo/legendas-lote.ts — LEGENDAS EM LOTE (Leva 7B, N12): a semana de um cliente com a
// legenda de cada card em RASCUNHO, editável antes de gravar.
//
// Já existia /api/cs/legendas-em-lote (09/08), que escreve e GRAVA direto, só em card sem legenda —
// feito para destravar 16 artes num domingo. Aqui é o uso do dia a dia: o social vê a semana
// inteira, ajusta o texto e só então salva nos cards. A IA é a mesma (lib/cs/legenda.ts, no tom e
// com o briefing do cliente); o que muda é que nada é gravado sem a pessoa ler.
//
// Regra nº 1 do guia de legendas: toda legenda fecha com o contato. A IA é instruída a fazer isso,
// mas instrução não é garantia — aqui o bloco de contato é conferido e, se faltar, colocado no fim.
//
// Módulo puro (testado em tests/conteudo-legendas-lote.test.ts).

import { segundaDaSemana } from "./lacunas";
import { somarDias } from "./no-ar";

/** Teto de cards por semana numa geração (cada um é uma chamada de IA). */
export const MAX_CARDS_POR_LOTE = 12;

export interface RascunhoLegenda {
  cardId: string;
  titulo: string;
  data: string | null;
  formato: string;
  legenda: string;
  hashtags: string;
  /** O card já tinha legenda (salvar substitui). */
  legendaAtual: string | null;
  /** O bloco de contato foi acrescentado aqui (a IA não fechou com ele). */
  contatoAcrescentado: boolean;
  erro?: string;
}

/** O contato da ficha do guia de legendas ("• CONTATO (fechar a legenda com isto): …"). */
export function contatoDaFicha(ficha: string | null | undefined): string | null {
  const m = (ficha ?? "").match(/CONTATO[^:]*:\s*(.+)/);
  const c = m?.[1]?.trim();
  if (!c || /a confirmar/i.test(c)) return null;
  return c;
}

/**
 * O bloco de contato do cliente, do mais curado para o mais cru: a ficha do guia de legendas, o
 * contato do briefing e, por fim, o endereço e o telefone do cadastro.
 */
export function blocoDeContato(p: { ficha?: string | null; briefingContato?: string | null; endereco?: string | null; telefone?: string | null }): string | null {
  const daFicha = contatoDaFicha(p.ficha);
  if (daFicha) return daFicha;
  const doBriefing = (p.briefingContato ?? "").trim();
  if (doBriefing) return doBriefing;
  const partes = [(p.endereco ?? "").trim(), (p.telefone ?? "").trim()].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

const digitos = (s: string) => s.replace(/\D/g, "");
const simples = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A legenda já traz o contato? (algum telefone do bloco, ou o começo do endereço). */
export function temContato(legenda: string, contato: string): boolean {
  const telefones = contato.match(/\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/g) ?? [];
  const dLegenda = digitos(legenda);
  if (telefones.some((t) => { const d = digitos(t); return d.length >= 8 && dLegenda.includes(d.slice(-8)); })) return true;
  const inicio = simples(contato).split(" ").slice(0, 3).join(" ");
  return inicio.length >= 8 && simples(legenda).includes(inicio);
}

/** Fecha a legenda com o contato quando ela ainda não traz. */
export function fecharComContato(legenda: string, contato: string | null): { texto: string; acrescentado: boolean } {
  const t = legenda.trimEnd();
  if (!contato || !t.trim() || temContato(t, contato)) return { texto: t, acrescentado: false };
  return { texto: `${t}\n\n${contato}`, acrescentado: true };
}

/** Segunda a domingo da semana que contém `ymd`. */
export function limitesDaSemana(ymd: string): { segunda: string; domingo: string } {
  const segunda = segundaDaSemana(ymd);
  return { segunda, domingo: somarDias(segunda, 6) };
}

/** Os cards do cliente na semana (pela data de postagem), na ordem do calendário. */
export function cardsDaSemana<T extends { clientId: string; dueDate?: string | null; dueTime?: string | null; archivedAt?: string | null }>(
  cards: readonly T[], clientId: string, segunda: string,
): T[] {
  const domingo = somarDias(segunda, 6);
  return cards
    .filter((c) => c.clientId === clientId && !c.archivedAt && c.dueDate && c.dueDate.slice(0, 10) >= segunda && c.dueDate.slice(0, 10) <= domingo)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"));
}
