// tests/google-analytics.test.ts — o site do cliente (Google Analytics 4) na aba Google do portal (19/11/2026).
// Dados INVENTADOS, no formato que a Data API e a Admin API do GA4 devolvem (data "AAAAMMDD", métrica em texto).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));

import { deDataGa, lerLinhasDia, lerLinhasEvento, lerPropriedades, fraseDoErroAnalytics } from "@/lib/google/analytics-api";
import {
  acaoDoEvento, contatosDoSitePorDia, montarRelatorioSite, rotuloCanalSite,
  type LinhaSiteDia, type LinhaSiteEvento,
} from "@/lib/google/relatorio";
import { janelaDoRelatorio } from "@/lib/reports/relatorioCliente";
import { casar, nomeNormalizado, type ClienteParaCasar } from "@/lib/google/detectar";
import { estadoGoogleMarketingIntegracao } from "@/lib/integracoes/catalogo";

describe("GA4 — leitura da resposta", () => {
  it("data AAAAMMDD vira AAAA-MM-DD; lixo é descartado", () => {
    expect(deDataGa("20261118")).toBe("2026-11-18");
    expect(deDataGa("2026-11-18")).toBeNull();
    expect(deDataGa(undefined)).toBeNull();
  });

  it("dia × canal: métrica em texto vira inteiro; linha sem data some", () => {
    const l = lerLinhasDia({ rows: [
      { dimensionValues: [{ value: "20261110" }, { value: "Organic Search" }], metricValues: [{ value: "120" }, { value: "80" }, { value: "301" }, { value: "95" }] },
      { dimensionValues: [{ value: "20261110" }, { value: "" }], metricValues: [{ value: "3" }] },
      { dimensionValues: [{ value: "(other)" }, { value: "Direct" }], metricValues: [{ value: "9" }] },
    ] });
    expect(l).toHaveLength(2);
    expect(l[0]).toEqual({ dia: "2026-11-10", canal: "Organic Search", sessoes: 120, sessoes_engajadas: 80, visualizacoes: 301, novos_usuarios: 95 });
    expect(l[1]).toMatchObject({ canal: "(not set)", sessoes: 3, sessoes_engajadas: 0 });
  });

  it("dia × evento × link: junta repetidos e guarda o link", () => {
    const l = lerLinhasEvento({ rows: [
      { dimensionValues: [{ value: "20261110" }, { value: "click" }, { value: "https://wa.me/5519999999999" }], metricValues: [{ value: "4" }] },
      { dimensionValues: [{ value: "20261110" }, { value: "click" }, { value: "https://wa.me/5519999999999" }], metricValues: [{ value: "2" }] },
      { dimensionValues: [{ value: "20261110" }, { value: "" }, { value: "x" }], metricValues: [{ value: "9" }] },
    ] }, true);
    expect(l).toEqual([{ dia: "2026-11-10", evento: "click", link: "https://wa.me/5519999999999", contagem: 6 }]);
  });

  it("propriedades: lê as de todas as contas e ignora o que não é properties/<n>", () => {
    const p = lerPropriedades({ accountSummaries: [
      { account: "accounts/1", displayName: "Reformar Pisos", propertySummaries: [{ property: "properties/111", displayName: "Site" }, { property: "lixo" }] },
      { account: "accounts/2", propertySummaries: [{ property: "properties/222", displayName: "www.ferragemcentral.com.br - GA4" }] },
    ] });
    expect(p).toEqual([
      { propriedade: "properties/111", nome: "Site", conta: "accounts/1", contaNome: "Reformar Pisos" },
      { propriedade: "properties/222", nome: "www.ferragemcentral.com.br - GA4", conta: "accounts/2", contaNome: null },
    ]);
  });

  it("erros do Google viram frase que o time resolve", () => {
    expect(fraseDoErroAnalytics(403, { error: { status: "PERMISSION_DENIED", message: "Google Analytics Data API has not been used in project 1 before or it is disabled" } })).toMatch(/Ative a Google Analytics Data API/);
    expect(fraseDoErroAnalytics(403, { error: { status: "PERMISSION_DENIED", message: "Request had insufficient authentication scopes.", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } })).toMatch(/Reconecte .* permissão do Analytics/);
    expect(fraseDoErroAnalytics(403, { error: { status: "PERMISSION_DENIED", message: "User does not have sufficient permissions for this property." } })).toMatch(/Leitor/);
    expect(fraseDoErroAnalytics(429, { error: { status: "RESOURCE_EXHAUSTED" } })).toMatch(/próxima rodada/);
  });
});

describe("GA4 — o que é contato", () => {
  it("clique em link: WhatsApp e telefone; outro site não é contato", () => {
    expect(acaoDoEvento("click", "https://wa.me/5519999999999?text=oi")).toBe("whatsapp");
    expect(acaoDoEvento("click", "https://api.whatsapp.com/send?phone=55")).toBe("whatsapp");
    expect(acaoDoEvento("click", "tel:+5519999999999")).toBe("ligacao");
    expect(acaoDoEvento("click", "https://instagram.com/loja")).toBeNull();
  });
  it("evento do site pelo nome", () => {
    expect(acaoDoEvento("clique_whatsapp", "")).toBe("whatsapp");
    expect(acaoDoEvento("botao_wpp", "")).toBe("whatsapp");
    expect(acaoDoEvento("click_to_call", "")).toBe("ligacao");
    expect(acaoDoEvento("clique_telefone", "")).toBe("ligacao");
    expect(acaoDoEvento("generate_lead", "")).toBe("formulario");
    expect(acaoDoEvento("form_submit", "")).toBe("formulario");
    expect(acaoDoEvento("enviar_formulario", "")).toBe("formulario");
    // Começar a preencher não é mandar; "hotel" não é telefone.
    expect(acaoDoEvento("form_start", "")).toBeNull();
    expect(acaoDoEvento("reserva_hotel", "")).toBeNull();
    expect(acaoDoEvento("purchase", "")).toBeNull();
  });
  it("o mesmo clique gravado duas vezes (evento do site + clique no link) conta UMA vez por dia", () => {
    const ev: LinhaSiteEvento[] = [
      { dia: "2026-11-10", evento: "clique_whatsapp", link: "", contagem: 5 },
      { dia: "2026-11-10", evento: "click", link: "https://wa.me/551", contagem: 4 },
      { dia: "2026-11-10", evento: "click", link: "https://wa.me/552", contagem: 2 }, // os links juntos são UMA fonte: 6
      { dia: "2026-11-11", evento: "click", link: "https://wa.me/551", contagem: 3 },
    ];
    const m = contatosDoSitePorDia(ev, "whatsapp");
    expect(m.get("2026-11-10")).toBe(6);
    expect(m.get("2026-11-11")).toBe(3);
  });
});

const dia = (d: string, canal: string, sessoes: number, extra: Partial<LinhaSiteDia> = {}): LinhaSiteDia =>
  ({ dia: d, canal, sessoes, sessoes_engajadas: Math.round(sessoes / 2), visualizacoes: sessoes * 2, novos_usuarios: Math.round(sessoes * 0.7), ...extra });

describe("GA4 — o bloco do site", () => {
  const janela = janelaDoRelatorio("2026-11-10", "2026-11-16");
  const anterior = janelaDoRelatorio("2026-11-03", "2026-11-09");

  it("visitas, contatos do site, canais em português e a frase sem 'conversão'", () => {
    const dias = [
      dia("2026-11-10", "Organic Search", 60), dia("2026-11-10", "Paid Search", 30), dia("2026-11-12", "Direct", 10),
      dia("2026-11-12", "Unassigned", 2), dia("2026-11-12", "(not set)", 1),
      dia("2026-11-04", "Organic Search", 50),
    ];
    const eventos: LinhaSiteEvento[] = [
      { dia: "2026-11-10", evento: "click", link: "https://wa.me/551", contagem: 12 },
      { dia: "2026-11-12", evento: "generate_lead", link: "", contagem: 3 },
      { dia: "2026-11-04", evento: "click", link: "https://wa.me/551", contagem: 8 },
    ];
    const r = montarRelatorioSite({ janela, anterior, dias, eventos });
    expect(r.kpis.find((k) => k.chave === "visitas")).toMatchObject({ valor: 103, anterior: 50 });
    expect(r.acoes.map((a) => [a.chave, a.valor, a.anterior])).toEqual([["whatsapp", 12, 8], ["formulario", 3, 0]]);
    // Ligação: o site nunca registrou → não aparece como "0".
    expect(r.kpis.some((k) => k.chave === "ligacao")).toBe(false);
    expect(r.canais[0]).toMatchObject({ rotulo: "Pesquisa no Google (sem anúncio)", visitas: 60, pct: 58 });
    // "Unassigned" e "(not set)" juntos.
    expect(r.canais.find((c) => c.rotulo === "Origem não identificada")?.visitas).toBe(3);
    expect(r.frase.replace(/\s/g, " ")).toBe("Na última semana, o seu site recebeu 103 visitas, 106% a mais que na semana anterior, e 12 pessoas clicaram no WhatsApp e 3 mandaram formulário.");
    expect(r.frase).not.toMatch(/convers/i);
    expect(r.seriePorChave.whatsapp?.find((p) => p.dia === "2026-11-10")).toMatchObject({ atual: 12, anterior: 0 });
    expect(r.semContatosMedidos).toBe(false);
  });

  it("site sem nenhum contato medido avisa (em vez de mostrar zero)", () => {
    const r = montarRelatorioSite({ janela, anterior, dias: [dia("2026-11-10", "Direct", 5)], eventos: [] });
    expect(r.acoes).toEqual([]);
    expect(r.semContatosMedidos).toBe(true);
    expect(r.frase.replace(/\s/g, " ")).toBe("Na última semana, o seu site recebeu 5 visitas.");
  });

  it("período anterior sem visitas não é base de comparação", () => {
    const r = montarRelatorioSite({ janela, anterior, dias: [dia("2026-11-10", "Direct", 5)], eventos: [] });
    expect(r.kpis.find((k) => k.chave === "visitas")?.variacaoPct).toBeNull();
    expect(r.serieVisitas[0].anterior).toBeNull();
  });

  it("canal desconhecido aparece como o GA4 mandou", () => {
    expect(rotuloCanalSite("Organic Maps")).toBe("Google Maps");
    expect(rotuloCanalSite("Canal Novo")).toBe("Canal Novo");
  });
});

describe("GA4 — vínculo automático", () => {
  const cli = (id: string, nome: string, extra: Partial<ClienteParaCasar> = {}): ClienteParaCasar => ({
    id, name: nome, nome_fantasia: null, razao_social: null, phone: null, contact_phone: null,
    google_ads_customer_id: null, google_perfil_local: null, google_analytics_propriedade: null, ...extra,
  });
  it("o domínio no nome da propriedade não atrapalha", () => {
    expect(nomeNormalizado("www.ferragemcentral.com.br - GA4")).toBe("ferragemcentral");
    expect(nomeNormalizado("Reformar Pisos")).toBe("reformar pisos");
  });
  it("nome da CONTA do Analytics igual ao cliente vincula; propriedade já usada não é oferecida", () => {
    const r = casar(
      [cli("a", "Reformar Pisos"), cli("b", "Outra Loja", { google_analytics_propriedade: "properties/222" })],
      [{ chave: "properties/111", nome: "Site", outrosNomes: ["Reformar Pisos"] }, { chave: "properties/222", nome: "Outra Loja" }],
      "analytics");
    expect(r.automaticos.map((m) => [m.clientId, m.chave])).toEqual([["a", "properties/111"]]);
  });
  it("duas propriedades na mesma conta do cliente: só sugere", () => {
    const r = casar([cli("a", "Reformar Pisos")],
      [{ chave: "properties/1", nome: "Site", outrosNomes: ["Reformar Pisos"] }, { chave: "properties/2", nome: "Loja virtual", outrosNomes: ["Reformar Pisos"] }],
      "analytics");
    expect(r.automaticos).toEqual([]);
    expect(r.sugestoes).toHaveLength(2);
  });
});

describe("Integrações — permissão do Analytics", () => {
  const base = {
    configurado: true, conectado: true, email: "x@y.com", ads: true, perfil: true,
    testeAds: { ok: true, contas: 2 }, testePerfil: { ok: true, contas: 1 }, vinculados: 3, comErro: 0, ultimaLeitura: null,
  };
  it("conexão antiga sem o Analytics pede reconectar", () => {
    const e = estadoGoogleMarketingIntegracao({ ...base, analytics: false });
    expect(e.situacao).toBe("atencao");
    expect(e.resumo).toMatch(/Google Analytics não foi aceita/);
  });
  it("com o Analytics, mostra quantos sites enxerga", () => {
    const e = estadoGoogleMarketingIntegracao({ ...base, analytics: true, testeAnalytics: { ok: true, contas: 4 } });
    expect(e.situacao).toBe("ok");
    expect(e.detalhes).toContain("Google Analytics: 4 site(s)");
  });
});
