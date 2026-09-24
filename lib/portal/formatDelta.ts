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
