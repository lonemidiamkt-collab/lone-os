// @vitest-environment node
// tests/onboarding-rota-cadastro.test.ts — a rota do cadastro (app/api/onboarding), 24/10/2026.
//   1.6  envio com login sem senha é recusado com a frase do que falta;
//   1.9  erro de banco ao abrir o link é 503 ("não consegui abrir"), não 404 ("link inválido");
//   1.10 erro de gravação não devolve o texto cru do Postgres;
//   3.9  ativar manda o e-mail de boas-vindas pela função interna (sem fetch na própria API, que
//        levava 401 calado) e a resposta diz se foi;
//   A/B  a senha do cadastro chega ao cofre do social decifrada (uma cifra só).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

process.env.VAULT_KEY = randomBytes(32).toString("base64");
const banco = bancoEmMemoria();
const enviados: { to: string; templateName: string }[] = [];
let respostaEmail: { success: boolean; error?: string } = { success: true };

vi.mock("@supabase/supabase-js", () => ({ createClient: () => banco.supabaseAdmin }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "lonemidiamkt@gmail.com" }) }));
vi.mock("@/lib/api/require-role", () => ({ requireRole: async () => ({ ok: true }), GESTAO: ["admin", "manager"] }));
vi.mock("@/lib/crm/ligar-cadastro", () => ({ aoConcluirCadastro: async () => {}, ligarCadastroNovo: async () => {} }));
vi.mock("@/lib/onboarding/sincronia-server", () => ({ sincronizarRascunho: async () => ({ clientId: null, campos: [] }) }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async () => ({ ok: true }) }));
vi.mock("@/lib/portal/link-automatico", () => ({ dispararLinkDoPortal: () => {} }));
vi.mock("@/lib/email/emailService", () => ({
  sendEmail: async (p: { to: string; templateName: string }) => { enviados.push(p); return respostaEmail; },
  logEmail: async () => {},
}));

const { GET, POST } = await import("@/app/api/onboarding/route");
const { encryptVault, decryptVault } = await import("@/lib/crypto/vault");
const enc = (s: string) => encryptVault(s)!;

const post = (body: unknown) => POST(new NextRequest("http://x/api/onboarding", { method: "POST", body: JSON.stringify(body) }));
const get = (token: string) => GET(new NextRequest(`http://x/api/onboarding?token=${token}`));

const ENVIO_OK = {
  action: "submit", token: "ob-tok", acessosRestaurados: true,
  nomeFantasia: "Padaria Pão Bom", cnpj: "11.222.333/0001-81", contactName: "Ana", contactEmail: "ana@padaria.com",
  contactWhatsapp: "(22) 99999-0000", enderecoCep: "28900-000", enderecoRua: "Rua A", enderecoNumero: "10",
  enderecoBairro: "Centro", enderecoCidade: "Cabo Frio", docLogo: "https://x/logo.png", docContratoSocial: "legal://c/1.pdf",
  metaStatus: "waiting_client", googleStatus: "waiting_client",
};

const fetchOriginal = globalThis.fetch;
beforeEach(() => {
  banco.limpar();
  enviados.length = 0;
  respostaEmail = { success: true };
  banco.db.client_onboarding_submissions = [{ id: "s1", client_id: "c1", token: "ob-tok", status: "pending", created_at: "2026-10-20T10:00:00Z" }];
  // Nenhum caminho pode chamar a própria API por HTTP (era o 401 calado do e-mail).
  globalThis.fetch = vi.fn(async () => { throw new Error("fetch não deveria ser chamado"); }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

describe("1.9 abrir o link", () => {
  it("erro do banco → 503 com frase de tentar de novo (antes: 404 'Link inválido')", async () => {
    banco.falharEm("client_onboarding_submissions", "select", { message: "connection refused" });
    const r = await get("ob-tok");
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Não consegui abrir/);
  });
  it("token que não existe → 404", async () => {
    expect((await get("ob-nao-existe")).status).toBe(404);
  });
});

describe("1.6 envio com o par pela metade", () => {
  it("login do Instagram sem senha (nem guardada) → 400 dizendo o que falta", async () => {
    banco.db.clients = [{ id: "c1", name: "Padaria", draft_status: "pending_invite" }];
    const r = await post({ ...ENVIO_OK, instagramLogin: "padaria_ig", instagramStatus: "fill_now" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Instagram: falta a senha/);
    expect(banco.db.client_onboarding_submissions[0].status).toBe("pending");
  });
});

describe("1.10 erro de gravação no envio", () => {
  it("não devolve o texto do Postgres", async () => {
    banco.db.clients = [{ id: "c1", name: "Padaria", draft_status: "pending_invite" }];
    banco.falharEm("client_onboarding_submissions", "update", { message: 'null value in column "x" violates not-null constraint' });
    const r = await post({ ...ENVIO_OK, instagramStatus: "waiting_client" });
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).not.toMatch(/violates|constraint|null value/);
    expect(error).toMatch(/Seus dados continuam aqui/);
  });
});

describe("A. envio de cliente JÁ ativo leva a senha ao cofre do social", () => {
  it("cliente ativo: client_access recebe a senha decifrável como a digitada", async () => {
    banco.db.clients = [{ id: "c1", name: "Padaria", draft_status: null }];
    const r = await post({ ...ENVIO_OK, instagramLogin: "padaria_ig", instagramPassword: "ig-123", instagramStatus: "fill_now" });
    expect(r.status).toBe(200);
    const acesso = banco.db.client_access?.[0];
    expect(acesso).toMatchObject({ client_id: "c1", instagram_login: "padaria_ig" });
    expect(decryptVault(acesso.instagram_password as string)).toBe("ig-123");
  });
  it("cadastro novo (rascunho): espera a ativação para espelhar", async () => {
    banco.db.clients = [{ id: "c1", name: "Padaria", draft_status: "pending_invite" }];
    await post({ ...ENVIO_OK, instagramLogin: "padaria_ig", instagramPassword: "ig-123", instagramStatus: "fill_now" });
    expect(banco.db.client_access ?? []).toHaveLength(0);
  });
});

describe("provision (tela Cadastros Pendentes): cofre + e-mail", () => {
  beforeEach(() => {
    banco.db.clients = [{
      id: "c1", name: "Padaria", nome_fantasia: "Padaria Pão Bom", draft_status: null, email_corporativo: "ana@padaria.com",
      service_type: "lone_growth", facebook_login: "ana@padaria.com", facebook_password: enc("fb-456"),
    }];
    banco.db.client_onboarding_submissions[0] = {
      ...banco.db.client_onboarding_submissions[0], status: "submitted",
      instagram_login: "padaria_ig", instagram_password: enc("ig-123"),
    };
  });

  it("A: a senha chega ao cofre do social, decifrável como a original", async () => {
    const r = await post({ action: "provision", clientId: "c1" });
    expect(r.status).toBe(200);
    const acesso = banco.db.client_access[0];
    expect(decryptVault(acesso.facebook_password as string)).toBe("fb-456");
    expect(decryptVault(acesso.instagram_password as string)).toBe("ig-123");
    expect((await r.json()).cofre).toEqual({ ok: true, erro: null });
  });

  it("3.9: e-mail vai pela função interna (nenhum fetch) e a resposta diz que foi", async () => {
    const r = await post({ action: "provision", clientId: "c1" });
    const body = await r.json();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ to: "ana@padaria.com", templateName: "welcome" });
    expect(body.email).toMatchObject({ enviado: true });
    expect(banco.db.clients[0].welcome_email_sent).toBe(true);
  });

  it("3.9: e-mail que falha volta como falha (antes a tela dizia 'aprovado' calada)", async () => {
    respostaEmail = { success: false, error: "RESEND_API_KEY nao configurada" };
    const body = await (await post({ action: "provision", clientId: "c1" })).json();
    expect(body.success).toBe(true); // a ativação continua valendo
    expect(body.email).toMatchObject({ enviado: false, codigo: "falha" });
    expect(body.email.motivo).toMatch(/RESEND_API_KEY/);
  });

  it("3.9: cliente sem e-mail → 'sem e-mail na ficha', sem tentar mandar", async () => {
    banco.db.clients[0].email_corporativo = null;
    const body = await (await post({ action: "provision", clientId: "c1" })).json();
    expect(enviados).toHaveLength(0);
    expect(body.email).toMatchObject({ enviado: false, codigo: "sem_email" });
  });
});

describe("B. approve espelha decifrado", () => {
  it("o social abre a senha, não 'v1:…' cifrado duas vezes", async () => {
    banco.db.clients = [{ id: "c1", name: "Padaria", draft_status: "awaiting_approval", email: "ana@padaria.com" }];
    banco.db.client_onboarding_submissions[0] = {
      ...banco.db.client_onboarding_submissions[0], instagram_login: "padaria_ig", instagram_password: enc("ig-123"),
    };
    const r = await post({ action: "approve", clientId: "c1" });
    expect(r.status).toBe(200);
    const senha = decryptVault(banco.db.client_access[0].instagram_password as string);
    expect(senha).toBe("ig-123");
    expect(senha).not.toMatch(/^v1:/);
  });
});
