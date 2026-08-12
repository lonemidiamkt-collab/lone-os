import { describe, it, expect, vi, beforeEach } from "vitest";

// O ponto da correção: separar "o cliente não gastou nada" de "a Meta não respondeu". Antes os
// dois davam a MESMA tela (tudo zero) — e o zero por falha era gravado no cache por 6h.

const meta = vi.hoisted(() => ({
  getInsightsByDateRange: vi.fn(),
  getTopAdInsights: vi.fn(),
  getAdThumbnail: vi.fn(),
  getDemographicBreakdown: vi.fn(),
  fetchAccountReach: vi.fn(),
}));

vi.mock("@/lib/meta/api", () => ({
  getInsightsByDateRange: meta.getInsightsByDateRange,
  getTopAdInsights: meta.getTopAdInsights,
  getAdThumbnail: meta.getAdThumbnail,
  getDemographicBreakdown: meta.getDemographicBreakdown,
}));
vi.mock("@/lib/meta/insights-server", () => ({ fetchAccountReach: meta.fetchAccountReach }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(), captureMessage: vi.fn(), setContext: vi.fn(), setTag: vi.fn(),
}));

// supabaseAdmin encadeável: devolve o que o teste pedir por tabela.
const tabelas = vi.hoisted(() => ({ valores: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => {
  function query(tabela: string) {
    const resultado = { data: tabelas.valores[tabela] ?? null, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "in", "is", "limit"]) {
      chain[m] = () => chain;
    }
    chain.single = async () => resultado;
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r);
    return chain;
  }
  return { supabaseAdmin: { from: (t: string) => query(t) } };
});

const { buildSnapshot } = await import("@/lib/portal/buildSnapshot");

const DIA = [{
  date_start: "2026-08-05", date_stop: "2026-08-05", spend: "100", impressions: "1000",
  reach: "800", clicks: "50", ctr: "5", cpc: "2", cpm: "10",
  actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "10" }],
}];

beforeEach(() => {
  vi.clearAllMocks();
  tabelas.valores = {
    agency_actions: [],
    ad_accounts: { meta_account_id: "act_123" },
    agency_settings: [{ key: "meta_token", value: "tok" }],
  };
  meta.getInsightsByDateRange.mockResolvedValue(DIA);
  meta.getTopAdInsights.mockResolvedValue([]);
  meta.getDemographicBreakdown.mockResolvedValue([]);
  meta.getAdThumbnail.mockResolvedValue(null);
  meta.fetchAccountReach.mockResolvedValue(800);
});

describe("buildSnapshot — confiança do dado", () => {
  it("tudo respondeu → ok", async () => {
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(s.ads_status).toBe("ok");
    expect(s.kpis.spend.value).toBe(100);
  });

  it("cliente sem conta de anúncio → sem_conta (zero aqui é a verdade)", async () => {
    tabelas.valores.ad_accounts = null;
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(s.ads_status).toBe("sem_conta");
    expect(s.kpis.spend.value).toBe(0);
  });

  it("cliente com conta que realmente não gastou → ok com zero, não é falha", async () => {
    meta.getInsightsByDateRange.mockResolvedValue([]);
    meta.fetchAccountReach.mockResolvedValue(null);
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(s.ads_status).toBe("ok");
    expect(s.kpis.spend.value).toBe(0);
  });

  it("Meta recusou o período atual → indisponivel (o apagão de 10/08)", async () => {
    meta.getInsightsByDateRange.mockRejectedValue(new Error("HTTP 400 code 17"));
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(s.ads_status).toBe("indisponivel");
  });

  it("caso 19/07: alcance veio, verba não → indisponivel, não 'gastou R$0'", async () => {
    meta.getInsightsByDateRange.mockRejectedValue(new Error("recusado"));
    meta.fetchAccountReach.mockResolvedValue(52_669); // o alcance do Império naquele dia
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(s.ads_status).toBe("indisponivel");
    expect(s.kpis.spend.value).toBe(0); // o número zerado existe...
    // ...mas agora vem carimbado como não-confiável, e por isso não é gravado nem mostrado.
  });

  it("só os criativos falharam → parcial (números valem, seção de criativo não)", async () => {
    meta.getTopAdInsights.mockRejectedValue(new Error("recusado"));
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(s.ads_status).toBe("parcial");
    expect(s.kpis.spend.value).toBe(100);
  });

  it("só o comparativo falhou → segue ok (perde a seta de variação, não os números)", async () => {
    meta.getInsightsByDateRange
      .mockResolvedValueOnce(DIA)
      .mockRejectedValueOnce(new Error("recusado"));
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(s.ads_status).toBe("ok");
    expect(s.kpis.spend.value).toBe(100);
  });
});
