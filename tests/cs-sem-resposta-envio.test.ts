// @vitest-environment node
// tests/cs-sem-resposta-envio.test.ts — 25/10/2026, auditoria 10.1 e 10.4. Dados INVENTADOS.
//
// O QUE ACONTECIA:
//  10.1 — "Cliente sem resposta" ignorava o resultado do envio e marcava todas as perguntas como avisadas. Se o
//         WhatsApp recusava, a pergunta do cliente nunca mais era lembrada, e a rotina respondia ok:true. Erro
//         ao ler as perguntas virava "0 vencidas".
//  10.4 — cs-eventos marcava o lembrete sem envio; cs-pauta tratava falha da IA como skip ok:true e contava envio
//         falho como "sugerida" (e o dedup da semana impedia propor de novo); ig-snapshots dizia ok com 0 gerados.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
const ops: { tabela: string; op: string; dados?: Linha }[] = [];
let falharLeituraDe: string | null = null;

function consulta(tabela: string) {
  db[tabela] ??= [];
  const filtros: ((r: Linha) => boolean)[] = [];
  let op = "select";
  let dados: Linha | undefined;
  const exec = async () => {
    if (op === "select" && falharLeituraDe === tabela) return { data: null, error: { message: "timeout" } };
    if (op === "insert") { const n = { id: `${tabela}-${db[tabela].length + 1}`, ...dados }; db[tabela].push(n); ops.push({ tabela, op, dados }); return { data: [n], error: null }; }
    const alvo = db[tabela].filter((r) => filtros.every((f) => f(r)));
    if (op === "update") { alvo.forEach((r) => Object.assign(r, dados)); ops.push({ tabela, op, dados }); }
    if (op === "delete") { db[tabela] = db[tabela].filter((r) => !alvo.includes(r)); ops.push({ tabela, op }); }
    return { data: alvo.map((r) => ({ ...r })), error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q, order: () => q, limit: () => q,
    eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; },
    // Comparações de data (strings ISO) — cs-eventos tira do radar o que passou com `lt`.
    lte: (c: string, v: string) => { if (c.endsWith("_date")) filtros.push((r) => String(r[c]) <= v); return q; },
    gte: (c: string, v: string) => { if (c.endsWith("_date")) filtros.push((r) => String(r[c]) >= v); return q; },
    lt: (c: string, v: string) => { filtros.push((r) => String(r[c]) < v); return q; },
    or: () => q, in: () => q, is: () => q, not: () => q,
    update: (d: Linha) => { op = "update"; dados = d; return q; },
    insert: (d: Linha) => { op = "insert"; dados = d; return q; },
    delete: () => { op = "delete"; return q; },
    upsert: (d: Linha) => { op = "insert"; dados = d; return q; },
    maybeSingle: () => exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
    single: () => exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => exec().then(ok, erro),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
let envio: { ok: boolean; error?: string; incerto?: boolean; id?: string } = { ok: true };
const enviadas: string[] = [];
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async (_j: string, t: string) => { enviadas.push(t); return envio; } }));

// cs-pauta
const ia = vi.hoisted(() => ({ r: { ok: true, data: { itens: [] as { dia: string; tema: string }[], observacao: "" } } as Record<string, unknown> }));
vi.mock("@/lib/ai/openai", () => ({ isOpenAIConfigured: () => true }));
vi.mock("@/lib/holidays/brasil-api", () => ({ getHolidays: async () => [] }));
vi.mock("@/lib/supabase/queries", () => ({ fetchClientCsRules: async () => [] }));
vi.mock("@/lib/cs/load-briefing", () => ({ loadBriefingCombinado: async () => "briefing" }));
vi.mock("@/lib/cs/pauta", () => ({
  datasProximaSemana: () => ({ segunda: new Date("2026-10-26T12:00:00Z"), datas: ["2026-10-26", "2026-10-28"] }),
  gerarPautaSemanal: async () => ia.r,
  serializePauta: () => "pauta", formatPauta: () => "pauta formatada", buildPautaSugestao: () => "proposta", labelDia: (d: string) => `seg ${d}`,
}));

// ig-snapshots
const ig = vi.hoisted(() => ({ snap: { mapped: true, error: "rate limit" } as Record<string, unknown> }));
vi.mock("@/lib/meta/igSnapshot", () => ({
  getIgSnapshotCached: async () => ig.snap, reconcileIgFromAdAccounts: async () => [], IG_PERIODS: ["7d"],
}));

const semResposta = await import("@/app/api/system/cs-sem-resposta/route");
const eventos = await import("@/app/api/system/cs-eventos/route");
const pauta = await import("@/app/api/system/cs-pauta/route");
const igSnap = await import("@/app/api/system/ig-snapshots/route");
const { desfechoDoAvisoSemResposta } = await import("@/lib/cs/requests");
const { okDaResposta } = await import("@/lib/automacoes/saude");

const post = (url: string) => new NextRequest(`http://x${url}`, { method: "POST" });

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  ops.length = 0;
  enviadas.length = 0;
  falharLeituraDe = null;
  envio = { ok: true, id: "msg1" };
  process.env.CS_INTERNAL_GROUP_JID = "interno@g.us";
  db.customer_requests = [
    { id: "r1", client_id: "c1", group_jid: "g@g.us", origin_text: "Vocês viram o orçamento?", author_name: "Ana", topico: "outro", aberta_em: new Date(Date.now() - 50 * 60_000).toISOString(), status: "aberta", clients: { name: "Loja Alfa" } },
  ];
});

describe("10.1 — cliente sem resposta", () => {
  const status = () => db.customer_requests[0].status;

  it("o erro original: o WhatsApp recusou e a pergunta era marcada como avisada — agora fica aberta e a rotina falha", async () => {
    envio = { ok: false, error: "HTTP 400: not a participant" };
    const res = await semResposta.POST(post("/api/system/cs-sem-resposta"));
    const corpo = await res.json();
    expect(status()).toBe("aberta");
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toMatch(/aviso de novo na próxima rodada/);
    expect(okDaResposta(res.status, JSON.stringify(corpo))).toBe(false);
  });

  it("enviou: marca e responde ok", async () => {
    const corpo = await (await semResposta.POST(post("/api/system/cs-sem-resposta"))).json();
    expect(corpo).toMatchObject({ ok: true, marcadas: 1 });
    expect(status()).toBe("expirada");
  });

  it("incerto (pode ter saído): marca para não duplicar, mas a rotina não diz ok", async () => {
    envio = { ok: false, error: "o WhatsApp não respondeu em 10 s — pode ter saído", incerto: true };
    const corpo = await (await semResposta.POST(post("/api/system/cs-sem-resposta"))).json();
    expect(status()).toBe("expirada");
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toMatch(/Confira o grupo interno/);
  });

  it("erro ao ler as perguntas não é '0 vencidas'", async () => {
    falharLeituraDe = "customer_requests";
    const res = await semResposta.POST(post("/api/system/cs-sem-resposta"));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });

  it("a regra, pura", () => {
    expect(desfechoDoAvisoSemResposta({ ok: true })).toEqual({ marcar: true, falha: null });
    expect(desfechoDoAvisoSemResposta({ ok: false, error: "x" }).marcar).toBe(false);
    expect(desfechoDoAvisoSemResposta({ ok: false, error: "x", incerto: true }).marcar).toBe(true);
  });
});

describe("10.4 — cs-eventos", () => {
  beforeEach(() => {
    const daqui4 = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    db.cs_client_events = [{ id: "e1", titulo: "Black Friday", descricao: null, event_date: daqui4, assigned_social: "Carlos", client_id: null, status: "ativo", reminded_5d: false, reminded_2d: false, client: { name: "Loja Alfa" } }];
  });
  it("o erro original: marcava o lembrete sem o envio — agora envio recusado não marca e a rotina falha", async () => {
    envio = { ok: false, error: "HTTP 400" };
    const corpo = await (await eventos.POST(post("/api/system/cs-eventos"))).json();
    expect(enviadas).toHaveLength(1);
    expect(corpo.ok).toBe(false);
    expect(db.cs_client_events[0].reminded_5d).toBe(false);
    expect(ops.filter((o) => o.tabela === "cs_client_events" && o.op === "update" && ("reminded_5d" in (o.dados ?? {}) || "reminded_2d" in (o.dados ?? {})))).toEqual([]);
  });
  it("sem grupo interno também é falha, e não marca", async () => {
    delete process.env.CS_INTERNAL_GROUP_JID;
    const corpo = await (await eventos.POST(post("/api/system/cs-eventos"))).json();
    expect(corpo.ok).toBe(false);
    expect(enviadas).toEqual([]);
  });
});

describe("10.4 — cs-pauta", () => {
  beforeEach(() => {
    db.clients = [{ id: "c1", name: "Loja Alfa", nome_fantasia: null, nicho: null, campaign_briefing: "x".repeat(250), fixed_briefing: "", assigned_social: "Carlos", active: true, agente_ativo: true }];
    db.cs_demandas = [];
    db.client_briefings = [];
    db.content_cards = [];
    db.cs_client_events = [];
    process.env.CS_PAUTA_CLIENT_IDS = "c1";
    ia.r = { ok: true, data: { itens: [{ dia: "2026-10-26", tema: "A" }], observacao: "" } };
  });
  it("falha da IA não é skip ok:true", async () => {
    ia.r = { ok: false, error: "insufficient_quota" };
    const corpo = await (await pauta.POST(post("/api/system/cs-pauta"))).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toMatch(/Loja Alfa: a IA não gerou a pauta \(insufficient_quota\)/);
  });
  it("o erro original: envio recusado contava como sugerida e travava a semana — agora a demanda sai e a rotina falha", async () => {
    envio = { ok: false, error: "HTTP 400" };
    const corpo = await (await pauta.POST(post("/api/system/cs-pauta"))).json();
    expect(corpo).toMatchObject({ ok: false, sugeridas: 0 });
    expect(db.cs_demandas).toEqual([]);
  });
  it("enviou: conta e guarda o id da mensagem", async () => {
    const corpo = await (await pauta.POST(post("/api/system/cs-pauta"))).json();
    expect(corpo).toMatchObject({ ok: true, sugeridas: 1 });
    expect(db.cs_demandas[0]).toMatchObject({ msg_id_sugestao: "msg1" });
  });
});

describe("10.4 — ig-snapshots", () => {
  beforeEach(() => { db.clients = [{ id: "c1", name: "Loja Alfa", nome_fantasia: null }]; });
  it("o erro original: ok:true com 0 gerados — agora falha com o motivo", async () => {
    ig.snap = { mapped: true, error: "rate limit" };
    const corpo = await (await igSnap.POST(post("/api/system/ig-snapshots"))).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toMatch(/nenhum relatório de Instagram foi gerado para 1 cliente\(s\) \(rate limit\)/);
  });
  it("gerou: ok", async () => {
    ig.snap = { mapped: true, error: null, posts: [] };
    expect((await (await igSnap.POST(post("/api/system/ig-snapshots"))).json()).ok).toBe(true);
  });
  it("leitura dos clientes que falha não é 'nenhum cliente'", async () => {
    falharLeituraDe = "clients";
    expect((await igSnap.POST(post("/api/system/ig-snapshots"))).status).toBe(500);
  });
});
