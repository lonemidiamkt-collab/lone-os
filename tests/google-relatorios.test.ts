// tests/google-relatorios.test.ts — Google Ads e Perfil da Empresa nos relatórios e no portal (18/11/2026).
// Dados INVENTADOS, no formato que as APIs do Google devolvem (REST: int64 como texto, campo zerado ausente).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));

import { fraseDoErroAds, linhasDoStream, lerLinhasCampanha, lerLinhasAcao, juntarContas } from "@/lib/google/ads-api";
import { lerSerieDiaria, lerTermos, lerPerfis, fraseDoErroPerfil } from "@/lib/google/perfil-api";
import {
  janelaDoPerfil, montarRelatorioAds, montarRelatorioPerfil, formatarValor,
  type LinhaAdsDia, type LinhaPerfilDia,
} from "@/lib/google/relatorio";
import { janelaDoRelatorio, diasEntre } from "@/lib/reports/relatorioCliente";
import { normalizarIdAds, formatarIdAds } from "@/lib/google/ids";
import { assinarState, lerState } from "@/lib/google/estado-oauth";
import { folhasGoogle } from "@/lib/reports/relatorioGooglePdf";
import { relatorioClienteHtml } from "@/lib/reports/relatorioClientePdf";
import { estadoGoogleMarketingIntegracao } from "@/lib/integracoes/catalogo";
import { casar, nomeNormalizado, telefoneNormalizado, type ClienteParaCasar } from "@/lib/google/detectar";

// ── IDs e state ─────────────────────────────────────────────────────────────

describe("ID da conta do Google Ads", () => {
  it("aceita com e sem hífen; recusa o resto", () => {
    expect(normalizarIdAds("123-456-7890")).toBe("1234567890");
    expect(normalizarIdAds(" 1234567890 ")).toBe("1234567890");
    expect(normalizarIdAds("12345")).toBeNull();
    expect(normalizarIdAds("act_1234567890")).toBeNull();
    expect(formatarIdAds("1234567890")).toBe("123-456-7890");
  });
  it("o consentimento de marketing volta para o destino certo", () => {
    expect(lerState(assinarState("marketing"))).toEqual({ valido: true, destino: "marketing" });
  });
});

// ── Google Ads: leitura ─────────────────────────────────────────────────────

describe("Google Ads — leitura da resposta", () => {
  it("SearchStream: junta os lotes", () => {
    expect(linhasDoStream([{ results: [1, 2] }, { results: [3] }, {}])).toEqual([1, 2, 3]);
    expect(linhasDoStream(null)).toEqual([]);
  });

  it("campanha × dia: micros viram reais, int64 em texto vira número, campo ausente é zero", () => {
    const cruas = [
      { campaign: { id: "11", name: "Pesquisa | Marca", advertisingChannelType: "SEARCH" }, segments: { date: "2026-11-10" },
        metrics: { impressions: "1200", clicks: "84", costMicros: "153420000", conversions: 6.5, conversionsValue: 0 } },
      { campaign: { id: "12", name: "PMax", advertisingChannelType: "PERFORMANCE_MAX" }, segments: { date: "2026-11-10" }, metrics: {} },
      { campaign: { id: "13" }, segments: { date: "lixo" }, metrics: { clicks: "9" } },
    ];
    const ligacoes = new Map([["11|2026-11-10", 3]]);
    const l = lerLinhasCampanha(cruas, ligacoes);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ campaign_id: "11", custo: 153.42, cliques: 84, impressoes: 1200, conversoes: 6.5, ligacoes: 3 });
    expect(l[1]).toMatchObject({ campaign_id: "12", custo: 0, cliques: 0, ligacoes: 0 });
    // Sem a leitura de ligações (o Google recusou só ela): "não informado", nunca zero.
    expect(lerLinhasCampanha(cruas, null)[0].ligacoes).toBeNull();
  });

  it("ações de conversão: soma por dia/categoria/ação e descarta zero", () => {
    const a = lerLinhasAcao([
      { segments: { date: "2026-11-10", conversionActionCategory: "GET_DIRECTIONS", conversionActionName: "Rotas (local)" }, metrics: { allConversions: 4 } },
      { segments: { date: "2026-11-10", conversionActionCategory: "GET_DIRECTIONS", conversionActionName: "Rotas (local)" }, metrics: { allConversions: 2.5, conversions: 1 } },
      { segments: { date: "2026-11-10", conversionActionCategory: "PHONE_CALL_LEAD", conversionActionName: "Ligação" }, metrics: {} },
    ]);
    expect(a).toEqual([{ dia: "2026-11-10", categoria: "GET_DIRECTIONS", acao: "Rotas (local)", conversoes: 1, todas_conversoes: 6.5 }]);
  });

  it("contas: acesso direto ganha do acesso via MCC; administradora e conta cancelada ficam fora", () => {
    const contas = juntarContas([
      { raiz: "9990001111", linhas: [
        { customerClient: { id: "9990001111", descriptiveName: "MCC Lone", manager: true, status: "ENABLED" } },
        { customerClient: { id: "1234567890", descriptiveName: "Loja A", manager: false, status: "ENABLED", currencyCode: "BRL" } },
        { customerClient: { id: "2223334444", descriptiveName: "Loja Fechada", manager: false, status: "CANCELED" } },
      ] },
      { raiz: "1234567890", linhas: [{ customerClient: { id: "1234567890", descriptiveName: "Loja A", status: "ENABLED" } }] },
      { raiz: "5556667777", linhas: [{ customerClient: { id: "5556667777", descriptiveName: "Loja B", status: "ENABLED" } }] },
    ]);
    expect(contas.map((c) => [c.nome, c.loginId])).toEqual([["Loja A", null], ["Loja B", null]]);
    const viaMcc = juntarContas([{ raiz: "9990001111", linhas: [{ customerClient: { id: "1234567890", descriptiveName: "Loja A", status: "ENABLED" } }] }]);
    expect(viaMcc[0].loginId).toBe("9990001111");
  });

  it("erro do Google em frase que diz o que fazer", () => {
    const corpo = { error: { status: "PERMISSION_DENIED", details: [{ errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" }, message: "x" }] }] } };
    expect(fraseDoErroAds(403, corpo)).toMatch(/Explorer/);
    expect(fraseDoErroAds(403, { error: { message: "Google Ads API has not been used in project 123 before or it is disabled" } })).toMatch(/Ative/);
    expect(fraseDoErroAds(401, {})).toMatch(/Reconecte/);
    expect(fraseDoErroPerfil(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } })).toMatch(/cota/);
  });
});

// ── Perfil da Empresa: leitura ──────────────────────────────────────────────

describe("Perfil da Empresa — leitura da resposta", () => {
  const cru = {
    multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [
      { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 1 }, value: "3" }, { date: { year: 2026, month: 11, day: 2 } }] } },
      { dailyMetric: "BUSINESS_DIRECTION_REQUESTS", timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 2 }, value: "5" }] } },
      { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 3 }, value: "40" }] } },
      { dailyMetric: "METRICA_NOVA_QUALQUER", timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 4 }, value: "99" }] } },
    ] }],
  };
  it("uma linha por dia do intervalo, dia sem valor é zero, e o último dia que o Google já entregou", () => {
    const { linhas, ultimoDia } = lerSerieDiaria(cru, "2026-11-01", "2026-11-05");
    expect(linhas.map((l) => l.dia)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(linhas[0].ligacoes).toBe(3);
    expect(linhas[1]).toMatchObject({ ligacoes: 0, rotas: 5 });
    expect(linhas[2].impressoes_mapas_celular).toBe(40);
    // 04 e 05 sem número nenhum: o Google ainda não entregou — não é "zero".
    expect(ultimoDia).toBe("2026-11-03");
  });
  it("termos: o Google esconde número pequeno (limiar)", () => {
    expect(lerTermos({ searchKeywordsCounts: [
      { searchKeyword: "Madeireira Perto De Mim", insightsValue: { value: "120" } },
      { searchKeyword: "telha", insightsValue: { threshold: "15" } },
      { searchKeyword: "  " },
    ] })).toEqual([{ termo: "madeireira perto de mim", valor: 120, limiar: null }, { termo: "telha", valor: null, limiar: 15 }]);
  });
  it("perfis com endereço legível", () => {
    expect(lerPerfis("accounts/1", [
      { name: "locations/55", title: "Loja Centro", storefrontAddress: { addressLines: ["Rua A, 10"], locality: "Campinas", administrativeArea: "SP" } },
      { name: "lixo" },
    ])).toEqual([{ local: "locations/55", nome: "Loja Centro", endereco: "Rua A, 10 · Campinas · SP", conta: "accounts/1", telefone: null, site: null }]);
  });
});

// ── Janela do Perfil (atraso do Google) ─────────────────────────────────────

describe("janela do Perfil", () => {
  const semana = janelaDoRelatorio("2026-11-09", "2026-11-15");
  const mes = janelaDoRelatorio("2026-10-01", "2026-10-31");
  it("Google já entregou tudo → a própria janela", () => {
    expect(janelaDoPerfil(semana, "2026-11-16")?.janela).toEqual(semana);
    expect(janelaDoPerfil(semana, "2026-11-16")?.nota).toBeNull();
  });
  it("semana: recua para os 7 dias que o Google já entregou", () => {
    const j = janelaDoPerfil(semana, "2026-11-12")!;
    expect([j.janela.inicio, j.janela.fim, j.janela.dias]).toEqual(["2026-11-06", "2026-11-12", 7]);
    expect([j.anterior.inicio, j.anterior.fim]).toEqual(["2026-10-30", "2026-11-05"]);
    expect(j.nota).toMatch(/atraso/);
  });
  it("mês: corta no último dia entregue e compara com os MESMOS dias do mês anterior", () => {
    const j = janelaDoPerfil(mes, "2026-10-28")!;
    expect([j.janela.inicio, j.janela.fim, j.janela.rotulo]).toEqual(["2026-10-01", "2026-10-28", "outubro de 2026"]);
    expect([j.anterior.inicio, j.anterior.fim]).toEqual(["2026-09-01", "2026-09-28"]);
  });
  it("nada entregue → null (o bloco sai como indisponível, não como zero)", () => {
    expect(janelaDoPerfil(mes, null)).toBeNull();
    expect(janelaDoPerfil(mes, "2026-09-20")).toBeNull();
  });
});

// ── Montagem ────────────────────────────────────────────────────────────────

function linhaAds(dia: string, extra: Partial<LinhaAdsDia> = {}): LinhaAdsDia {
  return { dia, campaign_id: "11", campanha: "Pesquisa", canal: "SEARCH", impressoes: 100, cliques: 10, custo: 20, conversoes: 1, valor_conversoes: 0, ligacoes: 1, ...extra };
}
function linhaPerfil(dia: string, extra: Partial<LinhaPerfilDia> = {}): LinhaPerfilDia {
  return { dia, impressoes_busca_celular: 50, impressoes_busca_computador: 10, impressoes_mapas_celular: 30, impressoes_mapas_computador: 10, ligacoes: 2, rotas: 1, cliques_site: 3, conversas: 0, reservas: 0, cardapio: 0, ...extra };
}

describe("relatório do Google Ads", () => {
  const janela = janelaDoRelatorio("2026-11-09", "2026-11-15");
  const atual = diasEntre("2026-11-09", "2026-11-15").map((d) => linhaAds(d));
  const anterior = diasEntre("2026-11-02", "2026-11-08").map((d) => linhaAds(d, { cliques: 5, custo: 20 }));

  it("números do período, comparação e custo por conversão", () => {
    const r = montarRelatorioAds({ janela, linhas: [...anterior, ...atual], acoes: [], moeda: "BRL" });
    const k = Object.fromEntries(r.kpis.map((x) => [x.chave, x]));
    expect(k.investimento.valor).toBe(140);
    expect(k.cliques.valor).toBe(70);
    expect(k.cliques.variacaoPct).toBe(100);
    expect(k.ctr.valor).toBe(10);
    expect(k.cpc.valor).toBe(2);
    expect(k.cpc.tom).toBe("bom"); // CPC caiu de 4 para 2
    expect(k.custo_conversao.valor).toBe(20);
    expect(k.ligacoes.valor).toBe(7);
    expect(r.serieCliques).toHaveLength(7);
    expect(r.serieCliques[0]).toEqual({ dia: "2026-11-09", atual: 10, anterior: 5 });
    expect(r.frase).toMatch(/70 cliques, 100% a mais que na semana anterior e 7 conversões/);
  });

  it("período anterior sem veiculação não é base de comparação", () => {
    const r = montarRelatorioAds({ janela, linhas: atual, acoes: [] });
    expect(r.kpis.every((k) => k.anterior == null && k.variacaoPct == null)).toBe(true);
    expect(r.serieCliques[0].anterior).toBeNull();
  });

  it("sem a leitura de ligações, o KPI de ligações some (não vira zero)", () => {
    const r = montarRelatorioAds({ janela, linhas: atual.map((l) => ({ ...l, ligacoes: null })), acoes: [] });
    expect(r.kpis.find((k) => k.chave === "ligacoes")).toBeUndefined();
  });

  it("ações por categoria, com nome em português e ordenadas", () => {
    const r = montarRelatorioAds({ janela, linhas: atual, acoes: [
      { dia: "2026-11-10", categoria: "GET_DIRECTIONS", acao: "Rotas", conversoes: 0, todas_conversoes: 9 },
      { dia: "2026-11-11", categoria: "PHONE_CALL_LEAD", acao: "Ligação do anúncio", conversoes: 3, todas_conversoes: 3 },
      { dia: "2026-11-11", categoria: "PHONE_CALL_LEAD", acao: "Ligação do site", conversoes: 1, todas_conversoes: 1 },
      { dia: "2026-11-01", categoria: "PURCHASE", acao: "fora da janela", conversoes: 50, todas_conversoes: 50 },
    ] });
    expect(r.acoes.map((a) => [a.rotulo, a.todas])).toEqual([["Rotas pedidas", 9], ["Ligações", 4]]);
  });

  it("sem impressão nem custo = não rodou", () => {
    const r = montarRelatorioAds({ janela, linhas: [], acoes: [] });
    expect(r.semVeiculacao).toBe(true);
    expect(r.frase).toMatch(/não rodaram/);
  });
});

describe("relatório do Perfil da Empresa", () => {
  const janela = janelaDoRelatorio("2026-11-09", "2026-11-15");
  const linhas = [
    ...diasEntre("2026-11-02", "2026-11-08").map((d) => linhaPerfil(d, { ligacoes: 1 })),
    ...diasEntre("2026-11-09", "2026-11-15").map((d) => linhaPerfil(d)),
  ];
  it("ligações, rotas, site; busca × mapas; comparação", () => {
    const r = montarRelatorioPerfil({ janela, ultimoDia: "2026-11-15", linhas, termos: [{ termo: "a", valor: 5, limiar: null }, { termo: "b", valor: null, limiar: 15 }], termosMes: "outubro de 2026" })!;
    const k = Object.fromEntries(r.kpis.map((x) => [x.chave, x]));
    expect(k.ligacoes.valor).toBe(14);
    expect(k.ligacoes.variacaoPct).toBe(100);
    expect(k.rotas.valor).toBe(7);
    expect(k.cliques_site.valor).toBe(21);
    expect(k.acoes.valor).toBe(42);
    expect(k.visualizacoes.valor).toBe(700);
    expect(r.visualizacoes).toMatchObject({ busca: 420, mapas: 280, celular: 560, computador: 140 });
    // Reserva e cardápio zerados nos dois períodos não aparecem.
    expect(r.acoes.map((a) => a.chave)).toEqual(["ligacoes", "rotas", "cliques_site", "conversas"]);
    expect(r.termos.map((t) => t.termo)).toEqual(["b", "a"]);
    expect(r.frase).toBe("Na última semana, o seu perfil apareceu 700 vezes no Google e gerou 14 ligações, 7 rotas pedidas e 21 visitas ao site — 20% mais contatos que na semana anterior.");
  });
  it("singular quando é um só", () => {
    const r = montarRelatorioPerfil({ janela, ultimoDia: "2026-11-15", linhas: [linhaPerfil("2026-11-10", { ligacoes: 1, rotas: 0, cliques_site: 0 })] })!;
    expect(r.frase).toContain("1 ligação.");
  });
  it("Google atrasado: recua a semana e avisa", () => {
    const r = montarRelatorioPerfil({ janela, ultimoDia: "2026-11-12", linhas })!;
    expect(r.janela.fim).toBe("2026-11-12");
    expect(r.nota).toMatch(/atraso/);
    expect(r.frase.startsWith("De 6 a 12 nov 2026")).toBe(true);
  });
});

describe("formatos", () => {
  it("dinheiro, porcentagem, decimal e vazio", () => {
    expect(formatarValor(1230.5, "dinheiro")).toMatch(/R\$\s?1\.230,50/);
    expect(formatarValor(4.25, "pct")).toBe("4,3%");
    expect(formatarValor(6.5, "decimal")).toBe("6,5");
    expect(formatarValor(null, "inteiro")).toBe("—");
  });
});

// ── PDF ─────────────────────────────────────────────────────────────────────

describe("PDF: folhas do Google", () => {
  const janela = janelaDoRelatorio("2026-11-09", "2026-11-15");
  const ads = montarRelatorioAds({ janela, linhas: diasEntre("2026-11-09", "2026-11-15").map((d) => linhaAds(d)), acoes: [] });
  const perfil = montarRelatorioPerfil({ janela, ultimoDia: "2026-11-15", linhas: diasEntre("2026-11-09", "2026-11-15").map((d) => linhaPerfil(d)) });

  it("uma folha para Ads e outra para o Perfil; indisponível e sem veiculação ficam fora", () => {
    expect(folhasGoogle({ ads, perfil, adsIndisponivel: null, perfilIndisponivel: null }, "Loja")).toHaveLength(2);
    expect(folhasGoogle({ ads: null, perfil, adsIndisponivel: { motivo: "x" }, perfilIndisponivel: null }, "Loja")).toHaveLength(1);
    const parado = montarRelatorioAds({ janela, linhas: [], acoes: [] });
    expect(folhasGoogle({ ads: parado, perfil: null, adsIndisponivel: null, perfilIndisponivel: null }, "Loja")).toHaveLength(0);
  });

  it("cliente só de Google: o PDF sai com as folhas do Google", () => {
    const html = relatorioClienteHtml({ clienteNome: "Loja Teste", logo: "", geradoEm: "2026-11-16", janela, anuncios: null, instagram: null,
      google: { ads, perfil, adsIndisponivel: null, perfilIndisponivel: null } });
    expect(html).toContain("Google Ads · 9 a 15 nov 2026");
    expect(html).toContain("Perfil da Empresa no Google");
    expect(html).toContain("Rotas pedidas");
    expect((html.match(/class="folha"/g) ?? []).length).toBe(2);
  });
});

// ── Integrações ─────────────────────────────────────────────────────────────

describe("cartão Google Ads e Perfil da Empresa", () => {
  const base = { configurado: true, conectado: true, email: "x@y", ads: true, perfil: true, testeAds: { ok: true, contas: 2 }, testePerfil: { ok: true, contas: 1 }, vinculados: 3, comErro: 0, ultimaLeitura: null };
  it("desconectado com cliente vinculado é erro, sem cliente é desligado", () => {
    expect(estadoGoogleMarketingIntegracao({ ...base, conectado: false }).situacao).toBe("erro");
    expect(estadoGoogleMarketingIntegracao({ ...base, conectado: false, vinculados: 0 }).situacao).toBe("desligada");
  });
  it("permissão desmarcada no consentimento pede reconectar", () => {
    const e = estadoGoogleMarketingIntegracao({ ...base, perfil: false, testePerfil: null });
    expect(e.situacao).toBe("atencao");
    expect(e.resumo).toMatch(/Perfil da Empresa não foi aceita/);
  });
  it("teste do Google falhando aparece com a frase; tudo certo é ok", () => {
    const e = estadoGoogleMarketingIntegracao({ ...base, testeAds: { ok: false, erro: "acesso de TESTE" } });
    expect(e.situacao).toBe("atencao");
    expect(e.resumo).toContain("acesso de TESTE");
    expect(estadoGoogleMarketingIntegracao(base).situacao).toBe("ok");
    expect(estadoGoogleMarketingIntegracao({ ...base, comErro: 1 }).situacao).toBe("atencao");
  });
});

// ── Vínculo automático ──────────────────────────────────────────────────────

describe("vínculo automático do Google", () => {
  const cli = (id: string, nome: string, extra: Partial<ClienteParaCasar> = {}): ClienteParaCasar => ({
    id, name: nome, nome_fantasia: null, razao_social: null, phone: null, contact_phone: null,
    google_ads_customer_id: null, google_perfil_local: null, ...extra,
  });
  it("normaliza nome e telefone", () => {
    expect(nomeNormalizado("Serraria Sao Joao LTDA - ME")).toBe("serraria sao joao");
    expect(telefoneNormalizado("+55 (19) 99876-5432")).toBe("1998765432");
    expect(telefoneNormalizado("(19) 3232-1010")).toBe("1932321010");
  });
  it("nome igual e único → vincula sozinho; parecido → só sugere", () => {
    const r = casar([cli("a", "Ferragem Central"), cli("b", "Madeireira Boa Vista")],
      [{ chave: "1111111111", nome: "FERRAGEM CENTRAL" }, { chave: "2222222222", nome: "Madeireira Boa Vista Campinas" }], "ads");
    expect(r.automaticos.map((m) => [m.clientId, m.chave])).toEqual([["a", "1111111111"]]);
    expect(r.sugestoes.map((m) => [m.clientId, m.chave, m.motivo])).toEqual([["b", "2222222222", "nome parecido"]]);
  });
  it("perfil com o telefone do cliente → vincula", () => {
    const r = casar([cli("a", "Outro Nome", { phone: "19 99876-5432" })], [{ chave: "locations/9", nome: "Loja X", telefone: "+55 19 99876-5432" }], "perfil");
    expect(r.automaticos[0]).toMatchObject({ clientId: "a", chave: "locations/9", motivo: "mesmo telefone" });
  });
  it("dois clientes com o mesmo nome (rede com duas lojas) → ninguém vincula sozinho", () => {
    const r = casar([cli("a", "Estofados Exemplo"), cli("b", "Estofados Exemplo")], [{ chave: "1111111111", nome: "Estofados Exemplo" }], "ads");
    expect(r.automaticos).toEqual([]);
    expect(r.sugestoes).toHaveLength(2);
  });
  it("conta já vinculada a outro cliente não é oferecida; cliente já vinculado não é procurado", () => {
    const r = casar([cli("a", "Loja Boa", { google_ads_customer_id: "1111111111" }), cli("b", "Madeireira Boa Vista")], [{ chave: "1111111111", nome: "Loja Boa" }], "ads");
    expect(r.automaticos).toEqual([]);
    expect(r.sugestoes).toEqual([]);
  });
});
