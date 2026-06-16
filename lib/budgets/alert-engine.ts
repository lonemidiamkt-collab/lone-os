// lib/budgets/alert-engine.ts — lógica PURA de alerta de saldo (sem I/O).
// Fonte única da verdade: usada pela UI (cor/badge), pelo motor de tempo real
// (sync-balances) e pelo digest agendado (budget-digest). Coberta por testes.
//
// Modelo de threshold em camadas (maior prioridade primeiro):
//   1. Regra manual absoluta (budget_alert_rules) — se definida, vence.
//   2. Default por % da verba contratada (monthly_budget):
//        warning  = saldo <= warningPct%  da verba  (default 20%)
//        critical = saldo <= criticalPct% da verba  (default 5%)
//   3. Paraquedas universal (sempre, mesmo sem verba):
//        critical = saldo <= 0  |  dias <= 1
//        warning  = dias <= 3

import type { OpAlertHit } from "@/lib/budgets/operational-alerts";

export type AlertSeverity = "critical" | "warning" | "ok" | "disabled" | "error";

export interface AlertConfig {
  /** Aviso de antecedência: saldo <= warningPct% da verba contratada. */
  warningPct: number;
  /** Crítico: saldo <= criticalPct% da verba contratada. */
  criticalPct: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = { warningPct: 20, criticalPct: 5 };

export interface AccountAlertInput {
  /** Saldo disponível em R$. null = não calculável (pós-pago sem cap). */
  available: number | null;
  /** Verba mensal contratada em R$ (base do cálculo de %). null se não definida. */
  monthlyBudget: number | null;
  daysRemaining: number | null;
  /** Status Meta: 1=Ativa 2=Desativada 3=Em revisão 7=Pendente 9=Grace. */
  accountStatus: number;
  /** Erro do último sync (null = ok). */
  syncError?: string | null;
  /** Override manual absoluto (budget_alert_rules), em R$. */
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
}

export interface AccountAlertResult {
  severity: AlertSeverity;
  /** Explicação curta para o operador / mensagem. */
  reason: string;
  /** Saldo como % da verba contratada (0–100), ou null se não há verba. */
  pctRemaining: number | null;
}

/**
 * Avalia a severidade de uma conta. Determinística e sem efeitos colaterais.
 */
export function evaluateAccount(
  input: AccountAlertInput,
  cfg: AlertConfig = DEFAULT_ALERT_CONFIG,
): AccountAlertResult {
  const { available, monthlyBudget, daysRemaining, accountStatus, syncError } = input;

  if (syncError) {
    return { severity: "error", reason: "Sync com erro", pctRemaining: null };
  }
  if (accountStatus !== 1) {
    return { severity: "disabled", reason: "Conta não ativa na Meta", pctRemaining: null };
  }
  if (available === null) {
    // Pós-pago sem cap: não há saldo monitorável → não alarmar.
    return { severity: "ok", reason: "Sem monitor de saldo", pctRemaining: null };
  }

  const base = monthlyBudget !== null && monthlyBudget > 0 ? monthlyBudget : null;
  const pctRemaining = base !== null ? clampPct((available / base) * 100) : null;

  // Thresholds efetivos: override manual vence; senão % da verba.
  const critFromPct = base !== null ? (base * cfg.criticalPct) / 100 : null;
  const warnFromPct = base !== null ? (base * cfg.warningPct) / 100 : null;
  const critThreshold = input.criticalThreshold ?? critFromPct;
  const warnThreshold = input.warningThreshold ?? warnFromPct;

  // ── Crítico ──
  if (available <= 0) {
    return { severity: "critical", reason: "Saldo zerado", pctRemaining };
  }
  if (critThreshold !== null && available <= critThreshold) {
    return {
      severity: "critical",
      reason: base !== null && input.criticalThreshold == null
        ? `Saldo ≤ ${cfg.criticalPct}% da verba`
        : `Saldo ≤ limite crítico`,
      pctRemaining,
    };
  }
  if (daysRemaining !== null && daysRemaining <= 1) {
    return { severity: "critical", reason: "Acaba em ≤ 1 dia", pctRemaining };
  }

  // ── Atenção (aviso de antecedência) ──
  if (warnThreshold !== null && available <= warnThreshold) {
    return {
      severity: "warning",
      reason: base !== null && input.warningThreshold == null
        ? `Saldo ≤ ${cfg.warningPct}% da verba`
        : `Saldo ≤ limite de atenção`,
      pctRemaining,
    };
  }
  if (daysRemaining !== null && daysRemaining <= 3) {
    return { severity: "warning", reason: "Acaba em ≤ 3 dias", pctRemaining };
  }

  return { severity: "ok", reason: "Saldo saudável", pctRemaining };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// ── Construtores de mensagem (WhatsApp / Evolution) ──────────

export interface DigestAccount {
  clientName: string;
  metaAccountId: string;
  isPrepaid: boolean;
  available: number | null;
  daysRemaining: number | null;
  avgDailySpend: number | null;
  currency: string;
  pixKey?: string | null;
  alert: AccountAlertResult;
  /** UUID interno da ad_account — usado no anti-spam do alerta em tempo real. Ignorado nas mensagens. */
  adAccountId?: string;
  /** UUID do cliente — usado p/ buscar a config de alertas. */
  clientId?: string;
  /** Alertas operacionais detectados (sem gasto, campanha parada, etc.) p/ o grupo interno. */
  opAlerts?: OpAlertHit[];
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0, warning: 1, error: 2, ok: 3, disabled: 4,
};

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: "🔴", warning: "🟡", error: "⚠️", ok: "🟢", disabled: "⚪",
};

function fmtBRL(n: number | null | undefined, currency = "BRL"): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency });
}

function fmtDays(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return "negativo";
  if (days > 365) return "> 1 ano";
  if (days < 1) return `~${Math.round(days * 24)}h`;
  return `~${days.toFixed(1)}d`;
}

function todayLabelBRT(now: Date): string {
  return now.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function accountLine(a: DigestAccount): string {
  const emoji = SEVERITY_EMOJI[a.alert.severity];
  const saldo = fmtBRL(a.available, a.currency);
  const dias = a.daysRemaining !== null ? ` · ${fmtDays(a.daysRemaining)}` : "";
  const gasto = a.avgDailySpend !== null ? ` · ${fmtBRL(a.avgDailySpend, a.currency)}/dia` : "";
  const pct = a.alert.pctRemaining !== null ? ` (${a.alert.pctRemaining.toFixed(0)}% da verba)` : "";
  return `${emoji} *${a.clientName}* — ${saldo}${pct}${dias}${gasto}`;
}

/**
 * Relatório completo agrupado por severidade. Sempre lista todas as contas
 * (decisão do produto: "relatório completo sempre"), com crítico no topo.
 */
export function buildDigestMessage(accounts: DigestAccount[], now: Date = new Date()): string {
  const sorted = [...accounts].sort((a, b) => {
    const r = SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity];
    if (r !== 0) return r;
    const da = a.daysRemaining ?? Infinity;
    const db = b.daysRemaining ?? Infinity;
    if (da !== db) return da - db;
    return a.clientName.localeCompare(b.clientName);
  });

  const counts = countBySeverity(accounts);
  const lines: string[] = [];
  lines.push(`📊 *Saldos Meta Ads* — ${todayLabelBRT(now)}`);
  lines.push(
    `🔴 ${counts.critical} críticas · 🟡 ${counts.warning} em atenção · 🟢 ${counts.ok} ok` +
    (counts.error ? ` · ⚠️ ${counts.error} c/ erro` : ""),
  );

  const sections: Array<[AlertSeverity, string]> = [
    ["critical", "🔴 *CRÍTICO — ação imediata*"],
    ["warning", "🟡 *Atenção — reabastecer em breve*"],
    ["error", "⚠️ *Sem sincronizar / com erro*"],
    ["ok", "🟢 *Saudáveis*"],
    ["disabled", "⚪ *Desativadas / fora de operação*"],
  ];

  for (const [sev, title] of sections) {
    const group = sorted.filter((a) => a.alert.severity === sev);
    if (group.length === 0) continue;
    lines.push("");
    lines.push(title);
    for (const a of group) lines.push(accountLine(a));
  }

  if (counts.critical > 0 || counts.warning > 0) {
    lines.push("");
    lines.push("💸 Reabasteça as contas em alerta para não pausar as campanhas.");
  }

  return lines.join("\n");
}

/**
 * Mensagem única de alerta urgente (disparo em tempo real quando uma conta
 * cruza o limite no meio da semana).
 */
export function buildUrgentMessage(a: DigestAccount): string {
  const head = a.alert.severity === "critical" ? "🚨 *SALDO CRÍTICO*" : "⚠️ *Saldo baixo*";
  const lines = [
    `${head} — ${a.clientName}`,
    `Conta: ${a.metaAccountId}`,
    `Saldo: ${fmtBRL(a.available, a.currency)}` +
      (a.alert.pctRemaining !== null ? ` (${a.alert.pctRemaining.toFixed(0)}% da verba)` : ""),
    `Motivo: ${a.alert.reason}`,
  ];
  if (a.avgDailySpend !== null) lines.push(`Gasto: ${fmtBRL(a.avgDailySpend, a.currency)}/dia`);
  if (a.daysRemaining !== null) lines.push(`Estimativa de pausa: ${fmtDays(a.daysRemaining)}`);
  if (a.pixKey) lines.push(`Pix: ${a.pixKey}`);
  return lines.join("\n");
}

export function countBySeverity(accounts: DigestAccount[]): Record<AlertSeverity, number> {
  const counts: Record<AlertSeverity, number> = {
    critical: 0, warning: 0, ok: 0, disabled: 0, error: 0,
  };
  for (const a of accounts) counts[a.alert.severity]++;
  return counts;
}

// ── Modo conta-a-conta (uma mensagem por conta) ──────────────

/** Ordena por severidade (crítico no topo), depois dias restantes, depois nome. */
export function sortBySeverity(accounts: DigestAccount[]): DigestAccount[] {
  return [...accounts].sort((a, b) => {
    const r = SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity];
    if (r !== 0) return r;
    const da = a.daysRemaining ?? Infinity;
    const db = b.daysRemaining ?? Infinity;
    if (da !== db) return da - db;
    return a.clientName.localeCompare(b.clientName);
  });
}

/** Cabeçalho curto enviado antes das mensagens individuais. */
export function buildRunHeader(accounts: DigestAccount[], now: Date = new Date()): string {
  const c = countBySeverity(accounts);
  return (
    `📊 *Saldos Meta Ads* — ${todayLabelBRT(now)}\n` +
    `🔴 ${c.critical} críticas · 🟡 ${c.warning} em atenção · 🟢 ${c.ok} ok\n` +
    `_(detalhes das que precisam de ação abaixo)_`
  );
}

/** Resumo consolidado das contas saudáveis (verdes) num único texto organizado. */
export function buildGreensSummary(accounts: DigestAccount[]): string {
  const sorted = [...accounts].sort((a, b) =>
    (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity) || a.clientName.localeCompare(b.clientName),
  );
  const lines = sorted.map((a) => {
    const saldo = fmtBRL(a.available, a.currency);
    const dias = a.daysRemaining !== null ? ` · ${fmtDays(a.daysRemaining)}` : "";
    return `🟢 ${a.clientName} — ${saldo}${dias}`;
  });
  return `*Contas saudáveis (${accounts.length})*\n` + lines.join("\n");
}

/** Mensagem individual de UMA conta; o formato varia conforme a severidade. */
export function buildAccountMessage(a: DigestAccount): string {
  const saldo = fmtBRL(a.available, a.currency);
  const pct = a.alert.pctRemaining !== null ? ` (${a.alert.pctRemaining.toFixed(0)}% da verba)` : "";
  const gasto = a.avgDailySpend !== null ? `${fmtBRL(a.avgDailySpend, a.currency)}/dia` : null;
  const dias = a.daysRemaining !== null ? fmtDays(a.daysRemaining) : null;
  const pix = a.pixKey ? `\nPix: ${a.pixKey}` : "";

  let base: string;
  switch (a.alert.severity) {
    case "critical": {
      const zerado = (a.available ?? 0) <= 0 ? " (zerado)" : "";
      const extra = [gasto && `Gasto ${gasto}`, dias && `acaba em ${dias}`].filter(Boolean).join(" · ");
      base =
        `🔴 *ATENÇÃO — ${a.clientName}*\n` +
        `Saldo da conta Meta Ads: ${saldo}${zerado}${pct}\n` +
        (extra ? extra + "\n" : "") +
        `Reabasteça (Pix/boleto) imediatamente pra não pausar as campanhas.${pix}`;
      break;
    }
    case "warning": {
      const extra = [gasto && `gasto ${gasto}`, dias && `acaba em ${dias}`].filter(Boolean).join(" · ");
      base =
        `🟡 *${a.clientName} — saldo baixo*\n` +
        `Saldo: ${saldo}${pct}\n` +
        (extra ? extra + "\n" : "") +
        `Reabasteça em breve.${pix}`;
      break;
    }
    case "error":
      base = `⚠️ *${a.clientName}* — sem sincronizar (erro no Meta).`;
      break;
    case "disabled":
      base = `⚪ *${a.clientName}* — conta desativada / fora de operação.`;
      break;
    default: {
      const parts = [saldo + pct, dias, gasto].filter(Boolean).join(" · ");
      base = `🟢 *${a.clientName}* — ${parts}`;
    }
  }

  // Anexa alertas operacionais que não estão refletidos na severidade de saldo.
  const opExtra = (a.opAlerts ?? []).filter((h) => h.type === "sem_gasto" || h.type === "campanha_parada");
  if (opExtra.length > 0) {
    base += "\n" + opExtra.map((h) => `⚠️ ${h.reason}`).join("\n");
  }
  return base;
}
