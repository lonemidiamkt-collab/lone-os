import { describe, it, expect } from "vitest";
import { medirFilhoContraPai } from "@/lib/traffic/medir";

describe("filho × pai", () => {
  const pai = { spend: 300, conversions: 60, impressions: 40000, clicks: 800 }; // R$ 5,00
  it("sem gasto de decisão → inconclusiva e continua medindo", () => {
    const r = medirFilhoContraPai({ pai, filho: { spend: 20, conversions: 2, impressions: 3000, clicks: 60 }, cplMeta: 8, convMin: 8 });
    expect(r.veredito).toBe("inconclusiva"); expect(r.suficiente).toBe(false);
  });
  it("15% mais barato com amostra → validada", () => {
    const r = medirFilhoContraPai({ pai, filho: { spend: 100, conversions: 25, impressions: 12000, clicks: 300 }, cplMeta: 8, convMin: 8 }); // R$ 4,00
    expect(r.veredito).toBe("validada"); expect(r.variacaoCpl).toBeCloseTo(-0.2, 2);
  });
  it("15% mais caro → refutada; gastou o dobro do mínimo sem conversa → refutada", () => {
    expect(medirFilhoContraPai({ pai, filho: { spend: 100, conversions: 14, impressions: 12000, clicks: 200 }, cplMeta: 8, convMin: 8 }).veredito).toBe("refutada");
    expect(medirFilhoContraPai({ pai, filho: { spend: 120, conversions: 0, impressions: 12000, clicks: 200 }, cplMeta: 8, convMin: 8 }).veredito).toBe("refutada");
  });
  it("diferença dentro do ruído → inconclusiva mesmo com amostra", () => {
    const r = medirFilhoContraPai({ pai, filho: { spend: 100, conversions: 19, impressions: 12000, clicks: 300 }, cplMeta: 8, convMin: 8 }); // R$ 5,26 (+5%)
    expect(r.veredito).toBe("inconclusiva"); expect(r.suficiente).toBe(true);
  });
});
