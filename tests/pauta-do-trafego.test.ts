import { describe, it, expect, vi } from "vitest";

// Fase 6 — o tráfego avisa "este produto está chamando atenção"; o social recebe pautas orgânicas,
// não o anúncio. O contrato: 3 ângulos diferentes, sem repetir a oferta, com o tom do cliente.
const chamadas: { system: string; user: string }[] = [];
vi.mock("@/lib/ai/openai", () => ({
  chatJson: async (p: { system: string; user: string }) => {
    chamadas.push(p);
    return { ok: true, data: { produto: "porcelanato 90×90", angulos: [
      { titulo: "Carrossel — 3 ambientes onde o porcelanato 90×90 funciona", hook: "Piso grande em sala pequena?", formato: "Carrossel", roteiro: ["1", "2", "3", "4"], cta: "Salva pra sua obra", angulo: "educativo" },
      { titulo: "Reels — porcelanato grande deixa o ambiente maior?", hook: "Mito ou verdade?", formato: "Reels", roteiro: ["a", "b", "c", "d"], cta: "Comenta o que você acha", angulo: "curiosidade" },
      { titulo: "Post — 3 erros ao escolher porcelanato", hook: "O erro nº 2 quase todo mundo comete", formato: "Post estático", roteiro: ["x", "y", "z", "w"], cta: "Manda pra quem tá na obra", angulo: "erros" },
    ] } };
  },
}));
const { pautasDoVencedor } = await import("@/lib/traffic/pauta-do-trafego");

describe("insight do tráfego → pauta orgânica", () => {
  it("manda produto, evidência, oferta como 'não repetir', tom e palavras proibidas; exige 3 ângulos diferentes", async () => {
    const r = await pautasDoVencedor({ cliente: "Império dos Pisos", nicho: "material de construção", produto: "porcelanato 90×90", oferta: "R$ 49,90 o m²", evidencia: "R$ 3,90 por conversa — 52% abaixo da meta", tomVoz: "direto, de loja", palavrasProibidas: ["barato"] });
    expect(r.ok).toBe(true);
    const c = chamadas[0];
    expect(c.user).toContain("oferta do anúncio (NÃO repetir no orgânico): R$ 49,90 o m²");
    expect(c.user).toContain("Palavras proibidas: barato");
    expect(c.system).toMatch(/NÃO são o anúncio/);
    expect(new Set(r.data!.angulos.map((a) => a.angulo)).size).toBe(3);
  });
});
