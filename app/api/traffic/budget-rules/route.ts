export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, type Papel } from "@/lib/api/require-role";

// Verba e limite de saldo são o trabalho do gestor de tráfego, não só da gestão.
const PODE_VERBA: Papel[] = ["admin", "manager", "traffic"];

// Configuração de cobrança/verba de uma conta de anúncio (modal de /traffic/budgets).
// O limite de saldo baixo é client_alert_config.verba_minima — o MESMO que o alerta do servidor lê.
// As antigas budget_alert_rules (intervalo, máx. avisos, canais) não eram lidas por nenhum job e saíram.

// ── GET /api/traffic/budget-rules?adAccountId=<uuid> ─────────

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PODE_VERBA);
  if (gate instanceof NextResponse) return gate;

  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) {
    return NextResponse.json({ error: "adAccountId obrigatório" }, { status: 400 });
  }

  const { data: account, error } = await supabaseAdmin
    .from("ad_accounts")
    .select("id, client_id, meta_account_id, account_name, is_prepaid, spend_cap, last_balance, account_status")
    .eq("id", adAccountId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  let verbaMinima: number | null = null;
  if (account.client_id) {
    const { data: cfg, error: cErr } = await supabaseAdmin
      .from("client_alert_config").select("verba_minima").eq("client_id", account.client_id).maybeSingle();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    verbaMinima = cfg?.verba_minima != null ? Number(cfg.verba_minima) : null;
  }

  return NextResponse.json({ account, verbaMinima });
}

// ── POST /api/traffic/budget-rules ───────────────────────────
// Body: { adAccountId, isPrepaid?, spendCap?, monthlyBudget?, dailyBudget?, paymentMethod?, verbaMinima?, phone?, pixKey? }

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PODE_VERBA);
  if (gate instanceof NextResponse) return gate;

  let body: {
    adAccountId: string;
    isPrepaid?: boolean;
    spendCap?: number | null;
    monthlyBudget?: number | null;
    dailyBudget?: number | null;
    paymentMethod?: string | null;
    verbaMinima?: number | null;
    phone?: string | null;
    pixKey?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { adAccountId, isPrepaid, spendCap, monthlyBudget, dailyBudget, paymentMethod, verbaMinima, phone, pixKey } = body;
  if (!adAccountId) return NextResponse.json({ error: "adAccountId obrigatório" }, { status: 400 });
  if (verbaMinima != null && (!Number.isFinite(verbaMinima) || verbaMinima < 0)) {
    return NextResponse.json({ error: "Limite de saldo inválido" }, { status: 422 });
  }

  const { data: acct, error: aErr } = await supabaseAdmin
    .from("ad_accounts").select("client_id").eq("id", adAccountId).maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!acct) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  // ── ad_account (tipo de cobrança + spend_cap + verba) ──
  const accountUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (isPrepaid !== undefined) accountUpdate.is_prepaid = isPrepaid;
  if (spendCap !== undefined) accountUpdate.spend_cap = spendCap;
  if (monthlyBudget !== undefined) accountUpdate.monthly_budget = monthlyBudget;
  const { error: upAccErr } = await supabaseAdmin.from("ad_accounts").update(accountUpdate).eq("id", adAccountId);
  if (upAccErr) return NextResponse.json({ error: upAccErr.message }, { status: 500 });

  if (acct.client_id) {
    // ── cliente (contato + verba sincronizada) ──
    const clientUpdate: Record<string, unknown> = {};
    if (phone !== undefined) clientUpdate.client_finance_phone = phone;
    if (pixKey !== undefined) clientUpdate.client_pix_key = pixKey;
    if (monthlyBudget !== undefined) clientUpdate.monthly_budget = monthlyBudget;
    if (dailyBudget !== undefined) clientUpdate.daily_budget = dailyBudget;
    if (paymentMethod !== undefined) clientUpdate.payment_method = paymentMethod;
    if (Object.keys(clientUpdate).length > 0) {
      const { error: cErr } = await supabaseAdmin.from("clients").update(clientUpdate).eq("id", acct.client_id);
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    // ── limite de saldo: upsert preserva os toggles; 0 vira null (= herda o % da verba) ──
    if (verbaMinima !== undefined) {
      const { error: vErr } = await supabaseAdmin.from("client_alert_config").upsert({
        client_id: acct.client_id,
        verba_minima: verbaMinima != null && verbaMinima > 0 ? verbaMinima : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });
      if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
