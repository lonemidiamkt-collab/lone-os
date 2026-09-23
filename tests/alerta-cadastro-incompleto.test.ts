import { describe, it, expect } from "vitest";
import { buildCadastroSection } from "@/lib/budgets/alert-engine";

// Roberto (23/09): "se o cliente tiver com zero de verba, tem que ficar soltando um alerta".
// Verba R$ 0 faz o alerta medir "% da verba" contra zero — o cliente nunca entra em atenção.
describe("seção de cadastro incompleto no digest", () => {
  it("sem pendência, não escreve nada (não polui o digest)", () => {
    expect(buildCadastroSection([])).toBe("");
  });
  it("lista quem está sem verba, sem gestor, ou os dois — e mostra o gasto quando a conta roda", () => {
    // fmtBRL usa espaço não-quebrável no "R$ " — normaliza para comparar como a pessoa lê
    const s = buildCadastroSection([
      { clientName: "Nova União", falta: ["verba"], avgDailySpend: 18.95 },
      { clientName: "Blocfast", falta: ["verba", "gestor"], avgDailySpend: 0 },
      { clientName: "Paiva Shopp", falta: ["gestor"], avgDailySpend: 45.67 },
    ]);
    const t = s.replace(/\u00a0/g, " ");
    expect(t).toContain("Cadastro incompleto (3)");
    expect(t).toContain("Nova União — sem verba no cadastro (gastando R$ 18,95/dia)");
    expect(t).toContain("Blocfast — sem verba e sem gestor no cadastro");
    expect(t).not.toContain("Blocfast — sem verba e sem gestor no cadastro (gastando"); // 0/dia não vira ruído
    expect(t).toContain("Paiva Shopp — sem gestor no cadastro (gastando R$ 45,67/dia)");
    expect(t.indexOf("Blocfast")).toBeLessThan(t.indexOf("Nova União")); // ordem alfabética
  });
});
