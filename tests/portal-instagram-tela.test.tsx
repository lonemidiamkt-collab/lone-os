// tests/portal-instagram-tela.test.tsx — aba "Crescimento nas redes" (04/11/2026).
// Abre com o número que veio no HTML (sem esperar a Meta), mostra "Atualizado em", trata a falha que
// agora chega com 200 + estado, e não chama de "nenhum post" o que a Meta não deixou ler.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
