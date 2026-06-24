// lib/traffic/sync-core.ts — núcleo reutilizável do sync de saldos.
// Extraído de app/api/traffic/sync-balances para ser fonte única usada tanto
// pelo sync manual quanto pelo digest agendado (app/api/system/budget-digest).
//
// Faz: busca Meta API em batch → atualiza ad_accounts → monta snapshots
// enriquecidos (DigestAccount) com severidade calculada → opcionalmente dispara
// alertas em tempo real ao grupo (anti-spam por dia/severidade).

import { supabaseAdmin } from "@/lib/supabase/server";
import {
  fetchAccountBalances,
  fetchBatchDailySpend,
  fetchBatchMonthlySpend,
  calculateAvailableBalance,
  estimateDaysRemaining,
  detectAccountType,
  type MetaAccountFields,
} from "@/lib/meta/account-balance";
import {
  evaluateAccount,
  buildUrgentMessage,
  DEFAULT_ALERT_CONFIG,
  type AlertConfig,
  type DigestAccount,
} from "@/lib/budgets/alert-engine";
import {
  detectClientAlerts,
  DEFAULT_CLIENT_ALERT_CONFIG,
  type ClientAlertConfig,
} from "@/lib/budgets/operational-alerts";
import { fetchActiveCampaignCount } from "@/lib/meta/insights-server";
import { sendGroupText } from "@/lib/whatsapp/evolution";

// ── Config de alerta (agency_settings) ───────────────────────

export type AlertMode = "digest" | "per_account";

export interface AlertSettings extends AlertConfig {
  enabled: boolean;
  groupJid: string | null;
  /** "digest" = um resumo consolidado; "per_account" = uma mensagem por conta. */
  mode: AlertMode;
}

function numOr(v: string | undefined, fallback: number): number {
  const n = v != null ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const { data } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", [
      "traffic_alert_enabled",
      "traffic_alert_group_jid",
      "traffic_alert_warning_pct",
      "traffic_alert_critical_pct",
      "traffic_alert_mode",
    ]);
  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    enabled: (map.get("traffic_alert_enabled") ?? "true") !== "false",
    groupJid: map.get("traffic_alert_group_jid")?.trim() || null,
    warningPct: numOr(map.get("traffic_alert_warning_pct"), DEFAULT_ALERT_CONFIG.warningPct),
    criticalPct: numOr(map.get("traffic_alert_critical_pct"), DEFAULT_ALERT_CONFIG.criticalPct),
    mode: map.get("traffic_alert_mode") === "per_account" ? "per_account" : "digest",
  };
}

export async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("meta_token");
  const expiresAt = map.get("meta_token_expires_at")
    ? parseInt(map.get("meta_token_expires_at")!, 10)
    : null;
  if (!token) return null;
  if (expiresAt && expiresAt < Date.now()) return null;
  return token;
}

// ── Sync ─────────────────────────────────────────────────────

export interface SyncResult {
  synced: number;
  errors: number;
  total: number;
  syncedAt: string;
  /** Snapshots enriquecidos de todas as contas processadas. */
  accounts: DigestAccount[];
  /** Alertas urgentes efetivamente enviados nesta execução. */
  alertsDispatched: number;
  tokenMissing?: boolean;
}

type AccountRow = {
  id: string;
  meta_account_id: string;
  account_name: string | null;
  is_prepaid: boolean;
  spend_cap: number | null;
  monthly_budget: number | null;
  billing_type_source: string | null;
  clients: { id: string; name: string; nome_fantasia: string | null; client_pix_key: string | null } | null;
};

// Carrega a config de alertas por cliente (client_alert_config). Resiliente:
// se a tabela não existir ou der erro, retorna vazio (→ defaults globais).
export async function getClientAlertConfigs(): Promise<Map<string, ClientAlertConfig>> {
  const map = new Map<string, ClientAlertConfig>();
  const { data, error } = await supabaseAdmin.from("client_alert_config").select("*");
  if (error || !data) return map;
  for (const r of data as Array<Record<string, unknown>>) {
    map.set(r.client_id as string, {
      verbaMinima: r.verba_minima != null ? Number(r.verba_minima) : null,
      destino: r.destino === "cliente" ? "cliente" : "interno",
      alertVerbaBaixa: r.alert_verba_baixa !== false,
      alertVerbaZerada: r.alert_verba_zerada !== false,
      alertErroConta: r.alert_erro_conta !== false,
      alertSemGasto: r.alert_sem_gasto !== false,
      alertCampanhaParada: r.alert_campanha_parada === true,
      alertMetaErro: r.alert_meta_erro !== false,
      semGastoDias: typeof r.sem_gasto_dias === "number" ? r.sem_gasto_dias : 3,
    });
  }
  return map;
}

export async function runBalanceSync(opts?: {
  targetAccountIds?: string[] | null;
  settings?: AlertSettings;
  /** Dispara alertas urgentes ao grupo para contas que cruzaram o limite. */
  dispatchRealtimeAlerts?: boolean;
}): Promise<SyncResult> {
  const targetAccountIds = opts?.targetAccountIds ?? null;
  const settings = opts?.settings ?? (await getAlertSettings());
  const emptyResult = (extra: Partial<SyncResult>): SyncResult => ({
    synced: 0, errors: 0, total: 0, syncedAt: new Date().toISOString(),
    accounts: [], alertsDispatched: 0, ...extra,
  });

  const token = await getMetaToken();
  if (!token) return emptyResult({ tokenMissing: true });

  let query = supabaseAdmin
    .from("ad_accounts")
    .select(`
      id, meta_account_id, account_name, is_prepaid, spend_cap, monthly_budget, billing_type_source,
      clients!inner ( id, name, nome_fantasia, client_pix_key )
    `)
    .neq("clients.active", false); // não sincroniza contas de ex-clientes (churned)
  if (targetAccountIds && targetAccountIds.length > 0) {
    query = query.in("meta_account_id", targetAccountIds) as typeof query;
  }

  const { data: accountsData, error: aErr } = await query;
  if (aErr) throw new Error(aErr.message);
  const accounts = (accountsData ?? []) as unknown as AccountRow[];
  if (accounts.length === 0) return emptyResult({});

  const metaIds = accounts.map((a) => a.meta_account_id);
  const [metaData, dailySpendMap, monthlySpendMap] = await Promise.all([
    fetchAccountBalances(token, metaIds),
    fetchBatchDailySpend(token, metaIds),
    fetchBatchMonthlySpend(token, metaIds),
  ]);

  const now = new Date().toISOString();
  let synced = 0;
  let errors = 0;
  const snapshots: DigestAccount[] = [];
  const alertConfigs = await getClientAlertConfigs();

  for (const account of accounts) {
    const clientId = account.clients?.id;
    const acfg: ClientAlertConfig = (clientId && alertConfigs.get(clientId)) || DEFAULT_CLIENT_ALERT_CONFIG;
    const raw = metaData.get(account.meta_account_id);
    const clientName =
      account.clients?.nome_fantasia || account.clients?.name || account.account_name || account.meta_account_id;
    const pixKey = account.clients?.client_pix_key ?? null;

    if (!raw || "error" in raw) {
      const errRaw = raw as { error: string; errorJson?: string } | undefined;
      await supabaseAdmin.from("ad_accounts").update({
        sync_error: errRaw?.error ?? "Erro desconhecido",
        last_error_message: errRaw?.errorJson ?? errRaw?.error ?? null,
        last_synced_at: now,
      }).eq("id", account.id);
      errors++;
      snapshots.push({
        clientName, metaAccountId: account.meta_account_id, isPrepaid: account.is_prepaid,
        available: null, daysRemaining: null, avgDailySpend: null, currency: "BRL", pixKey,
        alert: { severity: "error", reason: errRaw?.error ?? "Erro de sync", pctRemaining: null },
        clientId,
      });
      continue;
    }

    const meta = raw as MetaAccountFields;

    // Auto-detecção de tipo (só sobrescreve se não foi definido manualmente)
    const isManual = account.billing_type_source === "manual";
    let isPrepaid = account.is_prepaid;
    let detectedType: "prepaid" | "postpaid" | null = null;
    if (!isManual) {
      const detected = detectAccountType(meta);
      if (detected !== "unknown") {
        isPrepaid = detected === "prepaid";
        detectedType = detected;
      }
    }

    const dailyInsights = dailySpendMap.get(account.meta_account_id) ?? [];
    const last3 = dailyInsights.slice(-3).filter((v) => v > 0);
    const avg3dSpend = last3.length > 0 ? last3.reduce((a, b) => a + b, 0) / last3.length : null;

    const currentSpent = parseFloat(meta.amount_spent) / 100;
    const balanceFromMeta = calculateAvailableBalance(isPrepaid, account.spend_cap, meta);
    const currentMonthSpend = monthlySpendMap.get(account.meta_account_id) ?? null;

    // Saldo "efetivo" — mesma regra da página (enrichAccount): pós-pago com verba
    // contratada usa verba − gasto do mês; demais usam o saldo calculado da Meta.
    let effectiveAvailable: number | null;
    if (!isPrepaid && account.monthly_budget !== null) {
      effectiveAvailable = currentMonthSpend !== null
        ? Math.max(0, account.monthly_budget - currentMonthSpend)
        : null;
    } else {
      effectiveAvailable = balanceFromMeta;
    }

    const daysRemaining = estimateDaysRemaining(effectiveAvailable, avg3dSpend);
    const alert = evaluateAccount(
      {
        available: effectiveAvailable,
        monthlyBudget: account.monthly_budget,
        daysRemaining,
        accountStatus: meta.account_status,
        // Verba mínima em R$ definida por cliente vence o % global.
        warningThreshold: acfg.alertVerbaBaixa ? acfg.verbaMinima : null,
      },
      settings,
    );

    // Campanha parada: só busca campanhas p/ quem ligou o alerta (custo extra).
    let campaignsActive: number | null = null;
    let campaignsTotal: number | null = null;
    if (acfg.alertCampanhaParada && meta.account_status === 1) {
      const cc = await fetchActiveCampaignCount(token, account.meta_account_id);
      if (cc) { campaignsActive = cc.active; campaignsTotal = cc.total; }
    }

    // Alertas operacionais (sem gasto, etc.) p/ o grupo interno, conforme config do cliente.
    const opAlerts = detectClientAlerts(
      {
        available: effectiveAvailable,
        monthlyBudget: account.monthly_budget,
        avgDailySpend: avg3dSpend,
        accountStatus: meta.account_status,
        syncError: null,
        campaignsActive,
        campaignsTotal,
      },
      acfg,
      settings.warningPct,
      settings.criticalPct,
    );

    const updatePayload: Record<string, unknown> = {
      last_balance: balanceFromMeta,
      last_amount_spent: currentSpent,
      current_month_spend: currentMonthSpend,
      daily_spend_3d: last3.length > 0 ? last3 : null,
      last_3d_avg_spend: avg3dSpend,
      currency: meta.currency ?? "BRL",
      account_status: meta.account_status,
      spend_cap: meta.spend_cap ? parseFloat(meta.spend_cap) / 100 : account.spend_cap,
      sync_error: null,
      last_error_message: null,
      last_synced_at: now,
    };
    if (detectedType !== null) {
      updatePayload.is_prepaid = isPrepaid;
      updatePayload.billing_type_source = "auto";
    }

    const { error: updErr } = await supabaseAdmin.from("ad_accounts").update(updatePayload).eq("id", account.id);
    if (updErr) console.error(`[sync] UPDATE failed for ${account.meta_account_id}:`, updErr.message);

    snapshots.push({
      clientName, metaAccountId: account.meta_account_id, isPrepaid,
      available: effectiveAvailable, daysRemaining, avgDailySpend: avg3dSpend,
      currency: meta.currency ?? "BRL", pixKey, alert,
      adAccountId: account.id, clientId, opAlerts, // anti-spam + config por cliente
    });

    synced++;
  }

  let alertsDispatched = 0;
  if (opts?.dispatchRealtimeAlerts) {
    alertsDispatched = await dispatchRealtimeAlerts(snapshots, settings, now);
  }

  return { synced, errors, total: accounts.length, syncedAt: now, accounts: snapshots, alertsDispatched };
}

// ── Alertas em tempo real ────────────────────────────────────
// Envia no máximo 1 mensagem por (conta, severidade, dia) ao grupo.
// Dedup persistido em budget_alert_log.cycle_key.

async function dispatchRealtimeAlerts(
  snapshots: DigestAccount[],
  settings: AlertSettings,
  now: string,
): Promise<number> {
  if (!settings.enabled || !settings.groupJid) return 0;

  const today = now.slice(0, 10);
  let sent = 0;

  for (const snap of snapshots) {
    const sev = snap.alert.severity;
    if (sev !== "critical" && sev !== "warning") continue;
    const adAccountId = snap.adAccountId;
    if (!adAccountId) continue;

    const cycleKey = `${snap.metaAccountId}|${sev}|${today}`;
    const { data: existing } = await supabaseAdmin
      .from("budget_alert_log")
      .select("id")
      .eq("cycle_key", cycleKey)
      .limit(1);
    if (existing && existing.length > 0) continue; // já avisado hoje nessa severidade

    const res = await sendGroupText(settings.groupJid, buildUrgentMessage(snap));
    if (!res.ok) {
      console.error(`[budget-alert] Falha ao enviar alerta de ${snap.clientName}:`, res.error);
      continue;
    }

    await supabaseAdmin.from("budget_alert_log").insert({
      rule_id: null,
      ad_account_id: adAccountId,
      balance_at_trigger: snap.available ?? 0,
      channel: "whatsapp_group",
      cycle_key: cycleKey,
      sent_at: now,
    });
    sent++;
  }
  return sent;
}
