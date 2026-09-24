import { describe, it, expect, beforeAll } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import AnunciosAtivos from "@/components/portal/AnunciosAtivos";
import PublicoCard from "@/components/portal/PublicoCard";
import EvolucaoDiaria from "@/components/portal/EvolucaoDiaria";
import type { ActiveAdsList } from "@/lib/portal/types";

beforeAll(() => {
  // jsdom não tem ResizeObserver (recharts) nem matchMedia (framer-motion).
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const LISTA: ActiveAdsList = {
  total: 3,
  with_messages: 2,
  items: [
    { id: "a1", name: "Vídeo promoção", thumbnail_url: null, thumbnail_path: null, messages: 20, spend: 100, cpa: 5, clicks: 40 },
    { id: "a2", name: "Carrossel", thumbnail_url: null, thumbnail_path: null, messages: 10, spend: 20, cpa: 2, clicks: 30 },
    { id: "a3", name: "Arte parada", thumbnail_url: null, thumbnail_path: null, messages: 0, spend: 0, cpa: null, clicks: 0 },
  ],
};

describe("AnunciosAtivos — 'Ver todos os anúncios ativos'", () => {
  it("o botão mostra quantos estão no ar e abre a lista completa, sem esconder quem não trouxe conversa", () => {
    render(<AnunciosAtivos lista={LISTA} periodo="last_week" />);
    const botao = screen.getByRole("button", { name: /ver todos os anúncios ativos/i });
    expect(botao).toHaveTextContent("3");
    fireEvent.click(botao);

    const gaveta = screen.getByRole("dialog");
    expect(within(gaveta).getByText("Anúncios ativos")).toBeInTheDocument();
    expect(within(gaveta).getByText(/com os números dos últimos 7 dias/i)).toBeInTheDocument();
    expect(within(gaveta).getAllByRole("listitem")).toHaveLength(3);
    expect(within(gaveta).getByText("Sem veiculação no período")).toBeInTheDocument();
  });

  it("ordena por mais conversas ou por menor custo", () => {
    render(<AnunciosAtivos lista={LISTA} periodo="last_week" />);
    fireEvent.click(screen.getByRole("button", { name: /ver todos os anúncios ativos/i }));
    const gaveta = screen.getByRole("dialog");
    const nomes = () => within(gaveta).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);

    expect(nomes()).toEqual(["Vídeo promoção", "Carrossel", "Arte parada"]);
    fireEvent.click(within(gaveta).getByRole("button", { name: "Menor custo" }));
    expect(nomes()).toEqual(["Carrossel", "Vídeo promoção", "Arte parada"]);
    expect(within(gaveta).getByRole("button", { name: "Menor custo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("lista limitada avisa quantos existem no total", () => {
    render(<AnunciosAtivos lista={{ ...LISTA, total: 80 }} periodo="this_month" />);
    fireEvent.click(screen.getByRole("button", { name: /ver todos os anúncios ativos/i }));
    expect(screen.getByText(/Mostrando os 3 que mais renderam, de 80 anúncios ativos/)).toBeInTheDocument();
  });
});

describe("PublicoCard — mesmo componente nas duas abas", () => {
  it("faixa etária com percentual em cada barra, na ordem de idade, e gênero", () => {
    render(
      <PublicoCard
        titulo="Quem está vendo seus anúncios"
        genero={{ mulheres: 62, homens: 38 }}
        idades={[{ faixa: "35-44", pct: 30 }, { faixa: "25-34", pct: 45 }, { faixa: "18-24", pct: 25 }]}
      />,
    );
    const faixas = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(faixas).toEqual(["18-2425%", "25-3445%", "35-4430%"]);
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
  });

  it("cidades aparecem quando vêm (público do perfil)", () => {
    render(<PublicoCard titulo="Público do perfil" idades={[]} cidades={[{ nome: "Cabo Frio", pct: 41.2 }]} />);
    expect(screen.getByText("Cabo Frio")).toBeInTheDocument();
    expect(screen.getByText("41%")).toBeInTheDocument();
  });
});

describe("EvolucaoDiaria", () => {
  const dias = ["2026-09-20", "2026-09-21", "2026-09-22"];
  const series = { messages: [10, 29, 5], clicks: [100, 80, 60], spend: [50, 60, 70], reach: [800, 900, 1000] };

  it("resumo da aba em português, com unidade (nada de 'messages : 29')", () => {
    render(<EvolucaoDiaria dias={dias} series={series} anteriores={{ messages: [8, 20, 4] }} vazio="Sem dados." />);
    expect(screen.getByText("44 conversas")).toBeInTheDocument();
    expect(screen.getByText("seg, 21 set")).toBeInTheDocument();
    expect(screen.queryByText(/messages/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Investido" }));
    expect(screen.getByText(/^R\$\s180,00$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alcance" }));
    expect(screen.getByText("Média por dia")).toBeInTheDocument();
    expect(screen.getByText("900 pessoas")).toBeInTheDocument();
  });

  it("sem série mostra o aviso, não um gráfico vazio", () => {
    render(<EvolucaoDiaria dias={[]} series={{ messages: [], clicks: [], spend: [], reach: [] }} anteriores={{}} vazio="Aguardando os números…" />);
    expect(screen.getByText("Aguardando os números…")).toBeInTheDocument();
  });
});
