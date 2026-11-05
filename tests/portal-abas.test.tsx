// tests/portal-abas.test.tsx — troca de aba do Painel de Resultados (05/11/2026).
// Em produção, sair de "Anúncios" deixava a tela vazia: a saída animada da aba travava e a nova nunca
// entrava. Aqui: cada aba aparece na hora, e "Conteúdo e envios" tem o envio de material (fora do Instagram).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/api/chamar", () => ({ chamar: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/components/portal/PortalInstagram", () => ({
  default: () => <div>RELATORIO_INSTAGRAM</div>,
  IG_PERIODOS: [{ valor: "7d", rotulo: "7 dias", dias: 7 }],
}));
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

const props = { token: "t", clientId: "c", clientName: "Loja Teste", whatsappPhone: "", welcomeMessage: null, initialData: null, hasAds: true, hasSocial: true };

describe("abas do painel", () => {
  it("de Anúncios para Crescimento nas redes e Conteúdo e envios: a aba nova aparece na hora", () => {
    render(<PortalDashboard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Crescimento nas redes/ }));
    expect(screen.getByText("RELATORIO_INSTAGRAM")).toBeInTheDocument();
    expect(screen.queryByText("ENVIAR_MATERIAL")).toBeNull(); // envio saiu do relatório do Instagram

    fireEvent.click(screen.getByRole("button", { name: /Conteúdo e envios/ }));
    expect(screen.getByText("ENVIAR_MATERIAL")).toBeInTheDocument();
    expect(screen.getByText("AGENDA")).toBeInTheDocument();
    expect(screen.queryByText("RELATORIO_INSTAGRAM")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Anúncios/ }));
    expect(screen.getByRole("group", { name: "Período dos anúncios" })).toBeInTheDocument();
  });

  it("só anúncios: sem seletor de abas", () => {
    render(<PortalDashboard {...props} hasSocial={false} />);
    expect(screen.queryByRole("group", { name: "O que ver" })).toBeNull();
  });
});
