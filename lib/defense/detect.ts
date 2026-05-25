/**
 * Defesa Ativa — engine de detecção de anomalias em métricas Meta Ads.
 *
 * Função pura: recebe métrica atual + histórico 7 dias → decide se é anomalia.
 * Compara contra a média móvel 7d (excluindo o dia corrente).
 */

export type Severity = "critical" | "high" | "medium";

export interface HistoricalMetric {
  metric_date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpl: number | null;
}

export interface CurrentMetric extends HistoricalMetric {}

export interface AnomalyResult {
  metric: "spend" | "cpl" | "ctr" | "impressions";
  severity: Severity;
  currentValue: number;
  baselineValue: number;     // já pro-rateado pra fração do dia decorrida (pra métricas de volume)
  percentChange: number;     // +X = metric foi pra cima, -X = pra baixo
  description: string;
}

export interface DetectionContext {
  elapsedFraction: number;   // 0.0 a 1.0 — quanto do dia já passou em BRT.
                              // 1.0 = dia fechado (comparação completa).
                              // 0.5 = meio-dia, pro-rateia baseline de volume por 0.5.
}

// Thresholds (% change absoluto pra disparar)
const THRESHOLDS = {
  spend_drop: { value: 80, severity: "critical" as Severity },         // spend caiu >= 80%
  cpl_spike: { value: 80, severity: "high" as Severity },              // cpl subiu >= 80%
  ctr_drop: { value: 50, severity: "high" as Severity },               // ctr caiu >= 50%
  impressions_drop: { value: 70, severity: "critical" as Severity },   // impressions caiu >= 70%
};

// Pisos mínimos: sem volume suficiente no baseline, não emite alerta (evita falso positivo em contas pequenas)
const MIN_BASELINE = {
  spend: 50,          // R$ 50/dia médio
  impressions: 1000,  // 1k impressões/dia médio
  clicks: 10,         // 10 clicks/dia médio pra avaliar CTR
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pctChange(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0;
  return ((current - baseline) / baseline) * 100;
}

export function detectAnomalies(
  current: CurrentMetric,
  history: HistoricalMetric[],
  ctx: DetectionContext = { elapsedFraction: 1.0 },
): AnomalyResult[] {
  // Usa só dias passados (exclui o dia corrente caso esteja no histórico)
  const past = history.filter((h) => h.metric_date !== current.metric_date);
  if (past.length < 3) return []; // histórico insuficiente

  // Não detecta anomalias muito cedo no dia — sinal/ruído é ruim e false positives dominam
  // (0.3 = após ~7h20 decorridas do dia em BRT; antes disso, só coleta snapshot)
  if (ctx.elapsedFraction < 0.3) return [];

  const anomalies: AnomalyResult[] = [];
  const frac = Math.min(Math.max(ctx.elapsedFraction, 0.01), 1.0);

  // 1. Spend drop crítico — pro-rateia baseline de volume pela fração do dia
  const spendBaselineFull = mean(past.map((h) => h.spend));
  const spendBaselineProRated = spendBaselineFull * frac;
  if (spendBaselineFull >= MIN_BASELINE.spend) {
    const change = pctChange(current.spend, spendBaselineProRated);
    if (change <= -THRESHOLDS.spend_drop.value) {
      anomalies.push({
        metric: "spend",
        severity: THRESHOLDS.spend_drop.severity,
        currentValue: current.spend,
        baselineValue: spendBaselineProRated,
        percentChange: change,
        description: current.spend === 0
          ? `Spend ZERO hoje até agora (esperado R$ ${spendBaselineProRated.toFixed(2)} no mesmo horário). Conta pausada, sem orçamento ou reprovada?`
          : `Spend caiu ${Math.abs(change).toFixed(0)}% vs ritmo esperado (R$ ${current.spend.toFixed(2)} vs R$ ${spendBaselineProRated.toFixed(2)})`,
      });
    }
  }

  // 2. CPL spike — CPL é RATIO (spend/conversions), não pro-rateia
  const cplHistory = past.filter((h) => h.cpl !== null && h.cpl > 0).map((h) => h.cpl!);
  if (cplHistory.length >= 3 && current.cpl !== null && current.cpl > 0) {
    const cplBaseline = mean(cplHistory);
    const change = pctChange(current.cpl, cplBaseline);
    if (change >= THRESHOLDS.cpl_spike.value) {
      anomalies.push({
        metric: "cpl",
        severity: THRESHOLDS.cpl_spike.severity,
        currentValue: current.cpl,
        baselineValue: cplBaseline,
        percentChange: change,
        description: `CPL subiu ${change.toFixed(0)}% (R$ ${current.cpl.toFixed(2)} vs média R$ ${cplBaseline.toFixed(2)}). Possível fadiga criativa ou público saturado.`,
      });
    }
  }

  // 3. CTR drop — CTR é RATIO (clicks/impressions), não pro-rateia
  const clicksBaseline = mean(past.map((h) => h.clicks));
  if (clicksBaseline >= MIN_BASELINE.clicks) {
    const ctrBaseline = mean(past.map((h) => h.ctr));
    if (ctrBaseline > 0) {
      const change = pctChange(current.ctr, ctrBaseline);
      if (change <= -THRESHOLDS.ctr_drop.value) {
        anomalies.push({
          metric: "ctr",
          severity: THRESHOLDS.ctr_drop.severity,
          currentValue: current.ctr,
          baselineValue: ctrBaseline,
          percentChange: change,
          description: `CTR caiu ${Math.abs(change).toFixed(0)}% (${current.ctr.toFixed(2)}% vs média ${ctrBaseline.toFixed(2)}%). Público errado ou criativos saturados.`,
        });
      }
    }
  }

  // 4. Impressions drop — volume, pro-rateia
  const impBaselineFull = mean(past.map((h) => h.impressions));
  const impBaselineProRated = impBaselineFull * frac;
  if (impBaselineFull >= MIN_BASELINE.impressions) {
    const change = pctChange(current.impressions, impBaselineProRated);
    if (change <= -THRESHOLDS.impressions_drop.value) {
      anomalies.push({
        metric: "impressions",
        severity: THRESHOLDS.impressions_drop.severity,
        currentValue: current.impressions,
        baselineValue: impBaselineProRated,
        percentChange: change,
        description: `Impressões ${Math.abs(change).toFixed(0)}% abaixo do ritmo esperado. Problema de delivery (política, reprovação, pacing).`,
      });
    }
  }

  return anomalies;
}

export function metricLabel(metric: string): string {
  const map: Record<string, string> = {
    spend: "Investimento (spend)",
    cpl: "Custo por Lead (CPL)",
    ctr: "Taxa de Cliques (CTR)",
    impressions: "Impressões",
  };
  return map[metric] ?? metric;
}
