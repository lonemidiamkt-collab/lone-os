// tests/portal-desfazer-ajuste.test.tsx — 25/10/2026, onda 6 da auditoria de erro recuperável, item 12.5.
// "Pedir alteração" no portal age na hora: a arte sai de Agendado/Com o cliente, perde a aprovação e as
// marcas e volta ao designer. Clique no card errado (ou um "tá ótimo" escrito no campo) desagendava o
// post sem volta. Agora há "Desfazer" por 10 minutos, enquanto ninguém do time mexeu na arte.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const db = vi.hoisted(() => ({
  card: {} as Record<string, unknown>,
  pedidos: [] as Array<Record<string, unknown>>,
  opsLog: [] as Array<Record<string, unknown>>,
  comentarios: [] as Array<Record<string, unknown>>,
  avisos: [] as Array<Record<string, unknown>>,
}));

function consulta(tabela: string) {
  const filtros: Array<[string, string, unknown]> = [];
  let patch: Linha | null = null;
  let apagar = false;
  const casa = (l: Linha) => filtros.every(([op, c, v]) =>
    op === "eq" ? l[c] === v : op === "is" ? (l[c] ?? null) === v : op === "in" ? (v as unknown[]).includes(l[c]) : true);
  const exec = (): { data: unknown; error: null } => {
    if (tabela === "clients") {
      return { data: { id: "cli-1", name: "Padaria do Zé", public_report_enabled: true, active: true }, error: null };
    }
    if (tabela === "content_cards") {
      if (patch) { if (casa(db.card)) { Object.assign(db.card, patch); return { data: [{ id: db.card.id }], error: null }; } return { data: [], error: null }; }
      return { data: casa(db.card) ? { ...db.card } : null, error: null };
    }
    if (tabela === "ops_log") return { data: db.opsLog.filter(casa).map((l) => ({ ...l })), error: null };
    if (tabela === "design_requests") {
      const alvo = db.pedidos.filter(casa);
      if (apagar) db.pedidos = db.pedidos.filter((p) => !alvo.includes(p));
      else if (patch) alvo.forEach((p) => Object.assign(p, patch));
      return { data: alvo, error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { filtros.push(["eq", c, v]); return b; },
    is: (c: string, v: unknown) => { filtros.push(["is", c, v]); return b; },
    in: (c: string, v: unknown) => { filtros.push(["in", c, v]); return b; },
    update: (p: Linha) => { patch = p; return b; },
    delete: () => { apagar = true; return b; },
    insert: (d: Linha) => {
      if (tabela === "ops_log") db.opsLog.push({ ...d, created_at: (d as { created_at?: string }).created_at ?? new Date().toISOString() });
      if (tabela === "card_comments") db.comentarios.push(d);
      if (tabela === "notifications") db.avisos.push(d);
      return Promise.resolve({ data: null, error: null });
    },
    single: async () => exec(),
    maybeSingle: async () => exec(),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(exec()).then(ok, erro),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));
vi.mock("@/lib/conteudo/producao-server", () => ({
  lerCardEPedido: async () => {
    const pedido = db.pedidos.find((p) => p.content_card_id === db.card.id) ?? null;
    return { card: db.card, pedido };
  },
}));
// O ajuste de verdade (lib/cs/card.ts → transição pedir_alteracao): o que ele faz com o card e o pedido.
vi.mock("@/lib/cs/card", () => ({
  aplicarAjusteNoCard: async ({ correcao }: { correcao: string }) => {
    const agora = new Date().toISOString();
    Object.assign(db.card, {
      briefing: `${db.card.briefing}\n\n---\n✏️ AJUSTE DO CLIENTE (pelo portal do cliente): ${correcao}`,
      status: "in_production", status_changed_at: agora, column_entered_at: { ...(db.card.column_entered_at as object), in_production: agora },
      alteracao_pendente_em: agora, alteracao_motivo: correcao,
      designer_delivered_at: null, designer_delivered_by: null, client_approved_at: null, scheduled_at: null,
    });
    const p = db.pedidos.find((x) => x.content_card_id === db.card.id);
    if (p && p.status === "done") p.status = "in_progress";
    return true;
  },
}));

const { POST } = await import("@/app/api/portal/[token]/approve/route");
const D = await import("@/lib/portal/desfazer-ajuste");

const CARD = "cccccccc-0000-4000-8000-000000000001";
const post = (corpo: unknown) => POST(new NextRequest("http://x/api/portal/5b0c6a2e-8f1d-4c3a-9e7b-2d4f6a8c0e1f/approve", { method: "POST", body: JSON.stringify(corpo) }), { params: Promise.resolve({ token: "5b0c6a2e-8f1d-4c3a-9e7b-2d4f6a8c0e1f" }) });

const AGENDADO = {
  id: CARD, client_id: "cli-1", title: "Promo de sexta", archived_at: null,
  status: "scheduled", status_changed_at: "2026-10-24T10:00:00Z", column_entered_at: { scheduled: "2026-10-24T10:00:00Z" },
  briefing: "Post da promoção", designer_delivered_at: "2026-10-23T10:00:00Z", designer_delivered_by: "Rodrigo",
  social_confirmed_at: "2026-10-23T12:00:00Z", social_confirmed_by: "Thiago", client_approved_at: "2026-10-24T09:00:00Z",
  scheduled_at: "2026-10-31T12:00:00Z", publish_verified_at: null, publish_verified_by: null,
  blocked_reason: null, blocked_by: null, blocked_at: null, alteracao_pendente_em: null, alteracao_motivo: null, design_request_id: "dr-1",
};

beforeEach(() => {
  db.card = JSON.parse(JSON.stringify(AGENDADO));
  db.pedidos = [{ id: "dr-1", status: "done", content_card_id: CARD }];
  db.opsLog = []; db.comentarios = []; db.avisos = [];
});

describe("regra (pura)", () => {
  const depois = { status: "in_production", alteracao_pendente_em: "2026-10-25T12:00:00Z", briefing: "b+ajuste", pedido: { id: "dr-1", status: "in_progress" }, pedidoCriado: false };
  const cardAgora = { status: "in_production", alteracao_pendente_em: "2026-10-25T12:00:00Z", briefing: "b+ajuste", designer_delivered_at: null };
  const agora = new Date("2026-10-25T12:05:00Z").getTime();

  it("dentro dos 10 minutos e ninguém mexeu: pode", () => {
    expect(D.podeDesfazerAjuste({ em: "2026-10-25T12:00:00Z", depois, cardAgora, pedidoAgora: depois.pedido, agora })).toEqual({ ok: true });
  });

  it("passou do prazo, o designer entregou, a arte andou ou o pedido novo começou: não pode, e diz por quê", () => {
    expect(D.podeDesfazerAjuste({ em: "2026-10-25T11:40:00Z", depois, cardAgora, pedidoAgora: null, agora })).toMatchObject({ motivo: "prazo" });
    expect(D.podeDesfazerAjuste({ em: "2026-10-25T12:00:00Z", depois, cardAgora: { ...cardAgora, designer_delivered_at: "x" }, pedidoAgora: null, agora })).toMatchObject({ motivo: "entregue" });
    expect(D.podeDesfazerAjuste({ em: "2026-10-25T12:00:00Z", depois, cardAgora: { ...cardAgora, status: "approval" }, pedidoAgora: null, agora })).toMatchObject({ motivo: "mudou" });
    const criado = { ...depois, pedidoCriado: true, pedido: { id: "dr-9", status: "queued" } };
    expect(D.podeDesfazerAjuste({ em: "2026-10-25T12:00:00Z", depois: criado, cardAgora, pedidoAgora: { id: "dr-9", status: "in_progress" }, agora })).toMatchObject({ motivo: "designer" });
  });

  it("o briefing só volta inteiro se ninguém escreveu nele depois; senão leva uma nota", () => {
    const antes = { card: { briefing: "b", status: "scheduled" }, pedido: { id: "dr-1", status: "done" } };
    expect(D.planoDesfazerAjuste(antes, depois, cardAgora, depois.pedido)).toMatchObject({ card: { briefing: "b", status: "scheduled" }, pedido: { id: "dr-1", status: "done" } });
    expect(D.planoDesfazerAjuste(antes, depois, { ...cardAgora, briefing: "b+ajuste+nota do social" }, depois.pedido).card.briefing).toMatch(/nota do social[\s\S]*desfez este pedido/);
  });
});

describe("rota do portal", () => {
  it("o pedido devolve o Desfazer (10 min) e o Desfazer põe o post de volta na agenda, com aprovação e marcas", async () => {
    const r = await post({ cardId: CARD, action: "ajuste", comment: "tá ótimo" });
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, action: "ajuste", desfazer: { id: expect.any(String), ate: expect.any(String) } });
    expect(db.card.status).toBe("in_production");
    expect(db.pedidos[0].status).toBe("in_progress");

    const d = await post({ cardId: CARD, action: "desfazer_ajuste", desfazerId: j.desfazer.id });
    expect(d.status).toBe(200);
    expect(db.card).toMatchObject({
      status: "scheduled", scheduled_at: "2026-10-31T12:00:00Z", client_approved_at: "2026-10-24T09:00:00Z",
      designer_delivered_at: "2026-10-23T10:00:00Z", alteracao_pendente_em: null, briefing: "Post da promoção",
    });
    expect(db.pedidos[0].status).toBe("done");
    expect(db.avisos.at(-1)).toMatchObject({ title: expect.stringMatching(/desfez o pedido de ajuste/) });

    // Segundo clique: já desfeito, nada muda.
    const de_novo = await post({ cardId: CARD, action: "desfazer_ajuste", desfazerId: j.desfazer.id });
    expect(await de_novo.json()).toMatchObject({ ok: true, jaDesfeito: true });
  });

  it("depois que o designer entregou a nova versão, não desfaz — e diz para falar com o time", async () => {
    const j = await (await post({ cardId: CARD, action: "ajuste", comment: "trocar a cor" })).json();
    db.card.designer_delivered_at = new Date().toISOString();
    const d = await post({ cardId: CARD, action: "desfazer_ajuste", desfazerId: j.desfazer.id });
    expect(d.status).toBe(409);
    expect((await d.json()).error).toMatch(/designer já entregou/);
  });

  it("passados 10 minutos, não desfaz", async () => {
    const j = await (await post({ cardId: CARD, action: "ajuste", comment: "trocar a cor" })).json();
    db.opsLog[0].created_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const d = await post({ cardId: CARD, action: "desfazer_ajuste", desfazerId: j.desfazer.id });
    expect(d.status).toBe(409);
    expect((await d.json()).error).toMatch(/mais de 10 minutos/);
  });

  it("id de desfazer de outro card não vale", async () => {
    const d = await post({ cardId: CARD, action: "desfazer_ajuste", desfazerId: "dddddddd-0000-4000-8000-000000000009" });
    expect(d.status).toBe(404);
  });
});

describe("botão Pedir alteração", () => {
  it("avisa ANTES que a arte volta para produção, e oferece Desfazer depois de enviar", async () => {
    const api = { chamar: vi.fn() };
    vi.doMock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
    vi.resetModules();
    const { default: PedirAlteracao } = await import("@/components/portal/PedirAlteracao");
    render(<PedirAlteracao token="tok" cardId={CARD} titulo="Promo de sexta" />);
    fireEvent.click(screen.getByRole("button", { name: /pedir alteração/i }));
    expect(screen.getByText(/volta para o designer refazer \(e sai da agenda/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/O que mudar/), { target: { value: "tá ótimo" } });
    api.chamar.mockResolvedValueOnce({ ok: true, status: 200, erro: null, data: { desfazer: { id: "dz-1", ate: new Date(Date.now() + 10 * 60 * 1000).toISOString() } } });
    fireEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));
    const desfazer = await screen.findByRole("button", { name: /Desfazer \(até/ });
    api.chamar.mockResolvedValueOnce({ ok: true, status: 200, erro: null, data: { ok: true } });
    fireEvent.click(desfazer);
    await waitFor(() => expect(api.chamar).toHaveBeenLastCalledWith("/api/portal/tok/approve", { cardId: CARD, action: "desfazer_ajuste", desfazerId: "dz-1" }));
    expect(await screen.findByText(/Pedido desfeito/)).toBeInTheDocument();
  });
});
