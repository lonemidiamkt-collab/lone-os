// tests/portal-vendas-investimento.test.tsx — 21/10/2026, auditoria de erro recuperável (item 1.4).
// O portal mostrava "Custo por venda R$ 0,00" e "R$ 0 investidos" quando o gasto ainda não tinha sido
// lido (todo dia 1º, mês sem metric_snapshots). Aqui a TELA do cliente: sem investimento apurado ela
// diz "—" e "investimento ainda não apurado"; gasto zero de verdade continua aparecendo como R$ 0.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VendasDoCliente from "@/components/trafego/vendas/VendasDoCliente";
import { resumoVendas, type RespostaVendasCliente } from "@/lib/trafego/vendas";

function respostaCom(gastoPorDia: number[] | null): RespostaVendasCliente {
  const vendas = [{
    id: "v1", client_id: "c1", sold_on: "2026-11-01", quantity: 2, amount: 1000, channel: "whatsapp",
    note: null, source: "portal" as const, created_by: null, created_at: "2026-11-01T12:00:00Z",
  }];
  return { disponivel: true, desde: "2026-11-01", ate: "2026-11-01", vendas, resumo: resumoVendas(vendas, gastoPorDia) };
}

function servir(r: RespostaVendasCliente) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(r), { status: 200 })));
}

afterEach(() => { vi.unstubAllGlobals(); });

/** O cartão (KPI) cujo rótulo é `rotulo`. */
async function kpi(rotulo: string): Promise<HTMLElement> {
  const el = await screen.findByText(rotulo);
  return el.parentElement as HTMLElement;
}

describe("Portal › Vendas — custo por venda sem gasto lido", () => {
  it("dia 1º / mês sem métrica: '—' e 'investimento ainda não apurado', nunca R$ 0,00", async () => {
    servir(respostaCom(null));
    render(<VendasDoCliente token="tok" permitirLancar={false} />);
    const custo = await kpi("Custo por venda");
    expect(custo).toHaveTextContent("—");
    expect(custo).toHaveTextContent("investimento ainda não apurado");
    expect(custo).not.toHaveTextContent("R$");
    expect(screen.queryByText(/investidos em anúncio/)).not.toBeInTheDocument();
  });

  it("gasto zero de verdade: continua mostrando R$ 0", async () => {
    servir(respostaCom([0, 0]));
    render(<VendasDoCliente token="tok" permitirLancar={false} />);
    const custo = await kpi("Custo por venda");
    expect(custo).toHaveTextContent(/R\$\s0,00/);
    expect(custo).toHaveTextContent(/R\$\s0 investidos em anúncio/);
  });

  it("com gasto lido: custo = investimento ÷ vendas", async () => {
    servir(respostaCom([100, 300]));
    render(<VendasDoCliente token="tok" permitirLancar={false} />);
    const custo = await kpi("Custo por venda");
    expect(custo).toHaveTextContent(/R\$\s200,00/);
    expect(custo).toHaveTextContent(/R\$\s400 investidos em anúncio/);
  });
});
