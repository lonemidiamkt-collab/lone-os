import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Fase 0A — verificação em duas etapas: conta com autenticador só é "logada" em aal2.

let usuario: { id: string; email: string; factors?: { factor_type: string; status: string }[] } | null = null;
const equipe: Record<string, { is_active: boolean; deleted_at: string | null }> = {};
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    auth: { getUser: async () => (usuario ? { data: { user: usuario }, error: null } : { data: { user: null }, error: { message: "invalid" } }) },
    from: () => ({ select: () => ({ eq: (_c: string, email: string) => ({ maybeSingle: async () => ({ data: equipe[email] ?? null, error: null }) }) }) }),
  },
}));

// client do navegador, para estadoDuasEtapas
const mfa = { fatores: [] as { id: string; factor_type: string; status: string }[], atual: "aal1", proximo: "aal1" };
vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { mfa: {
    listFactors: async () => ({ data: { all: mfa.fatores, totp: mfa.fatores.filter((f) => f.factor_type === "totp") }, error: null }),
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: mfa.atual, nextLevel: mfa.proximo }, error: null }),
  } } },
}));

const { getServerUser, _limparCacheEquipe } = await import("@/lib/supabase/auth-server");
const { estadoDuasEtapas, traduz } = await import("@/lib/auth/duas-etapas");

const jwt = (payload: Record<string, unknown>) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`;
const req = (token: string) => new NextRequest("http://x/api/qualquer", { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => {
  usuario = { id: "u1", email: "lonemidiamkt@gmail.com", factors: [] };
  for (const k of Object.keys(equipe)) delete equipe[k];
  _limparCacheEquipe();
  mfa.fatores = []; mfa.atual = "aal1"; mfa.proximo = "aal1";
});

describe("servidor: quem tem autenticador só entra em aal2", () => {
  it("sem autenticador: senha basta (aal1)", async () => {
    const u = await getServerUser(req(jwt({ email: "lonemidiamkt@gmail.com", aal: "aal1" })));
    expect(u).toMatchObject({ email: "lonemidiamkt@gmail.com", isAdmin: true, aal: "aal1", duasEtapas: false });
  });

  it("com autenticador e sessão aal1: porta fechada — é uma senha sozinha", async () => {
    usuario!.factors = [{ factor_type: "totp", status: "verified" }];
    expect(await getServerUser(req(jwt({ email: "lonemidiamkt@gmail.com", aal: "aal1" })))).toBeNull();
  });

  it("com autenticador e sessão aal2: entra", async () => {
    usuario!.factors = [{ factor_type: "totp", status: "verified" }];
    const u = await getServerUser(req(jwt({ email: "lonemidiamkt@gmail.com", aal: "aal2" })));
    expect(u).toMatchObject({ aal: "aal2", duasEtapas: true });
  });

  it("desativado ou removido da equipe: sessão válida no Auth, mas porta fechada", async () => {
    equipe["lonemidiamkt@gmail.com"] = { is_active: false, deleted_at: null };
    expect(await getServerUser(req(jwt({ email: "lonemidiamkt@gmail.com", aal: "aal1" })))).toBeNull();
    _limparCacheEquipe();
    equipe["lonemidiamkt@gmail.com"] = { is_active: true, deleted_at: "2026-09-14T00:00:00Z" };
    expect(await getServerUser(req(jwt({ email: "lonemidiamkt@gmail.com", aal: "aal1" })))).toBeNull();
    _limparCacheEquipe();
    equipe["lonemidiamkt@gmail.com"] = { is_active: true, deleted_at: null };
    expect(await getServerUser(req(jwt({ email: "lonemidiamkt@gmail.com", aal: "aal1" })))).not.toBeNull();
  });

  it("fator abandonado no meio da inscrição (unverified) não conta", async () => {
    usuario!.factors = [{ factor_type: "totp", status: "unverified" }];
    expect(await getServerUser(req(jwt({ email: "lonemidiamkt@gmail.com", aal: "aal1" })))).not.toBeNull();
  });
});

describe("navegador: quando pedir o código", () => {
  it("inscrito + sessão aal1 → precisa do código; aal2 → não; sem fator → não", async () => {
    mfa.fatores = [{ id: "f1", factor_type: "totp", status: "verified" }]; mfa.atual = "aal1"; mfa.proximo = "aal2";
    expect(await estadoDuasEtapas()).toMatchObject({ inscrito: true, fatorId: "f1", precisaCodigo: true });
    mfa.atual = "aal2";
    expect((await estadoDuasEtapas()).precisaCodigo).toBe(false);
    mfa.fatores = []; mfa.atual = "aal1"; mfa.proximo = "aal1";
    expect(await estadoDuasEtapas()).toMatchObject({ inscrito: false, precisaCodigo: false });
  });

  it("erros do GoTrue viram frase que a pessoa entende", () => {
    expect(traduz("Invalid TOTP code entered")).toMatch(/inválido ou vencido/);
    expect(traduz("MFA enrollment is disabled for TOTP")).toMatch(/desligada no servidor/);
    expect(traduz("AAL2 required to unenroll")).toMatch(/Confirme o código/);
  });
});
