// A rota do cron e a gravação, com banco falso e relógio parado (05/11/2026).
//
// A biblioteca de lembretes sempre esteve certa: o erro era a ROTA passar o relógio deslocado para
// ela. Teste de função não pega isso; aqui a rota roda inteira, às 12:00 do dia do print.
//
// O banco falso recusa `.upsert` como o Postgres recusa: `meetings_ciclo_unico` é índice parcial,
// e ON CONFLICT sem o predicado dá 42P10. Foi assim que as gravações morreram em silêncio.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = { meetings: [], agency_settings: [], clients: [], cs_outbound: [] };
const enviados: { grupo: string; texto: string; origem?: string }[] = [];
let recusaEnvio: (grupo: string) => boolean = () => false;
let proximoId = 1;

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "update" | "insert" = "select";
  private dados: Linha | null = null;
  private ordem: { c: string; asc: boolean } | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filtros.push((r) => r[c] !== v); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  or() { return this; }
  gte(c: string, v: string) { this.filtros.push((r) => new Date(r[c] as string) >= new Date(v)); return this; }
  lte(c: string, v: string) { this.filtros.push((r) => new Date(r[c] as string) <= new Date(v)); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.ordem = { c, asc: o?.ascending !== false }; return this; }
  limit() { return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  insert(d: Linha) { this.op = "insert"; this.dados = d; return this; }
  upsert() { return Promise.resolve({ data: null, error: { code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" } }); }
  maybeSingle() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  single() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  then<T>(ok: (r: { data: Linha[] | null; error: { code?: string; message: string } | null }) => T) { return this.exec().then(ok); }
  private async exec(): Promise<{ data: Linha[] | null; error: { code?: string; message: string } | null }> {
    const t = db[this.tabela];
    if (this.op === "insert") {
      const nova: Linha = { id: `m${proximoId++}`, ...this.dados };
      t.push(nova);
      return { data: [nova], error: null };
    }
    const alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") { alvo.forEach((r) => Object.assign(r, this.dados)); return { data: alvo, error: null }; }
    if (this.ordem) {
      const { c, asc } = this.ordem;
      alvo.sort((a, b) => (new Date(a[c] as string).getTime() - new Date(b[c] as string).getTime()) * (asc ? 1 : -1));
    }
    return { data: alvo, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t) } }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/holidays/brasil-api", () => ({ getHolidays: async () => [] }));
vi.mock("@/lib/cs/mencao", () => ({ mencionar: async (n: string) => ({ trecho: `@${n}`, jids: [] }) }));
vi.mock("@/lib/cs/piloto", () => ({
  lerAbordagem: async () => ({ modo: "todos", clientes: [] }),
  podeAbordar: () => true,
  descrever: () => "todos",
}));
vi.mock("@/lib/cs/notify", () => ({
  csSendGroupText: async (grupo: string, texto: string, _q: unknown, meta?: { origem?: string }) => {
    enviados.push({ grupo, texto, origem: meta?.origem });
    return recusaEnvio(grupo) ? { ok: false, error: "o WhatsApp recusou" } : { ok: true, id: `w${enviados.length}` };
  },
}));

const EQUIPE = "equipe@g.us";
const CLIENTE = "cliente@g.us";
const sp = (s: string) => new Date(`${s}-03:00`);

function reuniao(o: Linha = {}): Linha {
  return {
    id: "reu-1", client_id: "c1", title: "Reunião", estado: "agendada", responsavel: "Thiago", attendees: [],
    start_at: "2026-11-05T13:00:00+00:00",   // 10:00 em SP, como o banco devolve
    clients: { name: "Contele", whatsapp_group_jid: CLIENTE },
    ...o,
  };
}

async function rodarCron(quando: string) {
  vi.setSystemTime(sp(quando));
  const { POST } = await import("@/app/api/system/cs-reuniao-mensal/route");
  const res = await POST(new NextRequest("http://x/api/system/cs-reuniao-mensal", { method: "POST" }));
  return res.json();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  process.env.CS_INTERNAL_GROUP_JID = EQUIPE;
  for (const k of Object.keys(db)) db[k] = [];
  enviados.length = 0;
  recusaEnvio = () => false;
  proximoId = 1;
});
afterEach(() => { vi.useRealTimers(); });

describe("os lembretes, pela rota, no relógio real", () => {
  it("o caso do print: reunião 10:00, rodada das 12:00, NÃO manda nada", async () => {
    db.meetings.push(reuniao());
    await rodarCron("2026-11-05T12:00:00");
    expect(enviados).toEqual([]);
  });

  it("a rodada das 9:00 avisa a equipe e o cliente", async () => {
    db.meetings.push(reuniao());
    const r = await rodarCron("2026-11-05T09:00:00");
    expect(enviados.map((e) => e.grupo).sort()).toEqual([CLIENTE, EQUIPE].sort());
    expect(enviados.find((e) => e.grupo === CLIENTE)?.texto).toMatch(/daqui a uma hora \(quinta-feira, 05 de novembro às 10:00\)/);
    expect(r.ok).toBe(true);
    expect(db.meetings[0].lembrete_hora_em).toBeTruthy();
    expect(db.meetings[0].lembrete_cliente_hora_em).toBeTruthy();
  });

  it("nenhuma rodada depois das 9:00 repete ou atrasa", async () => {
    db.meetings.push(reuniao());
    await rodarCron("2026-11-05T09:00:00");
    enviados.length = 0;
    for (const h of ["10", "11", "12", "13", "14"]) await rodarCron(`2026-11-05T${h}:00:00`);
    expect(enviados).toEqual([]);
  });

  it("reunião às 16:00, que nunca era lembrada, agora é às 15:00", async () => {
    db.meetings.push(reuniao({ start_at: "2026-11-05T19:00:00+00:00" }));
    await rodarCron("2026-11-05T14:00:00");
    expect(enviados).toEqual([]);
    await rodarCron("2026-11-05T15:00:00");
    expect(enviados).toHaveLength(2);
  });

  it("reunião de segunda tem véspera na sexta", async () => {
    db.meetings.push(reuniao({ start_at: "2026-11-09T13:00:00+00:00", lembrete_hora_em: null }));
    await rodarCron("2026-11-06T09:00:00");
    const doCliente = enviados.find((e) => e.grupo === CLIENTE)?.texto ?? "";
    expect(doCliente).toMatch(/segunda temos nossa reunião/);
    expect(doCliente).not.toMatch(/amanhã/);
  });

  it("o WhatsApp recusou o do cliente: a próxima rodada tenta só ele, sem repetir a equipe", async () => {
    db.meetings.push(reuniao({ start_at: "2026-11-05T13:30:00+00:00" }));   // 10:30
    recusaEnvio = (g) => g === CLIENTE;
    const r1 = await rodarCron("2026-11-05T09:00:00");
    expect(r1.ok).toBe(false);
    enviados.length = 0;
    recusaEnvio = () => false;
    await rodarCron("2026-11-05T10:00:00");
    expect(enviados.map((e) => e.grupo)).toEqual([CLIENTE]);
    expect(db.meetings[0].lembrete_cliente_hora_em).toBeTruthy();
  });

  it("reunião cancelada ou apagada não lembra", async () => {
    db.meetings.push(reuniao({ estado: "cancelada" }), reuniao({ id: "reu-2", deleted_at: "2026-11-04T10:00:00Z" }));
    await rodarCron("2026-11-05T09:00:00");
    expect(enviados).toEqual([]);
  });
});

describe("a oferta, pela rota", () => {
  function cliente(): Linha {
    return { id: "c1", name: "Contele", assigned_social: "Thiago", status: "active", active: true, agente_ativo: true, whatsapp_group_jid: CLIENTE, paused_at: null };
  }

  it("promete 10:00 e 15:00 e grava, mesmo com o upsert impossível", async () => {
    db.clients.push(cliente());
    await rodarCron("2026-11-16T08:00:00");
    const oferta = enviados.find((e) => e.origem === "cs-reuniao-oferta")?.texto ?? "";
    expect(oferta).toMatch(/terça-feira, 17 de novembro às 10:00/);
    expect(oferta).toMatch(/quarta-feira, 18 de novembro às 15:00/);
    expect(oferta).not.toMatch(/07:00|12:00/);
    expect(db.meetings).toHaveLength(1);
    expect(db.meetings[0]).toMatchObject({ estado: "ofertada", mes_referencia: "2026-11", tentativas: 1, meeting_type: "mensal" });
  });

  it("não repete a oferta na manhã seguinte", async () => {
    db.clients.push(cliente());
    await rodarCron("2026-11-16T08:00:00");
    enviados.length = 0;
    await rodarCron("2026-11-17T08:00:00");
    expect(enviados.filter((e) => e.origem === "cs-reuniao-oferta")).toEqual([]);
  });

  it("reoferta dois dias depois, na manhã certa", async () => {
    db.clients.push(cliente());
    await rodarCron("2026-11-16T08:00:40");
    enviados.length = 0;
    await rodarCron("2026-11-18T08:00:05");
    expect(enviados.filter((e) => e.origem === "cs-reuniao-oferta")).toHaveLength(1);
    expect(db.meetings[0].tentativas).toBe(2);
  });

  it("não saiu: não gasta a tentativa e tenta de novo na manhã seguinte", async () => {
    db.clients.push(cliente());
    recusaEnvio = (g) => g === CLIENTE;
    const r = await rodarCron("2026-11-16T08:00:00");
    expect(r.ok).toBe(false);
    expect(db.meetings[0]).toMatchObject({ estado: "pendente", tentativas: 0 });
    recusaEnvio = () => false;
    enviados.length = 0;
    await rodarCron("2026-11-17T08:00:00");
    expect(enviados.filter((e) => e.origem === "cs-reuniao-oferta")).toHaveLength(1);
  });
});

describe("gravar a proposta que veio da conversa", () => {
  const proposta = (o = {}) => ({
    clientId: "c1", cliente: "Contele", iso: "2026-11-13T15:00:00-03:00", responsavel: "Thiago",
    groupJid: CLIENTE, trecho: "pode ser sexta às 15h", estado: "aguardando_social" as const, lado: "cliente" as const, ...o,
  });

  it("sem nada marcado, cria a reunião do ciclo do mês do horário", async () => {
    const { gravarProposta } = await import("@/lib/cs/reuniao-ciclo-server");
    const g = await gravarProposta(proposta());
    expect(g.id).toBeTruthy();
    expect(db.meetings[0]).toMatchObject({
      estado: "aguardando_social", mes_referencia: "2026-11", meeting_type: "mensal",
      start_at: "2026-11-13T15:00:00-03:00", horario_proposto: "2026-11-13T15:00:00-03:00", responsavel: "Thiago",
    });
  });

  it("a mesma conversa não cria duas", async () => {
    const { gravarProposta } = await import("@/lib/cs/reuniao-ciclo-server");
    await gravarProposta(proposta());
    await gravarProposta(proposta({ iso: "2026-11-14T10:00:00-03:00" }));
    expect(db.meetings).toHaveLength(1);
    expect(db.meetings[0].horario_proposto).toBe("2026-11-14T10:00:00-03:00");
  });

  it("muda a reunião marcada à mão, em vez de criar outra ao lado dela", async () => {
    const { gravarProposta } = await import("@/lib/cs/reuniao-ciclo-server");
    db.meetings.push(reuniao({ meeting_type: "alinhamento", lembrete_vespera_em: "2026-11-04T12:00:00Z" }));
    await gravarProposta(proposta({ agendadaId: "reu-1" }));
    expect(db.meetings).toHaveLength(1);
    expect(db.meetings[0]).toMatchObject({
      estado: "aguardando_social", meeting_type: "alinhamento", horario_proposto: "2026-11-13T15:00:00-03:00",
      // O horário antigo fica até o social confirmar o novo; os lembretes dele, não.
      start_at: "2026-11-05T13:00:00+00:00", lembrete_vespera_em: null,
    });
  });

  it("reunião mudada para o horário proposto não gera lembrete enquanto o social não confirma", async () => {
    const { gravarProposta } = await import("@/lib/cs/reuniao-ciclo-server");
    db.meetings.push(reuniao());
    await gravarProposta(proposta({ agendadaId: "reu-1" }));
    await rodarCron("2026-11-05T09:00:00");
    expect(enviados).toEqual([]);
  });

  it("acha a próxima reunião do cliente, de qualquer tipo, e ignora a que já passou", async () => {
    const { reuniaoAtivaDoCliente } = await import("@/lib/cs/reuniao-ciclo-server");
    db.meetings.push(
      reuniao({ id: "passada", start_at: "2026-11-01T13:00:00+00:00" }),
      reuniao({ id: "manual", meeting_type: "alinhamento", start_at: "2026-11-07T13:00:00+00:00" }),
      reuniao({ id: "depois", start_at: "2026-11-20T13:00:00+00:00" }),
    );
    vi.setSystemTime(sp("2026-11-05T09:00:00"));
    expect((await reuniaoAtivaDoCliente("c1"))?.id).toBe("manual");
  });
});
