// @vitest-environment node
// Lista de cards que falha não vira vazia (onda 5 do erro recuperável, 25/10/2026). Dados INVENTADOS.
//
// O QUE ACONTECIA: fetchContentCards devolvia [] quando a leitura falhava. O raio-x de sexta dizia "🎯 Nada travado —
// Fluxo em dia!", /api/data/content respondia 200 com lista vazia (o quadro abria sem cards e o polling de 20 s
// apagava o quadro de quem estava trabalhando), e anexos/comentários que falhavam deixavam os cards sem as artes.
// Agora a leitura LANÇA; a rota responde 503, a rotina responde ok:false e diz "não consegui ler os cards".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const falhas = new Set<string>();
const dados: Record<string, Linha[]> = {};
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "is", "not", "in", "or", "gte", "limit"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(falhas.has(tabela)
        ? { data: null, error: { message: `${tabela} fora do ar` }, count: null }
        : { data: dados[tabela] ?? [], error: null, count: (dados[tabela] ?? []).length }).then(ok);
      return q;
    },
  },
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ email: "equipe@exemplo.com" }) }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
const enviadas: string[] = [];
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async (_j: string, t: string) => { enviadas.push(t); return { ok: true }; } }));

const db = await import("@/lib/supabase/queries");
const conteudo = await import("@/app/api/data/content/route");
const raioX = await import("@/app/api/system/cs-raio-x/route");
const { formatRaioXSemCards, formatRaioXGestor } = await import("@/lib/cs/gestor");

beforeEach(() => {
  falhas.clear();
  enviadas.length = 0;
  dados.content_cards = [{ id: "c1", client_id: "k1", title: "Post de Exemplo", status: "com_designer", social_media: "Ana Exemplo", archived_at: null }];
  dados.card_comments = [{ id: "m1", card_id: "c1", author: "Ana", role: "social", text: "capricha", created_at: "2026-10-24T12:00:00Z" }];
  dados.card_attachments = [{ id: "a1", card_id: "c1", url: "https://exemplo.com/arte.png", path: "x", position: 0, tipo: "entrega" }];
  dados.design_requests = [];
  dados.content_approvals = [];
  dados.cs_rework_events = [];
  process.env.CS_INTERNAL_GROUP_JID = "interno@g.us";
});

describe("fetchContentCards: falha lança, não devolve lista vazia", () => {
  it("leitura boa: cards com comentários e artes", async () => {
    const cards = await db.fetchContentCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].comments).toHaveLength(1);
    expect(cards[0].cardAttachments).toHaveLength(1);
    expect(cards[0].imageUrl).toBe("https://exemplo.com/arte.png");
  });
  it("o erro original: a leitura dos cards falhava e voltava [] — agora lança com o motivo", async () => {
    falhas.add("content_cards");
    await expect(db.fetchContentCards()).rejects.toThrow(/Não consegui ler os cards \(content_cards fora do ar\)/);
  });
  it("comentários ou artes que não carregam também lançam (antes: card sem as artes, 'nenhum comentário')", async () => {
    falhas.add("card_comments");
    await expect(db.fetchContentCards()).rejects.toThrow(/comentários/);
    falhas.clear(); falhas.add("card_attachments");
    await expect(db.fetchContentCards()).rejects.toThrow(/artes dos cards/);
  });
  it("lista vazia de verdade continua vazia (não é erro)", async () => {
    dados.content_cards = [];
    expect(await db.fetchContentCards()).toEqual([]);
  });
  it("pedidos de arte e aprovações (mesmo pacote do quadro) também lançam", async () => {
    falhas.add("design_requests"); falhas.add("content_approvals");
    await expect(db.fetchDesignRequests()).rejects.toThrow(/pedidos de arte/);
    await expect(db.fetchContentApprovals()).rejects.toThrow(/aprovações/);
  });
});

describe("/api/data/content responde 503 com o motivo (o store marca loadError e o polling não apaga o quadro)", () => {
  const get = (q = "") => new NextRequest(`https://painel.exemplo.com/api/data/content${q}`);
  it("quadro", async () => {
    falhas.add("content_cards");
    const r = await conteudo.GET(get());
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Não consegui ler os cards.*Tente de novo/);
  });
  it("arquivadas", async () => {
    falhas.add("content_cards");
    const r = await conteudo.GET(get("?archived=1"));
    expect(r.status).toBe(503);
  });
  it("leitura boa: 200 com os cards", async () => {
    const r = await conteudo.GET(get());
    expect(r.status).toBe(200);
    expect((await r.json()).contentCards).toHaveLength(1);
  });
});

describe("raio-x do gestor", () => {
  const post = () => new NextRequest("https://painel.exemplo.com/api/system/cs-raio-x", { method: "POST" });
  it("o erro original: cards não lidos viravam '🎯 Nada travado — Fluxo em dia!' — agora diz que não leu e responde ok:false", async () => {
    falhas.add("content_cards");
    const corpo = await (await raioX.POST(post())).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toMatch(/não consegui ler os cards/);
    expect(enviadas[0]).toMatch(/Não consegui ler os cards do quadro agora/);
    expect(enviadas[0]).not.toMatch(/Nada travado/);
  });
  it("retrabalho que não carregou não vira '0 — ninguém precisou refazer'", async () => {
    falhas.add("cs_rework_events");
    const corpo = await (await raioX.POST(post())).json();
    expect(corpo.ok).toBe(false);
    expect(enviadas[0]).toMatch(/não consegui ler as reprovações/);
    expect(enviadas[0]).not.toMatch(/ninguém precisou refazer/);
  });
  it("tudo lido e enviado: ok", async () => {
    const corpo = await (await raioX.POST(post())).json();
    expect(corpo.ok).toBe(true);
    expect(enviadas[0]).toMatch(/Raio-X do Gestor/);
  });
  it("formatadores: sem cards nunca diz 'nada travado'; com cards e retrabalho vazio diz 0", () => {
    expect(formatRaioXSemCards("25/10", [])).not.toMatch(/Nada travado/);
    expect(formatRaioXSemCards("25/10", "nao_lido")).toMatch(/não quer dizer zero/);
    const kpis = { leadTimeDays: null, onTimeRate: null, bottleneck: null } as unknown as Parameters<typeof formatRaioXGestor>[0];
    expect(formatRaioXGestor(kpis, [], "25/10", [])).toMatch(/Retrabalho \(7 dias\)\*: 0/);
  });
});

describe("telas", () => {
  it("quadro e Social usam o aviso com 'Tentar de novo'; Hoje, CEO, Agenda e ficha do cliente mostram a faixa", () => {
    const aviso = readFileSync("components/conteudo/ErroCargaCards.tsx", "utf8");
    expect(aviso).toMatch(/Tentar de novo/);
    expect(aviso).toMatch(/if \(!loadError\) return null/);
    expect(readFileSync("components/conteudo/QuadroProducao.tsx", "utf8")).toMatch(/if \(erroDeCarga && !carregado\) return <ErroCargaCards \/>/);
    expect(readFileSync("app/social/page.tsx", "utf8")).toMatch(/contentLoadError \? <ErroCargaCards \/>/);
    for (const f of ["app/my-work/Hoje.tsx", "app/ceo/page.tsx", "app/calendar/Agenda.tsx", "app/clients/[id]/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/<ErroCargaCards variante="faixa"/);
    }
  });
  it("arquivadas: lista que não carregou tem 'Tentar de novo'; /goals avisa quando a carga legada falhou", () => {
    const arq = readFileSync("components/ArchivedDemandsModal.tsx", "utf8");
    expect(arq).toMatch(/falhouCarga && \(/);
    expect(arq).toMatch(/setTentativa\(\(n\) => n \+ 1\)/);
    const goals = readFileSync("app/goals/page.tsx", "utf8");
    expect(goals).toMatch(/\{dbErro && \(/);
    expect(goals).toMatch(/onClick=\{recarregarDb\}/);
  });
});
