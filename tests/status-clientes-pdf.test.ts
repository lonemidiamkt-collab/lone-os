import { describe, it, expect } from "vitest";
import { legendaStatusClientes, contarPorFaixa, statusClientesPdfHtml, type DadosStatusClientes } from "@/lib/reports/statusClientesPdf";

// 02/10/2026: o status de sexta saiu como texto de 1.771 caracteres e pôs "conta sem nenhum gasto"
// debaixo de "Resultados ruins". Sem gasto é anúncio parado — faixa própria, com o porquê.
const DADOS: DadosStatusClientes = {
  data: "02/10/2026",
  linhas: [
    { cliente: "Nova União", faixa: "parado", motivo: "sem gasto em 7 dias — conta em análise na Meta", antes: "Bons resultados" },
    { cliente: "BAZAR RIBEIRO", faixa: "average", motivo: "CPL R$ 15,30 acima do alerta", antes: "Bons resultados" },
    { cliente: "Veneza Estofados", faixa: "good", motivo: "CPL R$ 3,41 dentro da meta", antes: null },
    { cliente: "WT Shopping", faixa: "good", motivo: "CPL R$ 6,57 dentro da meta", antes: "Resultados médios" },
  ],
  manuais: [],
  semBase: [],
};

describe("status dos clientes em PDF", () => {
  it("conta por faixa, com 'sem anúncio rodando' separado de 'ruins'", () => {
    expect(contarPorFaixa(DADOS)).toEqual({ at_risk: 0, parado: 1, average: 1, good: 2 });
  });

  it("a legenda dá os números e quem precisa olhar, sem abrir o arquivo", () => {
    const t = legendaStatusClientes(DADOS, "@5522981712589");
    expect(t).toContain("02/10/2026 · @5522981712589");
    expect(t).toContain("⏸️ 1 sem anúncio rodando · 🟠 1 médios · 🟢 2 bons");
    expect(t).not.toContain("ruins"); // zero ruins não aparece
    expect(t).toContain("3 mudaram de faixa");
    expect(t.length).toBeLessThan(260);
  });

  it("o PDF diz o porquê da conta parada e mostra a faixa anterior de quem mudou", () => {
    const html = statusClientesPdfHtml(DADOS, "");
    expect(html).toContain("conta em análise na Meta");
    expect(html).toContain("antes: Bons resultados");
    expect(html).toContain("Sem anúncio rodando");
  });
});
