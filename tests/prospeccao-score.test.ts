import { describe, it, expect } from "vitest";
import { calcularScore, faturamentoSinal, classeDe, segmentoAderente } from "@/lib/prospeccao/score";
import { CONFIG_PADRAO } from "@/lib/prospeccao/config";
import type { ProspectRow } from "@/lib/prospeccao/tipos";

const AGORA = new Date("2026-09-15T12:00:00Z");

export function prospectBase(extra: Partial<ProspectRow> = {}): ProspectRow {
  return {
    id: "p1", campanha_id: null, nome: "Casa do Piso", razao_social: null, cnpj: null, cnae: "4744006", cnae_descricao: null, segmento: "Pisos e revestimentos",
    cidade: "Cabo Frio", uf: "RJ", endereco: null, cep: null, lat: null, lng: null, distancia_km: 45, modalidade_preferida: "visita", site: "https://casadopiso.com.br",
    instagram: "casadopiso", telefone: "5522999990000", whatsapp_jid: "5522999990000@s.whatsapp.net", whatsapp_lid: null, whatsapp_verificado: true, email: null,
    google_maps_url: null, google_nota: 4.6, google_avaliacoes: 320, unidades: 2, porte: "EMPRESA DE PEQUENO PORTE", capital_social: 200000, abertura: "2010-03-01",
    fontes: {}, dados_cnpj: null, presenca: { instagram_followers: 12000, posts_por_semana: 3, anuncia: true, anuncia_fonte: "web" }, faturamento_sinal: null,
    diagnostico: { oportunidades: ["x"], por_que_prospectar: "y", abordagem_recomendada: "z", gancho: "Vi que vocês têm duas lojas e mais de 300 avaliações no Google" }, score: 88, score_detalhe: null, classe: "A",
    decisor_nome: "Marcelo Ferreira", decisor_cargo: "Sócio administrador", decisor_confianca: 0.9, decisor_fontes: ["CNPJ"], decisor_telefone: null, decisor_instagram: null,
    estagio: "icp_aprovado", etapa_pipeline: null, owner: "SDR_AI", modo_agente: "ativo", pausado_ate: null, precisa_humano: false, motivo_humano: null,
    next_action_type: null, next_action_at: null, next_action_owner: null, next_action_reason: null, ultima_interacao_em: null, ultima_msg_de: null, followups: 0,
    cadencia_cancelada: false, contexto_comercial: {}, objecoes: [], gift_reserved: false, gift_type: null, gift_status: null, reuniao_em: null, reuniao_tipo: null,
    meeting_id: null, google_event_id: null, meet_url: null, crm_lead_id: null, resultado_reuniao: null, motivo_perda: null, variante_abordagem: null, primeira_abordagem_em: null,
    ranking_dia: null, ranking_pos: null, quality_gate: null, origem: "web_search", origem_query: null, created_at: "2026-09-15T09:00:00Z", updated_at: "2026-09-15T09:00:00Z",
    ...extra,
  };
}

describe("score ICP (§10)", () => {
  it("loja forte do ICP vira lead A com todos os critérios", () => {
    const r = calcularScore(prospectBase(), CONFIG_PADRAO, AGORA);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.classe).toBe("A");
    expect(r.detalhe.segmento_aderente.pontos).toBe(20);
    expect(r.detalhe.mais_de_uma_unidade.pontos).toBe(5);
    expect(r.detalhe.decisor_identificado.pontos).toBe(5);
    expect(r.detalhe.localizacao_estrategica.pontos).toBe(5);
    expect(Object.values(r.detalhe).reduce((s, i) => s + i.max, 0)).toBe(100);
  });

  it("segmento fora do ICP zera o critério e derruba a classe", () => {
    const r = calcularScore(prospectBase({ cnae: "5611201", segmento: "Restaurante" }), CONFIG_PADRAO, AGORA);
    expect(r.detalhe.segmento_aderente.pontos).toBe(0);
    expect(segmentoAderente({ cnae: "5611201", segmento: "Restaurante" }, CONFIG_PADRAO.segmentos)).toBeNull();
  });

  it("empresa sem nada pesquisado é não prioritária, não inventa pontos", () => {
    const r = calcularScore(prospectBase({ cnae: null, segmento: null, porte: null, capital_social: null, google_avaliacoes: null, google_nota: null, presenca: null, instagram: null, site: null, unidades: null, decisor_nome: null, distancia_km: null, abertura: null }), CONFIG_PADRAO, AGORA);
    expect(r.classe).toBe("NP");
    expect(r.detalhe.anuncios_ativos.motivo).toMatch(/não verificados/);
    expect(r.detalhe.faturamento_compativel.pontos).toBe(0);
  });

  it("classes seguem os cortes 80/60/40", () => {
    expect(classeDe(80)).toBe("A"); expect(classeDe(79)).toBe("B"); expect(classeDe(60)).toBe("B"); expect(classeDe(59)).toBe("C"); expect(classeDe(40)).toBe("C"); expect(classeDe(39)).toBe("NP");
  });
});

describe("faturamento é sinal, nunca fato", () => {
  it("sempre marca is_estimate e devolve faixa + confiança", () => {
    const f = faturamentoSinal(prospectBase(), AGORA);
    expect(f.is_estimate).toBe(true);
    expect(["100k_300k", "acima_300k"]).toContain(f.faixa);
    expect(f.confianca).toBeGreaterThan(0.5);
    expect(f.sinais.length).toBeGreaterThan(3);
  });
  it("sem sinais → indeterminado com confiança zero", () => {
    const f = faturamentoSinal({ porte: null, capital_social: null, google_avaliacoes: null, presenca: null, unidades: null, abertura: null }, AGORA);
    expect(f.faixa).toBe("indeterminado");
    expect(f.confianca).toBe(0);
  });
  it("MEI recém-aberto com poucas avaliações → abaixo de 100k", () => {
    const f = faturamentoSinal({ porte: "MEI", capital_social: 5000, google_avaliacoes: 12, presenca: { instagram_followers: 400 }, unidades: 1, abertura: "2025-11-01" }, AGORA);
    expect(f.faixa).toBe("abaixo_100k");
  });
});
