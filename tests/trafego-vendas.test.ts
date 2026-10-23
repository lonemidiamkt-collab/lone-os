// tests/trafego-vendas.test.ts — Leva 7A (N9): vendas do cliente × investimento (custo por venda).

import { describe, it, expect } from "vitest";
import { validarVenda, resumoVendas, periodoDoMes, janelaDoInvestimento, gastoPorDiaDosClientes } from "@/lib/trafego/vendas";

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

  // 21/10/2026 — portal mostrava "Custo por venda R$ 0,00" e "R$ 0 investidos" todo dia 1º e em mês
  // sem metric_snapshots: o servidor passava `?? []` e a lista vazia somava 0.
  describe("investimento não apurado ≠ gasto zero", () => {
    const vendas = [{ quantity: 2, amount: 1000 }];

    it("dia 1º: o mês corrente ainda não tem dia fechado → sem janela → investimento null", () => {
      const hoje = "2026-11-01";
      const periodo = periodoDoMes("2026-11", hoje)!;
      expect(periodo).toEqual({ desde: "2026-11-01", ate: "2026-11-01" });
      expect(janelaDoInvestimento(periodo.desde, periodo.ate, hoje)).toBeNull();
      // O mesmo caminho do servidor: sem janela, nenhum gasto lido, `gasto.get(id) ?? null`.
      const gasto = gastoPorDiaDosClientes([], "c1");
      const r = resumoVendas(vendas, gasto.get("c1") ?? null);
      expect(r.investimento).toBeNull();
      expect(r.custoPorVenda).toBeNull();
      expect(r.retorno).toBeNull();
    });

    it("janela: só dias fechados (até ontem) no mês corrente; mês passado inteiro", () => {
      expect(janelaDoInvestimento("2026-11-01", "2026-11-02", "2026-11-02")).toEqual({ desde: "2026-11-01", ate: "2026-11-01" });
      expect(janelaDoInvestimento("2026-10-01", "2026-10-31", "2026-11-01")).toEqual({ desde: "2026-10-01", ate: "2026-10-31" });
    });

    it("mês sem métrica do cliente (outros clientes têm) → investimento null, não R$ 0", () => {
      const linhas = [{ client_id: "outro", metric_date: "2026-10-05", spend: 80 }];
      const gasto = gastoPorDiaDosClientes(linhas, "c1");
      expect(gasto.has("c1")).toBe(false);
      expect(resumoVendas(vendas, gasto.get("c1") ?? null)).toMatchObject({ investimento: null, custoPorVenda: null });
      // Lista vazia (quem ainda passar `?? []`) também é "não apurado".
      expect(resumoVendas(vendas, [])).toMatchObject({ investimento: null, custoPorVenda: null });
    });

    it("gasto zero DE VERDADE (linha de métrica com spend 0) continua R$ 0", () => {
      const linhas = [
        { client_id: "c1", metric_date: "2026-10-05", spend: 0 },
        { client_id: "c1", metric_date: "2026-10-06T00:00:00", spend: "0" },
      ];
      const gasto = gastoPorDiaDosClientes(linhas, "c1");
      expect(gasto.get("c1")).toEqual([0, 0]);
      const r = resumoVendas(vendas, gasto.get("c1") ?? null);
      expect(r.investimento).toBe(0);
      expect(r.custoPorVenda).toBe(0);
      expect(r.retorno).toBeNull(); // faturamento ÷ 0 não é número
    });

    it("dia repetido no snapshot vale a última leitura (não soma duas vezes)", () => {
      const linhas = [
        { client_id: "c1", metric_date: "2026-10-05", spend: 50 },
        { client_id: "c1", metric_date: "2026-10-05", spend: 60 },
        { client_id: "c1", metric_date: "2026-10-06", spend: 40 },
      ];
      expect(resumoVendas(vendas, gastoPorDiaDosClientes(linhas, "c1").get("c1") ?? null).investimento).toBe(100);
    });
  });
});
