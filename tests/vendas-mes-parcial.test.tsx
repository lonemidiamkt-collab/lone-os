// tests/vendas-mes-parcial.test.tsx — 25/10/2026, onda 5 da auditoria de erro recuperável.
// Portal › Vendas com o mês pela metade: só alguns dias de métrica no metric_snapshots, o investimento
// somava menos que o real e o custo por venda saía bom demais — mostrado como se fosse o do mês.
// Agora o resumo diz quantos dias entraram e a tela mostra "investimento apurado até dd/mm (X de Y dias)".

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VendasDoCliente from "@/components/trafego/vendas/VendasDoCliente";
import {
  coberturaDoInvestimento, diasComMetricaDosClientes, fraseCobertura, gastoPorDiaDosClientes, investimentoParcial,
  janelaDoInvestimento, periodoDoMes, resumoVendas, type RespostaVendasCliente,
} from "@/lib/trafego/vendas";

const VENDAS = [{ quantity: 4, amount: 4000 }];

/** O mesmo caminho do servidor (vendas-server.ts): janela → linhas → gasto e dias → resumo. */
function resumoDoServidor(linhas: { client_id: string; metric_date: string; spend: number }[], mes: string, hoje: string) {
  const periodo = periodoDoMes(mes, hoje)!;
  const janela = janelaDoInvestimento(periodo.desde, periodo.ate, hoje);
  const lidas = janela ? linhas.filter((l) => l.metric_date >= janela.desde && l.metric_date <= janela.ate) : [];
  const gasto = gastoPorDiaDosClientes(lidas, "c1");
  const dias = diasComMetricaDosClientes(lidas, "c1");
  return resumoVendas(VENDAS, gasto.get("c1") ?? null, { ...periodo, diasComMetrica: dias.get("c1") ?? null });
}

function diasDe(mes: string, de: number, ate: number, spend = 100) {
  return Array.from({ length: ate - de + 1 }, (_, i) => ({
    client_id: "c1", metric_date: `${mes}-${String(de + i).padStart(2, "0")}`, spend,
  }));
}

describe("cobertura do investimento", () => {
  it("mês completo: todos os dias na soma → custo final, sem frase", () => {
    const r = resumoDoServidor(diasDe("2026-09", 1, 30), "2026-09", "2026-10-25");
    expect(r.investimento).toBe(3000);
    expect(r.cobertura).toEqual({ diasApurados: 30, diasNoPeriodo: 30, apuradoAte: "2026-09-30", completa: true });
    expect(investimentoParcial(r)).toBe(false);
    expect(fraseCobertura(r.cobertura)).toBeNull();
  });

  it("mês parcial (metric_snapshots só com 10 dias): diz até quando apurou e X de Y dias", () => {
    const r = resumoDoServidor(diasDe("2026-09", 1, 10), "2026-09", "2026-10-25");
    expect(r.investimento).toBe(1000);
    expect(r.custoPorVenda).toBe(250); // bom demais — por isso a tela chama de parcial
    expect(r.cobertura).toMatchObject({ diasApurados: 10, diasNoPeriodo: 30, apuradoAte: "2026-09-10", completa: false });
    expect(investimentoParcial(r)).toBe(true);
    expect(fraseCobertura(r.cobertura)).toBe("investimento apurado até 10/09 (10 de 30 dias)");
  });

  it("buraco no meio do mês também é parcial (dia sem leitura não entra na soma)", () => {
    const linhas = [...diasDe("2026-09", 1, 12), ...diasDe("2026-09", 20, 30)];
    const r = resumoDoServidor(linhas, "2026-09", "2026-10-25");
    expect(fraseCobertura(r.cobertura)).toBe("investimento apurado até 30/09 (23 de 30 dias)");
  });

  it("mês corrente: hoje ainda não fechou → parcial até ontem", () => {
    const r = resumoDoServidor(diasDe("2026-10", 1, 24), "2026-10", "2026-10-25");
    expect(fraseCobertura(r.cobertura)).toBe("investimento apurado até 24/10 (24 de 25 dias)");
  });

  it("sem métrica nenhuma: investimento null e cobertura null (a tela diz 'ainda não apurado')", () => {
    const r = resumoDoServidor([{ client_id: "outro", metric_date: "2026-09-05", spend: 80 }], "2026-09", "2026-10-25");
    expect(r.investimento).toBeNull();
    expect(r.custoPorVenda).toBeNull();
    expect(r.cobertura).toBeNull();
    expect(investimentoParcial(r)).toBe(false);
  });

  it("dia repetido conta uma vez; dia fora do período não conta", () => {
    expect(coberturaDoInvestimento(["2026-09-05", "2026-09-05T00:00:00", "2026-08-31"], "2026-09-01", "2026-09-02"))
      .toBeNull();
    expect(coberturaDoInvestimento(["2026-09-01", "2026-09-01"], "2026-09-01", "2026-09-02"))
      .toEqual({ diasApurados: 1, diasNoPeriodo: 2, apuradoAte: "2026-09-01", completa: false });
    expect(fraseCobertura({ diasApurados: 1, diasNoPeriodo: 1, apuradoAte: "2026-09-01", completa: true })).toBeNull();
  });

  it("sem período (chamada antiga) o resumo não inventa cobertura", () => {
    expect(resumoVendas(VENDAS, [100]).cobertura).toBeUndefined();
  });
});

// ─── A tela do portal ───────────────────────────────────────────────────────

function servir(resumo: ReturnType<typeof resumoVendas>) {
  const r: RespostaVendasCliente = {
    disponivel: true, desde: "2026-09-01", ate: "2026-09-30", resumo,
    vendas: [{ id: "v1", client_id: "c1", sold_on: "2026-09-05", quantity: 4, amount: 4000, channel: "whatsapp", note: null, source: "portal", created_by: null, created_at: "2026-09-05T12:00:00Z" }],
  };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(r), { status: 200 })));
}
afterEach(() => { vi.unstubAllGlobals(); });

async function kpi(rotulo: string): Promise<HTMLElement> {
  return (await screen.findByText(rotulo)).closest("div") as HTMLElement;
}

describe("Portal › Vendas — mês parcial", () => {
  it("mês parcial: custo marcado como parcial e a frase 'apurado até dd/mm (X de Y dias)'", async () => {
    servir(resumoDoServidor(diasDe("2026-09", 1, 10), "2026-09", "2026-10-25"));
    render(<VendasDoCliente token="tok" permitirLancar={false} />);
    const custo = await kpi("Custo por venda");
    expect(custo).toHaveTextContent(/parcial/);
    expect(custo).toHaveTextContent(/R\$\s1\.000 investidos até 10\/09/);
    expect(screen.getByRole("note")).toHaveTextContent("Investimento apurado até 10/09 (10 de 30 dias)");
    expect(screen.getByRole("note")).toHaveTextContent(/ainda não são os finais/);
  });

  it("mês completo: nada de parcial", async () => {
    servir(resumoDoServidor(diasDe("2026-09", 1, 30), "2026-09", "2026-10-25"));
    render(<VendasDoCliente token="tok" permitirLancar={false} />);
    const custo = await kpi("Custo por venda");
    expect(custo).toHaveTextContent(/R\$\s3\.000 investidos em anúncio/);
    expect(custo).not.toHaveTextContent(/parcial/);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("sem métrica: continua '—' e 'investimento ainda não apurado', sem frase de cobertura", async () => {
    servir(resumoDoServidor([], "2026-09", "2026-10-25"));
    render(<VendasDoCliente token="tok" permitirLancar={false} />);
    const custo = await kpi("Custo por venda");
    expect(custo).toHaveTextContent("investimento ainda não apurado");
    expect(custo).not.toHaveTextContent("R$");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
