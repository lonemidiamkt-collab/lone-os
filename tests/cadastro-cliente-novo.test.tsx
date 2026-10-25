// tests/cadastro-cliente-novo.test.tsx — 24/10/2026, auditoria de erro recuperável (item 3.8).
// "Novo cliente": clique duplo criava DOIS cadastros e a falha não aparecia — o erro da rota
// (inclusive o 409 "esta conta de anúncio é do cliente X", da onda 1) virava uma promessa rejeitada
// que ninguém tratava. Agora o botão trava enquanto grava e o motivo aparece junto do botão.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const espias = vi.hoisted(() => ({ addClient: vi.fn(), addTask: vi.fn(), push: vi.fn(), chamar: vi.fn(), equipe: [] as { id: string; name: string }[] }));
vi.mock("@/stores/useClientsStore", () => ({ useClientsStore: (sel: (s: unknown) => unknown) => sel({ addClient: espias.addClient }) }));
vi.mock("@/stores/useOperationalStore", () => ({ useOperationalStore: (sel: (s: unknown) => unknown) => sel({ addTask: espias.addTask }) }));
vi.mock("@/stores/useNotificationsStore", () => ({ useNotificationsStore: (sel: (s: unknown) => unknown) => sel({ push: espias.push }) }));
vi.mock("@/lib/context/RoleContext", () => ({ useRole: () => ({ role: "admin", currentUser: "Roberto" }) }));
vi.mock("@/lib/hooks/useTeamMembers", () => ({ useTeamMembers: () => ({ forField: () => espias.equipe, members: espias.equipe, loading: false }) }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));

const { default: NewClientModal } = await import("@/components/NewClientModal");

function irAteOFim() {
  fireEvent.change(screen.getByPlaceholderText("Ex: Contele Energia Solar"), { target: { value: "Padaria do Zé" } });
  fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
  fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
}

beforeEach(() => { espias.addClient.mockReset(); espias.addTask.mockReset(); espias.chamar.mockReset(); espias.equipe = []; });

describe("Novo cliente", () => {
  it("clique duplo: um cadastro só, e o botão diz que está gravando", async () => {
    let terminar!: (c: { id: string }) => void;
    espias.addClient.mockReturnValue(new Promise((ok) => { terminar = ok; }));
    render(<NewClientModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    irAteOFim();
    const botao = screen.getByRole("button", { name: /cadastrar cliente/i });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(espias.addClient).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /cadastrando/i })).toBeDisabled();
    await act(async () => { terminar({ id: "novo" }); });
  });

  it("o motivo da rota aparece junto do botão (conta Meta de outro cliente) e o formulário continua lá", async () => {
    espias.addClient.mockRejectedValue(new Error("A conta de anúncio act_9 é do cliente Bazar Ribeiro. Cadastre sem a conta e, se ela for mesmo deste cliente, transfira na ficha."));
    render(<NewClientModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    irAteOFim();
    fireEvent.click(screen.getByRole("button", { name: /cadastrar cliente/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/é do cliente Bazar Ribeiro/));
    // Liberado para corrigir e tentar de novo.
    expect(screen.getByRole("button", { name: /cadastrar cliente/i })).not.toBeDisabled();
  });

  it("cliente criado mas as tarefas de setup falharam: a tela de sucesso diz o que faltou e não some sozinha", async () => {
    espias.equipe = [{ id: "1", name: "Ana" }];
    espias.addClient.mockResolvedValue({ id: "novo" });
    espias.addTask.mockRejectedValue(new Error("HTTP 500"));
    const onSuccess = vi.fn();
    render(<NewClientModal onClose={vi.fn()} onSuccess={onSuccess} />);
    irAteOFim();
    fireEvent.click(screen.getByRole("button", { name: /cadastrar cliente/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/3 de 3 tarefas de setup não foram criadas/));
    expect(espias.addClient).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /abrir a ficha do cliente/i }));
    expect(onSuccess).toHaveBeenCalledWith("novo");
  });
});
