/**
 * Leva 1 do tráfego: leitura da Meta que falha não vira zero, gasto zero de hoje é detectado,
 * e todo account_status da Meta tem nome.
 */

import { describe, it, expect } from "vitest";
import { dailySeriesFromRows, gastoDiario, getAccountStatusLabel } from "@/lib/meta/account-balance";
import { metaAccountStatus } from "@/lib/budgets/account-status";
import { getBalanceDisplay, type AccountForDisplay } from "@/lib/budgets/display";
import { detectClientAlerts, DEFAULT_CLIENT_ALERT_CONFIG } from "@/lib/budgets/operational-alerts";
import { escolherDiaCorrente, metricaZerada, detectAnomalies, type HistoricalMetric } from "@/lib/defense/detect";

describe("dailySeriesFromRows — dia sem linha é zero", () => {
  it("preenche os dias que a Meta não devolveu", () => {
    const serie = dailySeriesFromRows(
      [{ date_start: "2026-09-16", spend: "10" }, { date_start: "2026-09-19", spend: "30.5" }],
      "2026-09-16", "2026-09-22",
    );
    expect(serie).toEqual([10, 0, 0, 30.5, 0, 0, 0]);
  });
  it("sem nenhuma linha = 7 zeros (a Meta respondeu)", () => {
    expect(dailySeriesFromRows([], "2026-09-16", "2026-09-22")).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("gastoDiario — falha ≠ zero", () => {
  it("leitura falhou (undefined) → null para manter o último valor bom", () => {
    expect(gastoDiario(undefined)).toBeNull();
  });
  it("Meta respondeu sem gasto → média 0, não null", () => {
    expect(gastoDiario([0, 0, 0, 0, 0, 0, 0])).toEqual({ last3: [], avg: 0 });
  });
  it("média dos 3 últimos dias com gasto", () => {
    expect(gastoDiario([5, 0, 10, 20, 0, 30, 0])).toEqual({ last3: [10, 20, 30], avg: 20 });
  });
});

describe("account_status da Meta", () => {
  it("3 é pagamento que falhou (não 'em revisão') e é crítico", () => {
    expect(metaAccountStatus(3).label).toBe("Pagamento falhou");
    expect(metaAccountStatus(3).gravidade).toBe("critical");
  });
  it("todos os códigos documentados têm nome", () => {
    for (const c of [1, 2, 3, 7, 8, 9, 100, 101]) {
      expect(getAccountStatusLabel(c)).not.toMatch(/^Status |Desconhecido/);
    }
  });
  it("tela mostra 8 como acerto pendente, crítico", () => {
    const base: AccountForDisplay = {
      account_status: 8, is_prepaid: true, monthly_budget: null, current_month_spend: null, spend_cap: null,
      last_amount_spent: null, availableBalance: 100, avgDailySpend: 10, severity: "ok", currency: "BRL",
    };
    const d = getBalanceDisplay(base);
    expect(d.primary).toBe("Acerto pendente");
    expect(d.severity).toBe("critical");
  });
  it("alerta operacional de conta 3 sai como crítico", () => {
    const hits = detectClientAlerts(
      { available: 100, monthlyBudget: 1000, avgDailySpend: 10, accountStatus: 3, syncError: null },
      DEFAULT_CLIENT_ALERT_CONFIG, 18, 10,
    );
    expect(hits[0]).toMatchObject({ type: "erro_conta", severity: "critical" });
  });
});

describe("Defesa — gasto zero hoje", () => {
  const hist = (d: string): HistoricalMetric => ({
    metric_date: d, spend: 200, impressions: 5000, clicks: 50, conversions: 5, ctr: 1, cpm: 40, cpc: 4, cpl: 40,
  });
  const passado = ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"].map(hist);

  it("conta ativa sem linha de hoje depois das 11h → zero hoje", () => {
    expect(escolherDiaCorrente(false, true, 11)).toEqual({ tipo: "zero_hoje" });
  });
  it("antes das 11h ou conta não ativa → último dia com dado", () => {
    expect(escolherDiaCorrente(false, true, 10)).toEqual({ tipo: "ultimo_dia" });
    expect(escolherDiaCorrente(false, false, 15)).toEqual({ tipo: "ultimo_dia" });
  });
  it("zero hoje com histórico gastando dispara o alerta de spend", () => {
    const a = detectAnomalies(metricaZerada("2026-09-23"), passado, { elapsedFraction: 0.5 });
    expect(a.find((x) => x.metric === "spend")?.severity).toBe("critical");
  });
});
