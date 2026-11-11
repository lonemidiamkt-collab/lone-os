// Canal do Comercial → enum clients.lead_source (só aceita indicacao | trafego | organico | outros).
import { describe, it, expect } from "vitest";
import { leadSourceDaOrigem, origemDoLeadSource } from "@/lib/crm/origem-cliente";

// Os canais da ficha do lead (app/crm/page.tsx) + os que o sistema grava sozinho (site, rota, importação).
const CANAIS: Array<[string, string]> = [
  ["Indicação", "indicacao"],
  ["Parceria", "indicacao"],
  ["Anúncio → site", "trafego"],
  ["Tráfego pago", "trafego"],
  ["Site", "organico"],
  ["Instagram", "organico"],
  ["WhatsApp", "organico"],
  ["Visita — Rota Lagos", "outros"],
  ["Prospecção ativa", "outros"],
  ["Evento / networking", "outros"],
  ["Pipeline de outubro", "outros"],
  ["Outro", "outros"],
];

describe("leadSourceDaOrigem", () => {
  it.each(CANAIS)("%s → %s", (canal, esperado) => {
    expect(leadSourceDaOrigem(canal)).toBe(esperado);
  });

  it("nunca devolve valor fora do enum (o erro de 11/11/2026)", () => {
    const enumDoBanco = new Set(["indicacao", "trafego", "organico", "outros"]);
    for (const [canal] of CANAIS) expect(enumDoBanco.has(leadSourceDaOrigem(canal)!)).toBe(true);
    expect(enumDoBanco.has(leadSourceDaOrigem("qualquer coisa que alguém digitou")!)).toBe(true);
  });

  it("aceita sem acento, maiúscula e o próprio valor do enum", () => {
    expect(leadSourceDaOrigem("INDICACAO")).toBe("indicacao");
    expect(leadSourceDaOrigem("  indicação ")).toBe("indicacao");
    expect(leadSourceDaOrigem("trafego")).toBe("trafego");
  });

  it("vazio fica sem origem", () => {
    expect(leadSourceDaOrigem("")).toBeNull();
    expect(leadSourceDaOrigem(null)).toBeNull();
    expect(leadSourceDaOrigem(undefined)).toBeNull();
  });
});

describe("origemDoLeadSource", () => {
  it("volta para o rótulo que o Comercial mostra", () => {
    expect(origemDoLeadSource("indicacao")).toBe("Indicação");
    expect(origemDoLeadSource("trafego")).toBe("Tráfego pago");
    expect(origemDoLeadSource("outros")).toBe("Outro");
    expect(origemDoLeadSource(null)).toBeNull();
  });

  it("ida e volta da indicação não muda o canal", () => {
    expect(leadSourceDaOrigem(origemDoLeadSource("indicacao"))).toBe("indicacao");
    expect(leadSourceDaOrigem(origemDoLeadSource("trafego"))).toBe("trafego");
  });
});
