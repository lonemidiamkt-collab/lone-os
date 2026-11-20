// tests/google-carteira.test.ts — Tráfego › Google Ads e Tráfego › Google Meu Negócio (19/11/2026).
// Dados INVENTADOS, no formato das APIs do Google (REST: int64 como texto, campo zerado ausente).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));

import { juntarEstadoCampanhas } from "@/lib/google/ads-api";
import { lerAvaliacoes } from "@/lib/google/perfil-api";
import { montarLinhaAds, montarLinhaPerfil, leituraAtrasada, variacao, pior, type DiaAds, type EstadoCampanha, type DiaPerfil } from "@/lib/google/carteira";

const AGORA = Date.parse("2026-11-19T12:00:00Z");
const HOJE = "2026-11-19";

function dias(de: string, n: number, f: (i: number) => Partial<DiaAds>): DiaAds[] {
  const out: DiaAds[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.parse(`${de}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ dia: d, custo: 0, cliques: 0, impressoes: 0, conversoes: 0, ligacoes: null, ...f(i) });
  }
  return out;
}

const estado = (p: Partial<EstadoCampanha>): EstadoCampanha => ({
  campaign_id: "1", campanha: "Pesquisa", canal: "SEARCH", status: "ENABLED", status_principal: "ELIGIBLE", motivos_status: [],
  orcamento_diario: 30, impressoes_7d: 1000, custo_7d: 200, parcela_impressoes: 0.5, perdida_orcamento: 0.1, perdida_classificacao: 0.4, ...p,
});

describe("estado das campanhas (Google Ads API)", () => {
  it("junta cadastro e números; campanha sem linha de número = 0; parcela ausente = não informada", () => {
    const r = juntarEstadoCampanhas(
      [
        { campaign: { id: "1", name: "Pesquisa", status: "ENABLED", advertisingChannelType: "SEARCH", primaryStatus: "LIMITED", primaryStatusReasons: ["BUDGET_CONSTRAINED"] }, campaignBudget: { amountMicros: "25000000" } },
        { campaign: { id: "2", name: "PMax", status: "ENABLED", advertisingChannelType: "PERFORMANCE_MAX" }, campaignBudget: { amountMicros: "10000000" } },
      ],
      [{ campaign: { id: "1" }, metrics: { impressions: "1200", costMicros: "150500000", searchImpressionShare: 0.42, searchBudgetLostImpressionShare: 0.35, searchRankLostImpressionShare: 0.23 } }],
    );
    expect(r[0]).toMatchObject({ orcamento_diario: 25, impressoes_7d: 1200, custo_7d: 150.5, perdida_orcamento: 0.35, motivos_status: ["BUDGET_CONSTRAINED"] });
    expect(r[1]).toMatchObject({ impressoes_7d: 0, custo_7d: 0, perdida_orcamento: null, parcela_impressoes: null });
  });
  it("se a leitura dos números falhou, nada vira zero", () => {
    const [c] = juntarEstadoCampanhas([{ campaign: { id: "9", status: "ENABLED" } }], null);
    expect(c.impressoes_7d).toBeNull();
    expect(c.custo_7d).toBeNull();
  });
});

describe("linha do Google Ads na carteira", () => {
  const base = { hoje: HOJE, agora: AGORA, sincronizadoEm: "2026-11-19T10:00:00Z", erro: null };

  it("ritmo é medido até ontem (dia 18) contra a verba do Google", () => {
    // 18 dias de R$ 50 = R$ 900; verba R$ 1.500 → esperado em 18/30 = R$ 900: no ritmo.
    const l = montarLinhaAds({ ...base, verba: 1500, dias: dias("2026-11-01", 18, () => ({ custo: 50, conversoes: 1, cliques: 10, impressoes: 200 })), estados: [estado({})] });
    expect(l.mes.custo).toBe(900);
    expect(l.ritmo.dia).toBe(18);
    expect(l.leitura.tom).toBe("no_ritmo");
    expect(l.semana.custo).toBe(350);
    expect(l.custoPorConversao7d).toBe(50);
  });

  it("aponta campanha ativa sem impressão, anúncio reprovado e oportunidade de verba", () => {
    const l = montarLinhaAds({
      ...base, verba: null,
      dias: dias("2026-10-20", 30, () => ({ custo: 40, conversoes: 2, cliques: 8, impressoes: 300 })),
      estados: [
        estado({ campaign_id: "1", perdida_orcamento: 0.45, impressoes_7d: 2000 }),
        estado({ campaign_id: "2", campanha: "Marca", impressoes_7d: 0, perdida_orcamento: null, perdida_classificacao: null }),
        estado({ campaign_id: "3", campanha: "Promo", motivos_status: ["HAS_ADS_DISAPPROVED"], perdida_orcamento: null }),
      ],
    });
    const t = l.sinais.map((s) => s.titulo);
    expect(t).toContain("Anúncio reprovado");
    expect(t).toContain("Campanha ativa sem impressão");
    expect(t.some((x) => x.startsWith("Perdendo 4") && x.includes("por verba"))).toBe(true);
    expect(l.sinais.find((s) => s.titulo.includes("por verba"))!.detalhe).toContain("pedir mais verba");
    expect(t).toContain("Defina a verba do mês");
    expect(pior(l.sinais)).toBe("critico");
  });

  it("gasto sem conversão na semana vira atenção; leitura falhou é crítico", () => {
    const l = montarLinhaAds({ ...base, erro: "O acesso ao Google Ads venceu.", verba: 1000, dias: dias("2026-11-01", 18, () => ({ custo: 20 })), estados: [] });
    expect(l.sinais[0]).toMatchObject({ gravidade: "critico", titulo: "Leitura do Google falhou" });
    expect(l.sinais.map((s) => s.titulo)).toContain("Sem conversão em 7 dias");
  });

  it("nunca lida não mede ritmo (não é 'travada')", () => {
    const l = montarLinhaAds({ ...base, sincronizadoEm: null, verba: 1000, dias: [], estados: [] });
    expect(l.leitura.tom).toBe("sem_dados");
    expect(l.sinais.map((s) => s.titulo)).toContain("Leitura atrasada");
  });

  it("leitura atrasada só depois de 36 h", () => {
    expect(leituraAtrasada("2026-11-18T10:00:00Z", AGORA)).toBe(false);
    expect(leituraAtrasada("2026-11-17T10:00:00Z", AGORA)).toBe(true);
  });

  it("variação sem base é null", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(15, 10)).toBe(50);
  });
});

describe("avaliações do Perfil (My Business v4)", () => {
  it("lê nota em palavra, resposta e tira a tradução automática", () => {
    const r = lerAvaliacoes({
      reviews: [
        { reviewId: "a", starRating: "TWO", comment: "Demorou muito (Translated by Google) Took long", reviewer: { displayName: "Ana" }, createTime: "2026-11-10T10:00:00Z" },
        { name: "accounts/1/locations/2/reviews/b", starRating: "FIVE", reviewer: { isAnonymous: true }, reviewReply: { comment: "Obrigado!", updateTime: "2026-11-11T10:00:00Z" } },
      ],
    });
    expect(r[0]).toMatchObject({ review_id: "a", nota: 2, comentario: "Demorou muito", autor: "Ana", resposta: null });
    expect(r[1]).toMatchObject({ review_id: "b", nota: 5, comentario: null, autor: "Anônimo", resposta: "Obrigado!" });
  });
});

describe("linha do Perfil da Empresa na carteira", () => {
  const dia = (d: string, p: Partial<DiaPerfil>): DiaPerfil => ({
    dia: d, impressoes_busca_celular: 10, impressoes_busca_computador: 0, impressoes_mapas_celular: 5, impressoes_mapas_computador: 0,
    ligacoes: 0, rotas: 0, cliques_site: 0, conversas: 0, reservas: 0, ...p,
  });
  const serie = (de: string, n: number, p: Partial<DiaPerfil>) =>
    Array.from({ length: n }, (_, i) => dia(new Date(Date.parse(`${de}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), p));

  it("janela de 28 dias termina no último dia entregue e compara com os 28 anteriores", () => {
    const l = montarLinhaPerfil({
      hoje: HOJE, agora: AGORA, ultimoDia: "2026-11-15", sincronizadoEm: "2026-11-19T10:00:00Z", erro: null,
      dias: [...serie("2026-09-21", 28, { ligacoes: 2, rotas: 1 }), ...serie("2026-10-19", 28, { ligacoes: 1, rotas: 0 })],
      nota: 4.8, total: 60, avaliacoes: [], avaliacoesLidas: true, erroAvaliacoes: null,
    });
    expect(l.janela).toEqual({ de: "2026-10-19", ate: "2026-11-15" });
    expect(l.atual.ligacoes).toBe(28);
    expect(l.anterior.contatos).toBe(84);
    expect(l.sinais.map((s) => s.titulo)).toContain("Contatos caíram 67%");
  });

  it("fila de resposta: negativa sem resposta é crítico; nota e volume baixos viram dica", () => {
    const l = montarLinhaPerfil({
      hoje: HOJE, agora: AGORA, ultimoDia: "2026-11-15", sincronizadoEm: "2026-11-19T10:00:00Z", erro: null, dias: [],
      nota: 4.2, total: 12, avaliacoesLidas: true, erroAvaliacoes: null,
      avaliacoes: [
        { review_id: "1", nota: 2, comentario: "ruim", autor: "A", criada_em: "2026-11-15T10:00:00Z", resposta: null, respondida_em: null },
        { review_id: "2", nota: 5, comentario: null, autor: "B", criada_em: "2026-11-10T10:00:00Z", resposta: null, respondida_em: null },
        { review_id: "3", nota: 5, comentario: "top", autor: "C", criada_em: "2026-11-02T10:00:00Z", resposta: "valeu", respondida_em: "2026-11-02T12:00:00Z" },
      ],
    });
    expect(l.semResposta.map((a) => a.review_id)).toEqual(["2", "1"]);
    expect(l.negativasSemResposta).toBe(1);
    expect(l.novasNoMes).toBe(3);
    expect(l.taxaResposta90d).toBeCloseTo(0.33, 2);
    const t = l.sinais.map((s) => s.titulo);
    expect(t[0]).toBe("Avaliação negativa sem resposta");
    expect(t).toContain("2 sem resposta há mais de 48 h");
    expect(t).toContain("Nota 4,2");
    expect(t).toContain("Só 12 avaliações");
  });

  it("sem leitura das avaliações não inventa fila", () => {
    const l = montarLinhaPerfil({ hoje: HOJE, agora: AGORA, ultimoDia: null, sincronizadoEm: null, erro: null, dias: [], nota: null, total: null, avaliacoes: [], avaliacoesLidas: false, erroAvaliacoes: null });
    expect(l.janela).toBeNull();
    expect(l.sinais.map((s) => s.titulo)).toEqual(["Perfil ainda não lido"]);
  });
});
