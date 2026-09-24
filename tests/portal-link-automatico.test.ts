// tests/portal-link-automatico.test.ts — todo cliente novo nasce com o link do portal e o grupo de
// CADASTRO recebe UMA mensagem (lib/portal/link-automatico.ts). Contra um banco em memória.
//
// O que isto protege: mandar duas vezes (duas ativações, retry), mandar para grupo de cliente,
// recriar um link revogado de propósito, anunciar link velho sem a trava, e travar para sempre um
// envio que falhou.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
/** Simula o banco ANTES da migration 20260927100000 (sem a coluna da trava). */
let semColuna = false;
const COLUNA = "portal_link_avisado_em";

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "insert" | "update" = "select";
  private dados: Linha | null = null;
  private cols = "*";
  private max: number | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select(cols = "*") { if (this.op === "select") this.cols = cols; return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  or() { return this; }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  insert(d: Linha) { this.op = "insert"; this.dados = d; return this; }
  maybeSingle() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  then<T>(ok: (r: { data: Linha[] | null; error: { message: string; code?: string } | null }) => T, erro?: (e: unknown) => T) {
    return this.exec().then(ok, erro);
  }
  private async exec(): Promise<{ data: Linha[] | null; error: { message: string; code?: string } | null }> {
    await Promise.resolve(); // uma volta no event loop: deixa duas chamadas "ao mesmo tempo" se cruzarem
    const t = db[this.tabela];
    const tocaColuna = this.cols.includes(COLUNA) || (this.dados && COLUNA in this.dados);
    if (semColuna && this.tabela === "clients" && tocaColuna) {
      return { data: null, error: { message: `column clients.${COLUNA} does not exist`, code: "42703" } };
    }
    if (this.op === "insert") { t.push({ ...this.dados }); return { data: [{ ...this.dados }], error: null }; }
    let alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") { alvo.forEach((r) => Object.assign(r, this.dados)); return { data: alvo.map((r) => ({ ...r })), error: null }; }
    if (this.max != null) alvo = alvo.slice(0, this.max);
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}

const envio = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t) } }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: envio.fn }));

const {
  decidirLinkAutomatico, garantirLinkDoPortal, jidDoGrupoCadastro, mensagemLinkDoPortal, situacaoParaBackfill, idemDoLink,
} = await import("@/lib/portal/link-automatico");

const GRUPO_CADASTRO = "120363000000000001@g.us";
const GRUPO_DO_CLIENTE = "120363999999999999@g.us";
const ENV_ORIGINAL = { ...process.env };

const cliente = (p: Linha = {}): Linha => ({
  id: "k1", name: "Padaria do Zé", nome_fantasia: null, active: true, churned_at: null, draft_status: null,
  paused_at: null, paused_until: null, public_report_token: null, public_report_token_revoked_at: null,
  public_report_enabled: false, [COLUNA]: null, whatsapp_group_jid: GRUPO_DO_CLIENTE, ...p,
});
const k1 = () => db.clients.find((c) => c.id === "k1")!;

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.clients = [cliente()];
  db.cs_outbound = [];
  semColuna = false;
  process.env.CS_CADASTRO_GROUP_JID = GRUPO_CADASTRO;
  delete process.env.CS_INTERNAL_GROUP_JID;
  envio.fn.mockReset();
  // O envio de verdade registra a saída em cs_outbound (lib/cs/notify.ts#registrarSaida).
  envio.fn.mockImplementation(async (jid: string, texto: string, _q: unknown, meta: { idem?: string; clientId?: string }) => {
    db.cs_outbound.push({ group_jid: jid, texto, idem_key: meta?.idem ?? null, client_id: meta?.clientId ?? null, enviado: true });
    return { ok: true, id: "msg1" };
  });
});
afterEach(() => { process.env = { ...ENV_ORIGINAL }; });

describe("a decisão (pura)", () => {
  const base = { id: "k1", active: true };
  it("cliente novo sem link: gera e avisa", () => {
    expect(decidirLinkAutomatico(base, { origem: "cadastro" })).toEqual({ gerar: true, enviar: true, motivo: null });
  });
  it("arquivado, ex-cliente e rascunho (fora do CRM) não ganham nada", () => {
    expect(decidirLinkAutomatico({ ...base, active: false }, { origem: "cadastro" }).gerar).toBe(false);
    expect(decidirLinkAutomatico({ ...base, churned_at: "2026-09-01" }, { origem: "aprovacao" }).enviar).toBe(false);
    expect(decidirLinkAutomatico({ ...base, draft_status: "awaiting_approval" }, { origem: "aprovacao" }))
      .toMatchObject({ gerar: false, enviar: false });
  });
  it("lead ganho no CRM nasce rascunho e mesmo assim ganha o link", () => {
    expect(decidirLinkAutomatico({ ...base, draft_status: "pending_invite" }, { origem: "crm" })).toMatchObject({ gerar: true, enviar: true });
  });
  it("link revogado de propósito não é recriado nem anunciado", () => {
    const r = decidirLinkAutomatico({ ...base, public_report_token: "t", public_report_token_revoked_at: "2026-09-01" }, { origem: "reativacao" });
    expect(r).toEqual({ gerar: false, enviar: false, motivo: "link desativado de propósito" });
  });
  it("já avisado: não manda de novo; pausado: gera mas não manda", () => {
    expect(decidirLinkAutomatico({ ...base, public_report_token: "t", public_report_enabled: true, [COLUNA]: "2026-09-20" }, { origem: "aprovacao" }).enviar).toBe(false);
    const pausado = decidirLinkAutomatico({ ...base, paused_at: "2026-09-20" }, { origem: "cadastro" }, new Date("2026-09-24T12:00:00Z"));
    expect(pausado).toMatchObject({ gerar: true, enviar: false });
  });
  it("sem a migration, link que já existia não é anunciado", () => {
    expect(decidirLinkAutomatico({ ...base, public_report_token: "t", public_report_enabled: true }, { origem: "aprovacao", semColuna: true }).enviar).toBe(false);
    expect(decidirLinkAutomatico(base, { origem: "cadastro", semColuna: true }).enviar).toBe(true);
  });
});

describe("a mensagem e o grupo", () => {
  it("nome, link e uma linha sobre o que é — curta", () => {
    const m = mensagemLinkDoPortal("Padaria do Zé", "https://resultados.lonemidia.com/portal/abc");
    expect(m).toContain("*Padaria do Zé*");
    expect(m).toContain("https://resultados.lonemidia.com/portal/abc");
    expect(m).toMatch(/página de resultados que o cliente abre sem login/);
    expect(m.split("\n")).toHaveLength(3);
  });
  it("grupo de cadastro; sem ele, o interno", () => {
    expect(jidDoGrupoCadastro({ CS_CADASTRO_GROUP_JID: "a@g.us", CS_INTERNAL_GROUP_JID: "b@g.us" })).toBe("a@g.us");
    expect(jidDoGrupoCadastro({ CS_INTERNAL_GROUP_JID: "b@g.us" })).toBe("b@g.us");
    expect(jidDoGrupoCadastro({})).toBeNull();
  });
});

describe("garantirLinkDoPortal", () => {
  it("cliente novo: gera o link (portal ligado) e o grupo de CADASTRO recebe uma mensagem", async () => {
    const r = await garantirLinkDoPortal("k1", { origem: "cadastro" });
    expect(r).toMatchObject({ gerado: true, enviado: true, motivo: null });
    expect(k1().public_report_token).toBeTruthy();
    expect(k1().public_report_enabled).toBe(true);
    expect(k1()[COLUNA]).toBeTruthy();
    expect(r.url).toBe(`https://resultados.lonemidia.com/portal/${k1().public_report_token}`);
    expect(envio.fn).toHaveBeenCalledTimes(1);
    const [jid, texto, , meta] = envio.fn.mock.calls[0];
    expect(jid).toBe(GRUPO_CADASTRO);
    expect(texto).toContain(r.url);
    expect(meta).toMatchObject({ destino: "interno", clientId: "k1", idem: idemDoLink("k1") });
  });

  it("nunca duas vezes: segunda ativação (aprovar de novo, reativar) não manda", async () => {
    await garantirLinkDoPortal("k1", { origem: "crm" });
    const token = k1().public_report_token;
    const r = await garantirLinkDoPortal("k1", { origem: "aprovacao" });
    expect(r).toMatchObject({ gerado: false, enviado: false, motivo: "o grupo de cadastro já recebeu este link" });
    expect(k1().public_report_token).toBe(token); // o link não muda
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("duas ativações ao mesmo tempo: um link e uma mensagem", async () => {
    const [a, b] = await Promise.all([
      garantirLinkDoPortal("k1", { origem: "aprovacao" }),
      garantirLinkDoPortal("k1", { origem: "aprovacao" }),
    ]);
    expect(envio.fn).toHaveBeenCalledTimes(1);
    expect([a.enviado, b.enviado].filter(Boolean)).toHaveLength(1);
    expect(a.url).toBe(b.url);
  });

  it("envio que falha solta a trava: a próxima ativação manda", async () => {
    envio.fn.mockResolvedValueOnce({ ok: false, error: "Evolution fora" });
    const r1 = await garantirLinkDoPortal("k1", { origem: "cadastro" });
    expect(r1).toMatchObject({ gerado: true, enviado: false });
    expect(r1.motivo).toMatch(/Evolution fora/);
    expect(k1()[COLUNA]).toBeNull();
    const r2 = await garantirLinkDoPortal("k1", { origem: "backfill" });
    expect(r2).toMatchObject({ gerado: false, enviado: true });
    expect(envio.fn).toHaveBeenCalledTimes(2);
  });

  it("nunca para grupo de cliente: se o JID configurado é de um cliente, não manda", async () => {
    process.env.CS_CADASTRO_GROUP_JID = GRUPO_DO_CLIENTE;
    const r = await garantirLinkDoPortal("k1", { origem: "cadastro" });
    expect(r).toMatchObject({ gerado: true, enviado: false });
    expect(envio.fn).not.toHaveBeenCalled();
    expect(k1()[COLUNA]).toBeNull();
  });

  it("sem grupo configurado: gera o link, não manda, e avisa por quê", async () => {
    delete process.env.CS_CADASTRO_GROUP_JID;
    const r = await garantirLinkDoPortal("k1", { origem: "cadastro" });
    expect(r.gerado).toBe(true);
    expect(r.motivo).toMatch(/grupo de cadastro não configurado/);
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("link revogado: nada muda e nada sai", async () => {
    db.clients = [cliente({ public_report_token: "velho", public_report_token_revoked_at: "2026-09-01T00:00:00Z" })];
    const r = await garantirLinkDoPortal("k1", { origem: "reativacao" });
    expect(r).toMatchObject({ gerado: false, enviado: false, motivo: "link desativado de propósito" });
    expect(k1().public_report_token).toBe("velho");
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("gerar sem avisar (backfill ?gerar=1): o link nasce e o grupo não recebe nada", async () => {
    const r = await garantirLinkDoPortal("k1", { origem: "backfill", gerar: true, enviar: false });
    expect(r).toMatchObject({ gerado: true, enviado: false });
    expect(envio.fn).not.toHaveBeenCalled();
    expect(k1()[COLUNA]).toBeNull();
  });

  it("rascunho aprovado depois da conversão do CRM: o link do CRM vale, sem segunda mensagem", async () => {
    db.clients = [cliente({ draft_status: "pending_invite" })];
    expect((await garantirLinkDoPortal("k1", { origem: "crm" })).enviado).toBe(true);
    k1().draft_status = null;
    expect((await garantirLinkDoPortal("k1", { origem: "aprovacao" })).enviado).toBe(false);
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  describe("sem a migration (coluna da trava ausente)", () => {
    beforeEach(() => { semColuna = true; });

    it("link criado agora é avisado, uma vez (a trava vira o registro de envios)", async () => {
      const r1 = await garantirLinkDoPortal("k1", { origem: "cadastro" });
      expect(r1).toMatchObject({ gerado: true, enviado: true });
      const r2 = await garantirLinkDoPortal("k1", { origem: "aprovacao" });
      expect(r2.enviado).toBe(false);
      expect(envio.fn).toHaveBeenCalledTimes(1);
    });

    it("link que já existia não é anunciado", async () => {
      db.clients = [cliente({ public_report_token: "antigo", public_report_enabled: true })];
      const r = await garantirLinkDoPortal("k1", { origem: "reativacao" });
      expect(r).toMatchObject({ gerado: false, enviado: false });
      expect(envio.fn).not.toHaveBeenCalled();
    });
  });
});

describe("backfill: situação de cada cliente ativo", () => {
  it("sem link, sem aviso, desativado, em dia", () => {
    expect(situacaoParaBackfill({ id: "a" })).toBe("sem_link");
    expect(situacaoParaBackfill({ id: "b", public_report_token: "t", public_report_enabled: true })).toBe("sem_aviso");
    expect(situacaoParaBackfill({ id: "c", public_report_token: "t", public_report_token_revoked_at: "2026-09-01" })).toBe("desativado");
    expect(situacaoParaBackfill({ id: "d", public_report_token: "t", public_report_enabled: true, [COLUNA]: "2026-09-20" })).toBe("ok");
    // Sem a coluna não dá pra saber quem foi avisado: não lista ninguém como "sem aviso".
    expect(situacaoParaBackfill({ id: "e", public_report_token: "t", public_report_enabled: true }, true)).toBe("ok");
  });
});
