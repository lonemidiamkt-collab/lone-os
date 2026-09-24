import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { PainelComparativo } from "@/components/ui/painel-comparativo";

beforeAll(() => {
  // jsdom não tem ResizeObserver (recharts) nem matchMedia (framer-motion).
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const serie = [
  { rotulo: "Jan", atual: 100, anterior: 80 },
  { rotulo: "Fev", atual: null, anterior: 90 },
  { rotulo: "Mar", atual: 124, anterior: 100 },
];

describe("PainelComparativo", () => {
  it("carregando mostra esqueleto, sem números", () => {
    const { container } = render(<PainelComparativo titulo="Faturamento" serie={serie} kpis={[{ rotulo: "Vendas", valor: "42", variacaoPct: 10 }]} carregando />);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(screen.queryByText("42")).toBeNull();
  });

  it("erro aparece como alerta e nunca como zero", () => {
    render(<PainelComparativo titulo="Faturamento" serie={serie} kpis={[{ rotulo: "Vendas", valor: "0", variacaoPct: null }]} erro="Falhou a leitura." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Falhou a leitura.");
    expect(screen.queryByText("0")).toBeNull();
  });

  it("sem série e sem KPIs mostra a mensagem de vazio", () => {
    render(<PainelComparativo titulo="Faturamento" serie={[]} kpis={[]} vazio="Nada lançado ainda." />);
    expect(screen.getByText("Nada lançado ainda.")).toBeInTheDocument();
  });

  it("KPI respeita a natureza: queda de custo é melhora", () => {
    render(
      <PainelComparativo titulo="Conversas" serie={serie} kpis={[
        { rotulo: "Conversas", valor: "48", variacaoPct: 24, natureza: "direta" },
        { rotulo: "Custo por conversa", valor: "R$ 4,20", variacaoPct: -20, natureza: "inversa" },
        { rotulo: "Investido", valor: "R$ 200", variacaoPct: 30, natureza: "neutra" },
      ]} destaque={{ texto: "Conversas subiram 24%.", tom: "bom" }} />,
    );
    expect(screen.getByText("Conversas subiram 24%.")).toBeInTheDocument();
    expect(screen.getByText("+24%").closest("span")).toHaveTextContent("(melhorou)");
    expect(screen.getByText("−20%").closest("span")).toHaveTextContent("(melhorou)");
    expect(screen.getByText("+30%").closest("span")).toHaveTextContent("(estável)");
  });

  it("meta sem veredito esconde % e barra; com veredito mostra o progresso", () => {
    const { rerender } = render(
      <PainelComparativo titulo="F" serie={serie} kpis={[]} meta={{ rotulo: "Meta", atual: 50, alvo: 100, pendente: "Aguardando" }} />,
    );
    expect(screen.getByText("Aguardando")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    rerender(<PainelComparativo titulo="F" serie={serie} kpis={[]} meta={{ rotulo: "Meta", atual: 50, alvo: 100 }} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });
});
