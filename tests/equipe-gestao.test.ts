// @vitest-environment node
// tests/equipe-gestao.test.ts — 25/10/2026, onda 6 da auditoria de erro recuperável, itens 8.1, 8.2, 8.6,
// 8.7 e 8.9 (Gestão da Equipe na Área CEO).
//  · 8.1 desativar valia para si mesmo e para o último admin, e o desativado sumia sem "Reativar";
//  · 8.2 remover apagava o login e recriar com o mesmo e-mail dava 409 — sem volta pela tela;
//  · 8.6 o PATCH ignorava o e-mail calado (a tela mostrava a troca como salva);
//  · 8.7 a senha curta era recusada depois de o resto já estar gravado;
//  · 8.9 perdeu o celular da verificação em duas etapas: só saía por SQL.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
let membros: Linha[] = [];
let logins: Array<{ id: string; email: string; banned_until?: string; factors?: Array<{ id: string; factor_type: string; status: string }> }> = [];
const authOps: Array<[string, unknown]> = [];
const auditoria: Linha[] = [];
let eu = "lonemidiamkt@gmail.com";
const esquecidos: string[] = [];

function q(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let patch: Linha | null = null;
  let insercao: Linha | null = null;
  const linhas = () => (tabela === "team_members" ? membros : []).filter((l) => filtros.every((f) => f(l)));
  const executar = () => {
    if (tabela === "audit_log" && insercao) { auditoria.push(insercao); return { data: null, error: null }; }
    if (insercao) { const nova = { id: `tm-${membros.length + 1}`, deleted_at: null, ...insercao }; membros.push(nova); return { data: [nova], error: null }; }
    // Cópias, como o banco devolve: a linha lida antes não muda sozinha depois de um update.
    if (patch) { const alvo = linhas(); alvo.forEach((l) => Object.assign(l, patch)); return { data: alvo.map((l) => ({ ...l })), error: null }; }
    return { data: linhas().map((l) => ({ ...l })), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return b; },
    neq: (c: string, v: unknown) => { filtros.push((l) => l[c] !== v); return b; },
    is: (c: string, v: unknown) => { filtros.push((l) => (l[c] ?? null) === v); return b; },
    not: (c: string) => { filtros.push((l) => l[c] != null); return b; },
    ilike: (c: string, v: string) => { const alvo = v.replace(/\\(.)/g, "$1").toLowerCase(); filtros.push((l) => String(l[c]).toLowerCase() === alvo); return b; },
    update: (p: Linha) => { patch = p; return b; },
    insert: (d: Linha) => { insercao = d; return b; },
    single: async () => { const r = executar(); return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }; },
    maybeSingle: async () => { const r = executar(); return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }; },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, erro),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => q(t),
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: logins }, error: null }),
        updateUserById: async (id: string, attrs: { ban_duration?: string }) => {
          authOps.push(["update", { id, ...attrs }]);
          const u = logins.find((x) => x.id === id);
          if (u) u.banned_until = attrs.ban_duration === "none" ? undefined : "2126-01-01T00:00:00Z";
          return { data: { user: u }, error: null };
        },
        createUser: async (a: { email: string }) => { const u = { id: `auth-${logins.length + 1}`, email: a.email }; logins.push(u); authOps.push(["create", a.email]); return { data: { user: u }, error: null }; },
        deleteUser: async (id: string) => { authOps.push(["delete", id]); return { data: null, error: null }; },
        mfa: {
          listFactors: async ({ userId }: { userId: string }) => ({ data: { factors: logins.find((u) => u.id === userId)?.factors ?? [] }, error: null }),
          deleteFactor: async ({ userId, id }: { userId: string; id: string }) => {
            authOps.push(["deleteFactor", id]);
            const u = logins.find((x) => x.id === userId);
            if (u) u.factors = (u.factors ?? []).filter((f) => f.id !== id);
            return { data: { id }, error: null };
          },
        },
      },
    },
  },
}));
vi.mock("@/lib/api/require-role", () => ({
  GESTAO: ["admin", "manager"],
  requireRole: async () => ({ user: { id: "auth-eu", email: eu, isAdmin: true, aal: "aal2", duasEtapas: true }, papel: "admin" }),
}));
vi.mock("@/lib/supabase/auth-server", () => ({ _limparCacheEquipe: (e: string) => esquecidos.push(e) }));

const rota = await import("@/app/api/team/route");
const { POST: zerar } = await import("@/app/api/team/duas-etapas/route");
const { podeMudarAcesso, validarSenhaNova, separarEquipe, contarAdminsAtivos } = await import("@/lib/equipe/gestao");

const chamar = (metodo: "GET" | "POST" | "PATCH" | "DELETE", corpo?: unknown) => {
  const r = new NextRequest("http://x/api/team", { method: metodo, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  return (rota as unknown as Record<string, (r: NextRequest) => Promise<Response>>)[metodo](r);
};

beforeEach(() => {
  eu = "lonemidiamkt@gmail.com";
  authOps.length = 0; auditoria.length = 0; esquecidos.length = 0;
  membros = [
    { id: "tm-roberto", name: "Roberto Lino", email: "lonemidiamkt@gmail.com", role: "admin", is_active: true, deleted_at: null, whatsapp_phone: null },
    { id: "tm-thiago", name: "Thiago", email: "thiago@lonemidia.com", role: "social", is_active: true, deleted_at: null, whatsapp_phone: "5522981530700" },
    { id: "tm-gabriel", name: "Gabriel", email: "gabriel@lonemidia.com", role: "admin", is_active: true, deleted_at: null, whatsapp_phone: null },
  ];
  logins = [
    { id: "auth-roberto", email: "lonemidiamkt@gmail.com" },
    { id: "auth-thiago", email: "thiago@lonemidia.com", factors: [{ id: "f1", factor_type: "totp", status: "verified" }] },
    { id: "auth-gabriel", email: "gabriel@lonemidia.com" },
  ];
});

describe("regras (puras)", () => {
  it("ninguém tranca a si mesmo nem deixa a equipe sem admin", () => {
    const thiago = { name: "Thiago", email: "thiago@lonemidia.com", role: "social", is_active: true, deleted_at: null };
    expect(podeMudarAcesso({ alvo: thiago, euEmail: "Thiago@lonemidia.com", adminsAtivos: 2, mudanca: "desativar" }))
      .toMatchObject({ ok: false, erro: expect.stringMatching(/desativar a si mesmo/) });
    const unico = { name: "Gabriel", email: "gabriel@lonemidia.com", role: "admin", is_active: true, deleted_at: null };
    expect(podeMudarAcesso({ alvo: unico, euEmail: "x@y.com", adminsAtivos: 1, mudanca: "rebaixar" }))
      .toMatchObject({ ok: false, erro: expect.stringMatching(/último administrador/) });
    expect(podeMudarAcesso({ alvo: unico, euEmail: "x@y.com", adminsAtivos: 2, mudanca: "remover" })).toEqual({ ok: true });
  });

  it("senha nova: vazia mantém; curta é recusada ANTES de gravar (8.7)", () => {
    expect(validarSenhaNova("  ")).toEqual({ ok: true, trocar: false });
    expect(validarSenhaNova("1234")).toMatchObject({ ok: false, erro: expect.stringMatching(/pelo menos 6 caracteres \(tem 4\)/) });
    expect(validarSenhaNova("abcdef")).toEqual({ ok: true, trocar: true });
  });

  it("a lista separa ativos, desativados e removidos; só ativos contam como admin", () => {
    const g = separarEquipe([{ is_active: true, deleted_at: null }, { is_active: false, deleted_at: null }, { is_active: false, deleted_at: "x" }]);
    expect([g.ativo.length, g.desativado.length, g.removido.length]).toEqual([1, 1, 1]);
    expect(contarAdminsAtivos([{ role: "admin", is_active: true }, { role: "admin", is_active: false }, { role: "admin", is_active: true, deleted_at: "x" }])).toBe(1);
  });
});

describe("GET /api/team: quem saiu continua na lista, com o caminho de volta", () => {
  it("traz desativados e removidos, quem tem login, duas etapas e admin fixo", async () => {
    membros[1].is_active = false;
    const j = await (await chamar("GET")).json();
    const thiago = j.team.find((m: Linha) => m.id === "tm-thiago");
    expect(thiago).toMatchObject({ situacao: "desativado", temLogin: true, duasEtapas: true, whatsappFinal: "0700" });
    expect(thiago.whatsapp_phone).toBeUndefined(); // o número inteiro não sai na lista
    expect(j.team.find((m: Linha) => m.id === "tm-roberto")).toMatchObject({ adminFixo: true });
  });
});

describe("PATCH /api/team (8.1, 8.6, 8.8)", () => {
  it("desativar a si mesmo é recusado e nada muda", async () => {
    const r = await chamar("PATCH", { id: "tm-roberto", is_active: false });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/desativar a si mesmo/);
    expect(membros[0].is_active).toBe(true);
  });

  it("desativar o último admin ativo é recusado", async () => {
    eu = "outro@lonemidia.com";
    membros[2].is_active = false; // só sobra o Roberto como admin
    const r = await chamar("PATCH", { id: "tm-roberto", is_active: false });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/último administrador/);
  });

  it("desativar outra pessoa grava, esquece o cache dela (vale na hora) e reativar desfaz", async () => {
    const r = await chamar("PATCH", { id: "tm-thiago", is_active: false });
    expect(r.status).toBe(200);
    expect((await r.json()).member).toMatchObject({ id: "tm-thiago", situacao: "desativado" });
    expect(esquecidos).toContain("thiago@lonemidia.com");
    const volta = await chamar("PATCH", { id: "tm-thiago", is_active: true });
    expect((await volta.json()).member).toMatchObject({ situacao: "ativo" });
  });

  it("e-mail no PATCH é recusado com frase, em vez de ignorado calado (8.6)", async () => {
    const r = await chamar("PATCH", { id: "tm-thiago", email: "novo@lonemidia.com", name: "Thiago" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/e-mail é o login/);
    expect(membros[1].name).toBe("Thiago");
  });

  it("rebaixar um admin fixo grava a função e AVISA que ele segue admin no servidor (8.8)", async () => {
    eu = "gabriel@lonemidia.com";
    const r = await chamar("PATCH", { id: "tm-roberto", role: "manager" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.member.role).toBe("manager");
    expect(j.aviso).toMatch(/continua administrador/);
  });

  it("removido não volta pelo Reativar (o login precisa voltar junto: Restaurar)", async () => {
    membros[1].deleted_at = "2026-10-20T00:00:00Z"; membros[1].is_active = false;
    const r = await chamar("PATCH", { id: "tm-thiago", is_active: true });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Restaurar/);
  });
});

describe("DELETE + Restaurar (8.2)", () => {
  it("remover BLOQUEIA o login (não apaga), zera o WhatsApp e devolve o número para o Desfazer", async () => {
    const r = await chamar("DELETE", { id: "tm-thiago" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ ok: true, loginBloqueado: true, whatsapp: "5522981530700" });
    expect(authOps.some(([t]) => t === "delete")).toBe(false);
    expect(authOps).toContainEqual(["update", { id: "auth-thiago", ban_duration: "876000h" }]);
    expect(membros[1]).toMatchObject({ is_active: false, whatsapp_phone: null });
    expect(membros[1].deleted_at).toBeTruthy();
  });

  it("Restaurar desbloqueia o login, limpa deleted_at e põe o WhatsApp de volta", async () => {
    await chamar("DELETE", { id: "tm-thiago" });
    const r = await chamar("POST", { acao: "restaurar", id: "tm-thiago", whatsapp_phone: "5522981530700" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.member).toMatchObject({ situacao: "ativo", whatsappFinal: "0700", loginBloqueado: false });
    expect(authOps).toContainEqual(["update", { id: "auth-thiago", ban_duration: "none" }]);
    expect(membros[1]).toMatchObject({ deleted_at: null, is_active: true, whatsapp_phone: "5522981530700" });
  });

  it("removido no modelo antigo (login apagado): Restaurar pede senha nova e recria o login", async () => {
    membros[1].deleted_at = "2026-09-14T00:00:00Z"; membros[1].is_active = false;
    logins = logins.filter((u) => u.email !== "thiago@lonemidia.com");
    const semSenha = await chamar("POST", { acao: "restaurar", id: "tm-thiago" });
    expect(semSenha.status).toBe(409);
    expect(await semSenha.json()).toMatchObject({ precisaSenha: true, error: expect.stringMatching(/senha nova/) });
    const comSenha = await chamar("POST", { acao: "restaurar", id: "tm-thiago", password: "nova-123" });
    expect(comSenha.status).toBe(200);
    expect(authOps).toContainEqual(["create", "thiago@lonemidia.com"]);
  });

  it("cadastrar com o e-mail de alguém removido diz QUEM é e oferece restaurar (não um beco sem saída)", async () => {
    membros[1].deleted_at = "2026-09-14T00:00:00Z"; membros[1].is_active = false;
    const r = await chamar("POST", { name: "Thiago", email: "THIAGO@lonemidia.com", role: "social", password: "123456" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ membro: { id: "tm-thiago", situacao: "removido" }, error: expect.stringMatching(/Restaure/) });
    expect(authOps.some(([t]) => t === "create")).toBe(false);
  });

  it("remover a si mesmo continua recusado", async () => {
    const r = await chamar("DELETE", { id: "tm-roberto" });
    expect(r.status).toBe(400);
    expect(authOps).toHaveLength(0);
  });
});

describe("zerar a verificação em duas etapas (8.9)", () => {
  const zerarDe = (id: string) => zerar(new NextRequest("http://x/api/team/duas-etapas", { method: "POST", body: JSON.stringify({ id }) }));

  it("admin apaga o autenticador de quem perdeu o celular e fica registrado quem fez", async () => {
    const r = await zerarDe("tm-thiago");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, removidos: 1 });
    expect(authOps).toContainEqual(["deleteFactor", "f1"]);
    expect(auditoria[0]).toMatchObject({ table_name: "auth.mfa_factors", operation: "DELETE", record_id: "tm-thiago", user_name: "lonemidiamkt@gmail.com" });
  });

  it("a própria conta não passa por aqui (lá é Configurações, com o código)", async () => {
    const r = await zerarDe("tm-roberto");
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Configurações/);
  });

  it("sem autenticador: diz que não tinha, sem registrar nada", async () => {
    const r = await zerarDe("tm-gabriel");
    expect(await r.json()).toMatchObject({ ok: true, removidos: 0, aviso: expect.stringMatching(/não tinha/) });
    expect(auditoria).toHaveLength(0);
  });
});
