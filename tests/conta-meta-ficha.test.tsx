// tests/conta-meta-ficha.test.tsx — 21/10/2026, item 3.3: a tela "Vincular conta de anúncio" da ficha.
// Falha da Meta ao listar aparecia como "Nenhuma conta disponível. Conecte a Meta"; a conta de outro
// cliente aparecia igual a uma livre e vinha para cá num clique.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Client } from "@/lib/types";

const m = vi.hoisted(() => ({ chamar: vi.fn(), listar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: m.chamar }));
vi.mock("@/lib/meta/useMetaAds", () => ({
  TokenExpiredError: class extends Error {},
  useMetaConnection: () => ({ connected: true, loading: false, token: "tok", tokenExpired: false }),
  fetchAdAccounts: m.listar,
}));
vi.mock("@/stores/useClientsStore", () => ({ useClientsStore: (sel: (s: { patchClientLocal: () => void }) => unknown) => sel({ patchClientLocal: vi.fn() }) }));

const { default: ContaMetaAds } = await import("@/components/client/ficha/ContaMetaAds");

const cliente = { id: "b", name: "Veneza", metaAdAccountId: undefined } as unknown as Client;
const CONTAS = [
  { id: "act_123", name: "CA Bazar", account_id: "123" },
  { id: "act_777", name: "CA Livre", account_id: "777" },
];

beforeEach(() => {
  m.chamar.mockReset();
  m.listar.mockReset();
  m.chamar.mockImplementation(async (url: string) => {
    if (url === "/api/clients/contas-meta") {
      return { ok: true, status: 200, erro: null, data: { donos: { act_123: [{ clientId: "a", nome: "Bazar Ribeiro", ativo: true, naFicha: true, noEspelho: true }] } } };
    }
    return { ok: true, status: 200, erro: null, data: {} };
  });
});

const abrir = () => fireEvent.click(screen.getByRole("button", { name: /alterar conta de anúncio/i }));

describe("ficha › Conta Meta Ads", () => {
  it("a Meta falhou ao listar: mostra o erro e 'Tentar de novo' (não 'conecte a Meta')", async () => {
    m.listar.mockRejectedValueOnce(new Error("A Meta não respondeu ao listar as contas — contas pessoais: HTTP 500")).mockResolvedValueOnce(CONTAS);
    render(<ContaMetaAds client={cliente} updateClientData={vi.fn()} />);
    abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent(/não consegui listar as contas da meta/i);
    expect(screen.queryByText(/conecte a meta/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByText("CA Livre")).toBeInTheDocument();
  });

  it("conta de outro cliente: a lista diz de quem é e o clique pede confirmação antes de transferir", async () => {
    m.listar.mockResolvedValue(CONTAS);
    render(<ContaMetaAds client={cliente} updateClientData={vi.fn()} />);
    abrir();
    expect(await screen.findByText(/é do cliente Bazar Ribeiro/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("CA Bazar"));
    const confirmacao = screen.getByRole("alertdialog");
    expect(confirmacao).toHaveTextContent(/Bazar Ribeiro deixa de ter a conta/);
    expect(m.chamar).not.toHaveBeenCalledWith("/api/clients/update", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: /transferir para veneza/i }));
    await waitFor(() => expect(m.chamar).toHaveBeenCalledWith("/api/clients/update",
      expect.objectContaining({ id: "b", metaAdAccountId: "act_123", transferirContaMeta: true })));
  });

  it("conta livre: vincula direto, sem pedir transferência", async () => {
    m.listar.mockResolvedValue(CONTAS);
    render(<ContaMetaAds client={cliente} updateClientData={vi.fn()} />);
    abrir();
    fireEvent.click(await screen.findByText("CA Livre"));
    await waitFor(() => expect(m.chamar).toHaveBeenCalledWith("/api/clients/update",
      { id: "b", metaAdAccountId: "act_777", metaAdAccountName: "CA Livre" }));
  });

  it("o servidor recusou (dono que a lista não mostrou): vira a confirmação, não um erro mudo", async () => {
    m.listar.mockResolvedValue(CONTAS);
    m.chamar.mockImplementation(async (url: string, corpo?: { transferirContaMeta?: boolean }) => {
      if (url === "/api/clients/contas-meta") return { ok: false, status: 500, erro: "Não consegui ver de quem é cada conta agora.", data: null };
      if (url === "/api/clients/update" && !corpo?.transferirContaMeta) {
        return { ok: false, status: 409, erro: "A conta de anúncio act_777 é do cliente Casas Rio Bahia.", data: null };
      }
      return { ok: true, status: 200, erro: null, data: {} };
    });
    render(<ContaMetaAds client={cliente} updateClientData={vi.fn()} />);
    abrir();
    expect(await screen.findByText(/não consegui ver de quem é cada conta/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByText("CA Livre"));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/Casas Rio Bahia/);
  });
});
