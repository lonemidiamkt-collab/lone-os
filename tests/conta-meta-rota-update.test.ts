// tests/conta-meta-rota-update.test.ts — 21/10/2026, item 3.3, contra um banco em memória.
// A rota /api/clients/update inteira: vincular a conta de outro cliente sem confirmar volta 409 e
// NÃO mexe em nada; confirmando, a conta sai do antigo e vem para este (ficha + ad_accounts);
// salvar com a mesma conta não põe a coluna no UPDATE (é a coluna no SET que dispara o gatilho).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
const updatesEmClients: Linha[] = [];

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "update" | "delete" | "upsert" = "select";
  private dados: Linha | null = null;
  private conflito: string | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filtros.push((r) => r[c] !== v); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  not(c: string, _op: string, _v: unknown) { this.filtros.push((r) => r[c] != null); return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(d: Linha, o: { onConflict: string }) { this.op = "upsert"; this.dados = d; this.conflito = o.onConflict; return this; }
  maybeSingle() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  single() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.data?.length ? null : { message: "0 rows" } })); }
  then<T>(ok: (r: { data: Linha[] | null; error: null }) => T, erro?: (e: unknown) => T) { return this.exec().then(ok, erro); }
  private async exec(): Promise<{ data: Linha[] | null; error: null }> {
    const t = db[this.tabela];
    if (this.op === "upsert") {
      const ja = t.find((r) => r[this.conflito!] === this.dados![this.conflito!]);
      if (ja) Object.assign(ja, this.dados); else t.push({ ...this.dados });
      return { data: null, error: null };
    }
    const alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "delete") { db[this.tabela] = t.filter((r) => !alvo.includes(r)); return { data: null, error: null }; }
    if (this.op === "update") {
      if (this.tabela === "clients") updatesEmClients.push({ ...this.dados });
      alvo.forEach((r) => Object.assign(r, this.dados));
    }
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}

const historico = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t) } }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "julio@lone", isAdmin: false }) }));
vi.mock("@/lib/portal/link-automatico", () => ({ dispararLinkDoPortal: vi.fn() }));
vi.mock("@/lib/clients/historico", () => ({ registrarHistorico: historico.fn }));

const { POST } = await import("@/app/api/clients/update/route");

const A = "11111111-1111-4111-8111-111111111111"; // Bazar Ribeiro, dono da conta act_123
const B = "22222222-2222-4222-8222-222222222222"; // cliente onde alguém clicou na conta errada

const pedir = (corpo: Linha) => POST(new NextRequest("http://x/api/clients/update", { method: "POST", body: JSON.stringify(corpo) }));
const cliente = (id: string) => db.clients.find((c) => c.id === id)!;

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  updatesEmClients.length = 0;
  historico.fn.mockClear();
  db.clients = [
    { id: A, name: "Bazar Ribeiro", nome_fantasia: null, active: true, churned_at: null, meta_ad_account_id: "act_123", meta_ad_account_name: "CA Bazar" },
    { id: B, name: "Veneza", nome_fantasia: null, active: true, churned_at: null, meta_ad_account_id: null, meta_ad_account_name: null },
  ];
  db.ad_accounts = [{ client_id: A, meta_account_id: "act_123", is_prepaid: true }];
});

describe("/api/clients/update — conta Meta de outro cliente", () => {
  it("sem confirmação: 409 dizendo de quem é, e nada muda (nem ficha, nem alerta de verba)", async () => {
    const r = await pedir({ id: B, metaAdAccountId: "act_123", metaAdAccountName: "CA Bazar" });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toMatch(/é do cliente Bazar Ribeiro/);
    expect(j.donos).toEqual([{ clientId: A, nome: "Bazar Ribeiro", ativo: true }]);
    expect(cliente(B).meta_ad_account_id).toBeNull();
    expect(cliente(A).meta_ad_account_id).toBe("act_123");
    expect(db.ad_accounts).toEqual([{ client_id: A, meta_account_id: "act_123", is_prepaid: true }]);
    expect(updatesEmClients).toEqual([]);
  });

  it("com confirmação: sai do antigo, vem para este (a linha do alerta de verba vai junto) e fica no histórico dos dois", async () => {
    const r = await pedir({ id: B, metaAdAccountId: "act_123", metaAdAccountName: "CA Bazar", transferirContaMeta: true });
    expect(r.status).toBe(200);
    expect((await r.json()).transferidaDe).toEqual([{ clientId: A, nome: "Bazar Ribeiro" }]);
    expect(cliente(A)).toMatchObject({ meta_ad_account_id: null, meta_ad_account_name: null });
    expect(cliente(B)).toMatchObject({ meta_ad_account_id: "act_123", meta_ad_account_name: "CA Bazar" });
    expect(db.ad_accounts).toEqual([{ client_id: B, meta_account_id: "act_123", is_prepaid: true, account_name: "CA Bazar" }]);
    expect(historico.fn).toHaveBeenCalledTimes(2);
  });

  it("conta livre: vincula direto, grava ficha e espelho, e normaliza para act_", async () => {
    const r = await pedir({ id: B, metaAdAccountId: "777" });
    expect(r.status).toBe(200);
    expect(cliente(B).meta_ad_account_id).toBe("act_777");
    expect(db.ad_accounts).toContainEqual({ client_id: B, meta_account_id: "act_777" });
  });

  it("salvar o cadastro com a mesma conta: a coluna não vai no UPDATE e a conta não muda de lugar", async () => {
    // Dado legado: B também aponta para a conta de A (sem act_). Editar o nome de B não pode puxar a conta.
    cliente(B).meta_ad_account_id = "123";
    const r = await pedir({ id: B, name: "Veneza Matriz", metaAdAccountId: "act_123" });
    expect(r.status).toBe(200);
    expect(updatesEmClients).toEqual([{ name: "Veneza Matriz" }]);
    expect(db.ad_accounts).toEqual([{ client_id: A, meta_account_id: "act_123", is_prepaid: true }]);
  });
});
