// tests/carteira-erro-nao-e-vazio.test.tsx — 24/10/2026, auditoria de erro recuperável (item 3.11).
// Carteira, arquivados e material do cliente: erro de leitura virava lista vazia — "Nenhum cliente",
// "Nenhum cliente arquivado", ou a seção de material sumia como se o cliente não tivesse mandado nada.
// Agora a falha aparece como falha, com "Tentar de novo". (E o 3.8: o motivo da rota chega ao modal.)

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";

const espias = vi.hoisted(() => ({ chamar: vi.fn(), fetchClients: vi.fn(), fetchClientChats: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "roberto@lone", isAdmin: true }) }));
vi.mock("@/lib/supabase/queries", () => ({ fetchClients: espias.fetchClients, fetchClientChats: espias.fetchClientChats, insertClient: vi.fn() }));
vi.mock("@/lib/portal/link-automatico", () => ({ dispararLinkDoPortal: vi.fn() }));
vi.mock("@/lib/clients/conta-meta-server", () => ({ donosDaConta: vi.fn(async () => []) }));

const { useClientsStore } = await import("@/stores/useClientsStore");
const { GET } = await import("@/app/api/data/clients/route");
const { default: MaterialDoCliente } = await import("@/components/clients/MaterialDoCliente");

beforeEach(() => {
  espias.chamar.mockReset(); espias.fetchClients.mockReset(); espias.fetchClientChats.mockReset().mockResolvedValue({});
  useClientsStore.setState({ clients: [], clientChats: {}, loading: false, initialized: false, erro: null });
});

describe("/api/data/clients — leitura da carteira", () => {
  it("o bug: banco falhou e a rota respondia 200 com lista vazia; agora é 503 com frase", async () => {
    espias.fetchClients.mockRejectedValue({ message: "canceling statement due to statement timeout" });
    const r = await GET(new NextRequest("http://x/api/data/clients"));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Não consegui ler a carteira/);
  });

  it("as consultas lançam em vez de devolver [] (carteira e arquivados)", () => {
    const src = readFileSync("lib/supabase/queries.ts", "utf8");
    expect(src).toMatch(/\[DB\] fetchClients:", error\); throw error;/);
    expect(src).toMatch(/\[DB\] fetchChurnedClients:", error\); throw error;/);
  });
});

describe("store de clientes", () => {
  it("falha na carga: guarda o motivo e não finge que carregou; tentar de novo funciona", async () => {
    espias.chamar.mockResolvedValueOnce({ ok: false, data: null, erro: "Não consegui ler a carteira de clientes agora.", status: 503 });
    await useClientsStore.getState().init();
    expect(useClientsStore.getState()).toMatchObject({ initialized: false, loading: false, erro: "Não consegui ler a carteira de clientes agora." });

    espias.chamar.mockResolvedValueOnce({ ok: true, data: { clients: [{ id: "c1", name: "Padaria" }], clientChats: {} }, erro: null, status: 200 });
    await useClientsStore.getState().init();
    expect(useClientsStore.getState()).toMatchObject({ initialized: true, erro: null });
    expect(useClientsStore.getState().clients).toHaveLength(1);
  });

  it("cadastrar (3.8): o motivo da rota chega a quem chamou, e o cliente provisório sai da lista", async () => {
    const motivo = "A conta de anúncio act_9 é do cliente Bazar Ribeiro.";
    espias.chamar.mockResolvedValueOnce({ ok: false, data: null, erro: motivo, status: 409 });
    await expect(useClientsStore.getState().addClient({ name: "Novo" } as never)).rejects.toThrow(motivo);
    expect(useClientsStore.getState().clients).toHaveLength(0);
  });
});

describe("lista de clientes", () => {
  const src = readFileSync("app/clients/page.tsx", "utf8");
  it("carregando, falhou e vazio de verdade são três telas — e a falha tem 'Tentar de novo'", () => {
    expect(src).toMatch(/Carregando a carteira…/);
    expect(src).toMatch(/Não consegui carregar os clientes: \$\{carteiraErro\}/);
    expect(src).toMatch(/filtered\.length === 0 && carteiraPronta/);
    expect(src).toMatch(/Tentar de novo/);
  });
  it("arquivados: erro não vira 'Nenhum cliente arquivado'", () => {
    expect(src).toMatch(/Não consegui carregar os arquivados/);
    expect(src).toMatch(/!archivedLoading && !archivedErro && archived\.length === 0/);
  });
  it("ficha: carteira que não carregou não vira 'Cliente não encontrado'", () => {
    const ficha = readFileSync("app/clients/[id]/page.tsx", "utf8");
    expect(ficha).toMatch(/if \(!client && carteiraErro\)/);
    expect(ficha.indexOf("if (!client && carteiraErro)")).toBeLessThan(ficha.indexOf('<Header title="Cliente não encontrado" />'));
  });
});

describe("material enviado pelo cliente", () => {
  it("falha na leitura aparece (antes a seção sumia) e 'Tentar de novo' busca outra vez", async () => {
    espias.chamar.mockResolvedValueOnce({ ok: false, data: null, erro: "O painel está reiniciando. Tenta em alguns segundos.", status: 502 });
    render(<MaterialDoCliente clientId="c1" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Não consegui carregar o material/));
    espias.chamar.mockResolvedValueOnce({ ok: true, data: { itens: [{ id: "u1", file_name: "cardapio.pdf", mime_type: null, size_bytes: null, observacao: null, enviado_por: null, created_at: "2026-10-20T12:00:00Z", visto_em: null, visto_por: null, url: null }] }, erro: null, status: 200 });
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    await waitFor(() => expect(screen.getByText("cardapio.pdf")).toBeInTheDocument());
  });

  it("sem material de verdade, continua sem ocupar espaço", async () => {
    espias.chamar.mockResolvedValueOnce({ ok: true, data: { itens: [] }, erro: null, status: 200 });
    const { container } = render(<MaterialDoCliente clientId="c1" />);
    await waitFor(() => expect(espias.chamar).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
