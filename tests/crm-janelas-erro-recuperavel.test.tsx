// Janelas do comercial e de tarefas (auditoria 21/10/2026, itens 4.7, 4.9, 4.13). Dados INVENTADOS.
//
// O QUE ACONTECIA:
//  4.7 — a janela de marcar reunião não mostrava quem ia receber o convite (e o servidor punha o e-mail do cadastro).
//  4.9 — agenda que não carregava aparecia como "Nenhum horário livre" (ou horários sem conferir conflito).
//  4.13 — "Nova tarefa": clicar fora, no X ou em Cancelar jogava fora o que foi digitado, sem perguntar.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
vi.mock("@/lib/context/RoleContext", () => ({ useRole: () => ({ profiles: [{ name: "Roberto Lino", role: "admin" }], currentUser: "Roberto Lino" }) }));
vi.mock("@/stores/useOperationalStore", () => ({ useOperationalStore: () => vi.fn() }));
vi.mock("@/stores/useClientsStore", () => ({ useClientsStore: () => [] }));

const { default: MarcarReuniao } = await import("@/components/crm/MarcarReuniao");
const { NovaTarefaModal } = await import("@/app/tarefas/NovaTarefa");

const LEAD = { id: "l1", empresa: "Loja Exemplo", contatoNome: "Ana", email: "ana@exemplo.com", estagio: "contato", endereco: null, cidade: null };

beforeEach(() => { api.chamar.mockReset(); vi.restoreAllMocks(); });

describe("marcar reunião", () => {
  it("4.9 — o erro original: agenda que não carregou parecia sem horário livre; agora diz que não leu, com Tentar de novo", async () => {
    api.chamar.mockResolvedValue({ ok: true, data: { livres: [], google: "erro", erro: "Não consegui ler o Google Agenda da Lone (token expirado). Não ofereço horário sem conferir conflito." }, erro: null, status: 200 });
    render(<MarcarReuniao leads={[LEAD]} leadInicial={LEAD} autor="Roberto" onFechar={() => {}} onMarcada={() => {}} />);
    expect(await screen.findByText(/Não consegui ler o Google Agenda/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum horário livre/)).toBeNull();
    const chamadas = api.chamar.mock.calls.length;
    fireEvent.click(screen.getByText("Tentar de novo"));
    await waitFor(() => expect(api.chamar.mock.calls.length).toBeGreaterThan(chamadas));
  });

  it("4.9 — a chamada que cai também não vira 'Nenhum horário livre'", async () => {
    api.chamar.mockResolvedValue({ ok: false, data: null, erro: "Sem conexão com o servidor. Tenta de novo?", status: 0 });
    render(<MarcarReuniao leads={[LEAD]} leadInicial={LEAD} autor="Roberto" onFechar={() => {}} onMarcada={() => {}} />);
    expect(await screen.findByText(/Não consegui ler a agenda: Sem conexão/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum horário livre/)).toBeNull();
  });

  it("4.7 — mostra quem recebe o convite antes de marcar; apagou o campo, ninguém recebe", async () => {
    api.chamar.mockImplementation(async (url: string) => url.startsWith("/api/crm/reunioes/horarios")
      ? { ok: true, data: { livres: ["10:00"], google: "conectado", erro: null }, erro: null, status: 200 }
      : { ok: false, data: null, erro: "parou aqui (teste)", status: 400 });
    render(<MarcarReuniao leads={[LEAD]} leadInicial={LEAD} autor="Roberto" onFechar={() => {}} onMarcada={() => {}} />);
    fireEvent.click(await screen.findByText("10:00"));
    expect(screen.getByText("Convite para: ana@exemplo.com")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Convite por e-mail para"), { target: { value: "" } });
    expect(screen.getByText("Convite para: ninguém (sem convite por e-mail)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Marcar reunião", { selector: "button" }));
    await waitFor(() => expect(api.chamar).toHaveBeenCalledWith("/api/crm/reunioes", expect.objectContaining({ convidados: [] })));
  });

  it("4.7 — e-mail inválido trava o botão e diz o que corrigir", async () => {
    api.chamar.mockResolvedValue({ ok: true, data: { livres: ["10:00"], google: "conectado", erro: null }, erro: null, status: 200 });
    render(<MarcarReuniao leads={[LEAD]} leadInicial={LEAD} autor="Roberto" onFechar={() => {}} onMarcada={() => {}} />);
    fireEvent.click(await screen.findByText("10:00"));
    fireEvent.change(screen.getByLabelText("Convite por e-mail para"), { target: { value: "ana@exemplo" } });
    expect(screen.getByText(/E-mail inválido: ana@exemplo/)).toBeInTheDocument();
    expect(screen.getByText("Marcar reunião", { selector: "button" })).toBeDisabled();
  });
});

describe("4.13 — nova tarefa não descarta o que foi digitado sem perguntar", () => {
  const montar = () => {
    const onClose = vi.fn();
    render(<NovaTarefaModal clients={[]} currentUser="Roberto Lino" onClose={onClose} onCriar={async () => {}} />);
    return onClose;
  };
  it("o erro original: clique em Cancelar com título digitado fechava direto — agora pergunta", () => {
    const onClose = montar();
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByPlaceholderText(/Criar arte de piso/), { target: { value: "Ligar para o fornecedor" } });
    fireEvent.click(screen.getByText("Cancelar"));
    expect(confirmar).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirmar.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).toHaveBeenCalled();
  });
  it("sem nada digitado fecha direto, sem perguntar", () => {
    const onClose = montar();
    const confirmar = vi.spyOn(window, "confirm");
    fireEvent.click(screen.getByText("Cancelar"));
    expect(confirmar).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
