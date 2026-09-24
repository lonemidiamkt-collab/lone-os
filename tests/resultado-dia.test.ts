// Resultado de ontem: quem foi bem (dias fechados, contra a média dos 7 anteriores da própria conta).
import { describe, it, expect } from "vitest";
import { avaliarDia, ontemSP, type DiaConta } from "@/lib/traffic/resultado-dia";
import { legendaResultadoDia, textoResultadoDia, resultadoDiaPdfHtml } from "@/lib/reports/resultadoDiaPdf";

const base = (conv: number, spend = 100): DiaConta[] =>
  ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]
    .map((d) => ({ metric_date: d, spend, conversions: conv }));
const dia = (conversions: number, spend = 100): DiaConta => ({ metric_date: "2026-09-23", spend, conversions });

describe("avaliarDia", () => {
  it("mais conversas que a média conta como bom", () => {
    const r = avaliarDia(dia(10), base(6));
    expect(r?.motivos[0]).toBe("conversas subiram 67%");
  });

  it("custo por conversa 25% menor com gasto normal conta como bom", () => {
    const r = avaliarDia(dia(7, 100), base(5, 100)); // R$ 14,29 contra R$ 20
    expect(r?.motivos).toContain("custo por conversa caiu 29%");
  });

  it("gastar bem menos não é mérito, mesmo com custo menor", () => {
    expect(avaliarDia(dia(3, 30), base(5, 100))).toBeNull();
  });

  it("amostra pequena não vale: menos de 3 conversas ontem ou menos de 4 dias de base", () => {
    expect(avaliarDia(dia(2), base(1))).toBeNull();
    expect(avaliarDia(dia(10), base(5).slice(0, 3))).toBeNull();
  });

  it("dentro da média não entra", () => {
    expect(avaliarDia(dia(6), base(6))).toBeNull();
  });
});

describe("mensagem do resultado de ontem", () => {
  const quedas = [{ nome: "Cliente A", sintoma: "entrega caiu 74%", severidade: "critical" }];
  const bons = [{ clientId: "b", nome: "Cliente B", conversas: 10, mediaConversas: 6, custo: 10, mediaCusto: 16.7,
    gasto: 100, motivos: ["conversas subiram 67%"], ganho: 67 }];

  it("legenda curta com os dois lados e o destaque", () => {
    const l = legendaResultadoDia(quedas, bons, "2026-09-23");
    expect(l).toContain("1 pede atenção");
    expect(l).toContain("1 foi bem");
    expect(l).toContain("*Cliente B* — conversas subiram 67%");
    expect(l.split("\n").length).toBeLessThanOrEqual(4);
  });

  it("texto reserva e PDF trazem as duas seções", () => {
    expect(textoResultadoDia(quedas, bons, "2026-09-23")).toMatch(/Pedem atenção[\s\S]*Foram bem/);
    const html = resultadoDiaPdfHtml(quedas, bons, "2026-09-23", "");
    expect(html).toContain("Pedem atenção (1)");
    expect(html).toContain("Foram bem (1)");
  });

  it("só o lado bom também sai", () => {
    expect(legendaResultadoDia([], bons, "2026-09-23")).not.toContain("atenção");
  });

  it("ontem em São Paulo", () => {
    expect(ontemSP(new Date("2026-09-24T12:30:00Z"))).toBe("2026-09-23");
    expect(ontemSP(new Date("2026-09-24T02:00:00Z"))).toBe("2026-09-22"); // 23h do dia 23 em SP
  });
});
