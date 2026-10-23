// Cancelar reunião de venda e excluir lead com reunião (auditoria 21/10/2026, 4.3 e 4.4). Dados INVENTADOS.
//
// O QUE ACONTECIA:
//  4.3 — a falha do Google ao cancelar era engolida: o painel dizia "cancelada" e o lead seguia com o
//        convite e o Meet valendo (e o grupo lia "o convite foi cancelado").
//  4.4 — excluir o lead apagava a reunião em cascata e o evento do Google ficava de pé.
// Aqui roda o caminho de verdade (lib/crm/reunioes-server.ts → lib/prospeccao/google.ts) contra um banco
// em memória e um Google de mentira (fetch): a resposta do Google decide.
import { describe, it, expect, vi, beforeEach } from "vitest";

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
let falharUpdateReuniao = false;

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "update" = "select";
  private dados: Linha = {};
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  gte(c: string, v: string) { this.filtros.push((r) => Date.parse(String(r[c])) >= Date.parse(v)); return this; }
  order() { return this; }
  limit() { return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  maybeSingle() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  then<T>(ok: (r: { data: Linha[] | null; error: { message: string } | null }) => T) { return this.exec().then(ok); }
  private async exec(): Promise<{ data: Linha[] | null; error: { message: string } | null }> {
    const alvo = db[this.tabela].filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") {
      if (this.tabela === "crm_reunioes" && falharUpdateReuniao) return { data: null, error: { message: "banco fora do ar" } };
      alvo.forEach((r) => Object.assign(r, this.dados));
    }
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t) } }));
vi.mock("@/lib/supabase/queries", () => ({
  fetchCrmLeadById: async (id: string) => (id === "l1" ? { id: "l1", contatoNome: "Ana Souza", empresa: "Loja Exemplo", telefone: null, email: "ana@exemplo.com" } : null),
  updateCrmLead: async () => ({}),
  insertLeadActivity: async () => ({}),
}));
const grupo: string[] = [];
vi.mock("@/lib/crm/grupo-vendas-envio", () => ({ mandarNoGrupoVendas: async (t: string) => { grupo.push(t); return { ok: true }; } }));
vi.mock("@/lib/crm/registrar-atividade", () => ({ registrarAtividade: async () => ({}) }));
// Google "conectado": a credencial e o token vêm destes mocks; quem responde é o fetch abaixo.
vi.mock("@/lib/prospeccao/config", () => ({ lerSetting: async (k: string) => (k === "google_oauth" ? "cifrado" : null), gravarSetting: async () => {} }));
vi.mock("@/lib/crypto/vault", () => ({ encryptVault: (s: string) => s, decryptVault: () => JSON.stringify({ refresh_token: "r", email: "agenda@exemplo.com", conectado_em: "2026-10-18T12:00:00Z" }) }));

let respostaDelete: { status: number; corpo?: unknown } = { status: 204 };
const deletes: string[] = [];
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
  if (init?.method === "DELETE") {
    deletes.push(url);
    return new Response(respostaDelete.corpo ? JSON.stringify(respostaDelete.corpo) : null, { status: respostaDelete.status });
  }
  return new Response("{}", { status: 200 });
});
process.env.GOOGLE_CLIENT_ID = "id-de-teste";
process.env.GOOGLE_CLIENT_SECRET = "segredo-de-teste";

const { cancelarReuniao, cancelarReunioesDoLead, reunioesFuturasDoLead } = await import("@/lib/crm/reunioes-server");
const { textoExcluirComReuniao, erroCancelarNoGoogle, inicioDe } = await import("@/lib/crm/reunioes");

const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const reuniao = (o: Linha = {}): Linha => ({
  id: "r1", lead_id: "l1", inicio: daqui(2), fim: daqui(2.03), formato: "meet", local: null, meet_url: "https://meet.google.com/abc-defg-hij",
  estado: "agendada", google_event_id: "ev1", convidados: ["ana@exemplo.com"], criado_em: daqui(-1), ...o,
});
const estado = (id = "r1") => db.crm_reunioes.find((r) => r.id === id)!.estado;

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.crm_reunioes = [reuniao()];
  grupo.length = 0;
  deletes.length = 0;
  respostaDelete = { status: 204 };
  falharUpdateReuniao = false;
});

describe("cancelar reunião (4.3): só vira cancelada se o Google cancelou", () => {
  it("Google confirmou: cancela, avisa o grupo", async () => {
    const r = await cancelarReuniao("r1", "Roberto");
    expect(r.ok).toBe(true);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatch(/events\/ev1\?sendUpdates=all/);
    expect(estado()).toBe("cancelada");
    expect(grupo[0]).toMatch(/Reunião cancelada/);
  });
  it("Google falhou: a reunião continua marcada, o grupo não é avisado e a tela diz por quê", async () => {
    respostaDelete = { status: 500, corpo: { error: { message: "Backend Error" } } };
    const r = await cancelarReuniao("r1", "Roberto");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não confirmou o cancelamento/);
    expect(r.erro).toMatch(/continua marcada e o lead ainda tem o convite e o link do Meet/);
    expect(r.erro).toMatch(/Backend Error/);
    expect(estado()).toBe("agendada");
    expect(grupo).toEqual([]);
  });
  it("evento já apagado no Google (410 ou 404) conta como cancelado", async () => {
    respostaDelete = { status: 410 };
    expect((await cancelarReuniao("r1", null)).ok).toBe(true);
    expect(estado()).toBe("cancelada");
    db.crm_reunioes = [reuniao({ id: "r2" })];
    respostaDelete = { status: 404 };
    expect((await cancelarReuniao("r2", null)).ok).toBe(true);
  });
  it("Google desconectado: a frase diz o que fazer", () => {
    // (O token fica em cache no módulo do Google durante o arquivo; a regra da frase é testada direto.)
    expect(erroCancelarNoGoogle({ inicio: inicioDe("2026-10-23", "15:00"), meetUrl: "https://meet.google.com/x" }, "Google não conectado"))
      .toMatch(/continua marcada e o lead ainda tem o convite e o link do Meet\. Conecte o Google na Agenda do Comercial/);
  });
  it("reunião sem evento no Google (marcada com a agenda desconectada) cancela só no painel", async () => {
    db.crm_reunioes = [reuniao({ google_event_id: null, meet_url: null })];
    expect((await cancelarReuniao("r1", null)).ok).toBe(true);
    expect(deletes).toEqual([]);
  });
  it("Google cancelou mas o banco falhou: diz isso e pede para clicar de novo (repetir é seguro)", async () => {
    falharUpdateReuniao = true;
    const r = await cancelarReuniao("r1", null);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/cancelado no Google Agenda, mas não consegui marcar/);
    falharUpdateReuniao = false;
    respostaDelete = { status: 410 }; // o evento já foi apagado
    expect((await cancelarReuniao("r1", null)).ok).toBe(true);
    expect(estado()).toBe("cancelada");
  });
});

describe("excluir lead com reunião (4.4): cancela antes, ou não exclui", () => {
  it("lista só as que ainda vão acontecer", async () => {
    db.crm_reunioes.push(reuniao({ id: "passada", inicio: daqui(-3), fim: daqui(-2.97) }), reuniao({ id: "cancelada", estado: "cancelada" }));
    const f = await reunioesFuturasDoLead("l1");
    expect(f.ok && f.reunioes.map((r) => r.id)).toEqual(["r1"]);
  });
  it("cancela cada reunião futura no Google antes", async () => {
    db.crm_reunioes.push(reuniao({ id: "r2", inicio: daqui(5), fim: daqui(5.03), google_event_id: "ev2" }));
    const c = await cancelarReunioesDoLead("l1", "Roberto");
    expect(c.ok).toBe(true);
    expect(deletes.map((u) => /events\/(ev\d)/.exec(u)![1])).toEqual(["ev1", "ev2"]);
    expect(db.crm_reunioes.map((r) => r.estado)).toEqual(["cancelada", "cancelada"]);
  });
  it("Google falhou: para e devolve o erro — quem chama não exclui o lead", async () => {
    respostaDelete = { status: 403, corpo: { error: { message: "Forbidden" } } };
    const c = await cancelarReunioesDoLead("l1", null);
    expect(c.ok).toBe(false);
    expect(!c.ok && c.erro).toMatch(/continua marcada/);
    expect(estado()).toBe("agendada");
  });
  it("a confirmação diz qual reunião vai ser cancelada", () => {
    const uma = textoExcluirComReuniao([{ inicio: inicioDe("2026-10-23", "15:00") }]);
    expect(uma).toBe("Este lead tem reunião marcada para sexta, 23/10 às 15h. Ao excluir, ela é cancelada antes — no Google Agenda também (quem foi convidado recebe o aviso de cancelamento) — e o grupo de vendas é avisado.");
    expect(textoExcluirComReuniao([{ inicio: inicioDe("2026-10-23", "15:00") }, { inicio: inicioDe("2026-10-27", "10:30") }])).toMatch(/2 reuniões marcadas \(sexta, 23\/10 às 15h; terça, 27\/10 às 10h30\)/);
    // Reunião só do painel (marcada com a agenda desconectada): não promete aviso do Google.
    expect(textoExcluirComReuniao([{ inicio: inicioDe("2026-10-23", "15:00"), googleEventId: null }])).toBe("Este lead tem reunião marcada para sexta, 23/10 às 15h. Ao excluir, ela é cancelada antes e o grupo de vendas é avisado.");
    expect(erroCancelarNoGoogle({ inicio: inicioDe("2026-10-23", "15:00"), meetUrl: null }, "Google 500: x")).not.toMatch(/Meet/);
  });
});
