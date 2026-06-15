// lib/meta/account-balance.ts — server-side only
// Funções puras de cálculo de saldo + fetch batch da Meta API

import { META_CONFIG } from "./config";
import {
  evaluateAccount,
  DEFAULT_ALERT_CONFIG,
  type AlertConfig,
} from "@/lib/budgets/alert-engine";

// ── Tipos ────────────────────────────────────────────────────

export interface MetaAccountFields {
  id: string;
  balance: string;          // saldo pré-pago em centavos (string)
  amount_spent: string;     // já gasto no ciclo, em centavos
  spend_cap: string | null; // teto pós-pago em centavos (null ou "0" = sem cap real)
  currency: string;
  account_status: number;   // 1=Ativa 2=Desativada 3=Em revisão 7=Pendente 9=Grace period
  min_daily_budget?: string;
  funding_source_details?: {
    id?: string;
    type: number; // 1=cartão/crédito (pós-pago) 2=boleto/Pix (pré-pago)
    display_string?: string;
  } | null;
}

export interface NormalizedBalance {
  metaAccountId: string;    // "act_XXXX"
  currency: string;
  accountStatus: number;
  availableBalance: number | null; // null = não calculável (pós-pago sem cap)
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

// Spend caps acima deste valor (em centavos) são o "ilimitado" da Meta (ex: 922337203685477)
const SPEND_CAP_INFINITY_CENTS = 10_000_000_000; // R$ 100M

// Extrai o valor numérico de funding_source_details.display_string.
// Ex: "Saldo disponível (R$2.880,80 BRL)" → 2880.80
// Essa string é exatamente o que o Gerenciador de Anúncios exibe como saldo disponível.
function parseDisplayStringBalance(displayString: string | undefined): number | null {
  if (!displayString) return null;
  const match = displayString.match(/R\$\s*([\d.,]+)/);
  if (!match) return null;
  const raw = match[1];
  // Formato pt-BR: "2.880,80" — ponto = milhar, vírgula = decimal
  if (raw.includes(",")) {
    return parseFloat(raw.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(raw.replace(/,/g, ""));
}

// ── Auto-detecção de tipo de conta ───────────────────────────

export function detectAccountType(meta: MetaAccountFields): "prepaid" | "postpaid" | "unknown" {
  const fs = meta.funding_source_details;
  if (!fs) return "unknown";
  if (fs.type === 1) return "postpaid"; // cartão de crédito
  if (fs.type === 2) return "prepaid";  // boleto / Pix / pré-pago
  // type=20: conta com saldo pré-pago creditado (Brasil) — display_string mostra o valor real
  if (fs.type === 20) return "prepaid";
  return "unknown";
}

// ── Cálculo de saldo disponível ──────────────────────────────
// Retorna null quando não é possível calcular (pós-pago sem cap definido).
// A conversão centavos→reais ocorre UMA ÚNICA VEZ aqui — tudo abaixo é em reais.

export function calculateAvailableBalance(
  isPrepaid: boolean,
  spendCap: number | null,   // já em reais (vem do DB)
  meta: MetaAccountFields,   // valores em centavos (vem da Meta API)
): number | null {
  // funding_source_details.display_string é a fonte mais precisa quando disponível —
  // é exatamente o valor que o Gerenciador de Anúncios exibe como "Saldo disponível".
  // O campo `balance` da API NÃO é o saldo da campanha para contas type=20.
  const displayBalance = parseDisplayStringBalance(meta.funding_source_details?.display_string);
  if (displayBalance !== null) return displayBalance;

  if (isPrepaid) {
    // Pré-pago sem display_string: usar balance bruto da carteira
    return centsToReais(meta.balance);
  }

  // Pós-pago: cap - gasto. Precisamos de um cap real.
  const rawCapCents = parseFloat(meta.spend_cap ?? "0");
  const hasRealCap = (spendCap !== null && spendCap > 0) ||
    (rawCapCents > 0 && rawCapCents < SPEND_CAP_INFINITY_CENTS);

  if (!hasRealCap) return null; // sem cap definido, não dá pra calcular

  const cap = spendCap ?? centsToReais(meta.spend_cap ?? null);
  const spent = centsToReais(meta.amount_spent);
  return Math.max(0, cap - spent);
}

// ── Estimativa de dias restantes ─────────────────────────────

export function estimateDaysRemaining(
  availableBalance: number | null,
  avgDailySpend: number | null,
): number | null {
  if (availableBalance === null || availableBalance <= 0) return null;
  if (!avgDailySpend || avgDailySpend <= 0) return null;
  return availableBalance / avgDailySpend;
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return "Negativo";
  if (days > 365) return "> 1 ano";
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `~${hours}h`;
  }
  return `~${days.toFixed(1)}d`;
}

// ── Severidade ────────────────────────────────────────────────

export type BalanceSeverity = "critical" | "warning" | "ok" | "disabled" | "error";

// Delega ao motor único de alerta (lib/budgets/alert-engine). Mantém a
// assinatura legada e adiciona `monthlyBudget` (base do % de verba) e `config`.
// monthlyBudget é opcional para não quebrar chamadas antigas; quando ausente,
// vale só o paraquedas universal (saldo <= 0, dias <= 1/3) + thresholds manuais.
export function getBalanceSeverity(
  available: number | null,
  daysRemaining: number | null,
  accountStatus: number,
  warningThreshold: number | null,
  criticalThreshold: number | null,
  monthlyBudget: number | null = null,
  config: AlertConfig = DEFAULT_ALERT_CONFIG,
): BalanceSeverity {
  return evaluateAccount(
    { available, monthlyBudget, daysRemaining, accountStatus, warningThreshold, criticalThreshold },
    config,
  ).severity;
}

// ── Fetch batch da Meta API — saldos ─────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 1000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status === 429) {
        lastError = new Error(`Rate limit (429)`);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === "AbortError") lastError = new Error("Timeout Meta API (10s)");
    }
  }
  throw lastError ?? new Error("fetchWithRetry: todas tentativas falharam");
}

export async function fetchAccountBalances(
  token: string,
  accountIds: string[],
): Promise<Map<string, MetaAccountFields | { error: string; errorJson?: string }>> {
  const result = new Map<string, MetaAccountFields | { error: string; errorJson?: string }>();
  if (accountIds.length === 0) return result;

  const fields = "balance,amount_spent,spend_cap,currency,account_status,min_daily_budget,funding_source_details";
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

// ── Fetch batch de gasto do mês atual via Insights ───────────
// Retorna mapa de act_id → total gasto no mês corrente em reais
// Usa time_range explícito (1º do mês → hoje) para capturar gasto parcial de hoje.
// date_preset=this_month cobre apenas até ontem — usamos range explícito para incluir hoje.
// Campo "spend" do Insights já vem na moeda da conta (NÃO centavos).

export async function fetchBatchMonthlySpend(
  token: string,
  accountIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (accountIds.length === 0) return result;

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const firstDay = today.slice(0, 8) + "01"; // "YYYY-MM-01"
  const timeRange = encodeURIComponent(JSON.stringify({ since: firstDay, until: today }));

  const BATCH_SIZE = 50;

  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const batch = accountIds.slice(i, i + BATCH_SIZE);
    const requests = batch.map((id) => ({
      method: "GET",
      relative_url: `${id}/insights?fields=spend&time_range=${timeRange}`,
    }));

    const body = new URLSearchParams();
    body.set("access_token", token);
    body.set("batch", JSON.stringify(requests));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(
        `${META_CONFIG.graphApiBase}/${META_CONFIG.graphApiVersion}/`,
        {
          method: "POST",
          body: body.toString(),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.error("[Meta] Monthly spend HTTP error:", res.status);
        continue;
      }

      const responses: Array<{ code: number; body: string } | null> = await res.json();

      for (let j = 0; j < batch.length; j++) {
        const id = batch[j];
        const item = responses[j];
        if (!item || item.code !== 200) continue;
        try {
          const data: { data?: Array<{ spend?: string }> } = JSON.parse(item.body);
          const spend = parseFloat(data.data?.[0]?.spend ?? "0");
          if (Number.isFinite(spend) && spend >= 0) result.set(id, spend);
        } catch {
          // ignora erros por conta
        }
      }
    } catch (err) {
      console.error("[Meta] Monthly spend error:", err instanceof Error ? err.message : err);
    }
  }

  return result;
}

// ── Fetch batch de gasto diário via Insights (últimos 7 dias) ─
// Retorna mapa de act_id → array de gastos diários em reais (mais recente por último)

export async function fetchBatchDailySpend(
  token: string,
  accountIds: string[],
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (accountIds.length === 0) return result;

  const BATCH_SIZE = 50;

  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const batch = accountIds.slice(i, i + BATCH_SIZE);
    const requests = batch.map((id) => ({
      method: "GET",
      relative_url: `${id}/insights?fields=spend&date_preset=last_7d&time_increment=1`,
    }));

    const body = new URLSearchParams();
    body.set("access_token", token);
    body.set("batch", JSON.stringify(requests));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(
        `${META_CONFIG.graphApiBase}/${META_CONFIG.graphApiVersion}/`,
        {
          method: "POST",
          body: body.toString(),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.error("[Meta] Batch insights HTTP error:", res.status);
        continue;
      }

      const responses: Array<{ code: number; body: string } | null> = await res.json();

      for (let j = 0; j < batch.length; j++) {
        const id = batch[j];
        const item = responses[j];
        if (!item || item.code !== 200) continue;
        try {
          const data: { data?: Array<{ spend?: string }> } = JSON.parse(item.body);
          const days = (data.data ?? [])
            .map((d) => parseFloat(d.spend ?? "0"))
            .filter((v) => v > 0);
          if (days.length > 0) result.set(id, days);
        } catch {
          // ignore parse errors per account
        }
      }
    } catch (err) {
      console.error("[Meta] Batch insights error:", err instanceof Error ? err.message : err);
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
