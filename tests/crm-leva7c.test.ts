// tests/crm-leva7c.test.ts — Comercial da Leva 7C: ganho → onboarding (N27), cadência e nota do lead
// (N28) e a proposta em PDF sem R$ (N29).

import { describe, it, expect } from "vitest";
import {
  itensOnboardingPara, nichoValido, pacoteValido, prazoEm, tarefasDaConversao, ITENS_ONBOARDING,
} from "@/lib/clients/conversao";
import { CADENCIA, proximoToque, rotuloToque } from "@/lib/crm/cadencia";
import { camposRespondidos, normalizarQualificacao, notaDoLead } from "@/lib/crm/nota";
import { CONFIG_PADRAO } from "@/lib/prospeccao/config";
import {
  faltandoNaProposta, fatosDaPresenca, pacoteProposta, propostaPdfHtml, semDinheiro, type DadosProposta,
} from "@/lib/crm/proposta";

describe("N27 — ganho vira o cliente certo", () => {
  it("pacote e ramo validados", () => {
    expect(pacoteValido("lone_growth")).toBe(true);
    expect(pacoteValido("trafego_pago")).toBe(false); // nome legado não se vende mais
    expect(nichoValido("construcao")).toBe(true);
    expect(nichoValido("Lone Growth")).toBe(false);
  });

  it("checklist pela frente contratada (a mesma lista da aprovação do cadastro)", () => {
    expect(itensOnboardingPara("lone_growth")).toHaveLength(ITENS_ONBOARDING.length);
    expect(itensOnboardingPara("assessoria_trafego").every((i) => i.department === "traffic")).toBe(true);
    expect(itensOnboardingPara("assessoria_social").map((i) => i.department)).toEqual(["social", "social", "social", "social"]);
    expect(itensOnboardingPara("qualquer")).toHaveLength(ITENS_ONBOARDING.length);
  });

  it("nenhum grupo de WhatsApp criado sozinho: vira tarefa para o CS, com prazo", () => {
    const t = tarefasDaConversao("Tintas Bruno");
    expect(t.map((x) => x.title)).toEqual([
      "[Onboarding] Criar o grupo do WhatsApp — Tintas Bruno",
      "[Onboarding] Vincular o grupo do WhatsApp no painel — Tintas Bruno",
    ]);
    expect(t.every((x) => x.role === "social")).toBe(true);
    expect(prazoEm("2026-09-30", 2)).toBe("2026-10-02");
  });
});

describe("N28 — cadência dia 2 / 5 / 12", () => {
  const base = { estagio: "lead", inicio: "2026-09-20T13:00:00Z", hoje: "2026-09-21" };

  it("sem toque: o do dia 2 (futuro, hoje, atrasado)", () => {
    expect(proximoToque({ ...base, toques: [] })).toMatchObject({ dia: 2, data: "2026-09-22", situacao: "futuro", feitos: 0 });
    expect(proximoToque({ ...base, toques: [], hoje: "2026-09-22" })).toMatchObject({ situacao: "hoje" });
    expect(proximoToque({ ...base, toques: [], hoje: "2026-09-24" })).toMatchObject({ situacao: "atrasado", diasAtraso: 2 });
  });

  it("toque no dia zero é o primeiro contato; dois toques no mesmo dia contam um", () => {
    const t = proximoToque({ ...base, hoje: "2026-09-23", toques: ["2026-09-20T15:00:00Z", "2026-09-22T12:00:00Z", "2026-09-22T18:00:00Z"] });
    expect(t).toMatchObject({ dia: 5, data: "2026-09-25", feitos: 1 });
  });

  it("três toques ou lead fechado: sem cadência; três semanas depois, acabou", () => {
    expect(proximoToque({ ...base, toques: ["2026-09-22T12:00:00Z", "2026-09-25T12:00:00Z", "2026-10-02T12:00:00Z"] })).toBeNull();
    expect(proximoToque({ ...base, estagio: "ganho", toques: [] })).toBeNull();
    expect(proximoToque({ ...base, toques: [], hoje: "2026-10-20" })).toBeNull();
    expect(CADENCIA).toEqual([2, 5, 12]);
  });

  it("rótulo do card", () => {
    expect(rotuloToque({ dia: 5, data: "2026-09-25", feitos: 1, situacao: "futuro", diasAtraso: 0 })).toBe("Toque do dia 5 · 25/09");
    expect(rotuloToque({ dia: 2, data: "2026-09-22", feitos: 0, situacao: "atrasado", diasAtraso: 3 })).toBe("Toque do dia 2 atrasado 3d");
  });
});

describe("N28 — nota A/B/C pela régua da prospecção", () => {
  it("lead forte no ICP é A; lead fraco é NP", () => {
    const segmento = CONFIG_PADRAO.segmentos[0].nome;
    const forte = notaDoLead(normalizarQualificacao({
      segmento, porte: "DEMAIS", seguidores: 12000, postsPorSemana: 3, anuncia: true, googleNota: 4.8, googleAvaliacoes: 400,
      unidades: 3, decisor: true, site: true, uf: "RJ", distanciaKm: 10,
    }), CONFIG_PADRAO);
    expect(forte.nota).toBe("A");
    expect(forte.score).toBeGreaterThanOrEqual(80);
    const fraco = notaDoLead(normalizarQualificacao({ porte: "MEI" }), CONFIG_PADRAO);
    expect(fraco.nota).toBe("NP");
  });

  it("o que veio sujo da tela é limpo; em branco pontua como não confirmado", () => {
    const q = normalizarQualificacao({ porte: "GIGANTE", seguidores: -3, googleNota: 9, uf: "rj", anuncia: "sim", segmento: "  " });
    expect(q).toMatchObject({ porte: null, seguidores: null, googleNota: null, uf: "RJ", anuncia: null, segmento: null });
    expect(camposRespondidos(q)).toBe(1);
  });
});

describe("N29 — proposta sem R$", () => {
  const dados: DadosProposta = {
    empresa: "Tintas & Cia", decisor: "Bruno", cidade: "Araruama/RJ", segmento: "Loja de tintas",
    porQue: "Loja forte no bairro, provável R$ 100 mil/mês, que não aparece para quem busca no Instagram",
    oportunidades: ["Anunciar a linha premium (ticket de R$ 1.200)", "Postar com constância"],
    presenca: { seguidores: 1800, postsPorSemana: 0.5, googleNota: 4.7, googleAvaliacoes: 230, anuncia: false },
    pacote: pacoteProposta("assessoria_trafego"),
  };

  it("tira qualquer valor em reais do texto", () => {
    expect(semDinheiro("provável R$ 100 mil/mês, que não")).toBe("provável , que não");
    expect(semDinheiro("ticket de R$ 1.200")).toBe("ticket de");
  });

  it("PDF sem R$ e sem estimativa de faturamento; com os fatos lidos e o pacote", () => {
    const html = propostaPdfHtml(dados, "", "24/09/2026");
    expect(html).not.toMatch(/R\$/);
    expect(html).toContain("Tintas &amp; Cia");
    expect(html).toContain("Assessoria de Tráfego");
    expect(html).toContain("1.800 seguidores no Instagram");
    expect(html).toContain("Não encontramos anúncios ativos no Meta");
    expect(html).toContain("primeiros anúncios no ar");
  });

  it("sem diagnóstico não gera; pacote desconhecido cai no Lone Growth", () => {
    expect(faltandoNaProposta({ ...dados, porQue: null, oportunidades: [] })).toHaveLength(1);
    expect(pacoteProposta("xyz")).toBe("lone_growth");
    expect(fatosDaPresenca({ seguidores: null, postsPorSemana: null, googleNota: null, googleAvaliacoes: null, anuncia: null })).toEqual([]);
  });
});
