// tests/portal-abas.test.tsx — as sete áreas do Painel de Resultados (Lone Results 3.0, 19/11/2026).
// O menu é o do protótipo: Visão geral, Meta Ads, Google Ads, Google Maps, Instagram, Conteúdo e entregas, Vendas —
// sempre as sete. Canal que o cliente não tem mostra a página "ainda não ativo", nunca some nem vira zero.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/api/chamar", () => ({ chamar: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/components/portal/PortalInstagram", () => ({ default: () => <div>RELATORIO_INSTAGRAM</div> }));
vi.mock("@/components/portal/PortalResumo", () => ({ default: () => <div>VISAO_GERAL</div> }));
vi.mock("@/components/portal/PortalGoogle", () => ({ default: ({ parte }: { parte?: string }) => <div>GOOGLE_{parte}</div> }));
vi.mock("@/components/portal/PortalCrm", () => ({ default: () => <div>ATENDIMENTO_CRM</div> }));
vi.mock("@/components/portal/PortalAgenda", () => ({ default: () => <div>AGENDA</div> }));
vi.mock("@/components/portal/PortalContent", () => ({ default: () => <div>ARTES</div> }));
vi.mock("@/components/portal/PortalUpload", () => ({ default: () => <div>ENVIAR_MATERIAL</div> }));
vi.mock("@/components/portal/PortalMateriais", () => ({ default: () => <div>MEUS_ENVIOS</div> }));
vi.mock("@/components/portal/PortalInstalar", () => ({ default: () => null }));
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

const props = { token: "t", clientId: "c", clientName: "Loja Teste", whatsappPhone: "", welcomeMessage: null, initialData: null, hasAds: true, hasSocial: true, hasGoogleAds: true, hasGoogleMaps: true };

/** O menu lateral (computador) e a barra (celular) existem juntos no teste — o CSS é que esconde um. Usa o 1º. */
const menu = () => within(screen.getAllByRole("navigation", { name: "Áreas do painel" })[0]);
const area = (nome: string) => menu().getByRole("button", { name: new RegExp(`^${nome}`) });
const periodos = () => within(screen.getByRole("group", { name: "Período" }));

describe("menu do protótipo", () => {
  it("as sete áreas, com os nomes do protótipo, para qualquer cliente", () => {
    render(<PortalDashboard {...props} hasAds={false} hasSocial={false} hasGoogleAds={false} hasGoogleMaps={false} />);
    expect(menu().getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Visão geral", "Meta Ads", "Google Ads", "Google Maps", "Instagram", "Conteúdo e entregas", "VendasRegistro",
    ]);
  });

  it("abre na Visão geral; cada área aparece na hora ao tocar", () => {
    render(<PortalDashboard {...props} />);
    expect(screen.getByText("VISAO_GERAL")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Loja Teste");

    fireEvent.click(area("Instagram"));
    expect(screen.getByText("RELATORIO_INSTAGRAM")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Instagram");
    expect(screen.queryByText("ENVIAR_MATERIAL")).toBeNull();

    fireEvent.click(area("Conteúdo e entregas"));
    expect(screen.getByText("ENVIAR_MATERIAL")).toBeInTheDocument();
    expect(screen.getByText("AGENDA")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Período" })).toBeNull(); // conteúdo não tem filtro de período

    fireEvent.click(area("Google Ads"));
    expect(screen.getByText("GOOGLE_anuncios")).toBeInTheDocument();
    fireEvent.click(area("Google Maps"));
    expect(screen.getByText("GOOGLE_negocio")).toBeInTheDocument();
  });

  it("a área aberta é marcada no menu lateral e na barra do celular", () => {
    render(<PortalDashboard {...props} />);
    fireEvent.click(area("Meta Ads"));
    const marcados = screen.getAllByRole("button", { current: "page" });
    expect(marcados).toHaveLength(2);
    marcados.forEach((b) => expect(b).toHaveAccessibleName(/Meta Ads/));
  });

  it("barra do celular: quatro áreas à vista e as outras em Mais", () => {
    render(<PortalDashboard {...props} />);
    const barra = within(screen.getAllByRole("navigation", { name: "Áreas do painel" })[1]);
    expect(barra.queryByRole("button", { name: "Vendas" })).toBeNull();
    fireEvent.click(barra.getByRole("button", { name: "Mais áreas" }));
    fireEvent.click(barra.getByRole("button", { name: /^Vendas/ }));
    expect(screen.getByText("VENDAS")).toBeInTheDocument();
    expect(barra.queryByRole("button", { name: /^Vendas/ })).toBeNull(); // fechou
  });
});

describe("canal que o cliente ainda não tem", () => {
  it("continua no menu e explica como ativar — sem número, sem filtro de período", () => {
    render(<PortalDashboard {...props} hasAds={false} hasSocial={false} hasGoogleAds={false} hasGoogleMaps={false} />);

    fireEvent.click(area("Meta Ads"));
    expect(screen.getByRole("heading", { name: "Seus anúncios ainda não estão no ar" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Período" })).toBeNull();

    fireEvent.click(area("Google Ads"));
    expect(screen.getByRole("heading", { name: "Você ainda não anuncia no Google com a Lone" })).toBeInTheDocument();
    expect(screen.queryByText(/GOOGLE_/)).toBeNull();

    fireEvent.click(area("Google Maps"));
    expect(screen.getByRole("heading", { name: "Seu perfil no Google ainda não está ligado ao painel" })).toBeInTheDocument();
    expect(screen.getAllByText("Aguardando ativação")).toHaveLength(4);

    fireEvent.click(area("Instagram"));
    expect(screen.getByRole("heading", { name: "Seu Instagram ainda não está conectado ao painel" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Falar com a Lone pelo WhatsApp" }).length).toBeGreaterThan(1);
  });
});

describe("vendas", () => {
  it("área própria com o registro de vendas; o atendimento do CRM entra quando o cliente tem CRM", () => {
    const { unmount } = render(<PortalDashboard {...props} abaInicial="vendas" />);
    expect(screen.getByText("VENDAS")).toBeInTheDocument();
    expect(screen.queryByText("ATENDIMENTO_CRM")).toBeNull();
    expect(screen.getByText("Como chegar ao retorno real")).toBeInTheDocument();
    unmount();

    render(<PortalDashboard {...props} abaInicial="vendas" hasCrm />);
    expect(screen.getByText("ATENDIMENTO_CRM")).toBeInTheDocument();
  });

  it("o registro de vendas saiu da área de anúncios", () => {
    render(<PortalDashboard {...props} abaInicial="ads" />);
    expect(screen.queryByText("VENDAS")).toBeNull();
  });
});

describe("período único e endereço", () => {
  it("abre na área e no período do endereço", () => {
    render(<PortalDashboard {...props} abaInicial="social" periodoInicial="14d" />);
    expect(screen.getByText("RELATORIO_INSTAGRAM")).toBeInTheDocument();
    expect(periodos().getByRole("button", { name: "14 dias" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Visão geral: 7 e 14 dias, e o endereço padrão fica limpo", () => {
    render(<PortalDashboard {...props} />);
    expect(periodos().getAllByRole("button").map((b) => b.textContent)).toEqual(["7 dias", "14 dias"]);
    expect(window.location.search).toBe("");
  });

  it("cada área oferece só o período que a fonte dela responde, e o período escolhido acompanha a troca", () => {
    render(<PortalDashboard {...props} />);
    fireEvent.click(area("Meta Ads"));
    expect(periodos().getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    expect(periodos().queryByRole("button", { name: "30 dias" })).toBeNull();

    fireEvent.click(periodos().getByRole("button", { name: "14 dias" }));
    fireEvent.click(area("Instagram"));
    expect(periodos().getByRole("button", { name: "14 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(periodos().queryByRole("button", { name: "Hoje" })).toBeNull(); // o Instagram não tem "Hoje"
    expect(window.location.search).toBe("?aba=social&p=14d");

    // "30 dias" só existe no Instagram: de volta aos anúncios, cai em 7 dias (nunca outro recorte sob o rótulo).
    fireEvent.click(periodos().getByRole("button", { name: "30 dias" }));
    fireEvent.click(area("Meta Ads"));
    expect(periodos().getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?aba=ads");
  });

  it("trocar o período em outra área e voltar aos anúncios busca o período novo", async () => {
    const { chamar } = await import("@/lib/api/chamar");
    vi.mocked(chamar).mockClear();
    render(<PortalDashboard {...props} />);
    fireEvent.click(area("Instagram"));
    fireEvent.click(periodos().getByRole("button", { name: "14 dias" }));
    expect(chamar).not.toHaveBeenCalled();
    fireEvent.click(area("Meta Ads"));
    expect(chamar).toHaveBeenCalledWith("/api/portal/t/snapshot", { period_kind: "last_2_weeks" });
  });
});
