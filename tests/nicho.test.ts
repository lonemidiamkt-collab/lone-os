import { describe, it, expect } from "vitest";
import { normalizarNicho, contextoSazonal, blocoNichoParaPrompt } from "@/lib/cs/nicho";

// A pauta semanal sempre disse no prompt "use o nicho do cliente", mas nunca recebia o nicho. E o
// cadastro estava contaminado: `industry` guardava o PACOTE vendido pela Lone ("Lone Growth" em 24
// dos 50 clientes ativos), não o ramo de ninguém.
describe("nicho do cliente", () => {
  it("pacote vendido pela Lone NÃO é ramo de cliente", () => {
    for (const p of ["Lone Growth", "Trafego Pago", "Social media", "Designer", "Tecnologia"]) {
      expect(normalizarNicho(p)).toBeNull();
    }
  });

  it("junta as variações do mesmo ramo", () => {
    // No banco: "Construção" e "Construção Civil" conviviam como se fossem coisas diferentes.
    expect(normalizarNicho("Construção")).toBe("construcao");
    expect(normalizarNicho("Construção Civil")).toBe("construcao");
    expect(normalizarNicho("Material de construção")).toBe("construcao");
    expect(normalizarNicho("Pisos e porcelanato")).toBe("construcao");
  });

  it("lê o ramo pelo nome da empresa, sem precisar de IA", () => {
    expect(normalizarNicho("Madeirão Madeira")).toBe("construcao");
    expect(normalizarNicho("Óticas Raki")).toBe("otica");
    expect(normalizarNicho("Portuga P'Neus")).toBe("automotivo");
    expect(normalizarNicho("Veterinaria Regional")).toBe("saude");
  });

  it("mesmo mês, conversa oposta conforme o ramo", () => {
    // É o pedido do Roberto: "Atlas é seguradora, então mês chuvoso". Janeiro chove: pra seguradora
    // é sinistro, pra construção é infiltração e obra parada.
    expect(contextoSazonal("seguros", 1)).toMatch(/sinistro|temporal|alagamento/i);
    expect(contextoSazonal("construcao", 1)).toMatch(/infiltra|impermeabil|chuva/i);
    expect(contextoSazonal("seguros", 1)).not.toBe(contextoSazonal("construcao", 1));
  });

  it("cala quando não sabe, em vez de chutar", () => {
    expect(blocoNichoParaPrompt("Lone Growth", 1)).toBe("");
    expect(blocoNichoParaPrompt(null, 1)).toBe("");
    expect(blocoNichoParaPrompt("Ótica", 12)).toContain("Ótica");
  });
});
