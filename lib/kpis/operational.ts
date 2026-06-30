// lib/kpis/operational.ts — KPIs operacionais a partir de dados que o sistema JÁ coleta no
// content_cards (columnEnteredAt, dueDate, statusChangedAt, totalTimeSpentMs, nonDeliveryReason)
// mas que nunca viravam indicador. Funções PURAS (testáveis), sem IO.

import type { ContentCard } from "@/lib/types";

const DAY = 86_400_000;
const ms = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);
// Fim do dia da data de entrega — publicar no mesmo dia conta como no prazo.
const endOfDay = (t: number): number => t - (t % DAY) + DAY - 1;

export interface StageStat { stage: string; avgDays: number; samples: number; }
export interface ReasonStat { reason: string; count: number; }

export interface OperationalKpis {
  sampleSize: number;          // cards publicados considerados (lead time / prazo)
  leadTimeDays: number | null; // mediana ideia → publicado
  onTimeRate: number | null;   // % publicado até a data combinada (0-100)
  latePublishCount: number;
  avgLateDays: number | null;  // atraso médio dos que passaram da data
  bottleneck: StageStat | null;// etapa com maior tempo médio
  stages: StageStat[];         // tempo médio por etapa (todas)
  avgWorkHours: number | null; // tempo ativo médio por card (h), de total_time_spent_ms
  nonDeliveryReasons: ReasonStat[];
}

const STAGE_LABEL: Record<string, string> = {
  ideas: "Ideias", script: "Roteiro", in_production: "Produção", blocked: "Bloqueado",
  approval: "Aprovação", client_approval: "Aprov. cliente", scheduled: "Agendado", published: "Publicado",
};
export const stageLabel = (s: string): string => STAGE_LABEL[s] ?? s;

// Quando o card foi publicado: entrada na coluna "published" ou, na falta, o statusChangedAt.
function publishedAt(c: ContentCard): number | null {
  return ms(c.columnEnteredAt?.published) ?? (c.status === "published" ? ms(c.statusChangedAt) : null);
}
// Quando o card "nasceu": entrada em ideas, ou o 1º timestamp registrado.
function startedAt(c: ContentCard): number | null {
  const ce = c.columnEnteredAt ?? {};
  const all = Object.values(ce).map(ms).filter((x): x is number => x != null);
  return ms(ce.ideas) ?? (all.length ? Math.min(...all) : null);
}

export function computeOperationalKpis(cards: ContentCard[]): OperationalKpis {
  const publicados = cards.filter((c) => c.status === "published");

  // Lead time (ideia → publicado), em dias.
  const leadDays: number[] = [];
  for (const c of publicados) {
    const a = startedAt(c), b = publishedAt(c);
    if (a != null && b != null && b >= a) leadDays.push((b - a) / DAY);
  }

  // Prazo: publicado até a dueDate (fim do dia).
  let onTime = 0, lateCount = 0;
  const lateDaysArr: number[] = [];
  for (const c of publicados) {
    const due = ms(c.dueDate), pub = publishedAt(c);
    if (due == null || pub == null) continue;
    if (pub <= endOfDay(due)) onTime++;
    else { lateCount++; lateDaysArr.push((pub - endOfDay(due)) / DAY); }
  }
  const comPrazo = onTime + lateCount;

  // Tempo médio por etapa (gargalo): entre entradas consecutivas no columnEnteredAt.
  const stageSum: Record<string, number> = {};
  const stageN: Record<string, number> = {};
  for (const c of cards) {
    const entries = Object.entries(c.columnEnteredAt ?? {})
      .map(([stage, iso]) => ({ stage, t: ms(iso) }))
      .filter((e): e is { stage: string; t: number } => e.t != null)
      .sort((a, b) => a.t - b.t);
    for (let i = 0; i < entries.length - 1; i++) {
      const dur = (entries[i + 1].t - entries[i].t) / DAY;
      if (dur < 0) continue;
      stageSum[entries[i].stage] = (stageSum[entries[i].stage] ?? 0) + dur;
      stageN[entries[i].stage] = (stageN[entries[i].stage] ?? 0) + 1;
    }
  }
  const stages: StageStat[] = Object.keys(stageSum)
    .map((stage) => ({ stage, avgDays: round1(stageSum[stage] / stageN[stage])!, samples: stageN[stage] }))
    .sort((a, b) => b.avgDays - a.avgDays);

  // Tempo ativo (total_time_spent_ms) médio por card.
  const workHours = cards
    .map((c) => c.totalTimeSpentMs)
    .filter((x): x is number => typeof x === "number" && x > 0)
    .map((m) => m / 3_600_000);

  // Motivos de não-entrega.
  const reasonMap: Record<string, number> = {};
  for (const c of cards) {
    const r = c.nonDeliveryReason?.trim();
    if (r) reasonMap[r] = (reasonMap[r] ?? 0) + 1;
  }
  const nonDeliveryReasons = Object.entries(reasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    sampleSize: publicados.length,
    leadTimeDays: round1(median(leadDays)),
    onTimeRate: comPrazo ? Math.round((onTime / comPrazo) * 100) : null,
    latePublishCount: lateCount,
    avgLateDays: round1(avg(lateDaysArr)),
    bottleneck: stages[0] ?? null,
    stages,
    avgWorkHours: round1(avg(workHours)),
    nonDeliveryReasons,
  };
}
