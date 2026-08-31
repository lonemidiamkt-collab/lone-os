import { describe, it, expect } from "vitest";
import { funcaoPdfHtml } from "@/lib/reports/desempenhoPdf";
import type { BlocoFuncao } from "@/lib/reports/desempenho";

// O primeiro PDF gerado de verdade acusou o Carlos Augusto de estar "fora da meta" em 3 de 4
// indicadores, numa semana em que ele criou 24 peças (acima da meta). Os três eram artefatos do
// sistema, não do trabalho dele:
//   • "Pedidos decididos: 0%" — as 8 demandas da semana estavam TODAS pendentes. Nada decidido,
//     nada expirado: denominador zero. pct(0,0) devolvia 0 e o zero virou acusação.
//   • "Aprovações registradas: 1 (meta 5)" — client_approved_at está preenchido em 36 de 529 cards
//     do histórico. A métrica media o preenchimento do campo, não a pessoa.
//   • "Artes que você reprovou: 6 — fora da meta" — revisar é a função. O PDF punia quem confere.
// Esse documento ia para o grupo onde o time inteiro lê.

const base = (metas: BlocoFuncao["metas"]): BlocoFuncao =>
  ({ pessoa: "Fulano", funcao: "social", metas, destaques: [], atencao: [] });

describe("o PDF de desempenho não acusa ninguém por lacuna do sistema", () => {
  it("métrica sem base mostra o motivo, nunca 0% nem 'fora da meta'", () => {
    const html = funcaoPdfHtml(base({
      "Pedidos do cliente decididos": {
        valor: null, alvo: 90, unidade: "%", melhorQuando: "maior",
        semBase: "nenhum pedido venceu nesta semana",
      },
    }), "24/08 a 30/08", "");
    expect(html).toContain("nenhum pedido venceu nesta semana");
    expect(html).not.toContain("fora da meta");
    expect(html).not.toMatch(/>0%/);
  });

  it("métrica de acompanhamento tem número, mas não tem veredito", () => {
    const html = funcaoPdfHtml(base({
      "Artes que você devolveu pra ajuste": {
        valor: 6, alvo: 5, unidade: "un", melhorQuando: "menor", informativa: true,
      },
    }), "24/08 a 30/08", "");
    expect(html).toContain("acompanhamento");
    expect(html).not.toContain("fora da meta");
    expect(html).toContain("6"); // o número continua visível
  });

  it("meta de verdade continua sendo cobrada", () => {
    const html = funcaoPdfHtml(base({
      "Peças criadas": { valor: 4, alvo: 20, unidade: "un", melhorQuando: "maior" },
    }), "24/08 a 30/08", "");
    expect(html).toContain("fora da meta");
  });

  it("e o elogio também continua", () => {
    const html = funcaoPdfHtml(base({
      "Peças criadas": { valor: 24, alvo: 20, unidade: "un", melhorQuando: "maior" },
    }), "24/08 a 30/08", "");
    expect(html).toContain("na meta");
    expect(html).not.toContain("fora da meta");
  });
});
