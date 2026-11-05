// @vitest-environment node
// tests/portal-instagram-v2.test.ts — Painel de Resultados v2, etapa 1 (04/11/2026).
// O que se testa, com a Meta simulada por URL:
//  - a aba do Instagram não espera a Meta: relatório de 6h–48h sai na hora e atualiza por trás;
//  - Reels voltam a ter visualização e alcance (`views`; `video_views` foi desligada pela Meta);
//  - métrica recusada não derruba as outras (a busca refaz com menos);
//  - alcance pela janela EXATA (total_value + since/until), com o caminho antigo de reserva;
//  - posts que a Meta não deixou ler NÃO viram "0 posts";
//  - conta com permissão pela metade vira "parcial" com aviso para o time (e o aviso não vai ao cliente);
//  - falha volta 200 com `estado` (o 502 era trocado pela página do Cloudflare);
//  - ligar a conta de anúncio acha o Instagram na hora.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

const banco = bancoEmMemoria();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => null }));

const ig = await import("@/lib/meta/igSnapshot");
const rota = await import("@/app/api/meta/instagram/[clientId]/route");

const CLI = "33333333-3333-4333-8333-333333333333";
const IGID = "17840000000000001";
const HORA = 3_600_000;

type Resposta = { status?: number; corpo: unknown };
let chamadas: string[] = [];
let meta: (url: URL) => Resposta | undefined = () => undefined;

function metaPadrao(url: URL): Resposta | undefined {
  const p = url.pathname;
  const metric = url.searchParams.get("metric") ?? "";
  if (p.endsWith(`/${IGID}`)) return { corpo: { username: "lojateste", followers_count: 2500, media_count: 120 } };
  if (p.endsWith(`/${IGID}/insights`) && metric === "reach" && url.searchParams.get("metric_type") === "total_value") {
    return { corpo: { data: [{ name: "reach", total_value: { value: 4321 } }] } };
  }
  if (p.endsWith(`/${IGID}/insights`) && metric === "follower_count") return { corpo: { data: [{ values: [{ value: 3 }, { value: 4 }] }] } };
  if (p.endsWith(`/${IGID}/insights`) && metric === "follower_demographics") {
    return { corpo: { data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ["F"], value: 60 }, { dimension_values: ["M"], value: 40 }] }] } }] } };
  }
  if (p.endsWith(`/${IGID}/media`)) {
    const agora = new Date().toISOString();
    return { corpo: { data: [
      { id: "m1", media_type: "VIDEO", media_product_type: "REELS", timestamp: agora, like_count: 30, comments_count: 2, permalink: "https://ig/p/m1" },
      { id: "m2", media_type: "IMAGE", media_product_type: "FEED", timestamp: agora, like_count: 10, comments_count: 1, permalink: "https://ig/p/m2" },
    ] } };
  }
  if (p.endsWith("/m1/insights")) {
    return { corpo: { data: [
      { name: "reach", values: [{ value: 900 }] }, { name: "views", values: [{ value: 2100 }] },
      { name: "saved", values: [{ value: 12 }] }, { name: "shares", values: [{ value: 7 }] },
    ] } };
  }
  if (p.endsWith("/m2/insights")) {
    // A métrica extra é recusada para este post: a busca refaz com menos e não perde o alcance.
    if (metric.includes("total_interactions")) return { corpo: { error: { message: "(#100) metric not supported", code: 100 } } };
    return { corpo: { data: [{ name: "reach", values: [{ value: 400 }] }, { name: "views", values: [{ value: 650 }] }] } };
  }
  return { corpo: { error: { message: "não simulado", code: 1 } } };
}

beforeEach(() => {
  banco.limpar();
  chamadas = [];
  meta = metaPadrao;
  banco.db.agency_settings = [{ key: "meta_token", value: "tk" }];
  banco.db.clients = [{ id: CLI, ig_business_account_id: IGID, ig_public_username: null, meta_ad_account_id: "123" }];
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(String(u));
    chamadas.push(`${url.pathname}?metric=${url.searchParams.get("metric") ?? ""}`);
    const r = meta(url) ?? metaPadrao(url)!;
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }));
});

describe("cache sem espera", () => {
  it("decide fresco (<6h), do-dia (6–48h) e buscar (sem, velho demais ou do futuro)", () => {
    const agora = Date.parse("2026-11-04T22:00:00Z");
    const ha = (h: number) => new Date(agora - h * HORA).toISOString();
    expect(ig.decidirCacheIg(ha(2), agora)).toBe("fresco");
    expect(ig.decidirCacheIg(ha(10), agora)).toBe("do-dia");
    expect(ig.decidirCacheIg(ha(47), agora)).toBe("do-dia");
    expect(ig.decidirCacheIg(ha(49), agora)).toBe("buscar");
    expect(ig.decidirCacheIg(ha(-1), agora)).toBe("buscar");
    expect(ig.decidirCacheIg(null, agora)).toBe("buscar");
  });

  it("portal: relatório de 10h sai na hora, com 'atualizado em', e a atualização roda por trás", async () => {
    const geradoEm = new Date(Date.now() - 10 * HORA).toISOString();
    banco.db.client_ig_snapshots = [{ client_id: CLI, period_kind: "7d", generated_at: geradoEm,
      data: { mapped: true, periodo: "7d", conta: { username: "velho", seguidores: 10, posts: 1 } } }];
    const snap = await ig.getIgSnapshotCached(CLI, "7d", false, { servirVelho: true });
    expect(snap.conta?.username).toBe("velho");
    expect(snap.geradoEm).toBe(geradoEm);
    await vi.waitFor(() => expect(banco.db.client_ig_snapshots.some((r) => (r.data as { conta?: { username?: string } }).conta?.username === "lojateste")).toBe(true));
  });

  it("sem servirVelho (relatórios internos), relatório de 10h é refeito na hora", async () => {
    banco.db.client_ig_snapshots = [{ client_id: CLI, period_kind: "7d", generated_at: new Date(Date.now() - 10 * HORA).toISOString(),
      data: { mapped: true, periodo: "7d", conta: { username: "velho", seguidores: 10, posts: 1 } } }];
    const snap = await ig.getIgSnapshotCached(CLI, "7d");
    expect(snap.conta?.username).toBe("lojateste");
  });

  it("página do portal: sem cache não espera a Meta (null) e já pede a geração", async () => {
    expect(await ig.lerIgDoCache(CLI, "7d")).toBeNull();
    await vi.waitFor(() => expect(banco.db.client_ig_snapshots?.length ?? 0).toBeGreaterThan(0));
  });
});

describe("métricas dos posts", () => {
  it("Reels com visualizações, alcance, salvos e compartilhamentos; nada pede video_views", async () => {
    const snap = await ig.buildIgSnapshot(CLI, "7d");
    const reels = snap.posts!.find((p) => p.id === "m1")!;
    expect(reels).toMatchObject({ tipo: "REELS", views: 2100, alcance: 900, salvos: 12, compartilhamentos: 7 });
    expect(chamadas.some((c) => c.includes("video_views"))).toBe(false);
  });

  it("métrica recusada para um post: refaz com menos e mantém alcance e visualizações", async () => {
    const snap = await ig.buildIgSnapshot(CLI, "7d");
    expect(snap.posts!.find((p) => p.id === "m2")).toMatchObject({ alcance: 400, views: 650, salvos: null });
  });

  it("lê tanto `values` quanto `total_value`", () => {
    expect(ig.lerInsightsDoPost([{ name: "reach", total_value: { value: 5 } }, { name: "views", values: [{ value: 9 }] }]))
      .toEqual({ alcance: 5, views: 9, salvos: null, compartilhamentos: null });
    expect(ig.lerInsightsDoPost(undefined)).toEqual({ alcance: null, views: null, salvos: null, compartilhamentos: null });
  });
});

describe("alcance", () => {
  it("usa a janela exata (14 dias = 14 dias)", async () => {
    const snap = await ig.buildIgSnapshot(CLI, "14d");
    expect(snap.resumo).toMatchObject({ alcance: 4321, alcanceJanelaDias: 14, seguidoresGanhos: 7, postsNoPeriodo: 2 });
    expect(snap.fonte).toBe("owned");
  });

  it("se o caminho novo falhar, cai na janela rolante antiga e rotula com ela", async () => {
    meta = (url) => {
      if (url.searchParams.get("metric_type") === "total_value") return { corpo: { error: { message: "x", code: 100 } } };
      if (url.searchParams.get("period") === "days_28") return { corpo: { data: [{ values: [{ value: 100 }, { value: 8000 }] }] } };
      return undefined;
    };
    const snap = await ig.buildIgSnapshot(CLI, "14d");
    expect(snap.resumo).toMatchObject({ alcance: 8000, alcanceJanelaDias: 28 });
  });
});

describe("acesso pela metade nunca vira 'não postou'", () => {
  it("Meta recusa os posts e o caminho público também: posts = null (não 0) e aviso para o time", async () => {
    meta = (url) => {
      if (url.pathname.endsWith(`/${IGID}/media`)) return { corpo: { error: { message: "(#10) Application does not have permission for this action", code: 10 } } };
      if (url.searchParams.has("fields") && String(url.searchParams.get("fields")).startsWith("business_discovery")) return { corpo: { error: { message: "não é comercial", code: 110 } } };
      return undefined;
    };
    const snap = await ig.buildIgSnapshot(CLI, "30d");
    expect(snap.resumo?.postsNoPeriodo).toBeNull();
    expect(snap.fonte).toBe("parcial");
    expect(snap.avisos?.join(" ")).toMatch(/não deu para ler os posts/);
  });

  it("insights da conta todos recusados: parcial com o motivo", () => {
    expect(ig.avisosDeAcesso({ alcance: null, seguidoresGanhos: null, audiencia: false, erroPosts: null })[0]).toMatch(/permissão de insights/);
    expect(ig.avisosDeAcesso({ alcance: 10, seguidoresGanhos: null, audiencia: false, erroPosts: null })).toEqual([]);
  });

  it("o aviso interno não vai para o navegador do cliente", () => {
    const fora = ig.paraOPortal({ mapped: true, periodo: "7d", avisos: ["falta permissão"] });
    expect("avisos" in fora).toBe(false);
    expect(fora.parcial).toBe(true);
  });
});

describe("rota: falha aparece como falha, com motivo", () => {
  const pedir = (q: string) => rota.GET(new NextRequest(`http://x/api/meta/instagram/${CLI}?${q}`), { params: Promise.resolve({ clientId: CLI }) });

  beforeEach(() => {
    banco.db.clients[0] = { ...banco.db.clients[0], public_report_token: "tok", public_report_enabled: true, active: true };
  });

  it("Meta caiu: 200 com estado 'falha' e o motivo (não 502, que o Cloudflare engole)", async () => {
    meta = (url) => (url.pathname.endsWith(`/${IGID}`) ? { status: 400, corpo: { error: { message: "Service temporarily unavailable", code: 2 } } } : undefined);
    const r = await pedir("token=tok&period=7d");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ estado: "falha", error: "Service temporarily unavailable" });
  });

  it("vínculo vencido: estado 'reconectar'", async () => {
    meta = (url) => (url.pathname.endsWith(`/${IGID}`) ? { status: 400, corpo: { error: { message: "token expirado", code: 190 } } } : undefined);
    expect(await (await pedir("token=tok&period=7d")).json()).toMatchObject({ estado: "reconectar" });
  });

  it("sucesso pelo link do cliente: estado ok e sem os avisos internos", async () => {
    meta = (url) => {
      const m = url.searchParams.get("metric");
      if (url.pathname.endsWith(`/${IGID}/insights`) && (m === "reach" || m === "follower_count" || m === "follower_demographics")) return { corpo: { error: { message: "sem permissão", code: 10 } } };
      return undefined;
    };
    const d = await (await pedir("token=tok&period=7d")).json();
    expect(d).toMatchObject({ estado: "ok", parcial: true, fonte: "parcial" });
    expect(d.avisos).toBeUndefined();
  });
});

describe("ligar a conta de anúncio acha o Instagram na hora", () => {
  beforeEach(() => {
    banco.db.clients = [{ id: CLI, ig_business_account_id: null, ig_public_username: null, meta_ad_account_id: "act_555" }];
    banco.db.client_ig_snapshots = [{ client_id: CLI, period_kind: "7d", generated_at: new Date().toISOString(), data: { mapped: false } }];
  });

  it("pela Página da conta: grava o Instagram e esquece o relatório guardado", async () => {
    meta = (url) => {
      if (url.pathname.endsWith("/act_555/instagram_accounts")) return { corpo: { data: [] } };
      if (url.pathname.endsWith("/act_555/promote_pages")) return { corpo: { data: [{ id: "pg1" }] } };
      if (url.pathname.endsWith("/pg1")) return { corpo: { instagram_business_account: { id: "ig999" } } };
      if (url.pathname.endsWith("/ig999")) return { corpo: { username: "casadastelhas" } };
      return undefined;
    };
    const r = await ig.vincularIgPelaConta(CLI);
    expect(r.vinculado).toBe("@casadastelhas");
    expect(banco.db.clients[0]).toMatchObject({ ig_business_account_id: "ig999", ig_username_cache: "casadastelhas" });
    expect(banco.db.client_ig_snapshots).toHaveLength(0);
  });

  it("cliente que já tem Instagram não é mexido", async () => {
    banco.db.clients[0].ig_business_account_id = "igOriginal";
    expect((await ig.vincularIgPelaConta(CLI)).motivo).toBe("já tem Instagram cadastrado");
    expect(banco.db.clients[0].ig_business_account_id).toBe("igOriginal");
  });
});
