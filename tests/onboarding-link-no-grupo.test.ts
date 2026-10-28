// @vitest-environment node
// tests/onboarding-link-no-grupo.test.ts — o link de cadastro no grupo de cadastro (28/10/2026).
//
// O Roberto descreve o fluxo como "o sistema prepara o pré-cadastro com o nome, manda o link no grupo de cadastro,
// eu mando ao cliente". O link só ia para a área de transferência e para o WhatsApp do lead. E se o link não
// nascesse, o rascunho ficava órfão: a nova tentativa dava "este lead já virou cliente" e link nenhum saía.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

const banco = bancoEmMemoria();
const grupo = vi.hoisted(() => ({ envios: [] as { jid: string; texto: string }[], resposta: { ok: true } as { ok: boolean; error?: string } }));

vi.mock("@supabase/supabase-js", () => ({ createClient: () => banco.supabaseAdmin }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "lonemidiamkt@gmail.com" }) }));
vi.mock("@/lib/api/require-role", () => ({ requireRole: async () => ({ ok: true }), GESTAO: ["admin", "manager"] }));
vi.mock("@/lib/crm/ligar-cadastro", () => ({ aoConcluirCadastro: async () => {}, ligarCadastroNovo: async () => {} }));
vi.mock("@/lib/portal/link-automatico", () => ({ dispararLinkDoPortal: () => {} }));
vi.mock("@/lib/cs/notify", () => ({
  csSendGroupText: async (jid: string, texto: string) => { grupo.envios.push({ jid, texto }); return grupo.resposta; },
}));

process.env.CS_CADASTRO_GROUP_JID = "120363000000000001@g.us";
process.env.NEXT_PUBLIC_PORTAL_DOMAIN = "https://painel.lonemidia.com";
const { POST } = await import("@/app/api/onboarding/route");
const post = (body: unknown) => POST(new NextRequest("http://x/api/onboarding", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  banco.limpar();
  grupo.envios.length = 0;
  grupo.resposta = { ok: true };
});

describe("link de cadastro no grupo de cadastro", () => {
  it("'Novo cliente' (fora do Comercial): o grupo recebe o pré-cadastro com o link", async () => {
    const r = await post({ action: "generate_link_with_draft", name: "Loja Nova" });
    expect(r.status).toBe(200);
    const { token } = await r.json();
    expect(grupo.envios).toEqual([{ jid: "120363000000000001@g.us", texto: expect.stringContaining(`https://painel.lonemidia.com/onboarding/${token}`) }]);
    expect(grupo.envios[0].texto).toMatch(/Pré-cadastro criado: Loja Nova/);
  });

  it("venda do Comercial: a passagem do comercial e o link numa mensagem só", async () => {
    banco.db.crm_leads = [{ id: "lead-1", empresa: "Padaria Pão Bom", contato_nome: "Ana", telefone: null, email: null, origem: "site", responsavel: "Roberto", observacoes: null }];
    banco.db.crm_lead_activities = [];
    const r = await post({ action: "generate_link_with_draft", name: "Padaria Pão Bom", leadId: "lead-1", serviceType: "lone_growth" });
    expect(r.status).toBe(200);
    const { token } = await r.json();
    expect(grupo.envios).toHaveLength(1);
    expect(grupo.envios[0].texto).toMatch(/Cliente novo fechado pelo comercial: Padaria Pão Bom/);
    expect(grupo.envios[0].texto).toContain(`/onboarding/${token}`);
  });

  it("o grupo não recebeu: a tela avisa e vira sino com o link (nunca some calado)", async () => {
    grupo.resposta = { ok: false, error: "Evolution fora do ar" };
    const r = await post({ action: "generate_link_with_draft", name: "Loja Nova" });
    const corpo = await r.json();
    expect(corpo.avisos).toEqual([expect.stringMatching(/link de cadastro não foi para o grupo de cadastro \(Evolution fora do ar\)/)]);
    expect(banco.db.notifications).toEqual([expect.objectContaining({ title: "O link de cadastro não chegou ao grupo de cadastro", body: expect.stringContaining(`/onboarding/${corpo.token}`) })]);
  });

  it("o link não nasce: o rascunho é desfeito (a nova tentativa funciona) e nada vai ao grupo", async () => {
    banco.falharEm("client_onboarding_submissions", "insert", { message: "deadlock" });
    const r = await post({ action: "generate_link_with_draft", name: "Loja Nova" });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Nada ficou gravado/);
    expect(banco.db.clients ?? []).toEqual([]);
    expect(grupo.envios).toEqual([]);
  });
});
