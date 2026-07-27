// Teste OFFLINE da consciência de "já falamos hoje" (sem banco).
// Caso real de 27/07/2026: o mesmo grupo recebeu "Olá, bom dia, amigos!" às 08:48 (relatório) e
// "Oi, pessoal! Bom começo de semana!" às 10:02 (pergunta de agosto). Duas saudações de primeira
// conversa em 1h14, porque cada rotina falava sem saber da outra.
import { describe, it, expect } from "vitest";
import { abertura, assinatura } from "@/lib/cs/ja-falamos";

describe("abertura — não cumprimenta duas vezes no mesmo dia", () => {
  const PRIMEIRA = "Oi, pessoal! 👋 Bom começo de semana!";
  const EMENDA = "Ah, e aproveitando! 😊";

  it("primeira fala do dia → saudação normal", () => {
    expect(abertura(false, PRIMEIRA, EMENDA)).toBe(PRIMEIRA);
  });

  it("já falamos hoje → emenda, sem saudar de novo", () => {
    const a = abertura(true, PRIMEIRA, EMENDA);
    expect(a).toBe(EMENDA);
    expect(a).not.toContain("Bom começo de semana");
    expect(a.toLowerCase()).not.toContain("bom dia");
  });
});

describe("assinatura — reconhece o mesmo assunto mesmo com texto diferente", () => {
  it("ignora emoji, pontuação e número: o que sobra é o assunto", () => {
    const a = assinatura("Oi, pessoal! 👋 Já são 8 posts essa semana!!!");
    expect(a).not.toMatch(/[0-9!👋,]/);
    expect(a).toContain("pessoal");
    expect(a).toContain("posts");
  });

  it("mesma mensagem com números diferentes tem a MESMA assinatura", () => {
    const a = assinatura("Ficaram 2 artes esperando o OK de vocês.");
    const b = assinatura("Ficaram 5 artes esperando o OK de vocês.");
    expect(a).toBe(b);
  });

  it("assuntos diferentes têm assinaturas diferentes", () => {
    expect(assinatura("Segue o relatório da semana"))
      .not.toBe(assinatura("Já pensaram na promoção do Dia dos Pais"));
  });

  it("texto vazio não quebra", () => {
    expect(assinatura("")).toBe("");
  });
});
