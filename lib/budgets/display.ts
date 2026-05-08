// lib/budgets/display.ts — display logic for balance monitoring
// Centraliza o que mostrar na coluna "Saldo disponível" conforme tipo de conta.

import { type BalanceSeverity } from "@/lib/meta/account-balance";

export type DisplaySeverity = "ok" | "warning" | "critical" | "paused" | "review";

export interface BalanceDisplay {
  primary: string;
  secondary: string;
  severity: DisplaySeverity;
}

export interface AccountForDisplay {
  account_status: number | null;
  is_prepaid: boolean;
  monthly_budget: number | null;
  spend_cap: number | null;
  last_amount_spent: number | null;
  availableBalance: number | null;
  avgDailySpend: number | null;
  severity: BalanceSeverity;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// spend_caps acima deste valor são teto de segurança da Meta, não orçamento real
const CAP_INFINITY_BRL = 100_000_000;

export function getBalanceDisplay(a: AccountForDisplay): BalanceDisplay {
  // 1. Status da conta (prioridade máxima — antes de qualquer lógica de saldo)
  const st = a.account_status;
  if (st === 2) return { primary: "Desativada",   secondary: "—",              severity: "paused"   };
  if (st === 3) return { primary: "Em revisão",   secondary: "—",              severity: "review"   };
  if (st === 7) return { primary: "Pendente",     secondary: "—",              severity: "review"   };
  if (st === 9) return { primary: "Grace period", secondary: "Risco de pausa", severity: "critical" };
  if (st !== null && st !== 1) {
    return { primary: `Status ${st}`, secondary: "—", severity: "paused" };
  }

  // 2. Pré-pago: saldo da carteira calculado no sync
  if (a.is_prepaid) {
    const bal = a.availableBalance ?? 0;
    const sev: DisplaySeverity =
      a.severity === "critical" ? "critical" :
      a.severity === "warning"  ? "warning"  : "ok";
    return { primary: fmt(bal), secondary: "Saldo em conta", severity: sev };
  }

  // 3. Pós-pago com verba mensal contratada definida pelo gestor
  if (a.monthly_budget !== null) {
    return {
      primary:   fmt(a.monthly_budget),
      secondary: "Verba mensal contratada",
      severity:  "ok",
    };
  }

  // 4. Pós-pago com spend_cap real (< R$ 100M) — cap - gasto
  const hasRealCap =
    a.spend_cap !== null && a.spend_cap > 0 && a.spend_cap < CAP_INFINITY_BRL;
  if (hasRealCap) {
    const available = a.availableBalance;
    const sev: DisplaySeverity =
      a.severity === "critical" ? "critical" :
      a.severity === "warning"  ? "warning"  : "ok";
    return {
      primary:   available !== null ? fmt(available) : "—",
      secondary: `Cap ${fmt(a.spend_cap)} · gasto ${fmt(a.last_amount_spent)}`,
      severity:  sev,
    };
  }

  // 5. Pós-pago sem cap definido (cartão de crédito, sem teto configurado)
  return {
    primary:   "Ativa",
    secondary: a.avgDailySpend !== null
      ? `Cartão · gasto ${fmt(a.avgDailySpend)}/dia`
      : "Cartão · sem dados",
    severity: "ok",
  };
}
