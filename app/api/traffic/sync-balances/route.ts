export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runBalanceSync } from "@/lib/traffic/sync-core";

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
// Chama Meta API em batch, atualiza DB, dispara alertas em tempo real e
// retorna resultado. Núcleo extraído para lib/traffic/sync-core (reutilizado
// pelo digest agendado).

export async function POST(req: NextRequest) {
  try {
    // Aceita chamada de cron (sem body) ou manual ({ accountIds: [...] }).
    let targetAccountIds: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.accountIds)) targetAccountIds = body.accountIds;
    } catch { /* sem body = sync geral */ }

    const result = await runBalanceSync({
      targetAccountIds,
      dispatchRealtimeAlerts: true,
    });

    if (result.tokenMissing) {
      return NextResponse.json({ error: "Meta token não configurado ou expirado" }, { status: 400 });
    }

    return NextResponse.json({
      synced: result.synced,
      errors: result.errors,
      total: result.total,
      syncedAt: result.syncedAt,
      alertsDispatched: result.alertsDispatched,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
