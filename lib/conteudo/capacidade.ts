// lib/conteudo/capacidade.ts — CRONÔMETRO DA ETAPA e CAPACIDADE DO DESIGNER (Leva 7B, N18).
//
//   · Cronômetro: quanto tempo o card está na etapa, contra o prazo dele (a data de postagem; na
//     etapa do designer, o prazo da arte). O quadro já marcava "2d parado"; faltava dizer se isso é
//     problema — dois dias parado com o post daqui a uma semana é normal, com o post amanhã não é.
//   · Carga: quantas artes cada designer deve por dia útil (pelo prazo da arte), com aviso acima de
//     LIMITE_ARTES_POR_DIA. Arte vencida conta hoje — é trabalho de hoje.
//
// Módulo puro (testado em tests/conteudo-capacidade.test.ts).

import { SEM_DONO } from "@/lib/design/dono";
import type { Etapa } from "./etapas";
import { designerDeve, type EstadoDesign } from "./producao";
import { somarDias } from "./no-ar";

/** Artes por designer por dia útil acima das quais o quadro avisa. Ajuste aqui. */
export const LIMITE_ARTES_POR_DIA = 5;

/** Quantos dias úteis a faixa de carga mostra (hoje incluído). */
export const DIAS_DE_CARGA = 5;

/** A partir de quanto do tempo até o prazo o cronômetro fica em atenção. */
const FRACAO_ATENCAO = 0.75;

export type TomCronometro = "ok" | "atencao" | "estourado" | "neutro";

export interface Cronometro {
  /** ISO de quando entrou na etapa. */
  desde: string;
  msNaEtapa: number;
  /** Prazo (YYYY-MM-DD) que vale nesta etapa, ou null. */
  prazo: string | null;
  /** ms até o prazo (negativo = vencido). */
  msAtePrazo: number | null;
  /** Quanto do tempo entre entrar na etapa e o prazo já passou (0–1; >1 = estourado). */
  fracao: number | null;
  tom: TomCronometro;
  rotulo: string;
}

export interface ItemCronometro {
  etapa: Etapa;
  prazoArte: string | null;
  card: {
    status: string;
    dueDate?: string | null;
    dueTime?: string | null;
    statusChangedAt?: string | null;
    columnEnteredAt?: Record<string, string> | null;
  };
}

/** "40min", "5h", "3d". */
export function duracaoCurta(ms: number): string {
  const min = Math.max(0, Math.floor(Math.abs(ms) / 60_000));
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Instante do prazo: a data com a hora do post (sem hora = meio-dia, como o "No ar"). São Paulo, −03:00. */
export function instanteDoPrazo(data: string, hora?: string | null): number {
  const hhmm = /^\d{2}:\d{2}/.test(hora ?? "") ? (hora as string).slice(0, 5) : "12:00";
  return Date.parse(`${data.slice(0, 10)}T${hhmm}:00-03:00`);
}

/**
 * O cronômetro do card na etapa atual. null onde o tempo parado não é problema do time: Pauta
 * (backlog), Agendado e No ar (já saíram da mão).
 */
export function cronometroDaEtapa(it: ItemCronometro, agoraMs: number): Cronometro | null {
  if (it.etapa === "pauta" || it.etapa === "agendado" || it.etapa === "no_ar") return null;
  const desde = it.card.columnEnteredAt?.[it.card.status] ?? it.card.statusChangedAt ?? null;
  if (!desde) return null;
  const t0 = Date.parse(desde);
  if (!Number.isFinite(t0)) return null;
  const msNaEtapa = Math.max(0, agoraMs - t0);

  const prazo = (it.etapa === "com_designer" ? it.prazoArte : it.card.dueDate?.slice(0, 10)) ?? null;
  const hora = it.etapa === "com_designer" && !it.card.dueDate ? null : it.card.dueTime ?? null;
  const tPrazo = prazo ? instanteDoPrazo(prazo, hora) : NaN;
  if (!prazo || !Number.isFinite(tPrazo)) {
    return { desde, msNaEtapa, prazo: null, msAtePrazo: null, fracao: null, tom: "neutro", rotulo: `${duracaoCurta(msNaEtapa)} na etapa` };
  }
  const msAtePrazo = tPrazo - agoraMs;
  const total = tPrazo - t0;
  const fracao = total > 0 ? msNaEtapa / total : 1;
  const tom: TomCronometro = msAtePrazo < 0 ? "estourado" : fracao >= FRACAO_ATENCAO ? "atencao" : "ok";
  const resto = msAtePrazo < 0 ? `venceu há ${duracaoCurta(msAtePrazo)}` : `faltam ${duracaoCurta(msAtePrazo)}`;
  return { desde, msNaEtapa, prazo, msAtePrazo, fracao, tom, rotulo: `${duracaoCurta(msNaEtapa)} na etapa · ${resto}` };
}

// ─── Carga por designer ──────────────────────────────────────────────────────

export interface ItemCarga {
  designer: string | null;
  estado: EstadoDesign;
  prazoArte: string | null;
}

export interface CargaDia {
  data: string;
  artes: number;
  acima: boolean;
}

export interface CargaDesigner {
  designer: string;
  dias: CargaDia[];
  /** Artes com prazo vencido (já contadas em hoje). */
  vencidas: number;
  /** Artes sem prazo (não entram em dia nenhum). */
  semPrazo: number;
  maxDia: number;
  acima: boolean;
}

function fimDeSemana(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Os próximos `n` dias úteis a partir de hoje (hoje entra se for dia útil). */
export function diasUteis(hoje: string, n: number): string[] {
  const out: string[] = [];
  for (let d = hoje; out.length < n; d = somarDias(d, 1)) if (!fimDeSemana(d)) out.push(d);
  return out;
}

/** Prazo no fim de semana conta no dia útil anterior (a arte tem que estar pronta antes). */
function diaUtilDoPrazo(prazo: string): string {
  let d = prazo;
  while (fimDeSemana(d)) d = somarDias(d, -1);
  return d;
}

/**
 * Carga diária de cada designer: as artes que ele ainda deve (fila, fazendo, alteração), pelo prazo
 * da arte, nos próximos dias úteis. `designers` garante a linha de quem está livre.
 */
export function cargaPorDesigner(
  itens: readonly ItemCarga[],
  hoje: string,
  opts: { dias?: number; limite?: number; designers?: readonly string[] } = {},
): CargaDesigner[] {
  const limite = opts.limite ?? LIMITE_ARTES_POR_DIA;
  const dias = diasUteis(hoje, opts.dias ?? DIAS_DE_CARGA);
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  const porDesigner = new Map<string, { contagem: Map<string, number>; vencidas: number; semPrazo: number }>();
  const linha = (nome: string) => {
    let l = porDesigner.get(nome);
    if (!l) { l = { contagem: new Map(), vencidas: 0, semPrazo: 0 }; porDesigner.set(nome, l); }
    return l;
  };
  for (const n of opts.designers ?? []) if (n.trim()) linha(n.trim());

  for (const it of itens) {
    if (!designerDeve(it.estado)) continue;
    const l = linha(it.designer?.trim() || SEM_DONO);
    if (!it.prazoArte) { l.semPrazo++; continue; }
    const prazo = it.prazoArte.slice(0, 10);
    if (prazo < hoje) { l.vencidas++; l.contagem.set(primeiro, (l.contagem.get(primeiro) ?? 0) + 1); continue; }
    const dia = diaUtilDoPrazo(prazo);
    const alvo = dia < primeiro ? primeiro : dia;
    if (alvo > ultimo) continue;
    l.contagem.set(alvo, (l.contagem.get(alvo) ?? 0) + 1);
  }

  return [...porDesigner.entries()]
    .map(([designer, l]) => {
      const linhaDias = dias.map((data) => {
        const artes = l.contagem.get(data) ?? 0;
        return { data, artes, acima: artes > limite };
      });
      const maxDia = Math.max(0, ...linhaDias.map((d) => d.artes));
      return { designer, dias: linhaDias, vencidas: l.vencidas, semPrazo: l.semPrazo, maxDia, acima: maxDia > limite };
    })
    .sort((a, b) => (a.designer === SEM_DONO ? 1 : b.designer === SEM_DONO ? -1 : a.designer.localeCompare(b.designer, "pt-BR")));
}
