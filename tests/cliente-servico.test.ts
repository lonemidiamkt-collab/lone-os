import { describe, it, expect } from "vitest";
import { temTrafego, temSocial, podeFalarDeAnuncio, rotuloServico } from "@/lib/clients/servico";

// O caso que motivou este arquivo, com os dados reais de 11/09/2026: o Dumar Comercio e serviços é
// `assessoria_social` e tem `meta_ad_account_id = act_2350633382029247`. O código antigo decidia o
// texto da mensagem semanal por esse campo, e por isso mandou "nosso lado anúncios" e "de olho nas
// campanhas" para o grupo de um cliente que nunca comprou tráfego.
const DUMAR = { service_type: "assessoria_social", meta_ad_account_id: "act_2350633382029247", assigned_traffic: "Julio" };

describe("quem pode ouvir falar de anúncio", () => {
  it("só-social não pode, nem com conta de anúncio vinculada", () => {
    expect(podeFalarDeAnuncio(DUMAR)).toBe(false);
    expect(temTrafego(DUMAR)).toBe(false);
    expect(temSocial(DUMAR)).toBe(true);
  });

  it("só-social com gestor de tráfego preenchido também não pode", () => {
    // 3 clientes só-social têm assigned_traffic preenchido (CIIL, Dumar, Império teste).
    // Responsável atribuído não é contrato.
    expect(podeFalarDeAnuncio({ service_type: "assessoria_social" })).toBe(false);
  });

  it("os pacotes com tráfego podem", () => {
    for (const t of ["lone_growth", "assessoria_trafego", "trafego_pago", "trafego_social_site"]) {
      expect(podeFalarDeAnuncio({ service_type: t }), t).toBe(true);
    }
  });

  it("os pacotes sem tráfego não podem", () => {
    for (const t of ["assessoria_social", "assessoria_design", "site"]) {
      expect(podeFalarDeAnuncio({ service_type: t }), t).toBe(false);
    }
  });
});

describe("na dúvida, cala", () => {
  it("service_type vazio, nulo ou desconhecido não autoriza falar de anúncio", () => {
    // Deliberado: falar de campanha com quem não tem campanha chega ao CLIENTE e queima a agência.
    // O silêncio é recuperável pelo gestor, que fala com ele todo dia.
    for (const c of [{}, { service_type: null }, { service_type: "" }, { service_type: "   " }, { service_type: "pacote_novo_ainda_nao_mapeado" }]) {
      expect(podeFalarDeAnuncio(c)).toBe(false);
      expect(temSocial(c)).toBe(false);
    }
  });

  it("ignora caixa e espaço em volta", () => {
    expect(temTrafego({ service_type: "  LONE_GROWTH  " })).toBe(true);
    expect(temSocial({ service_type: "Assessoria_Social" })).toBe(true);
  });
});

describe("rótulo", () => {
  it("descreve o que o cliente comprou", () => {
    expect(rotuloServico({ service_type: "lone_growth" })).toBe("tráfego + social");
    expect(rotuloServico({ service_type: "assessoria_trafego" })).toBe("só tráfego");
    expect(rotuloServico(DUMAR)).toBe("só social");
    expect(rotuloServico({ service_type: "" })).toBe("indefinido");
  });
});
