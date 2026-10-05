import { describe, it, expect } from "vitest";
import { destaquesDaSemana, semanasFechadas } from "@/lib/traffic/destaques-semana";

const c = (cliente: string, conversasAnterior: number, gastoAnterior: number, conversasAtual: number, gastoAtual: number) =>
  ({ cliente, conversasAnterior, gastoAnterior, conversasAtual, gastoAtual });

describe("semanas fechadas", () => {
  it("rodando na segunda 05/10: a semana passada é 28/09 a 04/10 e a anterior 21 a 27/09", () => {
    expect(semanasFechadas("2026-10-05")).toEqual({
      atual: { de: "2026-09-28", ate: "2026-10-04" },
      anterior: { de: "2026-09-21", ate: "2026-09-27" },
    });
  });

  it("qualquer dia da semana aponta pra última semana FECHADA", () => {
    expect(semanasFechadas("2026-10-07").atual).toEqual({ de: "2026-09-28", ate: "2026-10-04" });
    expect(semanasFechadas("2026-10-11").atual).toEqual({ de: "2026-09-28", ate: "2026-10-04" }); // domingo ainda é a semana corrente
  });
});

describe("quem melhorou e quem piorou", () => {
  // Números do jeito que apareceram no comparativo de 05/10 (Madeirão Móveis, Império dos Pisos…).
  const d = destaquesDaSemana([
    c("Madeirão Móveis", 56, 255, 119, 224),      // mais conversas, custo menor → melhorou
    c("Armazém do Ferro", 98, 366, 171, 340),     // melhorou
    c("Body Skin", 4, 47, 13, 58),                // melhorou, mas pouco volume
    c("Loja Piorou", 40, 200, 25, 220),           // menos conversas, custo maior → piorou
    c("Misto", 30, 150, 40, 260),                 // mais conversas, mas custo maior → misto
    c("Dumar", 20, 90, 0, 0),                     // parou de gastar
    c("Sem dado", 1, 10, 2, 12),                  // abaixo do mínimo: fora da comparação
  ]);

  it("separa melhorou / piorou / misto / parou", () => {
    expect(d.melhoraram.map((x) => x.cliente)).toEqual(["Madeirão Móveis", "Armazém do Ferro", "Body Skin"]);
    expect(d.pioraram.map((x) => x.cliente)).toEqual(["Loja Piorou"]);
    expect(d.mistos).toBe(1);
    expect(d.pararam).toEqual([{ cliente: "Dumar", gastoAnterior: 90, conversasAnterior: 20 }]);
    expect(d.avaliados).toBe(5);
  });

  it("quem tem volume vem antes de quem não tem, mesmo com variação menor", () => {
    expect(d.melhoraram.at(-1)!.poucoVolume).toBe(true);
    expect(d.melhoraram[0].poucoVolume).toBe(false);
  });

  it("piores: perda grande de volume não fica escondida atrás de um custo que subiu pouco — Maicon, 05/10", () => {
    const p = destaquesDaSemana([
      c("Custo subiu bem", 69, 244, 50, 253),   // −28% conversas, +43% custo → 71 pontos
      c("Maicon", 124, 451, 49, 186),          // −60% conversas, +4% custo → 64 pontos
      c("Pouco mexeu", 41, 226, 34, 196),      // −17%, +5%
    ]).pioraram.map((x) => x.cliente);
    expect(p).toEqual(["Custo subiu bem", "Maicon", "Pouco mexeu"]);
  });

  it("calcula as variações", () => {
    const m = d.melhoraram[0];
    expect(Math.round(m.varConversas)).toBe(113);
    expect(m.custoAnterior).toBeCloseTo(255 / 56);
    expect(m.varCusto).toBeLessThan(0);
  });

  it("a carteira soma todo mundo, inclusive quem ficou de fora da comparação", () => {
    expect(d.carteira.conversasAnterior).toBe(56 + 98 + 4 + 40 + 30 + 20 + 1);
    expect(d.carteira.custoAtual).toBeCloseTo(d.carteira.gastoAtual / d.carteira.conversasAtual);
  });

  it("semana vazia não quebra", () => {
    const v = destaquesDaSemana([]);
    expect(v.carteira.custoAtual).toBeNull();
    expect(v.melhoraram).toEqual([]);
  });
});
