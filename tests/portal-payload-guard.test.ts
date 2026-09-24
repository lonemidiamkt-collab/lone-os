import { describe, it, expect, vi, beforeEach } from "vitest";

// Guarda do portal do cliente: o snapshot vai INTEIRO, por link público, pro celular do cliente.
// Nada interno pode estar nele — nota do time, saúde/score, alerta, dado de outro cliente, conta de
// anúncio, token, campanha/orçamento, financeiro da agência. A lista abaixo é de campos PERMITIDOS:
// campo novo no snapshot só passa aqui se alguém decidir, conscientemente, que o cliente pode vê-lo.

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
  // Storage da miniatura: falha de propósito (o snapshot segue sem o path).
  const storage = { from: () => ({ upload: async () => ({ error: { message: "sem storage no teste" } }) }) };
  return { supabaseAdmin: { from: (t: string) => query(t), storage } };
});

const { buildSnapshot } = await import("@/lib/portal/buildSnapshot");

const PERMITIDOS = new Set([
  // topo
  "ads_status", "stale_since", "period", "kpis", "chart", "top_creatives", "active_ads", "demographics",
  "agency_actions", "generated_at",
  // período
  "kind", "start", "end", "label", "previous_start", "previous_end",
  // kpis
  "messages", "spend", "cpa", "reach", "value", "delta_pct", "direction",
  // gráfico
  "days", "series", "clicks", "previous_messages", "previous_series", "peak", "metric", "day",
  // criativos e anúncios ativos
  "id", "name", "thumbnail_url", "thumbnail_path", "ctr", "frequency", "is_winner", "items", "total", "with_messages",
  // público
  "gender", "female_pct", "male_pct", "age_ranges", "pct",
  // o que fizemos (só o que o time marcou visible_to_client)
  "action_date", "title", "description", "icon",
]);

// Palavras que nunca podem aparecer num nome de campo do portal.
const PROIBIDO = /health|score|saude|mrr|ltv|fee|margin|margem|lucro|profit|salar|note|nota|intern|account|token|campaign|campanha|adset|budget|orcamento|alert|churn|contract|contrato|team|equipe|responsavel|owner|email|phone|telefone/i;

function chaves(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => chaves(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) { out.add(k); chaves(x, out); }
  }
  return out;
}

const conversas = (n: number) => [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(n) }];
const TOKEN = "EAAB-token-secreto-do-teste";

beforeEach(() => {
  vi.clearAllMocks();
  tabelas.valores = {
    // O banco devolve mais do que o portal pode mostrar (nota interna, autor): não pode vazar.
    agency_actions: [{
      id: "act1", action_date: "2026-09-18", title: "Novo criativo no ar", description: "Vídeo da promoção",
      icon: "new_creative", internal_note: "cliente atrasa pagamento", created_by: "julio@lone",
    }],
    ad_accounts: [{ meta_account_id: "act_999888" }],
    clients: { meta_ad_account_id: "act_999888", health_score: 42, mrr: 3000 },
    agency_settings: [{ key: "meta_token", value: TOKEN }],
  };
  meta.getInsightsByDateRange.mockResolvedValue([{
    date_start: "2026-09-16", date_stop: "2026-09-16", spend: "100", impressions: "1000", reach: "800",
    clicks: "50", ctr: "5", cpc: "2", cpm: "10", actions: conversas(10), account_id: "act_999888",
  }]);
  meta.getTopAdInsights.mockResolvedValue([{
    ad_id: "ad1", ad_name: "Vídeo promoção", spend: "80", impressions: "900", reach: "700", clicks: "40",
    ctr: "4.4", frequency: "1.3", actions: conversas(9), campaign_name: "[INTERNO] teste de margem", adset_id: "as1",
  }]);
  meta.getDemographicBreakdown.mockResolvedValue([
    { age: "25-34", gender: "female", reach: "300", impressions: "500" },
    { age: "35-44", gender: "male", reach: "200", impressions: "400" },
  ]);
  meta.getAdThumbnail.mockResolvedValue(null);
  meta.fetchAccountReach.mockResolvedValue(800);
  meta.getActiveAdsWithInsights.mockResolvedValue({
    ads: [
      { id: "ad1", name: "Vídeo promoção", effective_status: "ACTIVE", creative: { thumbnail_url: "https://cdn/ad1.jpg" }, campaign_id: "c9", adset: { daily_budget: "5000" } },
      { id: "ad2", name: "Arte sem conversa", effective_status: "ACTIVE" },
    ],
    insights: [{ ad_id: "ad1", spend: "80", clicks: "40", actions: conversas(9), account_id: "act_999888", campaign_name: "[INTERNO]" }],
  });
});

describe("portal: o snapshot público só leva campos permitidos", () => {
  it("snapshot completo (criativos, anúncios ativos, público, ações) sem nenhum campo fora da lista", async () => {
    const s = await buildSnapshot({ clientId: "c1", periodKind: "last_week", now: new Date("2026-09-23T15:00:00Z") });
    expect(s.ads_status).toBe("ok");
    expect(s.active_ads?.items.length).toBe(2);
    expect(s.top_creatives.length).toBe(1);

    const todas = [...chaves(s)];
    expect(todas.filter((k) => !PERMITIDOS.has(k)), "campo novo no snapshot público — o cliente pode ver isso?").toEqual([]);
    expect(todas.filter((k) => PROIBIDO.test(k))).toEqual([]);
  });

  it("nem valor interno escapa: conta de anúncio, token, nota do time, nome de campanha", async () => {
    const json = JSON.stringify(await buildSnapshot({ clientId: "c1", periodKind: "last_week", now: new Date("2026-09-23T15:00:00Z") }));
    for (const segredo of ["act_999888", TOKEN, "cliente atrasa pagamento", "julio@lone", "[INTERNO]", "daily_budget", "5000", "health_score", "mrr"]) {
      expect(json, segredo).not.toContain(segredo);
    }
  });

  it("os caminhos de falha (indisponível, sem conta) também respeitam a lista", async () => {
    meta.getInsightsByDateRange.mockRejectedValue(new Error("recusado"));
    const indisponivel = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(indisponivel.ads_status).toBe("indisponivel");

    tabelas.valores.ad_accounts = [];
    tabelas.valores.clients = { meta_ad_account_id: null };
    const semConta = await buildSnapshot({ clientId: "c1", periodKind: "last_week" });
    expect(semConta.ads_status).toBe("sem_conta");

    for (const s of [indisponivel, semConta]) {
      expect([...chaves(s)].filter((k) => !PERMITIDOS.has(k))).toEqual([]);
    }
  });
});

// ── Leva 7D: agenda do mês (N36) e histórico do material enviado (N37) ─────────────────────────
// Mesmas regras: lista de campos PERMITIDOS e palavras proibidas. O banco devolve mais do que o
// portal pode mostrar (briefing, observação do time, social, quem abriu o arquivo, caminho no storage).

const { montarAgenda } = await import("@/lib/portal/agenda");
const { montarMateriais } = await import("@/lib/portal/materiais");

const PERMITIDOS_AGENDA = new Set([
  "mes", "proximos", "doMes",
  "id", "titulo", "formato", "dia", "hora", "situacao", "imagem", "link", "podeAlterar",
]);
const PERMITIDOS_MATERIAIS = new Set([
  "id", "nome", "tipo", "tamanhoKb", "observacao", "enviadoPor", "enviadoEm", "recebido", "recebidoEm", "url",
  "uso", "titulo", "dia", "situacao", "link",
]);

describe("portal: agenda e material enviado só levam campos permitidos", () => {
  const cardsDoBanco = [
    { id: "c1", title: "Promoção", format: "Reels", status: "scheduled", due_date: "2026-09-25", due_time: "18:00",
      briefing: "cliente difícil, cobrar pagamento", observations: "nota interna do social", social_media: "Carlos",
      design_request_id: "dr1", alteracao_motivo: "designer errou a cor", image_url: "https://cdn/a.jpg" },
    { id: "c2", title: "Pauta interna", status: "ideas", due_date: "2026-09-26", briefing: "segredo da pauta" },
    { id: "c3", title: "No ar", status: "published", publish_verified_at: "2026-09-20T15:00:00Z", ig_media_id: "m1",
      publish_verified_by: "Instagram (automático)" },
  ];

  it("agenda: nenhum campo fora da lista, nada interno no JSON, pauta não aparece", () => {
    const r = montarAgenda({ cards: cardsDoBanco as never, hoje: "2026-09-24", mes: "2026-09", links: new Map([["m1", "https://instagram.com/p/x"]]) });
    const todas = [...chaves(r)];
    expect(todas.filter((k) => !PERMITIDOS_AGENDA.has(k)), "campo novo na agenda pública — o cliente pode ver isso?").toEqual([]);
    expect(todas.filter((k) => PROIBIDO.test(k))).toEqual([]);
    const json = JSON.stringify(r);
    for (const segredo of ["cliente difícil", "nota interna", "Carlos", "dr1", "designer errou", "segredo da pauta", "Pauta interna", "automático"]) {
      expect(json, segredo).not.toContain(segredo);
    }
  });

  it("material enviado: sem quem do time abriu, sem caminho no storage", () => {
    const itens = montarMateriais({
      uploads: [{ id: "u1", file_name: "foto.jpg", mime_type: "image/jpeg", size_bytes: 1000, observacao: "fotos novas",
        enviado_por: "Ana", created_at: "2026-09-20T12:00:00Z", visto_em: "2026-09-20T13:00:00Z",
        visto_por: "julio@lone", storage_path: "cliente-x/2026-09-20/abc.jpg", card_id: "c1" }],
      cards: new Map([["c1", cardsDoBanco[0] as never]]),
    });
    const todas = [...chaves(itens)];
    expect(todas.filter((k) => !PERMITIDOS_MATERIAIS.has(k))).toEqual([]);
    expect(todas.filter((k) => PROIBIDO.test(k))).toEqual([]);
    const json = JSON.stringify(itens);
    for (const segredo of ["julio@lone", "cliente-x/2026-09-20", "cliente difícil", "Carlos"]) expect(json, segredo).not.toContain(segredo);
  });
});
