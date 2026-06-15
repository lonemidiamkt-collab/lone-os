/**
 * QA: motor de alerta de saldo (lib/budgets/alert-engine).
 * Cobre o bug que deixou a "Imperio dos Pisos" verde com saldo R$ 0,00 e o
 * aviso de antecedência por % de verba (ex: verba 1000 → atenção em 200).
 */

import { describe, it, expect } from "vitest";
import {
  evaluateAccount,
  buildDigestMessage,
  buildUrgentMessage,
  countBySeverity,
  DEFAULT_ALERT_CONFIG,
  type DigestAccount,
} from "@/lib/budgets/alert-engine";

const ACTIVE = 1;

describe("evaluateAccount — paraquedas universal", () => {
  it("saldo R$ 0,00 em conta ativa SEM verba/regra → critical (o bug da Imperio)", () => {
    const r = evaluateAccount({
      available: 0, monthlyBudget: null, daysRemaining: null, accountStatus: ACTIVE,
    });
    expect(r.severity).toBe("critical");
    expect(r.reason).toMatch(/zerado/i);
  });

  it("saldo negativo → critical", () => {
    expect(evaluateAccount({ available: -5, monthlyBudget: null, daysRemaining: null, accountStatus: ACTIVE }).severity)
      .toBe("critical");
  });

  it("acaba em <= 1 dia → critical", () => {
    expect(evaluateAccount({ available: 300, monthlyBudget: null, daysRemaining: 0.8, accountStatus: ACTIVE }).severity)
      .toBe("critical");
  });

  it("acaba em <= 3 dias → warning", () => {
    expect(evaluateAccount({ available: 300, monthlyBudget: null, daysRemaining: 2.5, accountStatus: ACTIVE }).severity)
      .toBe("warning");
  });

  it("saldo positivo, muitos dias, sem verba → ok", () => {
    expect(evaluateAccount({ available: 500, monthlyBudget: null, daysRemaining: 20, accountStatus: ACTIVE }).severity)
      .toBe("ok");
  });
});

describe("evaluateAccount — % da verba contratada (default 20% / 5%)", () => {
  it("verba 1000, saldo 200 (20%) → warning (aviso de antecedência)", () => {
    const r = evaluateAccount({ available: 200, monthlyBudget: 1000, daysRemaining: 30, accountStatus: ACTIVE });
    expect(r.severity).toBe("warning");
    expect(r.pctRemaining).toBe(20);
    expect(r.reason).toMatch(/20%/);
  });

  it("verba 1000, saldo 201 (acima de 20%) → ok", () => {
    expect(evaluateAccount({ available: 201, monthlyBudget: 1000, daysRemaining: 30, accountStatus: ACTIVE }).severity)
      .toBe("ok");
  });

  it("verba 1000, saldo 50 (5%) → critical", () => {
    expect(evaluateAccount({ available: 50, monthlyBudget: 1000, daysRemaining: 30, accountStatus: ACTIVE }).severity)
      .toBe("critical");
  });
});

describe("evaluateAccount — status e erros", () => {
  it("conta não-ativa → disabled", () => {
    expect(evaluateAccount({ available: 0, monthlyBudget: 1000, daysRemaining: null, accountStatus: 2 }).severity)
      .toBe("disabled");
  });

  it("syncError → error (não some do relatório)", () => {
    expect(evaluateAccount({ available: null, monthlyBudget: null, daysRemaining: null, accountStatus: ACTIVE, syncError: "rate limit" }).severity)
      .toBe("error");
  });

  it("pós-pago sem cap (available null) → ok, sem alarme", () => {
    expect(evaluateAccount({ available: null, monthlyBudget: null, daysRemaining: null, accountStatus: ACTIVE }).severity)
      .toBe("ok");
  });

  it("override manual crítico vence o % da verba", () => {
    const r = evaluateAccount({
      available: 150, monthlyBudget: 1000, daysRemaining: 30, accountStatus: ACTIVE,
      criticalThreshold: 200,
    });
    expect(r.severity).toBe("critical");
  });
});

describe("config customizada", () => {
  it("warningPct=30 → saldo 250/1000 vira warning", () => {
    expect(evaluateAccount(
      { available: 250, monthlyBudget: 1000, daysRemaining: 30, accountStatus: ACTIVE },
      { ...DEFAULT_ALERT_CONFIG, warningPct: 30 },
    ).severity).toBe("warning");
  });
});

// ── Mensagens ────────────────────────────────────────────────

function acc(over: Partial<DigestAccount>): DigestAccount {
  return {
    clientName: "Cliente X", metaAccountId: "act_1", isPrepaid: true,
    available: 500, daysRemaining: 10, avgDailySpend: 50, currency: "BRL", pixKey: null,
    alert: { severity: "ok", reason: "Saldo saudável", pctRemaining: null },
    ...over,
  };
}

describe("buildDigestMessage", () => {
  const accounts = [
    acc({ clientName: "Imperio dos Pisos", available: 0, daysRemaining: null,
          alert: { severity: "critical", reason: "Saldo zerado", pctRemaining: 0 } }),
    acc({ clientName: "Iron Fox", available: 200,
          alert: { severity: "warning", reason: "Saldo ≤ 20% da verba", pctRemaining: 20 } }),
    acc({ clientName: "Saudável SA", available: 900 }),
  ];

  it("lista todas as contas, com seção crítica e os nomes", () => {
    const msg = buildDigestMessage(accounts, new Date("2026-06-15T11:00:00Z"));
    expect(msg).toContain("Imperio dos Pisos");
    expect(msg).toContain("Iron Fox");
    expect(msg).toContain("Saudável SA");
    expect(msg).toMatch(/CR[IÍ]TICO/i);
  });

  it("conta o resumo por severidade", () => {
    const counts = countBySeverity(accounts);
    expect(counts.critical).toBe(1);
    expect(counts.warning).toBe(1);
    expect(counts.ok).toBe(1);
  });
});

describe("buildUrgentMessage", () => {
  it("mensagem crítica inclui saldo, motivo e pix", () => {
    const msg = buildUrgentMessage(acc({
      clientName: "Imperio dos Pisos", available: 0, pixKey: "12345",
      alert: { severity: "critical", reason: "Saldo zerado", pctRemaining: 0 },
    }));
    expect(msg).toMatch(/CR[IÍ]TICO/i);
    expect(msg).toContain("Imperio dos Pisos");
    expect(msg).toContain("Pix: 12345");
  });
});
