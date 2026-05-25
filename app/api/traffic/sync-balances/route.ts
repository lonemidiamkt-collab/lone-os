export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
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

// ── Helpers ──────────────────────────────────────────────────

async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("meta_token");
  const expiresAt = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token) return null;
  if (expiresAt && expiresAt < Date.now()) return null;
  return token;
}

// ── GET /api/traffic/sync-balances ───────────────────────────
// Retorna dados atuais do DB (sem chamar Meta) para o frontend.

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("ad_accounts")
      .select(`
        id, meta_account_id, account_name, is_prepaid, billing_type_source, spend_cap,
        last_balance, last_amount_spent, current_month_spend, last_3d_avg_spend, daily_spend_3d,
        last_synced_at, currency, account_status, sync_error, last_error_message, monthly_budget,
        clients!inner (
          id, name, nome_fantasia, client_finance_phone, client_pix_key
        ),
        budget_alert_rules (
          id, severity, threshold_value, is_active
        )
      `)
      .order("account_name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ accounts: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/traffic/sync-balances ──────────────────────────
// Chama Meta API em batch, atualiza DB, retorna resultado.

export async function POST(req: NextRequest) {
  try {
    // Aceita tanto chamada de cron (sem body) quanto manual (pode ter { accountIds: [...] })
    let targetAccountIds: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.accountIds)) targetAccountIds = body.accountIds;
    } catch { /* sem body = sync geral */ }

    const token = await getMetaToken();
    if (!token) {
      return NextResponse.json({ error: "Meta token não configurado ou expirado" }, { status: 400 });
    }

    // Buscar contas ativas no DB
    let query = supabaseAdmin
      .from("ad_accounts")
      .select("id, meta_account_id, account_name, is_prepaid, spend_cap, monthly_budget, billing_type_source");

    if (targetAccountIds && targetAccountIds.length > 0) {
      query = query.in("meta_account_id", targetAccountIds) as typeof query;
    }

    const { data: accounts, error: aErr } = await query;
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ synced: 0, message: "Nenhuma conta cadastrada" });
    }

    type AccountRow = { id: string; meta_account_id: string; account_name: string | null; is_prepaid: boolean; spend_cap: number | null; monthly_budget: number | null; billing_type_source: string | null };
    const typedAccounts = accounts as AccountRow[];
    const metaIds = typedAccounts.map((a) => a.meta_account_id);
    const [metaData, dailySpendMap, monthlySpendMap] = await Promise.all([
      fetchAccountBalances(token, metaIds),
      fetchBatchDailySpend(token, metaIds),
      fetchBatchMonthlySpend(token, metaIds),
    ]);

    const now = new Date().toISOString();
    let synced = 0;
    let errors = 0;

    for (const account of typedAccounts) {
      const raw = metaData.get(account.meta_account_id);

      if (!raw || "error" in raw) {
        const errRaw = raw as { error: string; errorJson?: string } | undefined;
        await supabaseAdmin.from("ad_accounts").update({
          sync_error:          errRaw?.error ?? "Erro desconhecido",
          last_error_message:  errRaw?.errorJson ?? errRaw?.error ?? null,
          last_synced_at:      now,
        }).eq("id", account.id);
        errors++;
        continue;
      }

      const meta = raw as MetaAccountFields;

      // Auto-detecção de tipo de conta (só sobrescreve se não foi definido manualmente)
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

      // Gasto médio dos últimos 3 dias via Insights API (batch, já buscado acima)
      const dailyInsights = dailySpendMap.get(account.meta_account_id) ?? [];
      // Pegar os 3 dias mais recentes (array já vem em ordem crescente de data)
      const last3 = dailyInsights.slice(-3).filter((v) => v > 0);
      const avg3dSpend = last3.length > 0
        ? last3.reduce((a, b) => a + b, 0) / last3.length
        : null;

      const currentSpent = parseFloat(meta.amount_spent) / 100;

      const availableBalance = calculateAvailableBalance(
        isPrepaid,
        account.spend_cap,
        meta,
      );

      // Gasto do mês corrente via Insights (já em reais, não centavos).
      // Usado para calcular saldo de contas pós-pagas com verba mensal contratada.
      const currentMonthSpend = monthlySpendMap.get(account.meta_account_id) ?? null;

      const updatePayload: Record<string, unknown> = {
        last_balance:           availableBalance,
        last_amount_spent:      currentSpent,
        current_month_spend:    currentMonthSpend,
        daily_spend_3d:         last3.length > 0 ? last3 : null,
        last_3d_avg_spend:      avg3dSpend,
        currency:               meta.currency ?? "BRL",
        account_status:         meta.account_status,
        spend_cap:              meta.spend_cap ? parseFloat(meta.spend_cap) / 100 : account.spend_cap,
        sync_error:             null,
        last_error_message:     null,
        last_synced_at:         now,
      };
      if (detectedType !== null) {
        updatePayload.is_prepaid = isPrepaid;
        updatePayload.billing_type_source = "auto";
      }

      const { error: updErr } = await supabaseAdmin.from("ad_accounts").update(updatePayload).eq("id", account.id);
      if (updErr) console.error(`[sync] UPDATE failed for ${account.meta_account_id}:`, updErr.message, updErr.code);

      // ── Avaliador de regras de alerta ──────────────────────
      if (meta.account_status === 1 && availableBalance !== null) {
        await evaluateAlertRules(account.id, availableBalance, avg3dSpend, now);
      }

      synced++;
    }

    return NextResponse.json({
      synced,
      errors,
      total: accounts.length,
      syncedAt: now,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── Engine de alertas ─────────────────────────────────────────

async function evaluateAlertRules(
  adAccountId: string,
  availableBalance: number,
  avgDailySpend: number | null,
  now: string,
) {
  const { data: rules } = await supabaseAdmin
    .from("budget_alert_rules")
    .select("*")
    .eq("ad_account_id", adAccountId)
    .eq("is_active", true);

  if (!rules || rules.length === 0) return;

  const today = now.slice(0, 10); // "YYYY-MM-DD"
  const daysRemaining = estimateDaysRemaining(availableBalance, avgDailySpend);

  for (const rule of rules) {
    const triggered = availableBalance <= (rule.threshold_value as number);
    const cycleKey = `${adAccountId}|${rule.id}|${today}`;

    if (!triggered) {
      // Saldo voltou acima do threshold: apagar logs do ciclo atual (reset)
      await supabaseAdmin
        .from("budget_alert_log")
        .delete()
        .eq("cycle_key", cycleKey);
      continue;
    }

    // Verificar quantas notificações já foram enviadas nesse ciclo
    const { data: logs } = await supabaseAdmin
      .from("budget_alert_log")
      .select("sent_at")
      .eq("cycle_key", cycleKey)
      .order("sent_at", { ascending: false });

    const sendCount = logs?.length ?? 0;
    if (sendCount >= (rule.max_notifications as number)) continue;

    // Verificar intervalo mínimo entre envios
    if (sendCount > 0 && logs && logs[0]) {
      const lastSent = new Date(logs[0].sent_at as string).getTime();
      const hoursSinceLast = (Date.now() - lastSent) / 3_600_000;
      if (hoursSinceLast < (rule.repeat_interval_hours as number)) continue;
    }

    // ── Disparar notificação ──────────────────────────────────
    const channels = (rule.channels as string[]) ?? ["whatsapp"];
    for (const channel of channels) {
      await sendBudgetAlert(adAccountId, rule, channel, availableBalance, daysRemaining);
      await supabaseAdmin.from("budget_alert_log").insert({
        rule_id:           rule.id,
        ad_account_id:     adAccountId,
        balance_at_trigger: availableBalance,
        channel,
        cycle_key:         cycleKey,
        sent_at:           now,
      });
    }
  }
}

async function sendBudgetAlert(
  adAccountId: string,
  rule: Record<string, unknown>,
  channel: string,
  balance: number,
  daysRemaining: number | null,
) {
  const { data: account } = await supabaseAdmin
    .from("ad_accounts")
    .select("meta_account_id, account_name, clients(name, client_finance_phone, client_pix_key)")
    .eq("id", adAccountId)
    .single();

  if (!account) return;

  type ClientRow = { name: string; client_finance_phone: string | null; client_pix_key: string | null };
  const cl = Array.isArray(account.clients)
    ? (account.clients[0] as ClientRow | undefined)
    : (account.clients as unknown as ClientRow | null);
  const clientName = cl?.name ?? "Cliente";
  const phone = cl?.client_finance_phone ?? null;
  const pixKey = cl?.client_pix_key ?? "—";
  const daysStr = daysRemaining !== null ? `~${daysRemaining.toFixed(1)}d` : "—";

  // Severity label
  const severityLabel = rule.severity === "critical" ? "🚨 Saldo CRÍTICO" : "⚠️ Saldo baixo";

  const message =
    `${severityLabel} — ${clientName}\n` +
    `Conta: ${account.account_name ?? account.meta_account_id} (${account.meta_account_id})\n` +
    `Saldo atual: R$ ${balance.toFixed(2)}\n` +
    `Estimativa: pausa em ${daysStr}\n` +
    `\nPix: ${pixKey}`;

  if (channel === "whatsapp" && phone) {
    // Apenas log no servidor v1 — integração real via WhatsApp Business API no v2
    console.log(`[BudgetAlert] WhatsApp para ${phone}: ${message}`);
  }
  // Slack / email: implementar no v2
}
