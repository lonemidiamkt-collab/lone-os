import { describe, it, expect } from "vitest";
import { saldosPdfHtml, legendaSaldos } from "@/lib/reports/saldosPdf";
import type { DigestAccount } from "@/lib/budgets/alert-engine";

const conta = (p: Partial<DigestAccount> & { clientName: string }): DigestAccount => ({
  metaAccountId: "act_1", isPrepaid: true, available: 0, daysRemaining: null,
  avgDailySpend: null, currency: "BRL",
  alert: { severity: "critical", reason: "Saldo zerado", pctRemaining: 0 },
  ...p,
} as DigestAccount);

// Conferi o primeiro PDF antes de mandar pro grupo e apareceu "0.010570910646271666 dias no ritmo
// atual". O cálculo vem em fração; imprimir cru ocupa meia linha dizendo menos que "acaba hoje".
describe("PDF de saldos", () => {
  it("não imprime fração de dia", () => {
    const html = saldosPdfHtml([
      conta({ clientName: "Léo Carros", available: 1.73, daysRemaining: 0.010570910646271666,
              alert: { severity: "critical", reason: "Saldo ≤ 10% da verba", pctRemaining: 0 } }),
    ], "", "01 de setembro de 2026");
    expect(html).not.toContain("0.0105");
    expect(html).toContain("acaba hoje no ritmo atual");
  });

  it("arredonda pra baixo o que sobra", () => {
    const html = saldosPdfHtml([
      conta({ clientName: "Horto", available: 91, daysRemaining: 2.7335,
              alert: { severity: "warning", reason: "Saldo ≤ 10% da verba", pctRemaining: 8 } }),
    ], "", "hoje");
    expect(html).toContain("2 dias no ritmo atual");
  });

  it("conta tranquila fica fora da lista, mas conta no total", () => {
    const html = saldosPdfHtml([
      conta({ clientName: "Zerada" }),
      conta({ clientName: "Tranquila", available: 5000, alert: { severity: "ok", reason: "ok", pctRemaining: 90 } }),
    ], "", "hoje");
    expect(html).toContain("Zerada");
    expect(html).not.toMatch(/Tranquila<\/div>/);
    expect(html).toContain("2 contas");
  });

  it("a legenda diz o que decide, não a lista inteira", () => {
    const t = legendaSaldos([
      conta({ clientName: "A" }), conta({ clientName: "B" }),
      conta({ clientName: "C", alert: { severity: "ok", reason: "ok", pctRemaining: 90 } }),
    ]);
    expect(t).toMatch(/2 precisam de recarga/);
    expect(t).toContain("A, B");
    expect(t).toMatch(/PDF/);
  });
});
