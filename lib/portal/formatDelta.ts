import type { PeriodKind } from "./types";

export type MetricType = "messages" | "reach" | "cpa" | "spend";

export interface DeltaDisplay {
  text: string;
  color: string; // var(--token) — funciona nos dois temas
}

// "que a semana passada", "que as 2 semanas anteriores", etc.
const QUE: Record<PeriodKind, string> = {
  last_week:    "que a semana passada",
  last_2_weeks: "que as 2 semanas anteriores",
  this_month:   "que o mesmo período do mês passado",
  last_month:   "que o mês anterior",
};

// "à semana passada", "às 2 semanas anteriores", etc. (para "Similar a…")
const A: Record<PeriodKind, string> = {
  last_week:    "à semana passada",
  last_2_weeks: "às 2 semanas anteriores",
  this_month:   "ao mesmo período do mês passado",
  last_month:   "ao mês anterior",
};

const GREEN  = "var(--lone-success)";
const ORANGE = "var(--lone-warning)";
const GRAY   = "var(--muted-foreground)";
const THRESHOLD = 5;

const pct = (n: number) => `${Math.round(Math.abs(n)).toLocaleString("pt-BR")}%`;

/** Texto da variação vs o período anterior, com o número. `null` quando não há base de comparação. */
export function formatDelta(
  metric: MetricType,
  deltaPercent: number | null,
  period: PeriodKind,
): DeltaDisplay | null {
  if (deltaPercent === null || !Number.isFinite(deltaPercent)) return null;

  const up      = deltaPercent >  THRESHOLD;
  const down    = deltaPercent < -THRESHOLD;
  const neutral = !up && !down;
  const p = pct(deltaPercent);

  if (metric === "spend") {
    if (neutral) return { text: `≈ Investimento parecido ${A[period]}`, color: GRAY };
    if (up)      return { text: `↗ ${p} mais investido ${QUE[period]}`,  color: GRAY };
    return              { text: `↘ ${p} menos investido ${QUE[period]}`, color: GRAY };
  }

  if (metric === "messages" || metric === "reach") {
    if (neutral) return { text: `≈ Parecido ${A[period]}`,       color: GRAY   };
    if (up)      return { text: `↗ ${p} a mais ${QUE[period]}`,  color: GREEN  };
    return              { text: `↘ ${p} a menos ${QUE[period]}`, color: ORANGE };
  }

  if (metric === "cpa") {
    if (neutral) return { text: `≈ Parecido ${A[period]}`,          color: GRAY   };
    if (up)      return { text: `↗ ${p} mais caro ${QUE[period]}`,   color: ORANGE };
    return              { text: `↘ ${p} mais barato ${QUE[period]}`, color: GREEN  };
  }

  return null;
}

/** A leitura da variação em palavras, sem o número (o número vai no selo ao lado do KPI). */
export function fraseDelta(metric: MetricType, deltaPercent: number | null, period: PeriodKind): string | null {
  if (deltaPercent === null || !Number.isFinite(deltaPercent)) return null;
  if (Math.abs(deltaPercent) <= THRESHOLD) return `parecido ${A[period]}`;
  const up = deltaPercent > 0;
  if (metric === "spend") return `${up ? "mais" : "menos"} investido ${QUE[period]}`;
  if (metric === "cpa") return `${up ? "mais caro" : "mais barato"} ${QUE[period]}`;
  return `${up ? "a mais" : "a menos"} ${QUE[period]}`;
}

/** "a semana anterior", "o mês anterior"… — pra legenda "comparado com …". */
export function periodoAnterior(period: PeriodKind): string {
  return ANTERIOR[period];
}

const ABERTURA: Record<PeriodKind, string> = {
  last_week:    "Nos últimos 7 dias",
  last_2_weeks: "Nas últimas 2 semanas",
  this_month:   "Este mês",
  last_month:   "No mês passado",
};

const ANTERIOR: Record<PeriodKind, string> = {
  last_week:    "a semana anterior",
  last_2_weeks: "as 2 semanas anteriores",
  this_month:   "o mesmo período do mês passado",
  last_month:   "o mês anterior",
};

/** Frase de topo: "Nos últimos 7 dias: 48 conversas, 12% a mais que a semana anterior." */
export function resumoConversas(conversas: number | null, deltaPercent: number | null, period: PeriodKind): string | null {
  if (conversas == null) return null;
  const n = conversas.toLocaleString("pt-BR");
  const nome = conversas === 1 ? "conversa" : "conversas";
  const base = `${ABERTURA[period]}: ${n} ${nome}`;
  if (deltaPercent == null || !Number.isFinite(deltaPercent)) return `${base}.`;
  if (Math.abs(deltaPercent) <= THRESHOLD) return `${base}, parecido com ${ANTERIOR[period]}.`;
  return `${base}, ${pct(deltaPercent)} ${deltaPercent > 0 ? "a mais" : "a menos"} que ${ANTERIOR[period]}.`;
}

// ── Instagram em uma frase (N34, aba "Crescimento nas redes") ────────────────
// A aba de anúncios já abre com a frase do período (resumoConversas). Quem tem só social — ou abre a
// aba do Instagram — não tinha frase nenhuma: via quatro números soltos e tinha que montar a leitura
// sozinho. Sem comparação com o período anterior: a Meta não entrega o anterior do perfil, e inventar
// seta seria pior que não ter.

const ABERTURA_DIAS: Record<number, string> = {
  7: "Nos últimos 7 dias",
  14: "Nas últimas 2 semanas",
  30: "Nos últimos 30 dias",
};

const juntarPartes = (p: string[]) => (p.length <= 1 ? p.join("") : `${p.slice(0, -1).join(", ")} e ${p[p.length - 1]}`);
const nBR = (n: number) => Math.round(n).toLocaleString("pt-BR");

/**
 * "Nos últimos 7 dias: 3 posts publicados, 4.210 pessoas alcançadas e 18 seguidores novos."
 *
 * O alcance só entra quando a janela dele é a mesma do período (a Meta só dá alcance único em 7 ou
 * 28 dias — no seletor de 14 ele viria de outra janela). null quando não há resumo.
 */
export function resumoInstagram(
  dias: number,
  r: { postsNoPeriodo?: number | null; alcance?: number | null; alcanceJanelaDias?: number | null; seguidoresGanhos?: number | null } | null | undefined,
): string | null {
  if (!r || r.postsNoPeriodo == null) return null;
  const abertura = ABERTURA_DIAS[dias] ?? `Nos últimos ${dias} dias`;
  const partes: string[] = [];
  const posts = r.postsNoPeriodo;
  partes.push(posts === 0 ? "nenhum post publicado" : `${nBR(posts)} ${posts === 1 ? "post publicado" : "posts publicados"}`);
  const janelaCerta = r.alcanceJanelaDias == null || r.alcanceJanelaDias === dias;
  if (r.alcance != null && r.alcance > 0 && janelaCerta) {
    partes.push(`${nBR(r.alcance)} ${r.alcance === 1 ? "pessoa alcançada" : "pessoas alcançadas"}`);
  }
  const g = r.seguidoresGanhos;
  if (g != null && g !== 0) {
    const abs = Math.abs(g);
    partes.push(g > 0
      ? `${nBR(abs)} ${abs === 1 ? "seguidor novo" : "seguidores novos"}`
      : `${nBR(abs)} ${abs === 1 ? "seguidor a menos" : "seguidores a menos"}`);
  }
  return `${abertura}: ${juntarPartes(partes)}.`;
}
