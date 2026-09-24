// Defesa — dia em andamento. Em 24/09 saíram 24 "quedas" falsas às 7h15: a entrega da madrugada é
// baixa e o "hoje" da Meta atrasa, então o pro-rateio linear fazia toda conta parecer ter caído 70–90%.
import { describe, it, expect } from "vitest";
import { detectAnomalies, metricaZerada, FRACAO_ZERO_PARCIAL, FRACAO_QUEDA_PARCIAL, type HistoricalMetric } from "@/lib/defense/detect";

const hist = (d: string): HistoricalMetric => ({
  metric_date: d, spend: 200, impressions: 5000, clicks: 50, conversions: 5, ctr: 1, cpm: 40, cpc: 4, cpl: 40,
});
const passado = ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"].map(hist);
const hoje = (spend: number, impressions: number) => ({
  metric_date: "2026-09-24", spend, impressions, clicks: impressions / 100, conversions: 1,
  ctr: 1, cpm: 40, cpc: 4, cpl: spend || null,
});
const hora = (h: number) => h / 24;

describe("Defesa — dia em andamento", () => {
  it("7h15 com a entrega normal da madrugada não vira queda (o caso de 24/09)", () => {
    expect(detectAnomalies(hoje(20, 1000), passado, { elapsedFraction: hora(7.25) })).toEqual([]);
  });

  it("antes das 9h nem gasto zero conta", () => {
    expect(detectAnomalies(metricaZerada("2026-09-24"), passado, { elapsedFraction: hora(8.5) })).toEqual([]);
  });

  it("entre 9h e meio-dia só gasto ZERO dispara", () => {
    const zero = detectAnomalies(metricaZerada("2026-09-24"), passado, { elapsedFraction: hora(10) });
    expect(zero.map((a) => a.metric)).toEqual(["spend"]);
    expect(detectAnomalies(hoje(15, 400), passado, { elapsedFraction: hora(10) })).toEqual([]);
  });

  it("do meio-dia em diante a queda de entrega volta a valer", () => {
    const a = detectAnomalies(hoje(150, 500), passado, { elapsedFraction: hora(14) });
    expect(a.some((x) => x.metric === "impressions")).toBe(true);
  });

  it("dia fechado compara inteiro, como sempre", () => {
    const a = detectAnomalies({ ...hoje(200, 1000), metric_date: "2026-09-23" }, passado.slice(0, 6), { elapsedFraction: 1 });
    expect(a.some((x) => x.metric === "impressions")).toBe(true);
  });

  it("cortes: 9h e meio-dia", () => {
    expect(FRACAO_ZERO_PARCIAL).toBeCloseTo(0.375);
    expect(FRACAO_QUEDA_PARCIAL).toBe(0.5);
  });
});
