// Teste OFFLINE do lembrete de pendências — só a lógica pura buildPendenciasDigest.
import { describe, it, expect } from "vitest";
import { buildPendenciasDigest } from "@/lib/cs/pendencias";

describe("buildPendenciasDigest", () => {
  it("lista vazia → string vazia (chamador não posta)", () => {
    expect(buildPendenciasDigest([])).toBe("");
  });

  it("1 pendência → singular + menciona painel", () => {
    const msg = buildPendenciasDigest([
      { cliente: "Nova União", resumo: "Promoção Dia dos Pais 30% off", responsavel: "Rodrigo" },
    ]);
    expect(msg).toContain("*1 sugestão*");
    expect(msg).toContain("*Nova União* — Promoção Dia dos Pais 30% off (Rodrigo)");
    expect(msg).toContain("painel do Agente Lone");
    expect(msg).not.toContain("e mais");
  });

  it("várias pendências → plural, marca urgente e agrupa responsável", () => {
    const msg = buildPendenciasDigest([
      { cliente: "WT Shopping", resumo: "Arte da vacina de gripe", responsavel: "Pedro", urgencia: "alta" },
      { cliente: "Lagos Padrão", resumo: "Vídeo de venda", responsavel: "Pedro", urgencia: "media" },
    ]);
    expect(msg).toContain("*2 sugestões*");
    expect(msg).toContain("🔴"); // urgente marcado
    expect(msg).toContain("*WT Shopping*");
    expect(msg).toContain("*Lagos Padrão*");
  });

  it("acima do teto → resume o excedente", () => {
    const itens = Array.from({ length: 11 }, (_, i) => ({ cliente: `Cliente ${i}`, resumo: "arte" }));
    const msg = buildPendenciasDigest(itens);
    expect(msg).toContain("*11 sugestões*");
    expect(msg).toContain("…e mais 3."); // 11 - 8 listadas
  });
});
