import { describe, it, expect } from "vitest";
import { formatoDoCard, cardDaPauta } from "@/components/planejamento/pauta-card";

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
});
