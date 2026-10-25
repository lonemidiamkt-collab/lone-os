// tests/gestao-equipe-tela.test.tsx — 25/10/2026, onda 6 da auditoria de erro recuperável (8.1, 8.2, 8.6,
// 8.7, 8.8, 8.9) — a Gestão da Equipe como a pessoa usa.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const api = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/context/RoleContext", () => ({
  useRole: () => ({ role: "admin", currentProfile: { email: "lonemidiamkt@gmail.com", name: "Roberto Lino" } }),
}));

const { default: GestaoEquipe } = await import("@/components/equipe/GestaoEquipe");

const membro = (o: Record<string, unknown>) => ({
  role: "social", initials: "XX", is_active: true, deleted_at: null, whatsappFinal: null, situacao: "ativo",
  temLogin: true, loginBloqueado: false, duasEtapas: false, adminFixo: false, ...o,
});
const EQUIPE = [
  membro({ id: "tm-roberto", name: "Roberto Lino", email: "lonemidiamkt@gmail.com", role: "admin", adminFixo: true }),
  membro({ id: "tm-thiago", name: "Thiago", email: "thiago@lonemidia.com", whatsappFinal: "0700", duasEtapas: true }),
  membro({ id: "tm-pedro", name: "Pedro Henrique", email: "pedro@lonemidia.com", is_active: false, situacao: "desativado" }),
  membro({ id: "tm-ana", name: "Ana", email: "ana@lonemidia.com", is_active: false, deleted_at: "2026-10-01", situacao: "removido" }),
];

let respostas: Record<string, unknown>;
beforeEach(() => {
  api.chamar.mockReset();
  Object.values(toasts).forEach((f) => f.mockReset());
  respostas = {};
  api.chamar.mockImplementation(async (url: string, corpo?: Record<string, unknown>, init?: { method?: string }) => {
    const chave = `${init?.method ?? (corpo ? "POST" : "GET")} ${url}`;
    if (chave === "GET /api/team") return { ok: true, status: 200, erro: null, data: { team: EQUIPE } };
    return respostas[chave] ?? { ok: false, status: 500, erro: "sem resposta no teste", data: null };
  });
});

const linhaDe = async (nome: string) => (await screen.findByText(nome)).closest(".card") as HTMLElement;

describe("lista", () => {
  it("desativados e removidos aparecem, com Reativar e Restaurar (antes sumiam no F5)", async () => {
    render(<GestaoEquipe />);
    expect(await screen.findByRole("region", { name: "Desativados" })).toHaveTextContent("Pedro Henrique");
    expect(within(screen.getByRole("region", { name: "Desativados" })).getByRole("button", { name: /Reativar/ })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Removidos" })).getByRole("button", { name: /Restaurar/ })).toBeInTheDocument();
  });

  it("falha ao carregar aparece como falha, com Tentar de novo (não lista vazia)", async () => {
    api.chamar.mockResolvedValueOnce({ ok: false, status: 503, erro: "Não consegui ler a equipe agora.", data: null });
    render(<GestaoEquipe />);
    expect(await screen.findByText(/Não consegui carregar a equipe/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument();
  });
});

describe("desativar (8.1)", () => {
  it("pede confirmação COM O NOME; não aparece para a própria pessoa", async () => {
    render(<GestaoEquipe />);
    const eu = await linhaDe("Roberto Lino (você)");
    expect(within(eu).queryByTitle("Desativar acesso")).not.toBeInTheDocument();

    const thiago = await linhaDe("Thiago");
    fireEvent.click(within(thiago).getByTitle("Desativar acesso"));
    expect(within(thiago).getByRole("alertdialog")).toHaveTextContent(/Desativar Thiago\?/);
    expect(api.chamar).not.toHaveBeenCalledWith("/api/team", expect.objectContaining({ is_active: false }), expect.anything());

    respostas["PATCH /api/team"] = { ok: true, status: 200, erro: null, data: { member: { ...EQUIPE[1], is_active: false, situacao: "desativado" } } };
    fireEvent.click(within(thiago).getByRole("button", { name: /Desativar Thiago/ }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    // Desfazer no aviso.
    expect(toasts.success.mock.calls[0][1]).toMatchObject({ action: { label: "Desfazer" } });
  });

  it("recusa do servidor (ex.: último admin) aparece e a lista não muda", async () => {
    render(<GestaoEquipe />);
    const thiago = await linhaDe("Thiago");
    fireEvent.click(within(thiago).getByTitle("Desativar acesso"));
    respostas["PATCH /api/team"] = { ok: false, status: 400, erro: "Thiago é o último administrador ativo.", data: null };
    fireEvent.click(within(thiago).getByRole("button", { name: /Desativar Thiago/ }));
    expect(await screen.findByText(/Não desativei Thiago: Thiago é o último administrador ativo/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Desativados" })).toHaveTextContent("Pedro Henrique");
    expect(within(screen.getByRole("region", { name: "Desativados" })).queryByText("Thiago")).not.toBeInTheDocument();
  });
});

describe("remover (8.2)", () => {
  it("confirmação com nome e e-mail; Desfazer restaura com o WhatsApp que tinha", async () => {
    render(<GestaoEquipe />);
    const thiago = await linhaDe("Thiago");
    fireEvent.click(within(thiago).getByTitle("Remover"));
    expect(within(thiago).getByRole("alertdialog")).toHaveTextContent(/Remover Thiago \(thiago@lonemidia.com\)/);
    respostas["DELETE /api/team"] = { ok: true, status: 200, erro: null, data: { nome: "Thiago", whatsapp: "5522981530700", loginBloqueado: true } };
    fireEvent.click(within(thiago).getByRole("button", { name: /Remover Thiago/ }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    expect(await screen.findByRole("region", { name: "Removidos" })).toHaveTextContent("Thiago");

    respostas["POST /api/team"] = { ok: true, status: 200, erro: null, data: { member: EQUIPE[1] } };
    toasts.success.mock.calls[0][1].action.onClick();
    await waitFor(() => expect(api.chamar).toHaveBeenCalledWith("/api/team", { acao: "restaurar", id: "tm-thiago", whatsapp_phone: "5522981530700" }));
  });
});

describe("editar (8.6, 8.7, 8.8)", () => {
  it("e-mail é só leitura; senha curta é barrada no campo ANTES de gravar qualquer coisa", async () => {
    render(<GestaoEquipe />);
    const thiago = await linhaDe("Thiago");
    fireEvent.click(within(thiago).getByTitle("Editar"));
    expect(screen.queryByDisplayValue("thiago@lonemidia.com")).not.toBeInTheDocument(); // não é campo editável
    expect(screen.getByText(/O e-mail é o login e não muda aqui/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Thiago Souza" } });
    fireEvent.change(screen.getByLabelText(/Nova senha/), { target: { value: "123" } });
    expect(screen.getByText(/pelo menos 6 caracteres \(tem 3\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar Alterações/ })).toBeDisabled();
    expect(api.chamar).not.toHaveBeenCalledWith("/api/team", expect.objectContaining({ name: "Thiago Souza" }), expect.anything());
  });

  it("a lista só muda com a resposta do servidor; falha diz que nada foi salvo", async () => {
    render(<GestaoEquipe />);
    const thiago = await linhaDe("Thiago");
    fireEvent.click(within(thiago).getByTitle("Editar"));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Thiago Souza" } });
    respostas["PATCH /api/team"] = { ok: false, status: 409, erro: "esse WhatsApp já é de Carlos", data: null };
    fireEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Nada foi salvo: esse WhatsApp já é de Carlos/);
    expect(screen.queryByText("Thiago Souza")).not.toBeInTheDocument();
  });

  it("admin fixo: a tela avisa que a função não tira o acesso de admin", async () => {
    render(<GestaoEquipe />);
    const eu = await linhaDe("Roberto Lino (você)");
    expect(within(eu).getByText("Admin fixo")).toBeInTheDocument();
    fireEvent.click(within(eu).getByTitle("Editar"));
    fireEvent.change(screen.getByLabelText("Função"), { target: { value: "manager" } });
    expect(screen.getByText(/no servidor ele continua administrador/)).toBeInTheDocument();
  });
});

describe("duas etapas (8.9)", () => {
  it("admin zera a verificação de quem perdeu o celular, com confirmação", async () => {
    render(<GestaoEquipe />);
    const thiago = await linhaDe("Thiago");
    fireEvent.click(within(thiago).getByTitle(/Zerar verificação/));
    expect(within(thiago).getByRole("alertdialog")).toHaveTextContent(/perdeu ou trocou o celular/);
    respostas["POST /api/team/duas-etapas"] = { ok: true, status: 200, erro: null, data: { removidos: 1 } };
    fireEvent.click(within(thiago).getByRole("button", { name: "Zerar verificação" }));
    await waitFor(() => expect(api.chamar).toHaveBeenCalledWith("/api/team/duas-etapas", { id: "tm-thiago" }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
  });
});
