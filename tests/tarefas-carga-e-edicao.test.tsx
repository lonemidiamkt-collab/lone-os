// tests/tarefas-carga-e-edicao.test.tsx — 25/10/2026, auditoria de erro recuperável (13.4, 13.5, 6.4, 6.6). Dados INVENTADOS.
//
// 13.4/6.4: a carga das tarefas que falhava virava "Nenhuma tarefa em aberto" (lista) e "Tudo em dia!" (Hoje) — o
// store engolia o erro com `catch {}` e fetchTasks devolvia []. Agora a falha aparece como falha, com "Tentar de novo".
// 6.6: no Hoje o quadradinho concluía sem "Desfazer" e trocava o motivo do servidor por uma frase genérica.
// 13.5: não existia "Editar" — agora o mesmo formulário, e o servidor aceita título/cliente e limpa o prazo apagado.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";

const espias = vi.hoisted(() => ({
  chamar: vi.fn(), toastOk: vi.fn(), toastErro: vi.fn(), fetchTasks: vi.fn(),
  linhas: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[], avisos: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: espias.toastOk, error: espias.toastErro }) }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "ana@exemplo.com", isAdmin: false }) }));
vi.mock("@/lib/context/RoleContext", () => ({
  useRole: () => ({ role: "social", currentUser: "Ana Exemplo", profiles: [{ name: "Ana Exemplo", role: "social" }, { name: "Bruna Exemplo", role: "designer" }] }),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      let acao = "select";
      let valores: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) q[m] = () => q;
      q.update = (v: Record<string, unknown>) => { acao = "update"; valores = v; return q; };
      q.insert = (v: Record<string, unknown>) => { if (tabela === "notifications") espias.avisos.push(v); return Promise.resolve({ error: null }); };
      q.maybeSingle = () => Promise.resolve({ data: tabela === "team_members" ? { name: "Ana Exemplo" } : espias.linhas[0] ?? null, error: null });
      q.then = (ok: (v: unknown) => unknown) => {
        if (acao === "update") espias.updates.push(valores);
        return Promise.resolve({ data: null, error: null }).then(ok);
      };
      return q;
    },
  },
}));

const { useOperationalStore } = await import("@/stores/useOperationalStore");
const { useContentStore } = await import("@/stores/useContentStore");
const { useClientsStore } = await import("@/stores/useClientsStore");
const { default: Tarefas } = await import("@/app/tarefas/Tarefas");
const { default: Hoje } = await import("@/app/my-work/Hoje");
const { mudancasDaTarefa, erroDaEdicao } = await import("@/lib/tarefas/editar");
const rotaUpdate = await import("@/app/api/tasks/update/route");

const tarefa = (o: Record<string, unknown> = {}) => ({
  id: "t1", title: "Arte do feed", clientId: "k1", clientName: "Cliente Exemplo", assignedTo: "Ana Exemplo",
  role: "social", status: "pending", priority: "medium", dueDate: "2099-01-10", createdBy: "Ana Exemplo", ...o,
}) as never;

const PAYLOAD_OK = {
  timeline: {}, onboardingItems: {}, notices: [], creativeAssets: {}, socialProofs: {}, quinzReports: [], moodEntries: {}, clientAccess: {},
};

beforeEach(() => {
  espias.chamar.mockReset(); espias.toastOk.mockReset(); espias.toastErro.mockReset();
  espias.linhas = []; espias.updates.length = 0; espias.avisos.length = 0;
  useOperationalStore.setState({ tasks: [], initialized: false, loadError: null, tarefasErro: null });
  useContentStore.setState({ contentCards: [], designRequests: [], initialized: true, loadError: false });
  useClientsStore.setState({ clients: [], initialized: true, erro: null, loading: false });
});

describe("store de tarefas (13.4/6.4)", () => {
  it("o erro original: a carga falhava e o store engolia — agora guarda o motivo e não finge que carregou", async () => {
    espias.chamar.mockResolvedValueOnce({ ok: false, data: null, erro: "O painel está reiniciando. Tenta em alguns segundos.", status: 502 });
    await useOperationalStore.getState().init();
    expect(useOperationalStore.getState()).toMatchObject({ initialized: false, loadError: "O painel está reiniciando. Tenta em alguns segundos." });
    expect(useOperationalStore.getState().tarefasErro).toMatch(/Não consegui carregar as tarefas/);

    espias.chamar.mockResolvedValueOnce({ ok: true, data: { ...PAYLOAD_OK, tasks: [tarefa()], tarefasErro: null }, erro: null, status: 200 });
    await useOperationalStore.getState().recarregar();
    expect(useOperationalStore.getState()).toMatchObject({ initialized: true, loadError: null, tarefasErro: null });
    expect(useOperationalStore.getState().tasks).toHaveLength(1);
  });

  it("só as tarefas falharam no servidor: o resto carrega, as tarefas da tela ficam e o erro aparece", async () => {
    useOperationalStore.setState({ tasks: [tarefa()] });
    espias.chamar.mockResolvedValueOnce({ ok: true, data: { ...PAYLOAD_OK, tasks: null, tarefasErro: "Não consegui ler as tarefas (timeout)." }, erro: null, status: 200 });
    await useOperationalStore.getState().recarregar();
    expect(useOperationalStore.getState().tasks).toHaveLength(1);
    expect(useOperationalStore.getState().tarefasErro).toMatch(/timeout/);
  });
});

describe("telas (13.4/6.4)", () => {
  it("lista de Tarefas com erro: diz que não carregou e oferece Tentar de novo — nunca 'Nenhuma tarefa em aberto'", () => {
    useOperationalStore.setState({ initialized: false, tarefasErro: "Não consegui carregar as tarefas: sem conexão" });
    render(<Tarefas />);
    expect(screen.getByText("Não consegui carregar as tarefas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma tarefa em aberto")).not.toBeInTheDocument();
  });

  it("Hoje: com tarefas que não carregaram, nada de 'Tudo em dia!'", async () => {
    espias.chamar.mockResolvedValue({ ok: true, data: { reunioes: [], historico: [] }, erro: null, status: 200 });
    useOperationalStore.setState({ initialized: false, tarefasErro: "Não consegui carregar as tarefas: sem conexão" });
    render(<Hoje />);
    await waitFor(() => expect(espias.chamar).toHaveBeenCalled());
    expect(screen.queryByText("Tudo em dia!")).not.toBeInTheDocument();
    expect(screen.getByText(/O que depende das tarefas nesta tela pode estar incompleto/)).toBeInTheDocument();
  });

  it("Hoje: enquanto carrega também não diz 'Tudo em dia!'", async () => {
    espias.chamar.mockResolvedValue({ ok: true, data: { reunioes: [], historico: [] }, erro: null, status: 200 });
    render(<Hoje />);
    await waitFor(() => expect(espias.chamar).toHaveBeenCalled());
    expect(screen.queryByText("Tudo em dia!")).not.toBeInTheDocument();
    expect(screen.getByText("Carregando o que é seu…")).toBeInTheDocument();
  });

  it("Hoje: tudo carregado e vazio → 'Tudo em dia!' continua aparecendo", async () => {
    espias.chamar.mockResolvedValue({ ok: true, data: { reunioes: [], historico: [] }, erro: null, status: 200 });
    useOperationalStore.setState({ initialized: true, tarefasErro: null, tasks: [] });
    render(<Hoje />);
    expect(await screen.findByText("Tudo em dia!")).toBeInTheDocument();
  });
});

describe("Hoje › concluir (6.6)", () => {
  it("o erro original: concluía sem Desfazer — agora o aviso traz 'Desfazer' que devolve o status", async () => {
    espias.chamar.mockImplementation(async (url: string) => url.startsWith("/api/reunioes")
      ? { ok: true, data: { reunioes: [], historico: [] }, erro: null, status: 200 }
      : { ok: true, data: { success: true }, erro: null, status: 200 });
    useOperationalStore.setState({ initialized: true, tarefasErro: null, tasks: [tarefa()] });
    render(<Hoje />);
    fireEvent.click(await screen.findByTitle("Concluir"));
    await waitFor(() => expect(espias.toastOk).toHaveBeenCalled());
    const [msg, opcoes] = espias.toastOk.mock.calls[0];
    expect(msg).toBe("Concluída: Arte do feed");
    expect(opcoes.action.label).toBe("Desfazer");
    await opcoes.action.onClick();
    expect(espias.chamar).toHaveBeenLastCalledWith("/api/tasks/update", { id: "t1", status: "pending" });
  });

  it("falha: mostra o motivo do servidor, não uma frase genérica", async () => {
    espias.chamar.mockImplementation(async (url: string) => url.startsWith("/api/reunioes")
      ? { ok: true, data: { reunioes: [], historico: [] }, erro: null, status: 200 }
      : { ok: false, data: null, erro: "Sua sessão expirou. Faça login de novo.", status: 401 });
    useOperationalStore.setState({ initialized: true, tarefasErro: null, tasks: [tarefa()] });
    render(<Hoje />);
    fireEvent.click(await screen.findByTitle("Concluir"));
    await waitFor(() => expect(espias.toastErro).toHaveBeenCalledWith("Não concluí a tarefa: Sua sessão expirou. Faça login de novo."));
  });
});

describe("Editar tarefa (13.5)", () => {
  it("só o que mudou vai para o servidor; prazo apagado vai como '' (vira null)", () => {
    const antes = tarefa() as unknown as Parameters<typeof mudancasDaTarefa>[0];
    const depois = { ...antes, title: "Arte do story", dueDate: undefined } as never;
    expect(mudancasDaTarefa(antes, depois)).toEqual({ title: "Arte do story", dueDate: "" });
    expect(erroDaEdicao({ title: "  " })).toMatch(/título/);
  });

  it("a lista tem 'Editar' e o formulário abre preenchido", () => {
    useOperationalStore.setState({ initialized: true, tarefasErro: null, tasks: [tarefa()] });
    render(<Tarefas />);
    fireEvent.click(screen.getByRole("button", { name: "Editar a tarefa Arte do feed" }));
    expect(screen.getByRole("dialog", { name: "Editar tarefa" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Arte do feed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
  });

  it("rota: título vazio é recusado; prazo '' vira null; troca de pessoa avisa quem recebe", async () => {
    const vazio = await rotaUpdate.POST(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ id: "t1", title: "" }) }));
    expect(vazio.status).toBe(400);

    espias.linhas = [{ title: "Arte do feed", assigned_to: "Ana Exemplo", client_id: "k1", client_name: "Cliente Exemplo", due_date: null }];
    const ok = await rotaUpdate.POST(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ id: "t1", dueDate: "", assignedTo: "Bruna Exemplo", role: "designer" }) }));
    expect(ok.status).toBe(200);
    expect(espias.updates[0]).toMatchObject({ due_date: null, assigned_to: "Bruna Exemplo", role: "designer" });
    expect(espias.avisos[0]).toMatchObject({ target_user: "Bruna Exemplo", title: "📋 Tarefa passada pra você" });
  });
});
