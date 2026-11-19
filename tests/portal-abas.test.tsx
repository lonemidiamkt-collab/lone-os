// tests/portal-abas.test.tsx — troca de aba do Painel de Resultados (05/11/2026).
// Em produção, sair de "Anúncios" deixava a tela vazia: a saída animada da aba travava e a nova nunca
// entrava. Aqui: cada aba aparece na hora, e "Conteúdo e envios" tem o envio de material (fora do Instagram).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/api/chamar", () => ({ chamar: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/components/portal/PortalInstagram", () => ({
  default: () => <div>RELATORIO_INSTAGRAM</div>,
  IG_PERIODOS: [{ valor: "7d", rotulo: "7 dias", dias: 7 }],
}));
vi.mock("@/components/portal/PortalResumo", () => ({ default: () => <div>VISAO_GERAL</div> }));
vi.mock("@/components/portal/PortalAgenda", () => ({ default: () => <div>AGENDA</div> }));
vi.mock("@/components/portal/PortalContent", () => ({ default: () => <div>ARTES</div> }));
vi.mock("@/components/portal/PortalUpload", () => ({ default: () => <div>ENVIAR_MATERIAL</div> }));
vi.mock("@/components/portal/PortalMateriais", () => ({ default: () => <div>MEUS_ENVIOS</div> }));
vi.mock("@/components/trafego/vendas/VendasDoCliente", () => ({ default: () => <div>VENDAS</div> }));
vi.mock("@/components/ui/ThemeToggle", () => ({ ThemeToggle: () => null }));

const { default: PortalDashboard } = await import("@/components/portal/PortalDashboard");

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => { window.history.replaceState(null, "", "/portal/t"); window.scrollTo = (() => {}) as typeof window.scrollTo; });

const props = { token: "t", clientId: "c", clientName: "Loja Teste", whatsappPhone: "", welcomeMessage: null, initialData: null, hasAds: true, hasSocial: true };

/** O menu lateral (computador) e a barra (celular) existem juntos no teste — o CSS é que esconde um. Usa o 1º. */
const area = (nome: RegExp) => within(screen.getAllByRole("navigation", { name: "Áreas do painel" })[0]).getByRole("button", { name: nome });

describe("abas do painel", () => {
  it("de Anúncios para Crescimento nas redes e Conteúdo e envios: a aba nova aparece na hora", () => {
    render(<PortalDashboard {...props} />);
    fireEvent.click(area(/Crescimento nas redes/));
    expect(screen.getByText("RELATORIO_INSTAGRAM")).toBeInTheDocument();
    expect(screen.queryByText("ENVIAR_MATERIAL")).toBeNull(); // envio saiu do relatório do Instagram

    fireEvent.click(area(/Conteúdo e envios/));
    expect(screen.getByText("ENVIAR_MATERIAL")).toBeInTheDocument();
    expect(screen.getByText("AGENDA")).toBeInTheDocument();
    expect(screen.queryByText("RELATORIO_INSTAGRAM")).toBeNull();
    expect(screen.queryByRole("group", { name: "Período" })).toBeNull(); // conteúdo não tem filtro de período

    fireEvent.click(area(/Anúncios/));
    expect(screen.getByRole("group", { name: "Período" })).toBeInTheDocument();
  });

  it("só anúncios: sem menu de áreas", () => {
    render(<PortalDashboard {...props} hasSocial={false} />);
    expect(screen.queryByRole("navigation", { name: "Áreas do painel" })).toBeNull();
  });

  it("a área aberta é marcada no menu lateral e na barra do celular", () => {
    render(<PortalDashboard {...props} />);
    fireEvent.click(area(/Crescimento nas redes/));
    const marcados = screen.getAllByRole("button", { current: "page" });
    expect(marcados).toHaveLength(2);
    marcados.forEach((b) => expect(b).toHaveAccessibleName(/Crescimento nas redes/));
  });
});

describe("período único e endereço", () => {
  it("abre na área e no período do endereço", () => {
    render(<PortalDashboard {...props} abaInicial="social" periodoInicial="14d" />);
    expect(screen.getByText("RELATORIO_INSTAGRAM")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Período" })).getByRole("button", { name: "14 dias" })).toHaveAttribute("aria-pressed", "true");
  });

  it("cada área oferece só o período que a fonte dela responde, e o período escolhido acompanha a troca", () => {
    render(<PortalDashboard {...props} />);
    const periodos = () => within(screen.getByRole("group", { name: "Período" }));
    fireEvent.click(area(/Anúncios/));
    expect(periodos().getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    expect(periodos().queryByRole("button", { name: "30 dias" })).toBeNull();

    fireEvent.click(periodos().getByRole("button", { name: "14 dias" }));
    fireEvent.click(area(/Crescimento nas redes/));
    expect(periodos().getByRole("button", { name: "14 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(periodos().queryByRole("button", { name: "Hoje" })).toBeNull(); // o Instagram não tem "Hoje"
    expect(window.location.search).toBe("?aba=social&p=14d");

    // "30 dias" só existe no Instagram: de volta aos anúncios, cai em 7 dias (nunca outro recorte sob o rótulo).
    fireEvent.click(periodos().getByRole("button", { name: "30 dias" }));
    fireEvent.click(area(/Anúncios/));
    expect(periodos().getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?aba=ads");
  });

  it("trocar o período em outra área e voltar aos anúncios busca o período novo", async () => {
    const { chamar } = await import("@/lib/api/chamar");
    vi.mocked(chamar).mockClear();
    render(<PortalDashboard {...props} />);
    fireEvent.click(area(/Crescimento nas redes/));
    fireEvent.click(within(screen.getByRole("group", { name: "Período" })).getByRole("button", { name: "14 dias" }));
    expect(chamar).not.toHaveBeenCalled();
    fireEvent.click(area(/Anúncios/));
    expect(chamar).toHaveBeenCalledWith("/api/portal/t/snapshot", { period_kind: "last_2_weeks" });
  });
});

describe("visão geral", () => {
  it("com dois canais ou mais o painel abre na Visão geral, com 7 e 14 dias", () => {
    render(<PortalDashboard {...props} />);
    expect(screen.getByText("VISAO_GERAL")).toBeInTheDocument();
    const periodos = within(screen.getByRole("group", { name: "Período" }));
    expect(periodos.getAllByRole("button").map((b) => b.textContent)).toEqual(["7 dias", "14 dias"]);
    expect(window.location.search).toBe("");
  });

  it("com um canal só não existe Visão geral: abre direto na área dele", () => {
    render(<PortalDashboard {...props} hasSocial={false} hasGoogle={false} />);
    expect(screen.queryByText("VISAO_GERAL")).toBeNull();
  });

  it("seis áreas: a barra do celular mostra quatro e guarda as outras em Mais", () => {
    render(<PortalDashboard {...props} hasGoogle hasCrm />);
    const barra = within(screen.getAllByRole("navigation", { name: "Áreas do painel" })[1]);
    expect(barra.queryByRole("button", { name: "Conteúdo e envios" })).toBeNull();
    fireEvent.click(barra.getByRole("button", { name: "Mais áreas" }));
    fireEvent.click(barra.getByRole("button", { name: "Conteúdo e envios" }));
    expect(screen.getByText("ENVIAR_MATERIAL")).toBeInTheDocument();
    expect(barra.queryByRole("button", { name: "Conteúdo e envios" })).toBeNull(); // fechou
  });
});
