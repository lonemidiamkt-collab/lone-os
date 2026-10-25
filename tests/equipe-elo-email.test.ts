// @vitest-environment node
// tests/equipe-elo-email.test.ts — 25/10/2026, onda 6 da auditoria de erro recuperável, item 8.12.
// team_members NÃO tem a coluna auth_id, mas três lugares procuravam por ela: o id da pessoa no painel
// voltava sempre nulo, o social atribuído nunca revelava a senha do Instagram (403) e o erro do banco
// era engolido. O elo é o e-mail do login, sem diferença de maiúsculas.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";

process.env.VAULT_KEY = randomBytes(32).toString("base64");

type Op = { tabela: string; tipo: string; filtros: [string, string, unknown][] };
const ops: Op[] = [];
let equipe: Array<Record<string, unknown>> = [];
let falhaEquipe: { message: string } | null = null;
let cliente: Record<string, unknown> | null = null;

function consulta(tabela: string) {
  const op: Op = { tabela, tipo: "select", filtros: [] };
  const resultado = () => {
    ops.push(op);
    if (tabela === "team_members") {
      if (falhaEquipe) return { data: null, error: falhaEquipe };
      // ilike sem curinga = igual, sem diferença de caixa (como o Postgres faz com o padrão escapado).
      const il = op.filtros.find(([t]) => t === "ilike");
      const linhas = il ? equipe.filter((m) => String(m.email).toLowerCase() === String(il[2]).replace(/\\(.)/g, "$1").toLowerCase()) : equipe;
      return { data: linhas, error: null };
    }
    if (tabela === "clients") {
      if (op.filtros.some(([, c]) => c === "id")) return { data: cliente, error: null };
    }
    return { data: null, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => { op.filtros.push(["eq", c, v]); return q; },
    ilike: (c: string, v: unknown) => { op.filtros.push(["ilike", c, v]); return q; },
    in: (c: string, v: unknown) => { op.filtros.push(["in", c, v]); return q; },
    limit: () => q,
    order: () => q,
    insert: () => { op.tipo = "insert"; return q; },
    maybeSingle: async () => {
      const r = resultado();
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, erro),
  };
  return q;
}

const sessao = vi.hoisted(() => ({ user: null as null | { id: string; email: string; isAdmin: boolean } }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));
vi.mock("@/lib/supabase/auth-server", () => ({
  getServerUser: async () => (sessao.user ? { ...sessao.user, aal: "aal1", duasEtapas: false } : null),
}));

const { GET: quemSouEu } = await import("@/app/api/auth/team-member/route");
const { GET: revelar } = await import("@/app/api/client-vault/route");
const { encryptVault } = await import("@/lib/crypto/vault");
const { escolherPorEmail, padraoExatoIlike, nomesPorEmail, normalizarEmail } = await import("@/lib/equipe/email");

const CLIENTE = "11111111-2222-3333-4444-555555555555";
const THIAGO = { id: "tm-thiago", name: "Thiago", email: "Thiago@LoneMidia.com", role: "social", is_active: true, deleted_at: null };

beforeEach(() => {
  ops.length = 0;
  falhaEquipe = null;
  equipe = [THIAGO, { id: "tm-x", name: "Joao Silva", email: "joaoXsilva@lonemidia.com", role: "designer" }];
  sessao.user = { id: "auth-thiago", email: "thiago@lonemidia.com", isAdmin: false };
  cliente = { assigned_social: "Thiago", instagram_password: encryptVault("senha-do-insta") };
});

describe("e-mail é o elo (puro)", () => {
  it("compara sem diferença de maiúsculas e sem curinga do LIKE", () => {
    expect(normalizarEmail("  Julio@LoneMidia.com ")).toBe("julio@lonemidia.com");
    expect(padraoExatoIlike("joao_silva%x@lonemidia.com")).toBe("joao\\_silva\\%x@lonemidia.com");
    // `_` sem escapar casaria com qualquer letra: joao_silva acharia joaoXsilva.
    expect(escolherPorEmail(equipe, "joao_silva@lonemidia.com")).toBeNull();
    expect(escolherPorEmail(equipe, "THIAGO@lonemidia.com")).toMatchObject({ id: "tm-thiago" });
    expect(nomesPorEmail(equipe).get("thiago@lonemidia.com")).toBe("Thiago");
  });
});

describe("/api/auth/team-member", () => {
  it("devolve o id da equipe de quem está logado, pelo e-mail (antes vinha sempre nulo)", async () => {
    const r = await quemSouEu(new NextRequest("http://x/api/auth/team-member?auth_id=qualquer"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: "tm-thiago", nome: "Thiago", papel: "social" });
    const busca = ops.find((o) => o.tabela === "team_members")!;
    expect(busca.filtros.some(([, c]) => c === "auth_id")).toBe(false);
    expect(busca.filtros).toContainEqual(["ilike", "email", "thiago@lonemidia.com"]);
  });

  it("sem sessão: 401; banco fora: 503 (não 'não está na equipe')", async () => {
    sessao.user = null;
    expect((await quemSouEu(new NextRequest("http://x/api/auth/team-member"))).status).toBe(401);
    sessao.user = { id: "a", email: "thiago@lonemidia.com", isAdmin: false };
    falhaEquipe = { message: "connection reset" };
    const r = await quemSouEu(new NextRequest("http://x/api/auth/team-member"));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Não consegui consultar a equipe/);
  });
});

describe("cofre: o social atribuído revela a senha do Instagram", () => {
  const pedir = () => revelar(new NextRequest(`http://x/api/client-vault?clientId=${CLIENTE}&table=clients&field=instagram_password`));

  it("o bug: com o elo por auth_id ele caía no 403. Agora revela", async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ value: "senha-do-insta" });
  });

  it("fora da carteira continua 403; banco fora vira 503 com frase", async () => {
    cliente = { ...cliente, assigned_social: "Carlos Augusto" };
    expect((await pedir()).status).toBe(403);
    falhaEquipe = { message: "timeout" };
    const r = await pedir();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/conferir sua permissão/);
  });
});

describe("ninguém mais procura team_members por auth_id", () => {
  it("varre app/, lib/ e components/", () => {
    const raiz = process.cwd();
    const achados: string[] = [];
    const andar = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { andar(p); continue; }
        if (!/\.(ts|tsx)$/.test(n)) continue;
        const txt = readFileSync(p, "utf8");
        if (/\.(eq|in|select)\(\s*["'`][^"'`]*auth_id/.test(txt)) achados.push(p.replace(raiz + "/", ""));
      }
    };
    for (const d of ["app", "lib", "components"]) andar(join(raiz, d));
    expect(achados).toEqual([]);
  });
});
