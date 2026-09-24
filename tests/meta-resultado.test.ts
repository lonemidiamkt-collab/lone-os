// tests/meta-resultado.test.ts — Leva 7A (N4): o resultado segue o OBJETIVO da campanha
// (conversa, lead de formulário ou compra), sem somar tipos de ação que se sobrepõem.

import { describe, it, expect } from "vitest";
import {
  contarPorTipo, tipoDoObjetivo, resultadoDaCampanha, somarResultados, resultadoSemObjetivo,
  temLeadOuCompra, rotularResultado, comoTipoResultado,
} from "@/lib/meta/resultado";

const a = (action_type: string, value: number) => ({ action_type, value: String(value) });

describe("resultado pelo objetivo", () => {
  it("conta por prioridade, sem somar o agregado com as partes", () => {
    const c = contarPorTipo([
      a("onsite_conversion.messaging_conversation_started_7d", 10),
      a("lead", 7), a("onsite_conversion.lead_grouped", 5), a("offsite_conversion.fb_pixel_lead", 2),
      a("omni_purchase", 3), a("offsite_conversion.fb_pixel_purchase", 3),
    ]);
    expect(c).toEqual({ mensagens: 10, leads: 7, compras: 3 });
  });

  it("objetivo → tipo pedido", () => {
    expect(tipoDoObjetivo("OUTCOME_LEADS")).toBe("leads");
    expect(tipoDoObjetivo("LEAD_GENERATION")).toBe("leads");
    expect(tipoDoObjetivo("OUTCOME_SALES")).toBe("compras");
    expect(tipoDoObjetivo("CONVERSIONS")).toBe("compras");
    expect(tipoDoObjetivo("MESSAGES")).toBe("mensagens");
    expect(tipoDoObjetivo("OUTCOME_ENGAGEMENT")).toBe("mensagens");
    expect(tipoDoObjetivo(null)).toBe("mensagens");
  });

  it("campanha de cadastro conta leads; sem lead (destino WhatsApp) conta conversas", () => {
    expect(resultadoDaCampanha("OUTCOME_LEADS", [a("lead", 12), a("onsite_conversion.messaging_conversation_started_7d", 2)]))
      .toEqual({ valor: 12, tipo: "leads" });
    expect(resultadoDaCampanha("OUTCOME_LEADS", [a("onsite_conversion.messaging_conversation_started_7d", 9)]))
      .toEqual({ valor: 9, tipo: "mensagens" });
    expect(resultadoDaCampanha("OUTCOME_LEADS", [])).toEqual({ valor: 0, tipo: "leads" });
  });

  it("campanha de venda conta compras; campanha de mensagem ignora lead de pixel", () => {
    expect(resultadoDaCampanha("OUTCOME_SALES", [a("omni_purchase", 4), a("lead", 30)])).toEqual({ valor: 4, tipo: "compras" });
    expect(resultadoDaCampanha("MESSAGES", [a("onsite_conversion.messaging_conversation_started_7d", 20), a("lead", 3)]))
      .toEqual({ valor: 20, tipo: "mensagens" });
  });

  it("a conta soma as campanhas; tipo dominante (≥80%) ou misto", () => {
    expect(somarResultados([{ valor: 40, tipo: "mensagens" }, { valor: 2, tipo: "leads" }]))
      .toMatchObject({ resultados: 42, tipo: "mensagens", porTipo: { mensagens: 40, leads: 2, compras: 0 } });
    expect(somarResultados([{ valor: 20, tipo: "mensagens" }, { valor: 20, tipo: "leads" }]).tipo).toBe("misto");
    expect(somarResultados([{ valor: 0, tipo: "leads" }]).tipo).toBe("leads"); // conta de cadastro zerada é "0 leads"
  });

  it("sem objetivo (só a conta): conversas primeiro, como sempre", () => {
    expect(resultadoSemObjetivo([a("onsite_conversion.messaging_conversation_started_7d", 5), a("lead", 9)])).toEqual({ valor: 5, tipo: "mensagens" });
    expect(resultadoSemObjetivo([a("lead", 9)])).toEqual({ valor: 9, tipo: "leads" });
    expect(temLeadOuCompra([a("onsite_conversion.messaging_conversation_started_7d", 5)])).toBe(false);
    expect(temLeadOuCompra([a("lead", 1)])).toBe(true);
  });

  it("rótulos e leitura do banco", () => {
    expect(rotularResultado(1, "leads")).toBe("1 lead");
    expect(rotularResultado(12, "mensagens")).toBe("12 conversas");
    expect(rotularResultado(3, null)).toBe("3 conversas");
    expect(comoTipoResultado("compras")).toBe("compras");
    expect(comoTipoResultado("xyz")).toBeNull();
  });
});
