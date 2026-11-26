// tests/portal-hoje-bordas.test.ts — "Hoje" do Painel de Resultados (as últimas horas do dia, por cliente)
// nas bordas: fuso de São Paulo na virada do dia, corte de "ontem até a mesma hora", custo por resultado
// sem divisão por zero, cliente sem conta, Meta fora e o painel pela metade que deve SE COMPLETAR SOZINHO.
//
// O bug de 26/11/2026: o "Hoje" guardava o snapshot incompleto (criativos ou lista de anúncios recusados pela
// Meta) como "fresco" por 15 min. A tela busca de novo sozinha (20 s e 40 s depois) para completar, mas
// recebia sempre o mesmo painel pela metade — a busca automática nunca completava o "Hoje".

import { describe, it, expect, vi, beforeEach } from "vitest";

const meta = vi.hoisted(() => ({
  getInsightsByDateRange: vi.fn(),
  getHourlyInsights: vi.fn(),
  getTopAdInsights: vi.fn(),
  getAdThumbnail: vi.fn(),
  getDemographicBreakdown: vi.fn(),
  getActiveAdsWithInsights: vi.fn(),
  fetchAccountReach: vi.fn(),
}));
vi.mock("@/lib/meta/api", () => ({
  getInsightsByDateRange: meta.getInsightsByDateRange,
  getHourlyInsights: meta.getHourlyInsights,
  getTopAdInsights: meta.getTopAdInsights,
  getAdThumbnail: meta.getAdThumbnail,
  getDemographicBreakdown: meta.getDemographicBreakdown,
  getActiveAdsWithInsights: meta.getActiveAdsWithInsights,
}));
vi.mock("@/lib/meta/insights-server", () => ({ fetchAccountReach: meta.fetchAccountReach }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn(), setContext: vi.fn(), setTag: vi.fn() }));

const tabelas = vi.hoisted(() => ({ valores: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => {
  function query(tabela: string) {
    const resultado = { data: tabelas.valores[tabela] ?? null, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "in", "is", "limit", "delete"]) chain[m] = () => chain;
    chain.single = async () => resultado;
    chain.maybeSingle = async () => resultado;
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r);
    return chain;
  }
  return { supabaseAdmin: { from: (t: string) => query(t) } };
});

const { buildSnapshot, calcPeriod, horaSP, porHora } = await import("@/lib/portal/buildSnapshot");
const cache = await import("@/lib/portal/snapshotCache");

const CONVERSA = "onsite_conversion.messaging_conversation_started_7d";
const acoes = (n: number, tipo = CONVERSA) => (n ? [{ action_type: tipo, value: String(n) }] : []);
const hora = (h: number, spend: string, n: number, tipo = CONVERSA) => ({
  hourly_stats_aggregated_by_advertiser_time_zone: `${String(h).padStart(2, "0")}:00:00 - ${String(h).padStart(2, "0")}:59:59`,
  date_start: "x", spend, clicks: "2", actions: acoes(n, tipo),
});
/** Horas de hoje e de ontem que a "Meta" devolve, por dia. */
let horasPorDia: Record<string, ReturnType<typeof hora>[]> = {};

const BASE = () => ({
  agency_actions: [],
  ad_accounts: [{ meta_account_id: "act_123" }],
  clients: { meta_ad_account_id: "act_123" },
  agency_settings: [{ key: "meta_token", value: "tok" }],
});

beforeEach(() => {
  vi.clearAllMocks();
  tabelas.valores = BASE();
  horasPorDia = {};
  meta.getHourlyInsights.mockImplementation(async (_c: string, _t: string, dia: string) => horasPorDia[dia] ?? []);
  meta.getTopAdInsights.mockResolvedValue([]);
  meta.getDemographicBreakdown.mockResolvedValue([]);
  meta.getAdThumbnail.mockResolvedValue(null);
  meta.getActiveAdsWithInsights.mockResolvedValue({ ads: [], insights: [] });
  meta.fetchAccountReach.mockResolvedValue(500);
});

// ── Fuso e janela ────────────────────────────────────────────────────────────────────────────────

describe("janela do Hoje no fuso de São Paulo", () => {
  it("23h59 de SP (02h59 UTC do dia seguinte) ainda é o dia de SP, hora 23", () => {
    const quase = new Date("2026-11-06T02:59:59Z");
    expect(calcPeriod("today", quase)).toMatchObject({ start: "2026-11-05", end: "2026-11-05", previous_start: "2026-11-04" });
    expect(horaSP(quase)).toBe(23);
  });

  it("meia-noite de SP (03h00 UTC) já é o dia novo, hora 0", () => {
    const meiaNoite = new Date("2026-11-06T03:00:00Z");
    expect(calcPeriod("today", meiaNoite)).toMatchObject({ start: "2026-11-06", previous_start: "2026-11-05" });
    expect(horaSP(meiaNoite)).toBe(0);
  });

  it("dia 1º de janeiro compara com 31 de dezembro do ano anterior", () => {
    const anoNovo = new Date("2027-01-01T12:00:00Z");
    expect(calcPeriod("today", anoNovo)).toMatchObject({ start: "2027-01-01", previous_start: "2026-12-31", previous_end: "2026-12-31" });
  });

  it("porHora: só até a hora pedida, fora de ordem, e hora ilegível ignorada", () => {
    const linhas = porHora(
      [hora(2, "5", 1), hora(0, "1", 0), { ...hora(1, "9", 9), hourly_stats_aggregated_by_advertiser_time_zone: "lixo" }],
      "2026-11-05", 2,
    );
    expect(linhas.map((l) => l.date_start)).toEqual(["2026-11-05T00", "2026-11-05T01", "2026-11-05T02"]);
    expect(linhas.map((l) => l.spend)).toEqual(["1", "0", "5"]);
    expect(porHora([], "2026-11-05", 23)).toHaveLength(24);
  });
});

// ── Agregação ────────────────────────────────────────────────────────────────────────────────────

describe("agregação do Hoje", () => {
  it("00h30 de SP: só a hora 0 de hoje contra a hora 0 de ontem", async () => {
    horasPorDia = {
      "2026-11-06": [hora(0, "4", 1)],
      "2026-11-05": [hora(0, "2", 2), hora(1, "50", 10), hora(23, "50", 10)],
    };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-06T03:30:00Z") });
    expect(s.period.start).toBe("2026-11-06");
    expect(s.chart.days).toEqual(["2026-11-06T00"]);
    expect(s.kpis.messages).toMatchObject({ value: 1, delta_pct: -50, direction: "down" });
    expect(s.kpis.spend).toMatchObject({ value: 4, delta_pct: 100, direction: "up" });
  });

  it("ontem entra até a hora atual inclusive e sai a partir da seguinte", async () => {
    horasPorDia = {
      "2026-11-05": [hora(9, "30", 3), hora(10, "10", 1)],
      "2026-11-04": [hora(10, "20", 2), hora(11, "99", 99)],
    };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:59:00Z") }); // 10h59 SP
    expect(s.kpis.messages).toMatchObject({ value: 4, delta_pct: 100 });
    expect(s.kpis.spend).toMatchObject({ value: 40, delta_pct: 100 });
    expect(s.chart.previous_messages?.[10]).toBe(2);
    expect(s.chart.previous_messages).toHaveLength(11);
    expect(s.chart.peak).toEqual({ metric: "messages", day: "2026-11-05T09", value: 3 });
  });

  it("custo por resultado = investido ÷ resultados, arredondado em centavos", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "10", 2), hora(9, "0.01", 1)], "2026-11-04": [hora(8, "9", 3)] };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.kpis.cpa.value).toBe(3.34); // 10,01 ÷ 3
    expect(s.kpis.cpa.delta_pct).toBe(11.2); // 3,3367 × 3,00
  });

  it("gasto sem resultado: custo fica vazio (nunca Infinity/NaN) e ontem sem resultado não gera %", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "25", 0)], "2026-11-04": [hora(8, "0", 0)] };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.kpis.cpa).toEqual({ value: null, delta_pct: null, direction: "neutral" });
    expect(s.kpis.messages).toMatchObject({ value: 0, delta_pct: null, direction: "neutral" });
    expect(s.kpis.spend).toMatchObject({ value: 25, delta_pct: null });
    expect(s.chart.peak).toBeNull();
  });

  it("resultado hoje com ontem zerado: custo existe, sem % (divisão por zero)", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "20", 4)], "2026-11-04": [] };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.kpis.cpa).toMatchObject({ value: 5, delta_pct: null });
    expect(s.kpis.messages.delta_pct).toBeNull();
  });

  it("nada rodou hoje ainda: zeros de verdade e alcance 0 (não 'sem número', que parece falha)", async () => {
    meta.fetchAccountReach.mockResolvedValue(null); // a Meta devolve alcance 0 → fetchAccountReach vira null
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T09:10:00Z") });
    expect(s.ads_status).toBe("ok");
    expect(s.kpis.spend.value).toBe(0);
    expect(s.kpis.messages.value).toBe(0);
    expect(s.kpis.cpa.value).toBeNull();
    expect(s.kpis.reach).toMatchObject({ value: 0, delta_pct: null });
    expect(s.chart.days).toHaveLength(7); // 0h a 6h
  });

  it("gastou hoje e o alcance falhou: fica sem número (nunca zero falso)", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "10", 1)] };
    meta.fetchAccountReach.mockResolvedValue(null);
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.kpis.reach.value).toBeNull();
  });

  it("conta de formulário: conta leads quando não há conversa", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "30", 3, "lead")], "2026-11-04": [hora(8, "30", 1, "lead")] };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.result_kind).toBe("leads");
    expect(s.kpis.messages).toMatchObject({ value: 3, delta_pct: 200 });
    expect(s.kpis.cpa.value).toBe(10);
  });
});

// ── Cliente sem conta, token e Meta fora ─────────────────────────────────────────────────────────

describe("Hoje sem conta conectada ou com a Meta fora", () => {
  it("cliente sem conta de anúncio: 'sem_conta' com zeros e nenhuma chamada à Meta", async () => {
    tabelas.valores = { ...BASE(), ad_accounts: [], clients: { meta_ad_account_id: null } };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.ads_status).toBe("sem_conta");
    expect(s.kpis.spend.value).toBe(0);
    expect(meta.getHourlyInsights).not.toHaveBeenCalled();
  });

  it("conta ligada sem token Meta: 'indisponível' com números null (não zero)", async () => {
    tabelas.valores = { ...BASE(), agency_settings: [] };
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.ads_status).toBe("indisponivel");
    expect(s.kpis.spend.value).toBeNull();
  });

  it("as horas de hoje falharam: 'indisponível'", async () => {
    meta.getHourlyInsights.mockImplementation(async (_c: string, _t: string, dia: string) => {
      if (dia === "2026-11-05") throw new Error("HTTP 500");
      return [];
    });
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.ads_status).toBe("indisponivel");
  });

  it("só ontem falhou: números de hoje aparecem, sem comparação", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "10", 2)] };
    meta.getHourlyInsights.mockImplementation(async (_c: string, _t: string, dia: string) => {
      if (dia === "2026-11-04") throw new Error("HTTP 500");
      return horasPorDia[dia] ?? [];
    });
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: new Date("2026-11-05T13:30:00Z") });
    expect(s.ads_status).toBe("ok");
    expect(s.kpis.messages).toMatchObject({ value: 2, delta_pct: null });
    expect(s.chart.previous_messages).toBeNull();
  });
});

// ── O automático: cache do Hoje e o painel que se completa sozinho ──────────────────────────────

describe("cache do Hoje e o painel que se completa sozinho", () => {
  const AGORA = new Date("2026-11-05T13:30:00Z");
  const depois = (min: number) => new Date(AGORA.getTime() + min * 60_000);
  const snap = (extra: Record<string, unknown> = {}) =>
    ({ period: { start: "2026-11-05" }, ads_status: "ok", active_ads: { items: [], total: 0, with_messages: 0 }, ...extra }) as never;

  it("decidirHoje: completo vale 15 min; incompleto nunca é 'fresco'", () => {
    const em = AGORA.getTime();
    expect(cache.decidirHoje({ data: snap(), em }, depois(10))).toBe("fresco");
    expect(cache.decidirHoje({ data: snap({ ads_status: "parcial" }), em }, depois(0.5))).toBe("reserva");
    expect(cache.decidirHoje({ data: snap({ active_ads: null }), em }, depois(0.5))).toBe("reserva");
    expect(cache.decidirHoje({ data: snap({ ads_status: "parcial" }), em }, depois(61))).toBe("buscar");
    expect(cache.decidirHoje({ data: snap({ ads_status: "sem_conta", active_ads: null }), em }, depois(10))).toBe("fresco");
  });

  it("criativos recusados na 1ª busca: a nova busca automática (20 s depois) chama a Meta e completa", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "10", 2)] };
    meta.getTopAdInsights.mockRejectedValueOnce(new Error("HTTP 400 code 100"));
    const primeiro = await cache.obterSnapshot("c-incompleto", "today", AGORA);
    expect(primeiro.ads_status).toBe("parcial");

    const segundo = await cache.obterSnapshot("c-incompleto", "today", new Date(AGORA.getTime() + 20_000));
    expect(segundo.ads_status).toBe("ok");
    expect(meta.getTopAdInsights).toHaveBeenCalledTimes(2);

    // Completo: a terceira visita em 15 min já sai da memória.
    await cache.obterSnapshot("c-incompleto", "today", depois(5));
    expect(meta.getTopAdInsights).toHaveBeenCalledTimes(2);
  });

  it("lista de anúncios ativos recusada: também se completa na próxima busca", async () => {
    meta.getActiveAdsWithInsights.mockRejectedValueOnce(new Error("HTTP 400"));
    const primeiro = await cache.obterSnapshot("c-ativos", "today", AGORA);
    expect(primeiro.active_ads).toBeNull();
    const segundo = await cache.obterSnapshot("c-ativos", "today", new Date(AGORA.getTime() + 40_000));
    expect(segundo.active_ads).not.toBeNull();
  });

  it("incompleto e a Meta caiu na nova busca: mantém o incompleto avisando de quando é (não some)", async () => {
    horasPorDia = { "2026-11-05": [hora(8, "10", 2)] };
    meta.getTopAdInsights.mockRejectedValueOnce(new Error("HTTP 400"));
    await cache.obterSnapshot("c-caiu", "today", AGORA);
    meta.getHourlyInsights.mockRejectedValue(new Error("HTTP 500"));
    const s = await cache.obterSnapshot("c-caiu", "today", new Date(AGORA.getTime() + 20_000));
    expect(s.ads_status).toBe("parcial");
    expect(s.kpis.messages.value).toBe(2);
    expect(s.stale_since).toBe(AGORA.toISOString());
  });

  it("completo e a Meta caiu entre 15 min e 1h: reserva com aviso; depois de 1h, 'indisponível'", async () => {
    await cache.obterSnapshot("c-reserva", "today", AGORA);
    meta.getHourlyInsights.mockRejectedValue(new Error("HTTP 500"));
    expect((await cache.obterSnapshot("c-reserva", "today", depois(30))).stale_since).toBe(AGORA.toISOString());
    expect((await cache.obterSnapshot("c-reserva", "today", depois(61))).ads_status).toBe("indisponivel");
  });

  it("virou a meia-noite: o Hoje de ontem não é entregue", async () => {
    await cache.obterSnapshot("c-meia-noite", "today", new Date("2026-11-06T02:55:00Z")); // 23h55 SP
    const s = await cache.obterSnapshot("c-meia-noite", "today", new Date("2026-11-06T03:05:00Z")); // 00h05 SP
    expect(s.period.start).toBe("2026-11-06");
    expect(meta.getHourlyInsights).toHaveBeenCalledTimes(4);
  });

  it("ligar a conta (esquecerSnapshots) apaga o Hoje guardado", async () => {
    await cache.obterSnapshot("c-ligou", "today", AGORA);
    await cache.esquecerSnapshots("c-ligou");
    await cache.obterSnapshot("c-ligou", "today", depois(1));
    expect(meta.getHourlyInsights).toHaveBeenCalledTimes(4);
  });
});
