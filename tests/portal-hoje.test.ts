// tests/portal-hoje.test.ts — "Hoje" nos anúncios do portal (05/11/2026).
// Hoje é hora a hora e compara com ontem ATÉ A MESMA HORA (a manhã de hoje contra o dia inteiro de ontem
// diria todo dia "caiu 70%"). Alcance de hoje sem comparação e sem zero falso. Cache em memória que vale
// 15 min e nunca atravessa a meia-noite.

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
const { rotuloDia } = await import("@/lib/portal/formatos");
const { resumoConversas } = await import("@/lib/portal/formatDelta");

// 05/11/2026 10:30 em São Paulo (13:30 UTC).
const AGORA = new Date("2026-11-05T13:30:00Z");
const conversa = (n: number) => [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(n) }];
const hora = (h: number, spend: string, n: number) => ({
  hourly_stats_aggregated_by_advertiser_time_zone: `${String(h).padStart(2, "0")}:00:00 - ${String(h).padStart(2, "0")}:59:59`,
  date_start: "x", spend, clicks: "3", actions: conversa(n),
});

beforeEach(() => {
  vi.clearAllMocks();
  tabelas.valores = {
    agency_actions: [],
    ad_accounts: [{ meta_account_id: "act_123" }],
    clients: { meta_ad_account_id: "act_123" },
    agency_settings: [{ key: "meta_token", value: "tok" }],
  };
  meta.getHourlyInsights.mockImplementation(async (_c: string, _t: string, dia: string) =>
    dia === "2026-11-05" ? [hora(8, "10", 2), hora(9, "15", 3)] : [hora(8, "12", 1), hora(9, "8", 1), hora(15, "40", 9)]);
  meta.getTopAdInsights.mockResolvedValue([]);
  meta.getDemographicBreakdown.mockResolvedValue([]);
  meta.getAdThumbnail.mockResolvedValue(null);
  meta.getActiveAdsWithInsights.mockResolvedValue({ ads: [], insights: [] });
  meta.fetchAccountReach.mockResolvedValue(640);
});

describe("período Hoje", () => {
  it("é hoje × ontem, no calendário de São Paulo", () => {
    expect(calcPeriod("today", AGORA)).toMatchObject({ start: "2026-11-05", end: "2026-11-05", previous_start: "2026-11-04", previous_end: "2026-11-04", label: "Hoje" });
    // 23h30 de SP já é dia seguinte em UTC: continua sendo o dia de SP.
    expect(calcPeriod("today", new Date("2026-11-06T02:30:00Z")).start).toBe("2026-11-05");
  });

  it("hora de SP e linhas por hora preenchidas de 0h até agora (hora sem veiculação = 0)", () => {
    expect(horaSP(AGORA)).toBe(10);
    const linhas = porHora([hora(9, "15", 3)], "2026-11-05", 10);
    expect(linhas).toHaveLength(11);
    expect(linhas[9]).toMatchObject({ date_start: "2026-11-05T09", spend: "15" });
    expect(linhas[3]).toMatchObject({ spend: "0", actions: [] });
  });

  it("compara com ontem só até a mesma hora (as 15h de ontem ficam de fora) e sem alcance comparado", async () => {
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: AGORA });
    expect(s.kpis.messages).toMatchObject({ value: 5, delta_pct: 150 }); // 5 hoje × 2 ontem até 10h
    expect(s.kpis.spend.value).toBe(25);
    expect(s.kpis.reach).toMatchObject({ value: 640, delta_pct: null });
    expect(s.chart.granularidade).toBe("hora");
    expect(s.chart.days).toHaveLength(11);
    expect(s.chart.days[9]).toBe("2026-11-05T09");
    expect(s.chart.series.messages[9]).toBe(3);
    expect(s.chart.previous_messages?.[8]).toBe(1);
    expect(meta.getInsightsByDateRange).not.toHaveBeenCalled();
  });

  it("alcance de hoje que falhou fica sem número (nunca zero)", async () => {
    meta.fetchAccountReach.mockResolvedValue(null);
    const s = await buildSnapshot({ clientId: "c1", periodKind: "today", now: AGORA });
    expect(s.kpis.reach.value).toBeNull();
  });

  it("textos: '14h' no gráfico e a frase compara com ontem até a mesma hora", () => {
    expect(rotuloDia("2026-11-05T14")).toBe("14h");
    expect(rotuloDia("2026-11-05")).toBe("5 nov");
    expect(resumoConversas(5, 150, "today")).toBe("Hoje: 5 conversas, 150% a mais que ontem até a mesma hora.");
  });
});

describe("cache do Hoje", () => {
  it("15 min fresco, até 1h só de reserva (Meta fora), e nunca o de ontem", () => {
    const data = { period: { start: "2026-11-05" } } as Parameters<typeof cache.decidirHoje>[0] extends infer G ? G extends { data: infer D } ? D : never : never;
    const em = AGORA.getTime();
    expect(cache.decidirHoje({ data, em }, new Date(em + 10 * 60_000))).toBe("fresco");
    expect(cache.decidirHoje({ data, em }, new Date(em + 30 * 60_000))).toBe("reserva");
    expect(cache.decidirHoje({ data, em }, new Date(em + 61 * 60_000))).toBe("buscar");
    expect(cache.decidirHoje({ data, em }, new Date("2026-11-06T03:05:00Z"))).toBe("buscar"); // 00h05 de SP
    expect(cache.decidirHoje(undefined, AGORA)).toBe("buscar");
  });

  it("segunda visita em 15 min não chama a Meta de novo", async () => {
    await cache.obterSnapshot("c-cache", "today", AGORA);
    const chamadas = meta.getHourlyInsights.mock.calls.length;
    await cache.obterSnapshot("c-cache", "today", new Date(AGORA.getTime() + 5 * 60_000));
    expect(meta.getHourlyInsights.mock.calls.length).toBe(chamadas);
  });
});
