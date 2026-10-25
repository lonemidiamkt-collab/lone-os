// tests/saldo-sem-leitura.test.ts — 25/10/2026, auditoria 9.9 e 9.10. Dados INVENTADOS.
//
// O QUE ACONTECIA:
//  9.9  — conta pré-paga sem funding_source_details caía no campo `balance` (que não é o saldo nas contas
//         type=20) e `balance` vazio virava 0: "Saldo zerado" crítico no grupo, com a conta cheia.
//  9.10 — a conferência de 2 em 2h respondia ok:true com TODAS as contas em erro; a Central ficava verde.

import { describe, it, expect } from "vitest";
import { calculateAvailableBalance, type MetaAccountFields } from "@/lib/meta/account-balance";
import { evaluateAccount } from "@/lib/budgets/alert-engine";
import { detectClientAlerts, DEFAULT_CLIENT_ALERT_CONFIG } from "@/lib/budgets/operational-alerts";
import { getBalanceDisplay } from "@/lib/budgets/display";
import { resultadoDoSync } from "@/lib/traffic/resultado-sync";

const meta = (m: Partial<MetaAccountFields>): MetaAccountFields => ({
  id: "act_1", balance: "", amount_spent: "0", spend_cap: null, currency: "BRL", account_status: 1, ...m,
});

describe("9.9 — saldo pré-pago que não foi lido", () => {
  it("o erro original: sem funding_source_details e balance vazio dava 0 → agora null", () => {
    expect(calculateAvailableBalance(true, null, meta({ balance: "", funding_source_details: null }))).toBeNull();
    expect(calculateAvailableBalance(true, null, meta({ balance: "0", funding_source_details: undefined }))).toBeNull();
  });

  it("type=20 sem display_string: `balance` não é o saldo dessas contas → null", () => {
    expect(calculateAvailableBalance(true, null, meta({ balance: "12345", funding_source_details: { type: 20 } }))).toBeNull();
  });

  it("o que já funcionava continua: display_string manda; type=2 com balance usa o balance", () => {
    expect(calculateAvailableBalance(true, null, meta({ funding_source_details: { type: 20, display_string: "Saldo disponível (R$2.880,80 BRL)" } }))).toBe(2880.8);
    expect(calculateAvailableBalance(true, null, meta({ balance: "50000", funding_source_details: { type: 2 } }))).toBe(500);
    expect(calculateAvailableBalance(true, null, meta({ balance: "", funding_source_details: { type: 2 } }))).toBeNull();
  });

  it("saldo nulo de pré-pago é 'não consegui ler' — nem crítico, nem ok", () => {
    const r = evaluateAccount({ available: null, monthlyBudget: 3000, daysRemaining: null, accountStatus: 1, isPrepaid: true });
    expect(r.severity).toBe("error");
    expect(r.reason).toMatch(/Não consegui ler o saldo/);
    // pós-pago sem cap continua sem alarme
    expect(evaluateAccount({ available: null, monthlyBudget: null, daysRemaining: null, accountStatus: 1, isPrepaid: false }).severity).toBe("ok");
  });

  it("e não vira alerta de verba zerada no grupo", () => {
    const hits = detectClientAlerts({ available: null, monthlyBudget: 3000, avgDailySpend: 100, accountStatus: 1 }, DEFAULT_CLIENT_ALERT_CONFIG, 18, 10);
    expect(hits.find((h) => h.type === "verba_zerada")).toBeUndefined();
  });

  it("a tela diz que não leu", () => {
    const d = getBalanceDisplay({
      account_status: 1, is_prepaid: true, availableBalance: null, severity: "error", monthly_budget: null,
      current_month_spend: null, spend_cap: null, last_amount_spent: null, avgDailySpend: null, currency: "BRL",
    } as never);
    expect(d.secondary).toBe("Saldo não lido da Meta");
  });
});

describe("9.10 — conferência de saldo com todas as contas em erro", () => {
  const conta = (sev: string, reason = "ok") => ({ clientName: "X", alert: { severity: sev, reason } });
  it("o erro original: ok:true com 3 de 3 em erro — agora ok:false com o motivo", () => {
    const r = resultadoDoSync({ total: 3, errors: 3, accounts: [conta("error", "Token inválido (code 190)"), conta("error", "Token inválido (code 190)"), conta("error", "Timeout Meta API (10s)")] });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Nenhuma das 3 contas foi lida \(Token inválido \(code 190\); Timeout Meta API/);
  });
  it("uma conta sem acesso é do dia a dia: continua ok", () => {
    expect(resultadoDoSync({ total: 3, errors: 1, accounts: [conta("error"), conta("ok"), conta("ok")] }).ok).toBe(true);
    expect(resultadoDoSync({ total: 0, errors: 0, accounts: [] }).ok).toBe(true);
  });
});
