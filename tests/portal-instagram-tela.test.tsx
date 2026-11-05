// tests/portal-instagram-tela.test.tsx — aba "Crescimento nas redes" (04/11/2026).
// Abre com o número que veio no HTML (sem esperar a Meta), mostra "Atualizado em", trata a falha que
// agora chega com 200 + estado, e não chama de "nenhum post" o que a Meta não deixou ler.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const chamar = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: chamar.fn }));

const { default: PortalInstagram } = await import("@/components/portal/PortalInstagram");
type IgSnapPortal = import("@/components/portal/PortalInstagram").IgSnapPortal;

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => { chamar.fn.mockReset(); });

const snap = (resumo: Record<string, unknown> = {}, extra: Partial<IgSnapPortal> = {}): IgSnapPortal => ({
  conta: { username: "lojateste", seguidores: 2500, posts: 120 },
  resumo: { alcance: 4321, alcanceJanelaDias: 7, seguidoresGanhos: 7, curtidas: 40, comentarios: 3, engajamento: 43, postsNoPeriodo: 2, ...resumo },
  posts: [], fonte: "owned", geradoEm: "2026-11-04T15:30:00Z", ...extra,
} as IgSnapPortal);

describe("PortalInstagram", () => {
  it("abre com o Instagram que veio pronto do servidor, sem buscar de novo", () => {
    render(<PortalInstagram token="t" clientId="c" period="7d" inicial={snap()} />);
    expect(screen.getByText("4.321")).toBeInTheDocument();
    expect(screen.getByText(/Atualizado em 04\/11, 12:30/)).toBeInTheDocument();
    expect(screen.getByText("+7 novos no período")).toBeInTheDocument();
    expect(chamar.fn).not.toHaveBeenCalled();
  });

  it("falha da Meta (200 + estado 'falha'): diz que falhou e oferece tentar de novo — nunca número", async () => {
    chamar.fn.mockResolvedValue({ ok: true, status: 200, erro: null, data: { mapped: true, estado: "falha", error: "x" } });
    render(<PortalInstagram token="t" clientId="c" period="30d" />);
    expect(await screen.findByText(/Não consegui buscar os números do Instagram agora/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it("carregando sem nada: esqueleto da aba inteira", () => {
    chamar.fn.mockReturnValue(new Promise(() => {}));
    render(<PortalInstagram token="t" clientId="c" period="14d" />);
    expect(screen.getByLabelText("Carregando os números do Instagram")).toBeInTheDocument();
  });

  it("posts que a Meta não deixou ler: sem 'nenhum post publicado', com aviso de leitura parcial", () => {
    render(<PortalInstagram token="t" clientId="c" period="7d" inicial={snap({ postsNoPeriodo: null }, { parcial: true, fonte: "parcial" })} />);
    expect(screen.queryByText(/Nenhum post publicado/)).toBeNull();
    expect(screen.getByText(/Parte dos números deste perfil não veio da Meta/)).toBeInTheDocument();
  });

  it("sem Instagram ligado: não pede ao cliente que resolva", async () => {
    chamar.fn.mockResolvedValue({ ok: false, status: 404, erro: "x", data: null });
    render(<PortalInstagram token="t" clientId="c" period="7d" />);
    expect(await screen.findByText("Seu Instagram ainda não está ligado a este painel")).toBeInTheDocument();
    expect(screen.queryByText(/Fala com a nossa equipe/)).toBeNull();
  });
});

describe("PortalInstagram — leva 1 do Painel v2", () => {
  const metricas = {
    atual: { views: 5200, alcance: 4321, interacoes: 90, toques: 13, entraram: 40, sairam: 12, posts: 3 },
    anterior: { views: 4000, alcance: 4500, interacoes: 60, toques: 10, entraram: 20, sairam: 5, posts: 5 },
    toquesPorBotao: [{ tipo: "TEXT", valor: 9 }, { tipo: "CALL", valor: 4 }],
    alcancePorFormato: [{ formato: "REELS", valor: 3000 }, { formato: "FEED", valor: 1000 }, { formato: "AD", valor: 50 }],
    pctNaoSeguidores: 62,
  };

  it("saldo real de seguidores, toques nos botões e comparação com o período anterior; sem taxa de engajamento", () => {
    render(<PortalInstagram token="t" clientId="c" period="7d" inicial={snap({}, { metricas } as Partial<IgSnapPortal>)} />);
    expect(screen.getByText("+28 no período · 40 entraram, 12 saíram")).toBeInTheDocument();
    expect(screen.getByText("Toques nos botões")).toBeInTheDocument();
    expect(screen.getAllByText("↑ 30%")).toHaveLength(2); // visualizações 5.200 × 4.000 e toques 13 × 10
    expect(screen.getByText("↑ 50%")).toBeInTheDocument(); // interações 90 × 60
    expect(screen.getByText("Mensagem / WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("62% de quem viu o perfil (anúncios incluídos) ainda não segue")).toBeInTheDocument();
    // A frase usa os números dos cartões (40 entraram), não o follower_count antigo (7).
    expect(screen.getByText(/40 seguidores novos/)).toBeInTheDocument();
    expect(screen.queryByText(/Taxa de engajamento/)).toBeNull();
    expect(screen.queryByText("Anúncios")).toBeNull(); // alcance por anúncio fica fora do orgânico
    expect(screen.getByText("5 no período anterior")).toBeInTheDocument();
  });

  it("explicação fica no '?' (abre ao tocar), não solta embaixo dos números", () => {
    render(<PortalInstagram token="t" clientId="c" period="7d" inicial={snap({}, { metricas } as Partial<IgSnapPortal>)} />);
    expect(screen.queryByText(/não some com o alcance do tráfego pago/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "O que é Pessoas alcançadas?" }));
    expect(screen.getByText(/não some com o alcance do tráfego pago/)).toBeInTheDocument();
  });
});
