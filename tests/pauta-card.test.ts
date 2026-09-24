import { describe, it, expect } from "vitest";
import { formatoDoCard, cardDaPauta, dataSugerida, chaveDaPauta } from "@/components/planejamento/pauta-card";

describe("pauta do Radar → card", () => {
  it("traduz o formato livre para a lista do quadro", () => {
    expect(formatoDoCard("Reels de 30s com depoimento")).toBe("Reels");
    expect(formatoDoCard("Carrossel 5 lâminas")).toBe("Carrossel");
    expect(formatoDoCard("Stories em sequência")).toBe("Story");
    expect(formatoDoCard(null)).toBe("Post");
  });

  it("monta o card em Ideias com a pauta inteira no briefing", () => {
    const card = cardDaPauta({
      client_id: "c1", cliente_nome: "Imperio", ideia: "Antes e depois do piso",
      hook: "Você não vai acreditar", formato: "Reels", roteiro: ["abre", "mostra"],
      cta: "Chama no WhatsApp", porque_funciona: "prova visual",
      referencias: [{ url: "https://instagram.com/p/x", perfil: "loja" }],
    }, "Bia", "Roberto");
    expect(card).toMatchObject({ clientId: "c1", status: "ideas", format: "Reels", socialMedia: "Bia", title: "Antes e depois do piso" });
    expect(card.briefing).toContain("1. abre");
    expect(card.briefing).toContain("(https://instagram.com/p/x)");
  });

  it("Usar esta pauta: já vem com a data sugerida e a chave que impede card duplicado", () => {
    const card = cardDaPauta({
      id: "pauta-1", client_id: "c1", cliente_nome: "Imperio", ideia: "Antes e depois", hook: null,
      formato: "Carrossel", roteiro: null, cta: null, porque_funciona: null, referencias: [],
    }, null, "Bia", "2026-09-25");
    expect(card).toMatchObject({ dueDate: "2026-09-25", format: "Carrossel", status: "ideas", idempotencyKey: chaveDaPauta("pauta-1") });
  });
});

describe("data sugerida do card da pauta", () => {
  it("próximo dia de postagem (seg/qua/sex) depois de hoje", () => {
    expect(dataSugerida("2026-09-24")).toBe("2026-09-25"); // qui → sex
    expect(dataSugerida("2026-09-25")).toBe("2026-09-28"); // sex → seg
    expect(dataSugerida("2026-09-27")).toBe("2026-09-28"); // dom → seg
  });

  it("pula o dia que o cliente já tem card (e o que outra pauta acabou de pegar)", () => {
    expect(dataSugerida("2026-09-24", ["2026-09-25"])).toBe("2026-09-28");
    expect(dataSugerida("2026-09-24", ["2026-09-25", "2026-09-28", "2026-09-30"])).toBe("2026-10-02");
  });

  it("com a agenda toda cheia, volta pro primeiro dia de postagem em vez de travar", () => {
    const cheia: string[] = [];
    let d = "2026-09-24";
    for (let i = 0; i < 60; i++) { d = dataSugerida(d); cheia.push(d); }
    expect(dataSugerida("2026-09-24", cheia)).toBe("2026-09-25");
  });
});
