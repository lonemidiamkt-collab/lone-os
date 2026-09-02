import { describe, it, expect } from "vitest";
import { ehSoRecibo } from "@/lib/cs/recibo";

// As três primeiras são MENSAGENS REAIS que o Loninho postou no grupo da Equipe em 02/09, às
// 09:42, uma atrás da outra. Nenhuma carrega dado, nome, prazo ou pergunta.

describe("recibo vazio: o que o Loninho não devia ter mandado", () => {
  for (const frase of [
    "Vou ficar mais atenta, pode deixar! ⚠️",
    "Beleza, vou focar mais nisso daqui pra frente!",
    "Anotado! Vou lembrar disso 📝",
    "Ok!",
    "Perfeito, combinado 👍",
    "Entendi, pode deixar comigo",
  ]) {
    it(`cala: ${frase}`, () => expect(ehSoRecibo(frase)).toBe(true));
  }
});

describe("o que ele PRECISA continuar dizendo", () => {
  for (const frase of [
    "Carlos, bora dar uma olhada nas artes da Mr.distribuidora MDF que tão paradas há 48 dias?",
    "Beleza! O Contele já tá com a arte aprovada.",       // cortesia + nome próprio = informa
    "Anotado — prazo é dia 12.",                            // número
    "Ok, mas qual das duas artes?",                        // pergunta
    "Tem 3 cards parados no board do Rodrigo.",
    "Anotei:\n• Imperio dos Pisos\n• Contele",             // lista
    "O briefing da Nova União tá sem tom de voz — quer que eu puxe do histórico?",
  ]) {
    it(`fala: ${frase.slice(0, 45)}…`, () => expect(ehSoRecibo(frase)).toBe(false));
  }
});

describe("quem protege a confirmação de tarefa não é este detector", () => {
  it('"Boa! Vou marcar como feita" É recibo — e tudo bem', () => {
    // A frase não carrega dado nenhum, então o detector acerta em chamá-la de recibo. O que
    // impede o silêncio aqui é outro portão, em responderPapo: quando `marcada` está preenchida
    // (a tarefa foi mesmo marcada no banco), a mensagem sai independentemente disto.
    // Registrado para ninguém "consertar" o detector achando que ele erra neste caso.
    expect(ehSoRecibo("Boa! Vou marcar como feita ✅")).toBe(true);
  });
});

describe("bordas", () => {
  it("vazio é recibo (não manda mensagem em branco)", () => {
    expect(ehSoRecibo("")).toBe(true);
    expect(ehSoRecibo("   ")).toBe(true);
  });
  it("emoji na frente não engana o detector", () => {
    expect(ehSoRecibo("✅ Beleza!")).toBe(true);
  });
  it("resposta longa nunca é tratada como recibo", () => {
    expect(ehSoRecibo("Beleza. " + "detalhe ".repeat(20))).toBe(false);
  });
});
