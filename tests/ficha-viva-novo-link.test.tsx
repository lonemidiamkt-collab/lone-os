// tests/ficha-viva-novo-link.test.tsx — 21/10/2026, auditoria de erro recuperável (item 3.2).
// "Novo link" da Ficha Viva: o token novo ia só para o store (patchClientLocal) e, na junção da
// ficha, o extra antigo vencia (token é campo sensível) — o cartão mostrava o link velho, já morto,
// e "Copiar"/"mensagem WhatsApp" entregavam ao cliente um link quebrado. E trocava num clique só.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Client } from "@/lib/types";
import { mesclarFicha, separarPatchFicha } from "@/lib/clients/ficha-sensiveis";

const api = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/supabase/client", () => {
  const consulta = { select: () => consulta, eq: () => consulta, order: () => consulta, limit: () => consulta, maybeSingle: async () => ({ data: null }) };
  return { supabase: { from: () => consulta } };
});

const { default: FichaVivaManagementCard } = await import("@/components/FichaVivaManagementCard");

// A lista (store) vem magra: sem token. O extra (/api/clients/[id]) traz o token que estava no banco.
const base = { id: "c1", name: "Padaria do Zé", fichaVivaEnabled: true } as unknown as Client;
const extraInicial: Partial<Client> = { fichaVivaToken: "VELHO", fichaVivaRaioxToken: "RX-VELHO", fichaVivaTokenCreatedAt: "2026-09-01" };
const novoLink: Partial<Client> = {
  fichaVivaToken: "NOVO", fichaVivaRaioxToken: "RX-NOVO", fichaVivaTokenCreatedAt: "2026-10-21", fichaVivaTokenRevokedAt: undefined, fichaVivaEnabled: true,
};

describe("junção da ficha: o link novo chega à tela", () => {
  it("o bug: mudar só o store deixava o link velho na tela", () => {
    const store = { ...base, ...novoLink } as Client; // o antigo onUpdate = patchClientLocal
    expect(mesclarFicha(store, extraInicial).fichaVivaToken).toBe("VELHO");
  });

  it("pelo extra (como o portal): a tela mostra o link novo e o Raio-X novo", () => {
    const { extra, comuns } = separarPatchFicha(novoLink);
    const telaDepois = mesclarFicha({ ...base, ...comuns } as Client, { ...extraInicial, ...extra });
    expect(telaDepois.fichaVivaToken).toBe("NOVO");
    expect(telaDepois.fichaVivaRaioxToken).toBe("RX-NOVO");
    // Os campos sensíveis não vão para o store (que é a lista magra de todo mundo).
    expect(comuns).toEqual({ fichaVivaEnabled: true });
  });

  it("reativar depois de revogado: a data de revogação some da tela (senão o botão 'Reativar' continuava lá)", () => {
    const revogado = { ...extraInicial, fichaVivaTokenRevokedAt: "2026-10-01" };
    expect(mesclarFicha(base, revogado).fichaVivaTokenRevokedAt).toBe("2026-10-01");
    const { extra } = separarPatchFicha(novoLink);
    expect(mesclarFicha(base, { ...revogado, ...extra }).fichaVivaTokenRevokedAt).toBeUndefined();
  });
});

describe("cartão da Ficha Viva: 'Novo link' pede confirmação", () => {
  beforeEach(() => { api.chamar.mockReset(); });
  const ativo = { ...base, ...extraInicial } as Client;

  it("um clique só não troca: mostra que o link enviado ao cliente deixa de abrir", async () => {
    render(<FichaVivaManagementCard client={ativo} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /novo link/i }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/link enviado ao cliente deixa de abrir/i);
    expect(api.chamar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.chamar).not.toHaveBeenCalled();
  });

  it("confirmando: troca e entrega o token novo para quem guarda a tela", async () => {
    api.chamar.mockResolvedValue({ ok: true, status: 200, erro: null, data: { token: "NOVO", raioxToken: "RX-NOVO" } });
    const onUpdate = vi.fn();
    render(<FichaVivaManagementCard client={ativo} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: /novo link/i }));
    fireEvent.click(screen.getByRole("button", { name: /trocar o link/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(api.chamar).toHaveBeenCalledWith("/api/clients/c1/ficha-viva/generate-token", undefined, { method: "POST" });
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ fichaVivaToken: "NOVO", fichaVivaRaioxToken: "RX-NOVO", fichaVivaEnabled: true });
  });

  it("falha do servidor aparece como falha e não mexe no link da tela", async () => {
    api.chamar.mockResolvedValue({ ok: false, status: 500, erro: "Não consegui completar (erro 500).", data: null });
    const onUpdate = vi.fn();
    render(<FichaVivaManagementCard client={ativo} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: /novo link/i }));
    fireEvent.click(screen.getByRole("button", { name: /trocar o link/i }));
    expect(await screen.findByText(/não consegui completar/i)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
