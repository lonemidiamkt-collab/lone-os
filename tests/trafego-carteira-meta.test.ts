// tests/trafego-carteira-meta.test.ts — a visão Carteira da aba Anúncios Meta (19/11/2026). Dados INVENTADOS.
import { describe, it, expect } from "vitest";
import { montarLinhaMeta, umPorDia, frequenciaDaConta, type DiaMeta, type ContaMeta } from "@/lib/trafego/carteira-meta";

const HOJE = "2026-11-19";
const periodo = { de: "2026-11-12", ate: "2026-11-18" };
const anterior = { de: "2026-11-05", ate: "2026-11-11" };

function serie(de: string, n: number, f: (i: number) => Partial<DiaMeta>): DiaMeta[] {
  return Array.from({ length: n }, (_, i) => ({
    metric_date: new Date(Date.parse(`${de}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
    spend: 0, impressions: 0, clicks: 0, conversions: 0, results: null, result_kind: null, ...f(i),
  }));
}
const conta = (p: Partial<ContaMeta> = {}): ContaMeta => ({
  monthly_budget: 1500, current_month_spend: 900, last_3d_avg_spend: 50, last_balance: 400, is_prepaid: true, account_status: 1, sync_error: null, ...p,
});

describe("carteira da Meta", () => {
  it("soma o período, compara com o anterior e usa o resultado do objetivo", () => {
    const l = montarLinhaMeta({
      hoje: HOJE, periodo, anterior, frequencia7d: 1.8, conta: conta(),
      dias: [
        ...serie("2026-11-05", 7, () => ({ spend: 40, impressions: 4000, clicks: 60, conversions: 4, results: 4, result_kind: "mensagens" })),
        ...serie("2026-11-12", 7, () => ({ spend: 50, impressions: 5000, clicks: 75, conversions: 5, results: 5, result_kind: "mensagens" })),
      ],
    });
    expect(l.atual.gasto).toBe(350);
    expect(l.atual.resultados).toBe(35);
    expect(l.custoPorResultado).toBe(10);
    expect(l.custoPorResultadoAnterior).toBe(10);
    expect(l.ctr).toBe(1.5);
    expect(l.cpm).toBe(10);
    expect(l.tipoResultado).toBe("conversas");
    expect(l.diasComDado).toBe(7);
    expect(l.diasDeSaldo).toBe(8);
    expect(l.sinais).toEqual([]);
  });

  it("parou de gastar, saldo acabando, frequência alta e CTR baixo", () => {
    const l = montarLinhaMeta({
      hoje: HOJE, periodo, anterior, frequencia7d: 3.4, conta: conta({ last_balance: 60, last_3d_avg_spend: 40 }),
      dias: serie("2026-11-12", 5, () => ({ spend: 60, impressions: 9000, clicks: 40, conversions: 3, results: 3 })),
    });
    const t = l.sinais.map((s) => s.titulo);
    expect(t).toContain("Sem gasto há 2 dias");
    expect(t).toContain("Saldo para ~1 dia");
    expect(t).toContain("Frequência 3,4");
    expect(t.some((x) => x.startsWith("CTR 0,"))).toBe(true);
    expect(l.sinais[0].gravidade).toBe("critico");
  });

  it("custo por resultado 50%+ acima do anterior e conta com pagamento falhou", () => {
    const l = montarLinhaMeta({
      hoje: HOJE, periodo, anterior, frequencia7d: null, conta: conta({ account_status: 3, is_prepaid: false }),
      dias: [
        ...serie("2026-11-05", 7, () => ({ spend: 30, impressions: 3000, clicks: 40, conversions: 3, results: 3 })),
        ...serie("2026-11-12", 7, () => ({ spend: 60, impressions: 3000, clicks: 40, conversions: 2, results: 2 })),
      ],
    });
    const t = l.sinais.map((s) => s.titulo);
    expect(t[0]).toBe("Conta: Pagamento falhou");
    expect(t).toContain("Custo por resultado +200%");
  });

  it("dia duplicado (scan antigo) conta uma vez", () => {
    const d = umPorDia([
      { metric_date: "2026-11-12", spend: 10, impressions: 1, clicks: 0, conversions: 0, results: null, result_kind: null },
      { metric_date: "2026-11-12T00:00:00", spend: 12, impressions: 1, clicks: 0, conversions: 0, results: null, result_kind: null },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].spend).toBe(12);
  });

  it("frequência da conta usa só o retrato mais recente", () => {
    expect(frequenciaDaConta([
      { ate: "2026-11-17", impressions: 1000, reach: 100 },
      { ate: "2026-11-18", impressions: 600, reach: 300 },
      { ate: "2026-11-18", impressions: 400, reach: 200 },
    ])).toBe(2);
    expect(frequenciaDaConta([])).toBeNull();
  });
});
