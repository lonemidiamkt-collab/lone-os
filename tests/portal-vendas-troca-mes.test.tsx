// tests/portal-vendas-troca-mes.test.tsx — 24/10/2026, auditoria de erro recuperável, itens 1.7 e 1.8.
//   1.7 Trocar de mês e a leitura falhar deixava os números do mês ANTERIOR com o nome do novo.
//   1.8 "1.500" virava R$ 1,50: agora o campo mostra "Vai salvar R$ 1.500,00" e manda o número.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VendasDoCliente from "@/components/trafego/vendas/VendasDoCliente";
import { resumoVendas, type RespostaVendasCliente } from "@/lib/trafego/vendas";

const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const mesAtual = hoje.slice(0, 7);
const [y, m] = mesAtual.split("-").map(Number);
const mesPassado = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;

function resposta(quantidade: number): RespostaVendasCliente {
  const vendas = [{
    id: `v${quantidade}`, client_id: "c1", sold_on: hoje, quantity: quantidade, amount: 1000, channel: "whatsapp",
    note: null, source: "portal" as const, created_by: null, created_at: `${hoje}T12:00:00Z`,
  }];
  return { disponivel: true, desde: `${mesAtual}-01`, ate: hoje, vendas, resumo: resumoVendas(vendas, [100]) };
}

afterEach(() => { vi.unstubAllGlobals(); });

async function valorDoKpi(rotulo: string): Promise<HTMLElement> {
  const el = await screen.findByText(rotulo);
  return el.parentElement as HTMLElement;
}

describe("Portal › Vendas ao trocar de mês", () => {
  it("falha no mês novo: os números do mês anterior saem da tela, aparece o erro com 'Tentar de novo'", async () => {
    let falharMesPassado = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes(`mes=${mesPassado}`)) {
        if (falharMesPassado) return new Response(JSON.stringify({ error: "Banco fora do ar." }), { status: 503 });
        return new Response(JSON.stringify(resposta(5)), { status: 200 });
      }
      return new Response(JSON.stringify(resposta(2)), { status: 200 });
    }));

    render(<VendasDoCliente token="tok" permitirLancar={false} />);
    expect(await valorDoKpi("Vendas")).toHaveTextContent("2");

    fireEvent.change(screen.getByLabelText("Mês"), { target: { value: mesPassado } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não consegui carregar as vendas de/);
    // O "2" do mês atual não pode continuar na tela com o nome do mês passado.
    expect(screen.queryByText("Vendas")).not.toBeInTheDocument();

    falharMesPassado = false;
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(await valorDoKpi("Vendas")).toHaveTextContent("5");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Portal › Vendas — valor com ponto de milhar", () => {
  it("'1.500' mostra 'Vai salvar R$ 1.500,00' e grava 1500, não 1,50", async () => {
    const chamadas: { url: string; corpo: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        chamadas.push({ url, corpo: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(resposta(1)), { status: 200 });
    }));

    render(<VendasDoCliente token="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: /Registrar venda/ }));
    const campo = screen.getByLabelText(/Valor total/);
    fireEvent.change(campo, { target: { value: "1.500" } });
    expect(screen.getByText(/Vai salvar R\$\s1\.500,00/)).toBeInTheDocument();

    fireEvent.blur(campo);
    expect(campo).toHaveValue("1.500,00");

    fireEvent.click(screen.getByRole("button", { name: /Salvar venda/ }));
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0].corpo).toMatchObject({ amount: 1500 });
  });

  it("valor que não dá para entender trava o Salvar e diz como escrever", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(resposta(1)), { status: 200 })));
    render(<VendasDoCliente token="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: /Registrar venda/ }));
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: "1.50.0" } });
    expect(screen.getByText(/Não entendi o valor. Escreva assim: 1.500,00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar venda/ })).toBeDisabled();
  });
});
