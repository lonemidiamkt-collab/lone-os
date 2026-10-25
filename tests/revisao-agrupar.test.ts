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

import { comentarioDaRevisao, avisoSemConferencia, avisoRevisaoNaoRodou } from "@/lib/cs/revisao-agrupar";

describe("comentarioDaRevisao — falha de revisão nunca vira aprovação", () => {
  it("nenhuma arte vista (as imagens deram 502 de 16 a 19/10): sem selo, o chamador avisa", () => {
    expect(comentarioDaRevisao([], [{ n: 1, motivo: "não consegui baixar a arte" }], 1)).toBeNull();
    expect(avisoSemConferencia([{ n: 1, motivo: "não consegui baixar a arte" }])).toMatch(/NÃO conseguiu ver a arte \(não consegui baixar a arte\)/);
  });
  it("todas vistas e sem problema: o selo de sempre", () => {
    expect(comentarioDaRevisao([], [], 3)).toBe("✅ Revisão automática: arte conferida contra o briefing, nenhum erro aparente.");
  });
  it("parte vista: aprova só o que viu e diz quais ficaram sem conferência", () => {
    const t = comentarioDaRevisao([], [{ n: 2, motivo: "erro de conexão" }], 3)!;
    expect(t).toMatch(/^✅ Revisão automática: as artes que consegui ver/);
    expect(t).toMatch(/1 de 3 artes NÃO foram conferidas \(arte 2: erro de conexão\)/);
    expect(t).not.toMatch(/nenhum erro aparente/);
  });
  it("com problema: lista e, se houver, o aviso de parcial", () => {
    const t = comentarioDaRevisao(["Preço diferente do briefing"], [{ n: 3, motivo: "erro" }], 3)!;
    expect(t).toMatch(/^⚠️ Revisão automática encontrou pontos a conferir:\n• Preço diferente do briefing/);
    expect(t).toMatch(/1 de 3 artes NÃO foram conferidas/);
  });
  it("2.9: diz quantas artes conferiu e quais ficaram de fora pelo limite", () => {
    const t = comentarioDaRevisao([], [], 6, "Conferi 6 de 9 artes da entrega. As artes 7 a 9 ficaram de fora (limite de 6 por conferência) — confira à mão.")!;
    expect(t).toBe("✅ Revisão automática: arte conferida contra o briefing, nenhum erro aparente.\n\nConferi 6 de 9 artes da entrega. As artes 7 a 9 ficaram de fora (limite de 6 por conferência) — confira à mão.");
  });
  it("2.9: revisão que não rodou deixa aviso no card (antes voltava calada)", () => {
    expect(avisoRevisaoNaoRodou("a IA não está configurada no servidor.")).toBe('⚠️ Revisão automática NÃO rodou nesta entrega (a IA não está configurada no servidor). Ninguém conferiu a arte ainda: confira à mão ou use "Revisar arte" no card antes de enviar ao cliente.');
  });
});
