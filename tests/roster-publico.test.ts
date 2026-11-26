// @vitest-environment node
// tests/roster-publico.test.ts — Fase 0, leva 0B (25/11/2026).
// /api/team/roster é pública (a tela de login precisa da lista antes de alguém entrar) e devolvia o
// e-mail de cada pessoa da equipe e o final do WhatsApp para qualquer um na internet. Agora, sem
// sessão, sai só o que a tela usa: id, nome, iniciais e função. Com sessão, a lista completa.
// Nomes, e-mails e telefones abaixo são inventados.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

const banco = bancoEmMemoria();
const sessao = vi.hoisted(() => ({ logado: false }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/supabase/auth-server", () => ({
  getServerUser: async () => (sessao.logado ? { id: "u1", email: "ana@exemplo.test", isAdmin: false } : null),
}));

const { GET } = await import("@/app/api/team/roster/route");

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BETO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const pedir = (headers?: Record<string, string>) =>
  (GET as (req: NextRequest) => Promise<Response>)(new NextRequest("http://x/api/team/roster", { headers }));

beforeEach(() => {
  banco.limpar();
  sessao.logado = false;
  banco.db.team_members = [
    { id: ANA, name: "Ana Teste", email: "ana@exemplo.test", role: "social", initials: "AT", whatsapp_phone: "5511987659876", is_active: true, deleted_at: null },
    { id: BETO, name: "Beto Teste", email: "Beto.Teste@exemplo.test", role: "designer", initials: null, whatsapp_phone: null, is_active: true, deleted_at: null },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Saiu Teste", email: "saiu@exemplo.test", role: "social", initials: "ST", whatsapp_phone: null, is_active: false, deleted_at: null },
  ];
});

describe("roster sem login", () => {
  it("não devolve e-mail nem dígito de telefone — só id, nome, iniciais, função e cor", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto).not.toContain("@");
    expect(texto).not.toMatch(/9876|5511/);
    const { profiles } = JSON.parse(texto) as { profiles: Record<string, unknown>[] };
    expect(profiles).toHaveLength(2); // inativo continua fora
    for (const p of profiles) expect(Object.keys(p).sort()).toEqual(["color", "id", "initials", "name", "role"]);
    // id = id da equipe (uuid), não mais derivado do e-mail ("ana") — que entregava o começo do e-mail.
    expect(profiles.map((p) => p.id).sort()).toEqual([ANA, BETO]);
    expect(profiles.find((p) => p.id === BETO)).toMatchObject({ name: "Beto Teste", role: "designer", initials: "BE" });
  });

  it("consulta que falha devolve lista vazia (a tela cai na reserva), sem 500", async () => {
    banco.falharEm("team_members", "*", { message: "fora do ar" });
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profiles: [], erro: true });
  });
});

describe("roster com login", () => {
  it("devolve e-mail (minúsculo), id da equipe e o final do WhatsApp", async () => {
    sessao.logado = true;
    const { profiles } = (await (await pedir({ Authorization: "Bearer t" })).json()) as { profiles: Record<string, unknown>[] };
    expect(profiles.find((p) => p.id === ANA)).toMatchObject({ email: "ana@exemplo.test", teamMemberId: ANA, whatsappFinal: "9876" });
    expect(profiles.find((p) => p.id === BETO)).toMatchObject({ email: "beto.teste@exemplo.test", teamMemberId: BETO, whatsappFinal: null });
  });
});
