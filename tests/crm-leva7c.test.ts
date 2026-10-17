// tests/crm-leva7c.test.ts — Comercial da Leva 7C: ganho → onboarding (N27), cadência e nota do lead
// (N28) e a proposta em PDF sem R$ (N29).

import { describe, it, expect } from "vitest";
import {
  itensOnboardingPara, nichoValido, pacoteValido, prazoEm, tarefasDaConversao, ITENS_ONBOARDING,
} from "@/lib/clients/conversao";
import { CADENCIAS, fimDaCadencia, proximoToque, rotuloToque } from "@/lib/crm/cadencia";
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

describe("Cadência por etapa (Leva 2 do comercial, out/2026 — substituiu a régua 2/5/12)", () => {
  // Contato feito: dia 0 (WhatsApp), 2, 5 (ligação), 9, 14 (visita), 21 (encerramento).
  const base = { estagio: "contato", inicio: "2026-09-21T13:00:00Z", hoje: "2026-09-21" };

  it("sem toque: o passo do dia 0 é para hoje, por WhatsApp", () => {
    expect(proximoToque({ ...base, toques: [] })).toMatchObject({ dia: 0, data: "2026-09-21", situacao: "hoje", feitos: 0, total: 6 });
    expect(proximoToque({ ...base, toques: [] })!.passo.canal).toBe("whatsapp");
    expect(proximoToque({ ...base, toques: [], hoje: "2026-09-24" })).toMatchObject({ situacao: "atrasado", diasAtraso: 3 });
  });

  it("um toque por dia conta um passo; o próximo é a ligação do dia 5", () => {
    const t = proximoToque({ ...base, hoje: "2026-09-23", toques: ["2026-09-21T15:00:00Z", "2026-09-23T12:00:00Z", "2026-09-23T18:00:00Z"] });
    expect(t).toMatchObject({ dia: 5, data: "2026-09-26", feitos: 2 });
    expect(t!.passo.canal).toBe("ligacao");
  });

  it("toque antes do dia zero (outra etapa) não conta", () => {
    expect(proximoToque({ ...base, toques: ["2026-09-20T12:00:00Z"] })).toMatchObject({ feitos: 0, dia: 0 });
  });

  it("régua completa, lead fechado ou prazo vencido: sem toque — e vira 'fim da cadência'", () => {
    const seis = ["2026-09-21", "2026-09-23", "2026-09-26", "2026-09-30", "2026-10-05", "2026-10-12"].map((d) => `${d}T12:00:00Z`);
    expect(proximoToque({ ...base, toques: seis, hoje: "2026-10-12" })).toBeNull();
    expect(fimDaCadencia({ ...base, toques: seis, hoje: "2026-10-12" })).toEqual({ desde: "2026-10-12" });
    expect(proximoToque({ ...base, estagio: "ganho", toques: [] })).toBeNull();
    expect(proximoToque({ ...base, toques: [], hoje: "2026-10-30" })).toBeNull(); // dia 21 + 7 de folga passou
    expect(fimDaCadencia({ ...base, toques: [], hoje: "2026-10-30" })).toEqual({ desde: "2026-10-12" });
    expect(CADENCIAS.contato!.map((p) => p.dia)).toEqual([0, 2, 5, 9, 14, 21]);
  });

  it("negociação: um toque a cada 3 dias depois do último", () => {
    const t = proximoToque({ estagio: "negociacao", inicio: "2026-09-21", toques: ["2026-09-24T12:00:00Z"], hoje: "2026-09-27" });
    expect(t).toMatchObject({ data: "2026-09-27", situacao: "hoje", total: null });
  });

  it("etapas antigas são lidas como as novas (reuniao → diagnóstico: dia 1 e 3)", () => {
    expect(proximoToque({ estagio: "reuniao", inicio: "2026-09-21", toques: [], hoje: "2026-09-21" })).toMatchObject({ dia: 1, etapa: "diagnostico" });
  });

  it("rótulo do card", () => {
    const t = proximoToque({ ...base, hoje: "2026-09-28", toques: ["2026-09-21T15:00:00Z", "2026-09-23T12:00:00Z"] })!;
    expect(rotuloToque(t)).toBe("Ligação do dia 5 · atrasado 2d");
    const novo = proximoToque({ estagio: "novo", inicio: "2026-09-21T13:00:00Z", toques: [], hoje: "2026-09-21" })!;
    expect(rotuloToque(novo)).toBe("Primeiro contato · hoje");
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
