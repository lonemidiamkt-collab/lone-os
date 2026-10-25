// tests/editar-cliente-so-o-que-mudou.test.tsx — 24/10/2026, auditoria de erro recuperável (item 3.1).
// O "Editar" da ficha abria antes de os dados completos chegarem (CPF, endereço e logins vêm depois,
// por /api/clients/[id]) e o "Salvar" mandava o formulário inteiro: o vazio do que não tinha carregado
// virava null e apagava o dado no banco. Agora o botão trava até carregar e o salvar manda só a diferença.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Client } from "@/lib/types";
import { formDoCliente, patchDoFormulario, soOQueMudou } from "@/lib/clients/editar-cliente";

const api = vi.hoisted(() => ({ chamar: vi.fn(), updateStore: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
vi.mock("@/stores/useClientsStore", () => ({
  useClientsStore: (sel: (s: { updateClient: typeof api.updateStore }) => unknown) => sel({ updateClient: api.updateStore }),
}));
vi.mock("@/lib/hooks/useTeamMembers", () => ({ useTeamMembers: () => ({ forField: () => [], members: [], loading: false }) }));
vi.mock("@/lib/context/RoleContext", () => ({ useRole: () => ({ role: "admin", currentUser: "Roberto" }) }));
vi.mock("sonner", () => { const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }); return { toast: t }; });

const { default: EditClientModal } = await import("@/components/EditClientModal");
const { default: CabecalhoCliente } = await import("@/components/client/ficha/CabecalhoCliente");

// Como a ficha mostra o cliente ANTES de /api/clients/[id] responder: a lista é magra, sem CPF,
// endereço nem logins.
const magro = {
  id: "c1", name: "Padaria do Zé", nomeFantasia: "Padaria do Zé", phone: "21 99999-0000",
  serviceType: "lone_growth", paymentMethod: "pix", industry: "Gastronomia", leadSource: "indicacao",
  assignedTraffic: "Ana", assignedSocial: "Carlos", assignedDesigner: "Rodrigo", postsGoal: 12,
} as unknown as Client;
const completo = { ...magro, cpfCnpj: "123.456.789-00", endereco: "Rua A, 1", facebookLogin: "ze@padaria.com", instagramLogin: "@padaria" } as Client;

describe("o salvar manda só o que mudou", () => {
  it("o bug: o formulário inteiro de um cliente magro apagava CPF, endereço e logins", () => {
    const tudo = patchDoFormulario(formDoCliente(magro), magro);
    expect(tudo.cpfCnpj).toBeNull();
    expect(tudo.endereco).toBeNull();
    expect(tudo.facebookLogin).toBeNull();
  });

  it("sem mexer em nada, não há nada a gravar", () => {
    const f = formDoCliente(completo);
    expect(soOQueMudou(f, { ...f }, completo)).toEqual({});
  });

  it("trocou só o WhatsApp: só o WhatsApp vai — CPF, endereço e logins nem entram no pedido", () => {
    const f = formDoCliente(magro);
    const mudou = soOQueMudou(f, { ...f, phone: "21 98888-1111" }, magro);
    expect(mudou).toEqual({ phone: "21 98888-1111" });
  });

  it("apagar de propósito continua possível: campo esvaziado vai como null", () => {
    const f = formDoCliente(completo);
    expect(soOQueMudou(f, { ...f, endereco: "  " }, completo)).toEqual({ endereco: null });
  });

  it("espaço sobrando não conta como mudança", () => {
    const f = formDoCliente(completo);
    expect(soOQueMudou(f, { ...f, cpfCnpj: " 123.456.789-00 " }, completo)).toEqual({});
  });

  it("o nome acompanha o nome fantasia; a conta Meta ganha o act_", () => {
    const f = formDoCliente(completo);
    expect(soOQueMudou(f, { ...f, nomeFantasia: "Padaria Zé & Filhos" }, completo))
      .toEqual({ name: "Padaria Zé & Filhos", nomeFantasia: "Padaria Zé & Filhos" });
    expect(soOQueMudou(f, { ...f, metaAdAccountId: "123" }, completo)).toEqual({ metaAdAccountId: "act_123" });
  });

  it("trocar para um serviço sem social tira o social (a regra derivada vale dos dois lados)", () => {
    const f = formDoCliente(completo);
    expect(soOQueMudou(f, { ...f, serviceType: "assessoria_trafego" }, completo))
      .toEqual({ serviceType: "assessoria_trafego", assignedSocial: "" });
  });
});

describe("modal Editar", () => {
  beforeEach(() => { api.chamar.mockReset(); api.updateStore.mockReset(); });

  it("Salvar grava só o campo alterado, pelo salvar que a ficha passa", async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<EditClientModal client={magro} salvar={salvar} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("(11) 99999-9999"), { target: { value: "21 98888-1111" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));
    await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
    expect(salvar).toHaveBeenCalledWith("c1", { phone: "21 98888-1111" });
    expect(api.updateStore).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("sem mudança, não grava nada", async () => {
    const salvar = vi.fn();
    const onClose = vi.fn();
    render(<EditClientModal client={completo} salvar={salvar} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(salvar).not.toHaveBeenCalled();
    expect(api.chamar).not.toHaveBeenCalled();
  });
});

describe("botão Editar da ficha trava até os dados completos chegarem", () => {
  const props = {
    client: completo, saude: { nivel: "saudavel" as const, score: 80 }, isAdmin: true, podePedirArte: true,
    onPedirArte: vi.fn(), onLinkOnboarding: vi.fn(), gerandoLink: false, linkCopiado: false,
  };

  it("carregando: travado, e diz por quê", () => {
    const onEditar = vi.fn();
    render(<CabecalhoCliente {...props} onEditar={onEditar} dadosParaEditar="carregando" />);
    const botao = screen.getByRole("button", { name: /editar/i });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("title", expect.stringMatching(/carregando/i));
  });

  it("falhou: continua travado e avisa que editar apagaria CPF, endereço e logins", () => {
    render(<CabecalhoCliente {...props} onEditar={vi.fn()} dadosParaEditar="erro" />);
    expect(screen.getByRole("button", { name: /editar/i })).toHaveAttribute("title", expect.stringMatching(/apagaria CPF, endereço e logins/));
  });

  it("carregou: libera", () => {
    const onEditar = vi.fn();
    render(<CabecalhoCliente {...props} onEditar={onEditar} dadosParaEditar="ok" />);
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(onEditar).toHaveBeenCalled();
  });
});
