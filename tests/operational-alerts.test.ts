/**
 * QA: detecção de alertas operacionais por cliente (lib/budgets/operational-alerts).
 * Foco: os DOIS níveis de saldo (baixa = warnPct% / crítico = critPct% da verba)
 * e o bug do override "0" que silenciava o aviso (contas do fake-save antigo).
 */

import { describe, it, expect } from "vitest";
import {
  detectClientAlerts,
  DEFAULT_CLIENT_ALERT_CONFIG,
  type AccountAlertSnapshot,
  type ClientAlertConfig,
} from "@/lib/budgets/operational-alerts";

const WARN_PCT = 18;
const CRIT_PCT = 10;

function cfg(over: Partial<ClientAlertConfig> = {}): ClientAlertConfig {
  return { ...DEFAULT_CLIENT_ALERT_CONFIG, ...over };
}

function snap(over: Partial<AccountAlertSnapshot> = {}): AccountAlertSnapshot {
  return {
    available: 1000,
    monthlyBudget: 1000,
    avgDailySpend: 50,
    accountStatus: 1,
    syncError: null,
    ...over,
  };
}

function verbaHit(hits: ReturnType<typeof detectClientAlerts>) {
  return hits.find((h) => h.type === "verba_baixa" || h.type === "verba_zerada");
}

describe("detectClientAlerts — dois níveis de saldo (18% / 10%)", () => {
  it("saldo 150/1000 (15%) → verba_baixa WARNING (≤18%, >10%)", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 150 }), cfg(), WARN_PCT, CRIT_PCT));
    expect(h?.type).toBe("verba_baixa");
    expect(h?.severity).toBe("warning");
  });

  it("saldo 80/1000 (8%) → verba_baixa CRITICAL (≤10%)", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 80 }), cfg(), WARN_PCT, CRIT_PCT));
    expect(h?.type).toBe("verba_baixa");
    expect(h?.severity).toBe("critical");
  });

  it("saldo 0 → verba_zerada critical", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 0 }), cfg(), WARN_PCT, CRIT_PCT));
    expect(h?.type).toBe("verba_zerada");
    expect(h?.severity).toBe("critical");
  });

  it("saldo 300/1000 (30%) → sem alerta de verba", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 300 }), cfg(), WARN_PCT, CRIT_PCT));
    expect(h).toBeUndefined();
  });

  it("sem globalCritPct → só o nível de atenção (retrocompat)", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 80 }), cfg(), WARN_PCT));
    expect(h?.severity).toBe("warning");
  });
});

describe("detectClientAlerts — bug do override '0'", () => {
  it("verbaMinima=0 é ignorado → herda o % da verba (150/1000 ≤ 18% → warning)", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 150 }), cfg({ verbaMinima: 0 }), WARN_PCT, CRIT_PCT));
    expect(h?.type).toBe("verba_baixa");
    expect(h?.severity).toBe("warning");
  });

  it("verbaMinima=0 com saldo alto (300) → continua sem alerta (não dispara à toa)", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 300 }), cfg({ verbaMinima: 0 }), WARN_PCT, CRIT_PCT));
    expect(h).toBeUndefined();
  });
});

describe("detectClientAlerts — override manual positivo", () => {
  it("verbaMinima=200 → saldo 150 ≤ 200 → warning em R$", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 150 }), cfg({ verbaMinima: 200 }), WARN_PCT, CRIT_PCT));
    expect(h?.severity).toBe("warning");
    expect(h?.reason).toMatch(/R\$/);
  });

  it("override manual não impede o crítico do % da verba (saldo 80 ≤ 10% → critical)", () => {
    const h = verbaHit(detectClientAlerts(snap({ available: 80 }), cfg({ verbaMinima: 200 }), WARN_PCT, CRIT_PCT));
    expect(h?.severity).toBe("critical");
  });
});
