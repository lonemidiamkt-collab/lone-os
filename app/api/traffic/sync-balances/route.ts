export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runBalanceSync } from "@/lib/traffic/sync-core";
import { requireCronOrUser } from "@/lib/api/cron-guard";

// ── GET /api/traffic/sync-balances ───────────────────────────
// Retorna dados atuais do DB (sem chamar Meta) para o frontend.
// Exige login (vaza PIX/telefone dos clientes) ou CRON_SECRET.

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
  try {
    // next_payment_date (Contas & Verba) vem da migração 20260924160000; antes dela, lê sem a coluna.
    const colunas = (comAporte: boolean) => `
        id, meta_account_id, account_name, is_prepaid, billing_type_source, spend_cap,
        last_balance, last_amount_spent, current_month_spend, last_3d_avg_spend, daily_spend_3d,
        last_synced_at, currency, account_status, sync_error, last_error_message, monthly_budget,
        clients!inner (
          id, name, nome_fantasia, client_finance_phone, client_pix_key, daily_budget, payment_method${comAporte ? ", next_payment_date" : ""}
        )
      `;
    let { data, error } = await supabaseAdmin.from("ad_accounts").select(colunas(true)).order("account_name");
    let aporteDisponivel = true;
    if (error && (error.code === "42703" || /next_payment_date/.test(error.message))) {
      aporteDisponivel = false;
      ({ data, error } = await supabaseAdmin.from("ad_accounts").select(colunas(false)).order("account_name"));
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Limite de saldo que o alerta do servidor usa de verdade (client_alert_config.verba_minima).
    const { data: cfgs, error: cfgErr } = await supabaseAdmin
      .from("client_alert_config").select("client_id, verba_minima");
    if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });
    const verbaPorCliente = new Map((cfgs ?? []).map((c) => [c.client_id as string, c.verba_minima as number | null]));
    // select montado em string (com/sem a coluna nova) perde a tipagem do supabase-js: tipa à mão.
    const linhas = (data ?? []) as unknown as Array<Record<string, unknown> & { clients: { id: string } | null }>;
    const accounts = linhas.map((a) => {
      const cli = a.clients;
      return { ...a, verba_minima: cli ? verbaPorCliente.get(cli.id) ?? null : null };
    });

    return NextResponse.json({ accounts, aporteDisponivel });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/traffic/sync-balances ──────────────────────────
// Chama Meta API em batch, atualiza DB, dispara alertas em tempo real e
// retorna resultado. Núcleo extraído para lib/traffic/sync-core (reutilizado
// pelo digest agendado).

export async function POST(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
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
