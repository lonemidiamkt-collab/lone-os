// O que a IA olha quando revisa a arte ou escreve a legenda (lib/conteudo/artes-para-ia.ts).
// Auditoria de erro recuperável, 24/10/2026 — itens 2.9 (revisão automática), 2.10 (revisões
// manuais) e 2.11 (gerar legenda): a referência do social era revisada como se fosse a arte, a
// revisão parava em 6 sem dizer e a legenda via só a capa.
import { describe, it, expect } from "vitest";
import { artesParaIa, descricaoDasArtes, notaDeCobertura, resumoDaConferencia } from "@/lib/conteudo/artes-para-ia";
import type { AnexoDoCard } from "@/lib/cs/envio-aprovacao";

const img = (n: number) => `https://cdn.lone/arts/c1/${n}.png`;
const anexo = (id: string, n: number, p: Partial<AnexoDoCard> = {}): AnexoDoCard => ({ id, url: img(n), position: n, ...p });

describe("quais artes a IA olha", () => {
  it("a referência do social nunca entra — mesmo sendo o 1º anexo (o caso que a revisão pegava)", () => {
    const a = artesParaIa([
      anexo("ref", 0, { tipo: "referencia" }),
      anexo("e1", 1, { tipo: "entrega", delivery_id: "v2" }),
      anexo("e2", 2, { tipo: "entrega", delivery_id: "v2" }),
    ], "v2", img(0), Infinity);
    expect(a.artes).toEqual([{ n: 1, url: img(1) }, { n: 2, url: img(2) }]);
    expect(a.referencias).toBe(1);
    expect(a.foraDoLimite).toBe(0);
  });

  it("só a versão ATUAL: a versão anterior que continua no card fica de fora", () => {
    const a = artesParaIa([
      anexo("v1a", 1, { tipo: "entrega", delivery_id: "v1" }),
      anexo("v2a", 2, { tipo: "entrega", delivery_id: "v2" }),
    ], "v2", null, Infinity);
    expect(a.artes.map((x) => x.url)).toEqual([img(2)]);
  });

  it("teto de custo: olha até o limite e diz quantas ficaram de fora (antes parava em 6 calado)", () => {
    const anexos = Array.from({ length: 9 }, (_, i) => anexo(`e${i}`, i, { tipo: "entrega", delivery_id: "v1" }));
    const a = artesParaIa(anexos, "v1", null, 6);
    expect(a.artes).toHaveLength(6);
    expect(a.total).toBe(9);
    expect(a.foraDoLimite).toBe(3);
    expect(notaDeCobertura(a)).toBe("Conferi 6 de 9 artes da entrega. As artes 7 a 9 ficaram de fora (limite de 6 por conferência) — confira à mão.");
  });

  it("card só com referência: não há o que olhar, e o motivo é dito", () => {
    const a = artesParaIa([anexo("ref", 0, { tipo: "referencia" })], null, img(0), 6);
    expect(a.artes).toEqual([]);
    expect(a.erro).toMatch(/só tem referência do social/);
  });

  it("nota completa: referência e link de Drive aparecem", () => {
    const a = artesParaIa([
      anexo("ref", 0, { tipo: "referencia" }),
      anexo("e1", 1, { tipo: "entrega", delivery_id: "v1" }),
      { id: "drive", url: "https://drive.google.com/file/d/x", tipo: "entrega", delivery_id: "v1", position: 2 },
    ], "v1", null, Infinity);
    expect(notaDeCobertura(a)).toBe("Conferi 1 de 1 arte da entrega. 1 referência do social não entrou (não é arte). 1 arte é link e não deu para abrir.");
  });
});

describe("descrições para a legenda (carrossel)", () => {
  it("uma arte: a descrição pura", () => {
    expect(descricaoDasArtes(["Lata de tinta Suvinil 18L por R$ 299"])).toBe("Lata de tinta Suvinil 18L por R$ 299");
  });
  it("várias: numeradas na ordem, e a que não foi vista some sem quebrar a numeração", () => {
    expect(descricaoDasArtes(["Capa: Black Friday", null, "Slide 3: telhas"])).toBe("Arte 1 de 3: Capa: Black Friday\nArte 3 de 3: Slide 3: telhas");
  });
  it("nenhuma vista: sem descrição (a IA escreve pelo briefing e a tela diz isso)", () => {
    expect(descricaoDasArtes([null, undefined, ""])).toBeUndefined();
  });
});

describe("resumo da conferência manual (Revisar arte)", () => {
  const cob = (n: number) => ({ artes: Array.from({ length: n }, (_, i) => ({ n: i + 1, url: img(i + 1) })), total: n, foraDoLimite: 0, referencias: 0, semImagem: 0, legado: false });

  it("todas vistas e sem problema: ok", () => {
    const r = resumoDaConferencia([
      { n: 1, url: img(1), vista: true, problemas: [] },
      { n: 2, url: img(2), vista: true, problemas: [] },
    ], cob(2));
    expect(r).toMatchObject({ ok: true, resumo: "Sem erros aparentes nas 2 artes", problemas: [] });
    expect(r.nota).toBe("Conferi 2 de 2 artes da entrega.");
  });

  it("arte que não foi vista NÃO vira aprovação: aparece na lista e tira o ok", () => {
    const r = resumoDaConferencia([
      { n: 1, url: img(1), vista: true, problemas: [] },
      { n: 2, url: img(2), vista: false, motivo: "não consegui baixar a arte", problemas: [] },
    ], cob(2));
    expect(r.ok).toBe(false);
    expect(r.resumo).toBe("Sem erro aparente nas 1 artes que consegui ver — 1 sem conferência");
    expect(r.problemas).toEqual(["Arte 2 NÃO foi conferida (não consegui baixar a arte) — confira à mão."]);
    expect(r.nota).toBe("Conferi 1 de 2 artes da entrega.");
  });

  it("problemas agrupados por arte", () => {
    const r = resumoDaConferencia([
      { n: 1, url: img(1), vista: true, problemas: ["Preço diferente do briefing"] },
      { n: 2, url: img(2), vista: true, problemas: ["Preço diferente do briefing"] },
    ], cob(2));
    expect(r).toMatchObject({ ok: false, resumo: "1 ponto a conferir", problemas: ["Artes 1 e 2: Preço diferente do briefing"] });
  });

  it("nenhuma vista", () => {
    const r = resumoDaConferencia([{ n: 1, url: img(1), vista: false, motivo: "erro", problemas: [] }], cob(1));
    expect(r).toMatchObject({ ok: false, resumo: "Não consegui ver a arte" });
  });
});
