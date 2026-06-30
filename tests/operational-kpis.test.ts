// Testes do cálculo de KPIs operacionais (lib/kpis/operational). Puro, sem rede.
import { describe, it, expect } from "vitest";
import { computeOperationalKpis } from "@/lib/kpis/operational";
import type { ContentCard } from "@/lib/types";

function card(over: Partial<ContentCard>): ContentCard {
  return { id: over.id ?? "x", title: "t", clientId: "c", status: "ideas", ...over } as ContentCard;
}

describe("computeOperationalKpis", () => {
  const A = card({
    id: "A", status: "published", dueDate: "2026-01-04", totalTimeSpentMs: 4 * 3_600_000,
    columnEnteredAt: { ideas: "2026-01-01T00:00:00Z", in_production: "2026-01-02T00:00:00Z", published: "2026-01-04T00:00:00Z" },
  });
  const B = card({
    id: "B", status: "published", dueDate: "2026-01-04", totalTimeSpentMs: 2 * 3_600_000,
    columnEnteredAt: { ideas: "2026-01-01T00:00:00Z", published: "2026-01-07T00:00:00Z" },
  });
  const C = card({ id: "C", status: "in_production", nonDeliveryReason: "cliente não enviou material" });
  const k = computeOperationalKpis([A, B, C]);

  it("lead time = mediana ideia→publicado (3 e 6 dias → 4.5)", () => {
    expect(k.sampleSize).toBe(2);
    expect(k.leadTimeDays).toBe(4.5);
  });
  it("prazo: 1 no prazo, 1 atrasado → 50% e atraso ~2d", () => {
    expect(k.onTimeRate).toBe(50);
    expect(k.latePublishCount).toBe(1);
    expect(k.avgLateDays).toBeGreaterThanOrEqual(1.9);
    expect(k.avgLateDays).toBeLessThanOrEqual(2.1);
  });
  it("gargalo = etapa com maior tempo médio (ideias)", () => {
    expect(k.bottleneck?.stage).toBe("ideas");
  });
  it("tempo ativo médio = 3h (4h e 2h)", () => {
    expect(k.avgWorkHours).toBe(3);
  });
  it("motivos de não-entrega contabilizados", () => {
    expect(k.nonDeliveryReasons).toEqual([{ reason: "cliente não enviou material", count: 1 }]);
  });
  it("não quebra com lista vazia", () => {
    const z = computeOperationalKpis([]);
    expect(z.sampleSize).toBe(0);
    expect(z.leadTimeDays).toBeNull();
    expect(z.onTimeRate).toBeNull();
    expect(z.bottleneck).toBeNull();
  });
});
