// @vitest-environment node
// tests/admin-pela-funcao.test.ts — 25/10/2026, onda 6 da auditoria de erro recuperável, item 8.8.
// Admin no servidor era SÓ uma lista fixa de e-mails: rebaixar o Julio dizia "salvo" e ele seguia admin;
// promover alguém a admin não abria nenhuma rota que confere isAdmin. Agora quem manda é a função na
// equipe (role = "admin"); a lista fixa fica como rede de segurança dos sócios e a tela mostra quem está nela.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let equipe: Record<string, { role: string; is_active: boolean; deleted_at: string | null; email: string }> = {};
let falha: { message: string } | null = null;
let consultas = 0;
let emailDoToken = "gabriel@lonemidia.com";

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: emailDoToken, factors: [] } }, error: null }) },
    from: () => ({
      select: () => ({
        ilike: (_c: string, padrao: string) => ({
          limit: async () => {
            consultas++;
            if (falha) return { data: null, error: falha };
            const alvo = padrao.replace(/\\(.)/g, "$1").toLowerCase();
            return { data: Object.values(equipe).filter((m) => m.email.toLowerCase() === alvo), error: null };
          },
        }),
        eq: () => ({ maybeSingle: async () => { consultas++; return { data: null, error: null }; } }),
      }),
    }),
  },
}));

const { getServerUser, _limparCacheEquipe } = await import("@/lib/supabase/auth-server");
const { papelDoUsuario } = await import("@/lib/api/require-role");
const { ehAdmin, ehAdminFixo } = await import("@/lib/auth/admins-fixos");
const { avisoAdminFixo } = await import("@/lib/equipe/gestao");

const jwt = (payload: Record<string, unknown>) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`;
const req = () => new NextRequest("http://x/api/qualquer", { headers: { authorization: `Bearer ${jwt({ aal: "aal1" })}` } });
const membro = (email: string, role: string) => { equipe[email] = { email, role, is_active: true, deleted_at: null }; };

beforeEach(() => {
  equipe = {};
  falha = null;
  consultas = 0;
  _limparCacheEquipe();
});

describe("isAdmin vem da função na equipe", () => {
  it("promovido a admin vira admin no servidor (antes não abria nenhuma rota de admin)", async () => {
    emailDoToken = "gabriel@lonemidia.com";
    membro("Gabriel@LoneMidia.com", "admin"); // linha antiga com maiúsculas: o elo é sem diferença de caixa
    const u = await getServerUser(req());
    expect(u).toMatchObject({ isAdmin: true, papel: "admin" });
    expect(await papelDoUsuario(u!)).toBe("admin");
  });

  it("social continua social — e o papel vem junto da sessão, sem consultar de novo", async () => {
    emailDoToken = "thiago@lonemidia.com";
    membro("thiago@lonemidia.com", "social");
    const u = await getServerUser(req());
    expect(u).toMatchObject({ isAdmin: false, papel: "social" });
    const antes = consultas;
    expect(await papelDoUsuario(u!)).toBe("social");
    expect(consultas).toBe(antes);
  });

  it("admin fixo segue admin mesmo com outra função (rede de segurança) — e a tela avisa", async () => {
    emailDoToken = "julio@lonemidia.com";
    membro("julio@lonemidia.com", "manager");
    expect((await getServerUser(req()))?.isAdmin).toBe(true);
    expect(ehAdminFixo("Julio@lonemidia.com")).toBe(true);
    expect(avisoAdminFixo("Julio", "julio@lonemidia.com", "manager")).toMatch(/continua administrador/);
    expect(avisoAdminFixo("Julio", "julio@lonemidia.com", "admin")).toBeNull();
    expect(avisoAdminFixo("Gabriel", "gabriel@lonemidia.com", "social")).toBeNull();
  });

  it("rebaixado deixa de ser admin assim que a Gestão da Equipe esquece o cache dele", async () => {
    emailDoToken = "gabriel@lonemidia.com";
    membro("gabriel@lonemidia.com", "admin");
    expect((await getServerUser(req()))?.isAdmin).toBe(true);
    equipe["gabriel@lonemidia.com"].role = "social";
    expect((await getServerUser(req()))?.isAdmin).toBe(true); // ainda no cache de 60 s
    _limparCacheEquipe("Gabriel@lonemidia.com");              // /api/team faz isto ao salvar
    expect((await getServerUser(req()))?.isAdmin).toBe(false);
  });

  it("equipe fora do ar: só a lista fixa é admin; o papel fica desconhecido (require-role consulta de novo)", async () => {
    emailDoToken = "gabriel@lonemidia.com";
    falha = { message: "connection reset" };
    const u = await getServerUser(req());
    expect(u).toMatchObject({ isAdmin: false });
    expect(u?.papel).toBeUndefined();
    expect(ehAdmin("lonemidiamkt@gmail.com", null)).toBe(true);
  });
});
