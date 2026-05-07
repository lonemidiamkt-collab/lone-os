// lib/meta/account-balance.ts — server-side only
// Funções puras de cálculo de saldo + fetch batch da Meta API

import { META_CONFIG, getGraphUrl } from "./config";

// ── Tipos ────────────────────────────────────────────────────

export interface MetaAccountFields {
  id: string;
  balance: string;          // saldo pré-pago em centavos (string)
  amount_spent: string;     // já gasto no ciclo
  spend_cap: string | null; // teto pós-pago (null = sem cap)
  currency: string;
  account_status: number;   // 1=Ativa 2=Desativada 3=Em revisão 7=Pendente 9=Grace period
  min_daily_budget?: string;
}

export interface NormalizedBalance {
  metaAccountId: string;    // "act_XXXX"
  currency: string;
  accountStatus: number;
  availableBalance: number; // valor em reais/moeda local (já calculado)
  amountSpent: number;
  spendCap: number | null;
  isPrepaid: boolean;
  rawBalance: number;       // balance bruto (pré-pago) em R$
  error?: string;
}

export interface AdAccountRow {
  id: string;
  meta_account_id: string;
  is_prepaid: boolean;
  spend_cap: number | null;
}

// ── Helpers ───────────────────────────────────────────────────

function centsToReais(centavos: string | null | undefined): number {
  if (!centavos) return 0;
  const n = parseFloat(centavos);
  return Number.isFinite(n) ? n / 100 : 0;
}

// ── Cálculo de saldo disponível ──────────────────────────────

export function calculateAvailableBalance(
  isPrepaid: boolean,
  spendCap: number | null,
  meta: MetaAccountFields,
): number {
  if (isPrepaid) {
    return centsToReais(meta.balance);
  }
  // Pós-pago: cap menos gasto atual
  if (!spendCap && !meta.spend_cap) return Infinity;
  const cap = spendCap ?? centsToReais(meta.spend_cap ?? null);
  const spent = centsToReais(meta.amount_spent);
  return cap - spent;
}

// ── Estimativa de dias restantes ─────────────────────────────

export function estimateDaysRemaining(
  availableBalance: number,
  last3DaysSpend: number[],
): number | null {
  if (!Number.isFinite(availableBalance) || availableBalance <= 0) return null;
  const valid = last3DaysSpend.filter((v) => v > 0);
  if (valid.length === 0) return null;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (avg === 0) return null;
  return availableBalance / avg;
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return "Negativo";
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `~${hours}h`;
  }
  return `~${days.toFixed(1)}d`;
}

// ── Severidade ────────────────────────────────────────────────

export type BalanceSeverity = "critical" | "warning" | "ok" | "disabled" | "error";

export function getBalanceSeverity(
  available: number,
  daysRemaining: number | null,
  accountStatus: number,
  warningThreshold: number | null,
  criticalThreshold: number | null,
): BalanceSeverity {
  if (accountStatus !== 1) return "disabled";
  if (available < 0) return "critical"; // estourou
  if (criticalThreshold !== null && available <= criticalThreshold) return "critical";
  if (daysRemaining !== null && daysRemaining <= 1) return "critical";
  if (warningThreshold !== null && available <= warningThreshold) return "warning";
  if (daysRemaining !== null && daysRemaining <= 3) return "warning";
  return "ok";
}

// ── Fetch batch da Meta API ──────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 1000); // 2s, 4s
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 4) {
        lastError = new Error(`Rate limit (${res.status})`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("fetchWithRetry: todas tentativas falharam");
}

export async function fetchAccountBalances(
  token: string,
  accountIds: string[],  // "act_XXXX"
): Promise<Map<string, MetaAccountFields | { error: string; errorJson?: string }>> {
  const result = new Map<string, MetaAccountFields | { error: string; errorJson?: string }>();
  if (accountIds.length === 0) return result;

  const fields = "balance,amount_spent,spend_cap,currency,account_status,min_daily_budget";
  const BATCH_SIZE = 50;

  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const batch = accountIds.slice(i, i + BATCH_SIZE);
    const ids = batch.join(",");
    const url = `${META_CONFIG.graphApiBase}/${META_CONFIG.graphApiVersion}/?ids=${encodeURIComponent(ids)}&fields=${fields}&access_token=${token}`;

    try {
      const res = await fetchWithRetry(url);
      const json = await res.json();

      if (!res.ok) {
        console.error("[Meta API ERROR] batch", batch, JSON.stringify(json, null, 2));
        const err = json?.error;
        const msg = err
          ? `${err.message} (code ${err.code}${err.error_subcode ? `, subcode ${err.error_subcode}` : ""})`
          : `HTTP ${res.status}`;
        const fullJson = JSON.stringify(json);
        for (const id of batch) result.set(id, { error: msg, errorJson: fullJson });
        continue;
      }

      // Resposta é um objeto: { "act_123": { ...fields }, "act_456": { ...fields } }
      for (const id of batch) {
        if (json[id]) {
          result.set(id, json[id] as MetaAccountFields);
        } else {
          result.set(id, { error: "Conta não encontrada na resposta" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const id of batch) result.set(id, { error: msg });
    }
  }

  return result;
}

// ── Status da conta Meta → label/cor ─────────────────────────

export function getAccountStatusLabel(status: number | null | undefined): string {
  switch (status) {
    case 1:  return "Ativa";
    case 2:  return "Desativada";
    case 3:  return "Em revisão";
    case 7:  return "Pendente";
    case 9:  return "Grace period";
    default: return "Desconhecido";
  }
}
