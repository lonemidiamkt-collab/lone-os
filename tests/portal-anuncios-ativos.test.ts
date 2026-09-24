import { describe, it, expect, vi, beforeEach } from "vitest";

// "Ver todos os anúncios ativos" (CEO, 24/09): a lista vem pronta no snapshot público. O que importa
// aqui: todo anúncio ativo entra (inclusive o que não trouxe conversa), a lista tem teto, a ordem é
// a combinada, e nada além do próprio anúncio vai pro celular do cliente.

const meta = vi.hoisted(() => ({
  getInsightsByDateRange: vi.fn(),
  getTopAdInsights: vi.fn(),
  getAdThumbnail: vi.fn(),
  getDemographicBreakdown: vi.fn(),
  getActiveAdsWithInsights: vi.fn(),
  fetchAccountReach: vi.fn(),
}));

vi.mock("@/lib/meta/api", () => ({
  getInsightsByDateRange: meta.getInsightsByDateRange,
  getTopAdInsights: meta.getTopAdInsights,
  getAdThumbnail: meta.getAdThumbnail,
  getDemographicBreakdown: meta.getDemographicBreakdown,
  getActiveAdsWithInsights: meta.getActiveAdsWithInsights,
}));
vi.mock("@/lib/meta/insights-server", () => ({ fetchAccountReach: meta.fetchAccountReach }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(), captureMessage: vi.fn(), setContext: vi.fn(), setTag: vi.fn(),
}));

const tabelas = vi.hoisted(() => ({ valores: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => {
  function query(tabela: string) {
    const resultado = { data: tabelas.valores[tabela] ?? null, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "in", "is", "limit"]) chain[m] = () => chain;
    chain.single = async () => resultado;
    chain.maybeSingle = async () => resultado;
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r);
    return chain;
  }
  return { supabaseAdmin: { from: (t: string) => query(t) } };
});

const { montarAnunciosAtivos, ordenarAnuncios, situacaoAnuncio, LIMITE_ANUNCIOS_ATIVOS } = await import("@/lib/portal/anunciosAtivos");
const { buildSnapshot } = await import("@/lib/portal/buildSnapshot");

const conversas = (n: number) => [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(n) }];

const ADS = [
  { id: "a1", name: "Vídeo promoção", effective_status: "ACTIVE", creative: { thumbnail_url: "https://cdn/a1.jpg" } },
  { id: "a2", name: "Carrossel", effective_status: "ACTIVE", creative: { thumbnail_url: "https://cdn/a2.jpg" } },
  { id: "a3", name: "Arte sem conversa", effective_status: "ACTIVE" },
  { id: "a4", name: "Parado no período", effective_status: "ACTIVE" },
];
const INSIGHTS = [
  { ad_id: "a1", spend: "100", clicks: "40", actions: conversas(20) }, // R$ 5,00 por conversa
  { ad_id: "a2", spend: "90", clicks: "30", actions: conversas(30) },  // R$ 3,00 por conversa
  { ad_id: "a3", spend: "55.555", clicks: "12" },                       // gastou, nenhuma conversa
  // a4: sem linha → não veiculou no período
];

describe("montarAnunciosAtivos — a lista do snapshot", () => {
  it("todo anúncio ativo entra, inclusive sem conversa e sem veiculação", () => {
    const { items, total, with_messages } = montarAnunciosAtivos(ADS, INSIGHTS);
    expect(items.map((a) => a.id)).toEqual(["a2", "a1", "a3", "a4"]);
    expect(total).toBe(4);
    expect(with_messages).toBe(2);
    expect(items.find((a) => a.id === "a3")).toMatchObject({ messages: 0, spend: 55.56, cpa: null, clicks: 12 });
    expect(items.find((a) => a.id === "a4")).toMatchObject({ messages: 0, spend: 0, cpa: null, clicks: 0, thumbnail_url: null });
  });

  it("custo por conversa com centavos e miniatura do Storage quando o criativo também está no topo", () => {
    const { items } = montarAnunciosAtivos(ADS, INSIGHTS, { thumbPaths: new Map([["a1", "c1/a1.jpg"]]) });
    expect(items.find((a) => a.id === "a1")).toMatchObject({ cpa: 5, thumbnail_path: "c1/a1.jpg", thumbnail_url: "https://cdn/a1.jpg" });
    expect(items.find((a) => a.id === "a2")?.thumbnail_path).toBeNull();
  });

  it("soma linhas repetidas do mesmo anúncio e ignora anúncio duplicado", () => {
    const { items, total } = montarAnunciosAtivos(
      [...ADS, ADS[0]],
      [...INSIGHTS, { ad_id: "a1", spend: "10", clicks: "2", actions: conversas(2) }],
    );
    expect(total).toBe(4);
    expect(items.find((a) => a.id === "a1")).toMatchObject({ messages: 22, spend: 110, clicks: 42, cpa: 5 });
  });

  it(`tem teto de ${LIMITE_ANUNCIOS_ATIVOS} itens, fica com os que mais renderam e conta o total`, () => {
    const muitos = Array.from({ length: 75 }, (_, i) => ({ id: `ad${i}`, name: `Anúncio ${i}` }));
    const ins = muitos.map((a, i) => ({ ad_id: a.id, spend: String(10 + i), actions: conversas(i % 5 === 0 ? 0 : i) }));
    const { items, total, with_messages } = montarAnunciosAtivos(muitos, ins);
    expect(items).toHaveLength(LIMITE_ANUNCIOS_ATIVOS);
    expect(total).toBe(75);
    expect(with_messages).toBe(60); // 15 dos 75 (i múltiplo de 5) não trouxeram conversa — contado antes do corte
    expect(items[0].id).toBe("ad74");
    // ordenado por conversas: nenhum item cortado tinha mais conversa que o último que ficou
    const menorQueFicou = Math.min(...items.map((a) => a.messages));
    const cortados = ins.filter((r) => !items.some((a) => a.id === r.ad_id));
    for (const r of cortados) expect(Number(r.actions[0].value)).toBeLessThanOrEqual(menorQueFicou);
  });

  it("nome vazio vira 'Anúncio sem nome' e só campos do próprio anúncio saem", () => {
    const { items } = montarAnunciosAtivos(
      [{ id: "x", name: "  ", effective_status: "ACTIVE", campaign_id: "camp_1", adset: { daily_budget: "5000" } } as never],
      [{ ad_id: "x", spend: "1", actions: conversas(1), account_id: "act_9" } as never],
    );
    expect(items[0].name).toBe("Anúncio sem nome");
    expect(Object.keys(items[0]).sort()).toEqual(
      ["clicks", "cpa", "id", "messages", "name", "spend", "thumbnail_path", "thumbnail_url"],
    );
  });
});

describe("ordenarAnuncios", () => {
  const { items } = montarAnunciosAtivos(ADS, INSIGHTS);

  it("por resultado: mais conversas primeiro; empate decide quem investiu mais", () => {
    expect(ordenarAnuncios(items, "resultado").map((a) => a.id)).toEqual(["a2", "a1", "a3", "a4"]);
  });

  it("por custo: menor custo por conversa primeiro; sem conversa vai pro fim (com verba antes de parado)", () => {
    // a2 R$ 3 < a1 R$ 5; a3 gastou sem conversa; a4 nem veiculou.
    expect(ordenarAnuncios(items, "custo").map((a) => a.id)).toEqual(["a2", "a1", "a3", "a4"]);
    const invertido = items.map((a) => (a.id === "a1" ? { ...a, cpa: 1 } : a));
    expect(ordenarAnuncios(invertido, "custo").map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("não muda a lista original", () => {
    const antes = items.map((a) => a.id);
    ordenarAnuncios(items, "custo");
    expect(items.map((a) => a.id)).toEqual(antes);
  });
});

describe("situacaoAnuncio — o selo da lista", () => {
  it("com conversa, gastou sem conversa, não veiculou", () => {
    expect(situacaoAnuncio({ messages: 3, spend: 10 })).toBe("com_resultado");
    expect(situacaoAnuncio({ messages: 0, spend: 10 })).toBe("sem_resultado");
    expect(situacaoAnuncio({ messages: 0, spend: 0 })).toBe("sem_veiculacao");
  });
});

// ── Dentro do buildSnapshot ─────────────────────────────────────────────────

const DIA = (data: string, gasto: string, cliques: string, alcance: string, msgs: number) => ({
  date_start: data, date_stop: data, spend: gasto, impressions: "1000", reach: alcance, clicks: cliques,
  ctr: "5", cpc: "2", cpm: "10", actions: conversas(msgs),
});

beforeEach(() => {
  vi.clearAllMocks();
  tabelas.valores = {
    agency_actions: [],
    ad_accounts: [{ meta_account_id: "act_123" }],
    clients: { meta_ad_account_id: "act_123" },
    agency_settings: [{ key: "meta_token", value: "tok" }],
  };
  meta.getInsightsByDateRange.mockResolvedValue([DIA("2026-09-16", "100", "50", "800", 10)]);
  meta.getTopAdInsights.mockResolvedValue([]);
  meta.getDemographicBreakdown.mockResolvedValue([]);
  meta.getAdThumbnail.mockResolvedValue(null);
  meta.fetchAccountReach.mockResolvedValue(800);
  meta.getActiveAdsWithInsights.mockResolvedValue({ ads: ADS, insights: INSIGHTS });
});

describe("buildSnapshot — anúncios ativos e comparativo diário", () => {
  const agora = new Date("2026-09-23T15:00:00Z"); // últimos 7 dias = 16 a 22/09; anterior = 9 a 15/09

  it("pede os anúncios ativos na janela do período e grava a lista no snapshot", async () => {
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week", now: agora });
    expect(meta.getActiveAdsWithInsights).toHaveBeenCalledWith("act_123", "tok", "2026-09-16", "2026-09-22");
    expect(s.ads_status).toBe("ok");
    expect(s.active_ads?.total).toBe(4);
    expect(s.active_ads?.items.map((a) => a.id)).toEqual(["a2", "a1", "a3", "a4"]);
  });

  it("a lista falhou → active_ads null, mas o snapshot segue 'ok' (e cacheável)", async () => {
    meta.getActiveAdsWithInsights.mockRejectedValue(new Error("recusado"));
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week", now: agora });
    expect(s.active_ads).toBeNull();
    expect(s.ads_status).toBe("ok");
    expect(s.kpis.spend.value).toBe(100);
  });

  it("cliques, investido e alcance do período anterior saem alinhados pelo mesmo dia relativo", async () => {
    meta.getInsightsByDateRange
      .mockResolvedValueOnce([DIA("2026-09-16", "100", "50", "800", 10), DIA("2026-09-17", "120", "60", "900", 12)])
      .mockResolvedValueOnce([DIA("2026-09-09", "80", "40", "700", 8)]); // 10/09 sem veiculação = 0
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week", now: agora });
    expect(s.chart.previous_messages).toEqual([8, 0]);
    expect(s.chart.previous_series).toEqual({ clicks: [40, 0], spend: [80, 0], reach: [700, 0] });
  });

  it("período anterior falhou → sem comparação em nenhuma aba", async () => {
    meta.getInsightsByDateRange
      .mockResolvedValueOnce([DIA("2026-09-16", "100", "50", "800", 10)])
      .mockRejectedValueOnce(new Error("recusado"));
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week", now: agora });
    expect(s.chart.previous_messages).toBeNull();
    expect(s.chart.previous_series).toBeNull();
  });
});
