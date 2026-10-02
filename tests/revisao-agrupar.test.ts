import { describe, it, expect } from "vitest";
import { agruparProblemas, briefingResumido } from "@/lib/cs/revisao-agrupar";

describe("problemas repetidos em várias artes", () => {
  it("o mesmo problema em três artes vira uma linha — Reformar Construção, 01/10", () => {
    const r = agruparProblemas([
      ["Preços incluídos na arte, mas o briefing especifica para não incluir preços.", "Fundo vermelho fora do padrão azul"],
      ["Preços incluídos na arte, mas o briefing especifica para não incluir preços"],
      ["preços incluídos na arte, mas o briefing especifica para não incluir preços."],
    ]);
    expect(r).toEqual([
      "Artes 1, 2 e 3: Preços incluídos na arte, mas o briefing especifica para não incluir preços",
      "Arte 1: Fundo vermelho fora do padrão azul",
    ]);
  });

  it("arte única não leva rótulo de arte", () => {
    expect(agruparProblemas([["telefone ilegível no rodapé"]])).toEqual(["telefone ilegível no rodapé"]);
  });

  it("duas artes: 'Artes 1 e 2'", () => {
    expect(agruparProblemas([["a"], ["a"]])).toEqual(["Artes 1 e 2: a"]);
  });

  it("nada a apontar, nada sai", () => {
    expect(agruparProblemas([[], []])).toEqual([]);
  });
});

describe("briefing resumido", () => {
  it("curto passa inteiro", () => {
    expect(briefingResumido("Preço R$ 23", 1400)).toBe("Preço R$ 23");
  });

  it("longo corta no fim de uma linha e avisa que foi resumido — nunca no meio da palavra", () => {
    const b = "Linha um do briefing\n".repeat(80) + "Contato (fechar a legenda com isto — endereço completo)";
    const r = briefingResumido(b, 1400);
    expect(r.length).toBeLessThan(1500);
    expect(r).not.toContain("— endere");
    expect(r).toContain("[briefing resumido");
    expect(r.split("\n").slice(-2, -1)[0]).toBe("Linha um do briefing");
  });
});
