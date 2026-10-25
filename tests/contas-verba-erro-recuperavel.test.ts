// @vitest-environment node
// tests/contas-verba-erro-recuperavel.test.ts — 25/10/2026, auditoria 9.4, 9.6 e 9.7. Dados INVENTADOS.
//
// O QUE ACONTECIA:
//  9.4 — "3.000" gravava R$ 3,00 e "3.000,00" chegava vazio e APAGAVA a verba (type=number + parseFloat).
//  9.6 — "Adicionar conta" trocava calada a conta da ficha de quem já tinha outra (relatório, portal e
//        Instagram passavam a ler a nova; o gatilho tirava a antiga do controle de verba).
//  9.7 — erro ao ler as contas ocultas virava "nenhuma oculta" e o próximo "Ocultar" gravava só aquela:
//        as outras voltavam ao Início, Hoje, Anúncios e vigia.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { lerCampoReais, paraCampo } from "@/lib/trafego/contas-verba";
import { alternarNaLista, lerListaOcultas } from "@/lib/trafego/contas-ocultas";

describe("9.4 — valores do modal Verba e alertas", () => {
  it("o erro original: '3.000' é três mil e '3.000,00' não some", () => {
    expect(lerCampoReais("3.000")).toBe(3000);
    expect(lerCampoReais("3.000,00")).toBe(3000);
    expect(lerCampoReais("3000")).toBe(3000);
  });
  it("vazio apaga de propósito (null); o que não dá para entender não salva (undefined)", () => {
    expect(lerCampoReais("")).toBeNull();
    expect(lerCampoReais("3,000,00")).toBeUndefined();
    expect(lerCampoReais("três mil")).toBeUndefined();
  });
  it("o campo abre no formato brasileiro", () => {
    expect(paraCampo(3000)).toBe("3.000,00");
    expect(paraCampo(null)).toBe("");
  });
});

describe("9.7 — lista de contas ocultas", () => {
  it("mexe numa conta só", () => {
    expect(alternarNaLista(["act_1", "act_2"], "act_3", true)).toEqual(["act_1", "act_2", "act_3"]);
    expect(alternarNaLista(["act_1", "act_2"], "act_1", false)).toEqual(["act_2"]);
    expect(alternarNaLista(["act_1"], "act_1", true)).toEqual(["act_1"]);
  });
  it("valor ilegível é erro, não 'nenhuma oculta'", () => {
    expect(lerListaOcultas('["act_1"]')).toEqual({ ok: true, ids: ["act_1"] });
    expect(lerListaOcultas(null)).toEqual({ ok: true, ids: [] });
    expect(lerListaOcultas("{quebrado").ok).toBe(false);
  });
});

// ─── Rotas contra um banco em memória ─────────────────────────────────────────

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
let falharLeituraDe: string | null = null;
const mudou = vi.hoisted(() => ({ entre: null as null | (() => void) }));

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "update" | "insert" | "upsert" = "select";
  private dados: Linha | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  order() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  not(c: string) { this.filtros.push((r) => r[c] != null); return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  insert(d: Linha) { this.op = "insert"; this.dados = d; return this; }
  upsert(d: Linha) { this.op = "upsert"; this.dados = d; return this; }
  maybeSingle() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  single() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  then<T>(ok: (r: { data: Linha[] | null; error: { message: string; code?: string } | null }) => T, erro?: (e: unknown) => T) { return this.exec().then(ok, erro); }
  private async exec(): Promise<{ data: Linha[] | null; error: { message: string; code?: string } | null }> {
    const t = db[this.tabela];
    if (this.op === "select" && falharLeituraDe === this.tabela) return { data: null, error: { message: "timeout" } };
    if (this.op === "insert") {
      if (this.tabela === "agency_settings" && t.some((r) => r.key === this.dados!.key)) return { data: null, error: { message: "dup", code: "23505" } };
      const nova = { id: `id-${t.length + 1}`, ...this.dados };
      t.push(nova);
      return { data: [nova], error: null };
    }
    const alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") {
      if (mudou.entre) { const f = mudou.entre; mudou.entre = null; f(); return this.exec(); }
      alvo.forEach((r) => Object.assign(r, this.dados));
    }
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t) } }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCronOrUser: async () => null }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "julio@lone", isAdmin: false }) }));

const contas = await import("@/app/api/traffic/ad-accounts/route");
const ocultas = await import("@/app/api/traffic/hidden-accounts/route");

const C = "11111111-1111-4111-8111-111111111111";
const adicionar = (corpo: Linha) => contas.POST(new NextRequest("http://x/api/traffic/ad-accounts", { method: "POST", body: JSON.stringify(corpo) }));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  falharLeituraDe = null;
  mudou.entre = null;
  db.clients = [{ id: C, name: "Loja Alfa", nome_fantasia: null, active: true, churned_at: null, meta_ad_account_id: "act_111", meta_ad_account_name: "CA Alfa" }];
  db.ad_accounts = [{ id: "a1", client_id: C, meta_account_id: "act_111" }];
  db.agency_settings = [];
});

describe("9.6 — adicionar conta a quem já tem outra na ficha", () => {
  it("o erro original: trocava a ficha calada — agora pergunta (409) e não grava nada", async () => {
    const r = await adicionar({ clientId: C, metaAccountId: "act_222", accountName: "CA Alfa 2" });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.codigo).toBe("ficha_tem_outra_conta");
    expect(j.error).toMatch(/A ficha de Loja Alfa usa a conta act_111/);
    expect(db.ad_accounts).toHaveLength(1);
    expect(db.clients[0].meta_ad_account_id).toBe("act_111");
  });
  it("'só adicionar ao controle de verba': entra na carteira e a ficha fica como está", async () => {
    const r = await adicionar({ clientId: C, metaAccountId: "act_222", accountName: "CA Alfa 2", trocarFicha: false });
    expect(r.status).toBe(200);
    expect((await r.json()).fichaAtualizada).toBe(false);
    expect(db.ad_accounts.map((a) => a.meta_account_id)).toEqual(["act_111", "act_222"]);
    expect(db.clients[0].meta_ad_account_id).toBe("act_111");
  });
  it("'trocar a principal': a ficha passa para a nova", async () => {
    const r = await adicionar({ clientId: C, metaAccountId: "act_222", accountName: "CA Alfa 2", trocarFicha: true });
    expect((await r.json()).fichaAtualizada).toBe(true);
    expect(db.clients[0].meta_ad_account_id).toBe("act_222");
  });
  it("ficha vazia: segue como antes, sem perguntar", async () => {
    db.clients[0].meta_ad_account_id = null;
    db.ad_accounts = [];
    const r = await adicionar({ clientId: C, metaAccountId: "act_222", accountName: "CA Alfa 2" });
    expect(r.status).toBe(200);
    expect(db.clients[0].meta_ad_account_id).toBe("act_222");
  });
});

describe("9.7 — ocultar uma conta não apaga as outras", () => {
  const post = (corpo: Linha) => ocultas.POST(new NextRequest("http://x/api/traffic/hidden-accounts", { method: "POST", body: JSON.stringify(corpo) }));
  const guardado = () => JSON.parse(String(db.agency_settings.find((r) => r.key === "hidden_ad_accounts")?.value ?? "[]"));

  it("o erro original: a lista inteira substituía — agora só esta conta entra", async () => {
    db.agency_settings = [{ key: "hidden_ad_accounts", value: '["act_1","act_2"]' }];
    const r = await post({ acao: "ocultar", id: "act_3" });
    expect(r.status).toBe(200);
    expect(guardado()).toEqual(["act_1", "act_2", "act_3"]);
  });
  it("tela antiga mandando a lista inteira é recusada", async () => {
    db.agency_settings = [{ key: "hidden_ad_accounts", value: '["act_1","act_2"]' }];
    expect((await post({ ids: ["act_3"] })).status).toBe(409);
    expect(guardado()).toEqual(["act_1", "act_2"]);
  });
  it("leitura que falha não grava nada e diz que falhou", async () => {
    db.agency_settings = [{ key: "hidden_ad_accounts", value: '["act_1"]' }];
    falharLeituraDe = "agency_settings";
    const r = await post({ acao: "ocultar", id: "act_3" });
    expect(r.status).toBe(500);
    falharLeituraDe = null;
    expect(guardado()).toEqual(["act_1"]);
    const g = await ocultas.GET(new NextRequest("http://x/api/traffic/hidden-accounts"));
    expect(g.status).toBe(200);
  });
  it("outra pessoa ocultou no meio: relê e mantém as duas", async () => {
    db.agency_settings = [{ key: "hidden_ad_accounts", value: '["act_1"]' }];
    mudou.entre = () => { db.agency_settings[0].value = '["act_1","act_9"]'; };
    const r = await post({ acao: "ocultar", id: "act_3" });
    expect(r.status).toBe(200);
    expect(guardado().sort()).toEqual(["act_1", "act_3", "act_9"]);
  });
});
