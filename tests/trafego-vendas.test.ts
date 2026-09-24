// tests/trafego-vendas.test.ts — Leva 7A (N9): vendas do cliente × investimento (custo por venda).

import { describe, it, expect } from "vitest";
import { validarVenda, resumoVendas, periodoDoMes } from "@/lib/trafego/vendas";

const HOJE = "2026-09-24";

describe("vendas do cliente", () => {
  it("valida: data obrigatória, sem futuro, até 120 dias; quantidade 1–999; valor pt-BR ou com ponto", () => {
    expect(validarVenda({ soldOn: "" }, HOJE)).toMatchObject({ ok: false });
    expect(validarVenda({ soldOn: "2026-09-25" }, HOJE)).toMatchObject({ ok: false, erro: "A data da venda não pode ser no futuro." });
    expect(validarVenda({ soldOn: "2026-01-01" }, HOJE)).toMatchObject({ ok: false });
    expect(validarVenda({ soldOn: HOJE, quantity: 0 }, HOJE)).toMatchObject({ ok: false });
    const a = validarVenda({ soldOn: HOJE, quantity: "2", amount: "1.500,50", channel: "loja", note: "  sofá  " }, HOJE);
    expect(a).toEqual({ ok: true, venda: { soldOn: HOJE, quantity: 2, amount: 1500.5, channel: "loja", note: "sofá" } });
    const b = validarVenda({ soldOn: HOJE, amount: "R$ 1500.50", channel: "fax" }, HOJE);
    expect(b).toEqual({ ok: true, venda: { soldOn: HOJE, quantity: 1, amount: 1500.5, channel: null, note: null } });
    expect(validarVenda({ soldOn: HOJE, amount: "abc" }, HOJE)).toMatchObject({ ok: false, erro: "Valor da venda inválido." });
  });

  it("resumo: custo por venda = investimento ÷ vendas; retorno só com valor informado", () => {
    const r = resumoVendas([{ quantity: 2, amount: 3000 }, { quantity: 1, amount: null }, { quantity: 1, amount: 1000 }], [100, 200, 100]);
    expect(r).toEqual({ vendas: 4, faturamento: 4000, vendasComValor: 3, investimento: 400, custoPorVenda: 100, retorno: 10, ticketMedio: 4000 / 3 });
    expect(resumoVendas([], [100])).toMatchObject({ vendas: 0, custoPorVenda: null, retorno: null, faturamento: null });
    expect(resumoVendas([{ quantity: 1, amount: null }], null)).toMatchObject({ investimento: null, custoPorVenda: null });
  });

  it("período do mês: corta no dia de hoje no mês corrente", () => {
    expect(periodoDoMes("2026-09", HOJE)).toEqual({ desde: "2026-09-01", ate: HOJE });
    expect(periodoDoMes("2026-08", HOJE)).toEqual({ desde: "2026-08-01", ate: "2026-08-31" });
    expect(periodoDoMes("2026-10", HOJE)).toBeNull();
    expect(periodoDoMes("setembro", HOJE)).toBeNull();
  });
});
