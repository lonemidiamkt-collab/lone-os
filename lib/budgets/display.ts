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
  current_month_spend: number | null;
  spend_cap: number | null;
  last_amount_spent: number | null;
  availableBalance: number | null;
  avgDailySpend: number | null;
  severity: BalanceSeverity;
  currency: string;
  payment_method?: string | null; // "cartao" = paga no cartão → sem alerta de saldo baixo
}

function fmt(n: number | null | undefined, currency = "BRL"): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency });
}

// spend_caps acima deste valor são teto de segurança da Meta, não orçamento real
const CAP_INFINITY_BRL = 100_000_000;

// Mapeia BalanceSeverity → DisplaySeverity (descarta "disabled" → "paused")
function toDisplay(s: BalanceSeverity): DisplaySeverity {
  if (s === "critical") return "critical";
  if (s === "warning")  return "warning";
  if (s === "disabled") return "paused";
  return "ok";
}

export function getBalanceDisplay(a: AccountForDisplay): BalanceDisplay {
  const cur = a.currency || "BRL";

  // 1. Status da conta (prioridade máxima — antes de qualquer lógica de saldo)
  const st = a.account_status;
  if (st === 2) return { primary: "Desativada",   secondary: "—",              severity: "paused"   };
  if (st === 3) return { primary: "Em revisão",   secondary: "—",              severity: "review"   };
  if (st === 7) return { primary: "Pendente",     secondary: "—",              severity: "review"   };
  if (st === 9) return { primary: "Grace period", secondary: "Risco de pausa", severity: "critical" };
  if (st !== null && st !== 1) {
    return { primary: `Status ${st}`, secondary: "—", severity: "paused" };
  }

  // 1.5. CARTÃO DE CRÉDITO: a Meta cobra direto no cartão — a conta não "esvazia" saldo, então
  // saldo baixo NÃO é alerta. Sobrepõe a lógica de saldo (mostra gasto, sem severidade crítica).
  if (a.payment_method === "cartao") {
    return {
      primary:   "Cartão",
      secondary: a.avgDailySpend !== null ? `Sem monitor de saldo · gasto ${fmt(a.avgDailySpend, cur)}/dia` : "Sem monitor de saldo (cartão)",
      severity:  "ok",
    };
  }

  // 2. Pré-pago: saldo da carteira calculado no sync
  if (a.is_prepaid) {
    return {
      primary:   fmt(a.availableBalance, cur),
      secondary: "Saldo em conta",
      severity:  toDisplay(a.severity),
    };
  }

  // 3. Pós-pago com verba mensal contratada
  // Saldo = verba − gasto do mês corrente (Insights this_month).
  // Se current_month_spend ainda não foi sincronizado, mostra "—" e mantém "ok"
  // para não gerar falso alarme.
  if (a.monthly_budget !== null) {
    const synced = a.current_month_spend !== null;
    return {
      primary:   synced ? fmt(a.availableBalance, cur) : "—",
      secondary: synced
        ? `Verba ${fmt(a.monthly_budget, cur)} · gasto ${fmt(a.current_month_spend, cur)}`
        : "Verba mensal · sync pendente",
      severity: synced ? toDisplay(a.severity) : "ok",
    };
  }

  // 4. Pós-pago com spend_cap real (< R$ 100M) — cap - gasto
  const hasRealCap =
    a.spend_cap !== null && a.spend_cap > 0 && a.spend_cap < CAP_INFINITY_BRL;
  if (hasRealCap) {
    return {
      primary:   fmt(a.availableBalance, cur),
      secondary: `Cap ${fmt(a.spend_cap, cur)} · gasto ${fmt(a.last_amount_spent, cur)}`,
      severity:  toDisplay(a.severity),
    };
  }

  // 5. Pós-pago sem cap definido (cartão sem teto configurado)
  return {
    primary:   "Ativa",
    secondary: a.avgDailySpend !== null
      ? `Cartão · gasto ${fmt(a.avgDailySpend, cur)}/dia`
      : "Cartão · sem dados",
    severity: "ok",
  };
}
