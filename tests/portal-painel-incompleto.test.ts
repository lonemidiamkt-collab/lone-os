import { describe, it, expect, vi, beforeEach } from "vitest";

// 29/10/2026: às 6h41–6h46 a Meta recusou ("HTTP 400 code 100 — Invalid parameter") os criativos e a
// lista de anúncios ativos de 18 painéis. O aquecimento gravou os painéis pela metade e eles valeram
// como completos o dia inteiro: o cliente abria o link e a seção de anúncios tinha sumido.

const gravados: Array<{ client_id: string; period_kind: string; data: { ads_status: string } }> = [];
let guardado: { data: unknown; generated_at: string } | null = null;
const respostas: Array<Record<string, unknown>> = [];

vi.mock("next/server", () => ({ after: (f: () => unknown) => { void f(); } }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => {
        const q = { eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: guardado, error: null }) };
        return q;
      },
      upsert: async (linha: { client_id: string; period_kind: string; data: { ads_status: string } }) => { gravados.push(linha); return { error: null }; },
    }),
  },
}));
vi.mock("@/lib/portal/buildSnapshot", () => ({
  buildSnapshot: vi.fn(async () => respostas.shift() ?? snap("ok")),
}));

const { snapshotCompleto, decidirCache, deveGravar, gerarParaCache, INCOMPLETO_TTL_MS, CACHE_TTL_MS, STALE_MAX_MS } = await import("@/lib/portal/snapshotCache");

const periodo = { kind: "this_month", start: "2026-10-01", end: "2026-10-28", previous_start: "2026-09-01", previous_end: "2026-09-28" };
function snap(ads_status: string, extra: Record<string, unknown> = {}) {
  return { ads_status, period: periodo, active_ads: { items: [], total: 0, with_messages: 0 }, ...extra } as never;
}
const agora = Date.parse("2026-10-29T12:00:00Z");
const ha = (ms: number) => new Date(agora - ms).toISOString();

describe("snapshotCompleto", () => {
  it("ok com a lista de anúncios = completo; sem conta também", () => {
    expect(snapshotCompleto(snap("ok"))).toBe(true);
    expect(snapshotCompleto(snap("sem_conta", { active_ads: { items: [], total: 0, with_messages: 0 } }))).toBe(true);
  });
  it("parcial, lista de anúncios que falhou (null) e indisponível = incompleto", () => {
    expect(snapshotCompleto(snap("parcial"))).toBe(false);
    expect(snapshotCompleto(snap("ok", { active_ads: null }))).toBe(false);
    expect(snapshotCompleto(snap("indisponivel"))).toBe(false);
    expect(snapshotCompleto(null)).toBe(false);
  });
  it("snapshot antigo, sem a chave da lista, não vira incompleto", () => {
    expect(snapshotCompleto({ ads_status: "ok" } as never)).toBe(true);
  });
});

describe("decidirCache — incompleto vale 5 min, não 6 h", () => {
  it("completo segue a regra de sempre", () => {
    expect(decidirCache(ha(CACHE_TTL_MS - 60_000), agora, true)).toBe("fresco");
  });
  it("incompleto: fresco só nos primeiros 5 min; depois entrega e completa por trás", () => {
    expect(decidirCache(ha(INCOMPLETO_TTL_MS - 1000), agora, false)).toBe("fresco");
    expect(decidirCache(ha(INCOMPLETO_TTL_MS + 1000), agora, false)).toBe("do-dia");
    expect(decidirCache(ha(3 * 3600_000), agora, false)).toBe("do-dia");
    expect(decidirCache(ha(STALE_MAX_MS + 1000), agora, false)).toBe("buscar");
  });
});

describe("deveGravar — painel pela metade não apaga um completo", () => {
  it("indisponível nunca grava; completo sempre grava", () => {
    expect(deveGravar(snap("indisponivel"), null, null, agora)).toBe(false);
    expect(deveGravar(snap("ok"), snap("ok"), ha(1000), agora)).toBe(true);
  });
  it("incompleto não substitui o completo de até 24 h do mesmo período", () => {
    expect(deveGravar(snap("parcial"), snap("ok"), ha(7 * 3600_000), agora)).toBe(false);
    expect(deveGravar(snap("ok", { active_ads: null }), snap("ok"), ha(3600_000), agora)).toBe(false);
  });
  it("incompleto grava quando não há nada, quando o guardado também é incompleto, é de outro período ou passou de 24 h", () => {
    expect(deveGravar(snap("parcial"), null, null, agora)).toBe(true);
    expect(deveGravar(snap("parcial"), snap("parcial"), ha(1000), agora)).toBe(true);
    expect(deveGravar(snap("parcial"), snap("ok", { period: { ...periodo, start: "2026-09-01" } }), ha(1000), agora)).toBe(true);
    expect(deveGravar(snap("parcial"), snap("ok"), ha(STALE_MAX_MS + 1000), agora)).toBe(true);
  });
});

describe("gerarParaCache — o aquecimento da madrugada", () => {
  beforeEach(() => { gravados.length = 0; respostas.length = 0; guardado = null; });

  it("tenta de novo o que veio pela metade e grava o completo", async () => {
    respostas.push(snap("parcial"), snap("ok"));
    const itens = await gerarParaCache([{ id: "c1", nome: "Unafer" }], () => ["this_month"], new Date(agora), { pausaEntreClientesMs: 0, esperaMs: 0 });
    expect(itens[0]).toMatchObject({ resultado: "completo", tentativas: 2, gravado: true });
    expect(gravados.map((g) => g.data.ads_status)).toEqual(["ok"]);
  });

  it("continua pela metade: NÃO apaga o completo de ontem", async () => {
    respostas.push(snap("parcial"), snap("parcial"), snap("parcial"));
    guardado = { data: snap("ok"), generated_at: ha(23 * 3600_000) };
    const itens = await gerarParaCache([{ id: "c1", nome: "Unafer" }], () => ["this_month"], new Date(agora), { pausaEntreClientesMs: 0, esperaMs: 0 });
    expect(itens[0]).toMatchObject({ resultado: "incompleto", tentativas: 3, gravado: false });
    expect(gravados).toEqual([]);
  });

  it("Meta fora do ar: tenta de novo e não grava zero", async () => {
    respostas.push(snap("indisponivel"), snap("indisponivel"), snap("indisponivel"));
    const itens = await gerarParaCache([{ id: "c1", nome: "Unafer" }], () => ["last_week"], new Date(agora), { pausaEntreClientesMs: 0, esperaMs: 0 });
    expect(itens[0]).toMatchObject({ resultado: "indisponivel", gravado: false });
    expect(gravados).toEqual([]);
  });
});
