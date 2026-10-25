// tests/ficha-viva-estrutura.test.tsx — 25/10/2026, onda 6 da auditoria de erro recuperável, 12.1, 12.2, 12.3.
//  · 12.1 falha ao ler o diagnóstico virava "O cliente ainda não respondeu. Envie o link" (e a estrutura
//         automática não rodava);
//  · 12.2 "Refazer" trocava a estrutura editada à mão sem confirmar e sem guardar a anterior;
//  · 12.3 os campos "1 por linha" convertiam a cada tecla e o Enter sumia.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import type { Client } from "@/lib/types";

// ── banco e IA de mentira para as rotas ─────────────────────────────────────────
const db = vi.hoisted(() => ({
  diag: null as null | Record<string, unknown>,
  falhaLeitura: null as null | { message: string },
  updates: [] as Record<string, unknown>[],
  filtros: [] as [string, unknown][],
}));
function consulta() {
  const b: Record<string, unknown> = {
    select: () => b, order: () => b, limit: () => b, ilike: () => b,
    eq: (c: string, v: unknown) => { db.filtros.push([c, v]); return b; },
    update: (p: Record<string, unknown>) => { db.updates.push(p); if (db.diag) Object.assign(db.diag, p); return { eq: async () => ({ error: null }) }; },
    maybeSingle: async () => (db.falhaLeitura ? { data: null, error: db.falhaLeitura } : { data: db.diag ? { ...db.diag } : null, error: null }),
    single: async () => ({ data: { id: "c1", name: "Padaria", nome_fantasia: null, industry: null }, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
  };
  return b;
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => consulta() } }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u", email: "lonemidiamkt@gmail.com", isAdmin: true, aal: "aal2", duasEtapas: true }) }));
vi.mock("@/lib/equipe/membro-server", () => ({ buscarMembroPorEmail: async () => ({ membro: { name: "Roberto Lino" }, erro: null }) }));
vi.mock("@/lib/cs/diagnostico-comercial", () => ({
  analisarDiagnostico: async () => ({ ok: true, data: { diagnostico: "Nova da IA", swot: { forcas: ["IA"], fraquezas: [], oportunidades: [], ameacas: [] }, prioridades: ["p"], scripts: [] } }),
}));

// ── tela ────────────────────────────────────────────────────────────────────────
const api = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { GET: lerDiag, POST: salvar } = await import("@/app/api/clients/[id]/ficha-viva/analise/route");
const { POST: refazer } = await import("@/app/api/clients/[id]/ficha-viva/analyze/route");
const E = await import("@/lib/fichaViva/analise");
const { default: Cartao } = await import("@/components/FichaVivaManagementCard");

const params = { params: Promise.resolve({ id: "c1" }) };
const DIAG_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const editada = {
  diagnostico: "Escrito pelo time", swot: { forcas: ["atendimento"], fraquezas: [], oportunidades: [], ameacas: [] },
  prioridades: ["vender mais"], scripts: [], editadoEm: "2026-10-21T15:00:00Z", editadoPor: "Roberto Lino",
};

beforeEach(() => {
  db.diag = { id: DIAG_ID, respostas: { q1: "ok" }, analise: { ...editada }, status: "analisado", answered_at: "2026-10-20" };
  db.falhaLeitura = null; db.updates.length = 0; db.filtros.length = 0;
  api.chamar.mockReset();
});

describe("estrutura (puro)", () => {
  it("toda troca guarda a anterior; voltar troca as duas de lugar", () => {
    const nova = E.refazerComIa({ diagnostico: "IA", swot: {}, prioridades: [], scripts: [] }, editada, "2026-10-25T10:00:00Z");
    expect(nova).toMatchObject({ diagnostico: "IA", editadoEm: null, anterior: { diagnostico: "Escrito pelo time", editadoPor: "Roberto Lino" } });
    const volta = E.voltarAnterior(nova)!;
    expect(volta).toMatchObject({ diagnostico: "Escrito pelo time", anterior: { diagnostico: "IA" } });
    expect(volta.anterior && "anterior" in volta.anterior).toBe(false); // um nível só
    expect(E.voltarAnterior(editada)).toBeNull();
  });

  it("só pede confirmação quando houve edição à mão", () => {
    expect(E.precisaConfirmarRefazer(editada)).toBe(true);
    expect(E.precisaConfirmarRefazer({ ...editada, editadoEm: null })).toBe(false);
  });

  it("rascunho guarda o texto cru (com Enter e linha vazia) e converte só ao salvar", () => {
    const r = E.paraRascunho(editada);
    const digitado = { ...r, forcas: "atendimento\n" }; // o Enter que sumia
    expect(digitado.forcas.endsWith("\n")).toBe(true);
    expect(E.doRascunho({ ...digitado, forcas: "atendimento\nentrega rápida\n\n" }).swot.forcas).toEqual(["atendimento", "entrega rápida"]);
  });
});

describe("rotas", () => {
  it("12.1: GET com falha de leitura é 503 — não 'não respondeu'", async () => {
    db.falhaLeitura = { message: "connection reset" };
    const r = await lerDiag(new NextRequest("http://x"), params);
    expect(r.status).toBe(503);
    db.falhaLeitura = null; db.diag = null;
    expect(await (await lerDiag(new NextRequest("http://x"), params)).json()).toEqual({ diagnostico: null });
  });

  it("12.2: Refazer guarda a estrutura editada como anterior", async () => {
    const r = await refazer(new NextRequest("http://x", { method: "POST" }), params);
    const j = await r.json();
    expect(j.guardouAnterior).toBe(true);
    expect(db.updates[0].analise).toMatchObject({ diagnostico: "Nova da IA", anterior: { diagnostico: "Escrito pelo time" } });
  });

  it("12.2: salvar a edição marca quem/quando e grava no diagnóstico ABERTO (diagId), não no mais recente", async () => {
    const r = await salvar(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ diagId: DIAG_ID, analise: { diagnostico: "Revisado", swot: {}, prioridades: [], scripts: [] } }) }), params);
    expect(r.status).toBe(200);
    expect(db.filtros).toContainEqual(["id", DIAG_ID]);
    expect(db.updates[0].analise).toMatchObject({ diagnostico: "Revisado", editadoPor: "Roberto Lino", anterior: { diagnostico: "Escrito pelo time" } });
  });

  it("voltar à anterior sem anterior guardada: 409 com frase", async () => {
    const r = await salvar(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ acao: "voltar_anterior", diagId: DIAG_ID }) }), params);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Não há versão anterior/);
  });
});

describe("cartão da Ficha Viva (equipe)", () => {
  const cliente = { id: "c1", name: "Padaria", fichaVivaEnabled: true } as unknown as Client;

  it("12.1: falha ao carregar o diagnóstico mostra a falha + Tentar de novo, e não 'o cliente não respondeu'", async () => {
    api.chamar.mockResolvedValueOnce({ ok: false, status: 503, erro: "Não consegui carregar o diagnóstico agora.", data: null });
    render(<Cartao client={cliente} onUpdate={vi.fn()} />);
    expect(await screen.findByText(/Não consegui carregar o diagnóstico agora/)).toBeInTheDocument();
    expect(screen.queryByText(/ainda não respondeu/)).not.toBeInTheDocument();
    api.chamar.mockResolvedValueOnce({ ok: true, status: 200, erro: null, data: { diagnostico: db.diag } });
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByText("Escrito pelo time")).toBeInTheDocument();
  });

  it("12.2: Refazer de estrutura editada pede confirmação antes de chamar a IA", async () => {
    api.chamar.mockResolvedValueOnce({ ok: true, status: 200, erro: null, data: { diagnostico: db.diag } });
    render(<Cartao client={cliente} onUpdate={vi.fn()} />);
    await screen.findByText("Escrito pelo time");
    expect(screen.getByText(/editada à mão em 21\/10 por Roberto Lino/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /refazer/i }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/A versão atual fica guardada/);
    expect(api.chamar).toHaveBeenCalledTimes(1); // só a leitura; a IA não rodou
  });

  it("12.3: Enter no campo '1 por linha' não some", async () => {
    api.chamar.mockResolvedValueOnce({ ok: true, status: 200, erro: null, data: { diagnostico: db.diag } });
    render(<Cartao client={cliente} onUpdate={vi.fn()} />);
    await screen.findByText("Escrito pelo time");
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    const forcas = screen.getByLabelText(/Forças \(1 por linha\)/) as HTMLTextAreaElement;
    fireEvent.change(forcas, { target: { value: "atendimento\n" } });
    expect(forcas.value).toBe("atendimento\n");
    fireEvent.change(forcas, { target: { value: "atendimento\nentrega" } });
    api.chamar.mockResolvedValueOnce({ ok: true, status: 200, erro: null, data: { analise: { ...editada, swot: { ...editada.swot, forcas: ["atendimento", "entrega"] } } } });
    fireEvent.click(screen.getByRole("button", { name: /salvar estrutura/i }));
    await waitFor(() => expect(api.chamar).toHaveBeenLastCalledWith("/api/clients/c1/ficha-viva/analise",
      expect.objectContaining({ diagId: DIAG_ID, analise: expect.objectContaining({ swot: expect.objectContaining({ forcas: ["atendimento", "entrega"] }) }) })));
  });
});
