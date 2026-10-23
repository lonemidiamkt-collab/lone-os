// Excluir lead com reunião marcada (auditoria 21/10/2026, 4.4) — a DECISÃO da rota, não só a função.
// Antes: DELETE apagava o lead e as reuniões em cascata; o evento do Google ficava de pé e o lead seguia
// com o convite. Agora: reunião futura → 409 pedindo confirmação; confirmada → cancela no Google antes;
// Google não confirmou → o lead NÃO é excluído. Dados INVENTADOS.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/require-role", () => ({ requireRole: async () => ({ user: { email: "socio@exemplo.com" }, papel: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/crm/extras", () => ({ carregarExtras: async () => new Map(), EXTRAS_VAZIOS: {} }));
vi.mock("@/lib/crm/nota", () => ({ normalizarQualificacao: (q: unknown) => q, notaDoLead: () => ({}) }));
vi.mock("@/lib/prospeccao/config", () => ({ carregarConfig: async () => ({ segmentos: [] }) }));

const excluidos: string[] = [];
vi.mock("@/lib/supabase/queries", () => ({ deleteCrmLead: async (id: string) => { excluidos.push(id); } }));

type R = { id: string; inicio: string };
let futuras: R[] = [];
let cancelamento: { ok: true; canceladas: R[] } | { ok: false; erro: string; canceladas: R[] } = { ok: true, canceladas: [] };
const pedidosDeCancelar: { leadId: string; autor: string | null }[] = [];
vi.mock("@/lib/crm/reunioes-server", () => ({
  reunioesFuturasDoLead: async () => ({ ok: true, reunioes: futuras }),
  cancelarReunioesDoLead: async (leadId: string, autor: string | null) => { pedidosDeCancelar.push({ leadId, autor }); return cancelamento; },
}));

const { DELETE } = await import("@/app/api/crm/leads/route");
const excluir = (qs: string) => DELETE(new NextRequest(`https://painel.exemplo.com/api/crm/leads?${qs}`, { method: "DELETE" }));
const reuniao: R = { id: "r1", inicio: "2026-10-23T18:00:00.000Z" };

beforeEach(() => {
  excluidos.length = 0;
  pedidosDeCancelar.length = 0;
  futuras = [];
  cancelamento = { ok: true, canceladas: [] };
});

describe("DELETE /api/crm/leads", () => {
  it("sem reunião: exclui como antes", async () => {
    const r = await excluir("id=l1");
    expect(r.status).toBe(200);
    expect(excluidos).toEqual(["l1"]);
  });
  it("com reunião e sem confirmação: 409 com o texto da confirmação, nada é excluído nem cancelado", async () => {
    futuras = [reuniao];
    const r = await excluir("id=l1");
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Este lead tem reunião marcada para sexta, 23\/10 às 15h/);
    expect(excluidos).toEqual([]);
    expect(pedidosDeCancelar).toEqual([]);
  });
  it("confirmado e o Google cancelou: cancela antes e só então exclui", async () => {
    futuras = [reuniao];
    cancelamento = { ok: true, canceladas: [reuniao] };
    const r = await excluir("id=l1&cancelarReunioes=1&autor=Roberto");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, reunioesCanceladas: 1 });
    expect(pedidosDeCancelar).toEqual([{ leadId: "l1", autor: "Roberto" }]);
    expect(excluidos).toEqual(["l1"]);
  });
  it("confirmado mas o Google não cancelou: o lead fica e a tela diz por quê", async () => {
    futuras = [reuniao];
    cancelamento = { ok: false, erro: "O Google Agenda não confirmou o cancelamento da reunião de sexta, 23/10 às 15h (Google 500: x). Ela continua marcada.", canceladas: [] };
    const r = await excluir("id=l1&cancelarReunioes=1");
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/^O lead não foi excluído: O Google Agenda não confirmou/);
    expect(excluidos).toEqual([]);
  });
});
