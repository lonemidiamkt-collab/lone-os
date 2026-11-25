// 25/11/2026: o designer vê a carteira inteira e traz a arte que ficou com outro; salvar a ficha não apaga o designer.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Client, ContentCard, DesignRequest } from "@/lib/types";
import { montarItens } from "@/lib/conteudo/quadro";
import { camposDaEquipe } from "@/lib/clients/editar-cliente";

const { passarArtes } = vi.hoisted(() => ({ passarArtes: vi.fn(async () => true) }));
vi.mock("@/lib/design/passar-artes", () => ({ passarArtes, oferecerPassarArtes: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: vi.fn(async () => ({ ok: true, data: null, erro: null, status: 200 })) }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/supabase/client", () => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }) };
  return { supabase: { from: () => q }, REALTIME_ENABLED: false };
});
const equipe = [{ id: "1", name: "Téo Braga" }, { id: "2", name: "Caio Lima" }];
vi.mock("@/lib/hooks/useTeamMembers", () => ({ useTeamMembers: () => ({ forField: () => equipe, members: equipe, loading: false, erro: null }) }));
vi.mock("@/components/clients/MarcaDoCliente", () => ({ default: () => null }));
vi.mock("@/components/client/ficha/CofreStatus", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
const { default: CarteiraDoDesigner } = await import("@/components/design/CarteiraDoDesigner");
const { default: DadosTab } = await import("@/components/client-tabs/DadosTab");

const clientes = [{ id: "c1", name: "Padaria Sol", assignedDesigner: "Téo Braga" }, { id: "c2", name: "Academia Lua", assignedDesigner: "Téo Braga" }];
const itens = (status = "queued") => montarItens(
  [{ id: "k1", title: "Post", clientId: "c1", status: "in_production", designRequestId: "1" }] as unknown as ContentCard[],
  [{ id: "1", clientId: "c1", status, assignedDesigner: "Caio Lima", contentCardId: "k1" }] as unknown as DesignRequest[], clientes);
const tela = (p: Partial<Parameters<typeof CarteiraDoDesigner>[0]> = {}) => render(<CarteiraDoDesigner pessoa="Téo Braga" minha papel="designer" clientes={clientes} itens={itens()} {...p} />);
beforeEach(() => { cleanup(); passarArtes.mockClear(); localStorage.clear(); });

describe("Seus clientes", () => {
  it("cliente sem arte aparece, e a arte que está com outro tem botão", async () => {
    tela();
    expect(screen.getByRole("link", { name: /Academia Lua/ })).toHaveAttribute("href", "/clients/c2");
    expect(screen.getByText(/1 arte aberta está em outra fila \(1 com Caio Lima\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Passar 1 para mim/ }));
    await waitFor(() => expect(passarArtes).toHaveBeenCalledWith("c1", ["1"], "Téo Braga"));
  });
  it("arte que o colega já começou: sem botão para o designer, com botão para a gestão", () => {
    tela({ itens: itens("in_progress") });
    expect(screen.queryByRole("button", { name: /Passar/ })).toBeNull();
    expect(screen.getByText(/para pegar, abra a arte e assuma/)).toBeInTheDocument();
    cleanup();
    tela({ itens: itens("in_progress"), papel: "admin", minha: false });
    expect(screen.getByRole("button", { name: /Passar 1 para Téo/ })).toBeInTheDocument();
  });
  it("a gestão lê quantas já começaram antes de passar", () => {
    tela({ itens: itens("in_progress"), papel: "admin", minha: false });
    expect(screen.getByText(/1 já começou/)).toBeInTheDocument();
  });
  it("o social vê, mas não passa", () => {
    tela({ papel: "social", minha: false });
    expect(screen.queryByRole("button", { name: /Passar/ })).toBeNull();
  });
  it("fechada, o aviso continua à vista; carteira vazia diz o nome procurado", () => {
    tela();
    fireEvent.click(screen.getByRole("button", { name: /Seus clientes/ }));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/em outra fila/)).toBeInTheDocument();
    cleanup(); localStorage.clear();
    tela({ pessoa: "Ninguém" });
    expect(screen.getByText("Ninguém")).toBeInTheDocument();
  });
});

describe("salvar a ficha não desfaz o que outra pessoa gravou", () => {
  const montar = (salvar: ReturnType<typeof vi.fn>, client: Partial<Client>) => (
    <DadosTab client={{ id: "c1", name: "Padaria", serviceType: "lone_growth", phone: "11 9", assignedDesigner: "", ...client } as unknown as Client} role="admin" currentUser="Chefe"
      updateClientData={salvar as never} onNavigateTab={vi.fn()} generateOnboardingLink={vi.fn()} generatingLink={false} dadosCompletos parte="cadastro" />);
  it("o bug: mudar o telefone mandava o designer vazio junto e apagava o que outra pessoa pôs", async () => {
    const salvar = vi.fn(async () => {});
    const { container, rerender } = render(montar(salvar, {}));
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    rerender(montar(salvar, { assignedDesigner: "Téo Braga" })); // outra pessoa pôs o designer com a ficha aberta
    const tel = [...container.querySelectorAll("input")].find((i) => i.value === "11 9")!;
    fireEvent.change(tel, { target: { value: "11 8" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
    expect(salvar).toHaveBeenCalledWith("c1", { phone: "11 8" });
    // E a ficha, fora da edição, mostra quem está lá de verdade.
    await waitFor(() => expect(screen.getByText("Téo Braga")).toBeInTheDocument());
  });
  it("nada mudou: não grava", async () => {
    const salvar = vi.fn(async () => {});
    render(montar(salvar, {}));
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Editar/ })).toBeInTheDocument());
    expect(salvar).not.toHaveBeenCalled();
  });
  it("cliente só de tráfego pode receber o primeiro designer", () => {
    for (const s of ["assessoria_trafego", "trafego_pago", "site"]) expect(camposDaEquipe(s, { assignedDesigner: "" } as Client).needsDesigner).toBe(true);
  });
});
