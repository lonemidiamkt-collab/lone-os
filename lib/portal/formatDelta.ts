import type { PeriodKind } from "./types";

export type MetricType = "messages" | "reach" | "cpa" | "spend";

export interface DeltaDisplay {
  text: string;
  color: string; // hex
}

// "que a semana passada", "que as 2 semanas anteriores", etc.
const QUE: Record<PeriodKind, string> = {
  last_week:    "que a semana passada",
  last_2_weeks: "que as 2 sem. anteriores",
  this_month:   "que o mês passado",
  last_month:   "que o mês anterior",
};

// "à semana passada", "às 2 semanas anteriores", etc. (para "Similar a…")
const A: Record<PeriodKind, string> = {
  last_week:    "à semana passada",
  last_2_weeks: "às 2 sem. anteriores",
  this_month:   "ao mês passado",
  last_month:   "ao mês anterior",
};

const GREEN  = "#22C55E";
const ORANGE = "#F59E0B";
const GRAY   = "#6B7280";
const THRESHOLD = 5;

export function formatDelta(
  metric: MetricType,
  deltaPercent: number | null,
  period: PeriodKind,
): DeltaDisplay | null {
  if (deltaPercent === null) return null;

  const up      = deltaPercent >  THRESHOLD;
  const down    = deltaPercent < -THRESHOLD;
  const neutral = !up && !down;

  if (metric === "spend") {
    if (neutral) return { text: "≈ Investimento similar",             color: GRAY };
    if (up)      return { text: `↗ Mais investido ${QUE[period]}`,   color: GRAY };
    return              { text: `↘ Menos investido ${QUE[period]}`,  color: GRAY };
  }

  if (metric === "messages" || metric === "reach") {
    if (neutral) return { text: `≈ Similar ${A[period]}`,     color: GRAY   };
    if (up)      return { text: `↗ Mais ${QUE[period]}`,      color: GREEN  };
    return              { text: `↘ Menos ${QUE[period]}`,     color: ORANGE };
  }

  if (metric === "cpa") {
    if (neutral) return { text: `≈ Similar ${A[period]}`,        color: GRAY   };
    if (up)      return { text: `↗ Mais caro ${QUE[period]}`,   color: ORANGE };
    return              { text: `↘ Mais barato ${QUE[period]}`, color: GREEN  };
  }

  return null;
}
