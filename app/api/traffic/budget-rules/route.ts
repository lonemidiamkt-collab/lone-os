export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-auth";

// ── GET /api/traffic/budget-rules?adAccountId=<uuid> ─────────
// Retorna regras + dados da conta para o modal de configuração.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const adAccountId = searchParams.get("adAccountId");
  if (!adAccountId) {
    return NextResponse.json({ error: "adAccountId obrigatório" }, { status: 400 });
  }

  const { data: rules, error } = await supabaseAdmin
    .from("budget_alert_rules")
    .select("*")
    .eq("ad_account_id", adAccountId)
    .order("severity"); // critical antes de warning (c < w)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: account } = await supabaseAdmin
    .from("ad_accounts")
    .select("id, meta_account_id, account_name, is_prepaid, spend_cap, last_balance, account_status")
    .eq("id", adAccountId)
    .single();

  return NextResponse.json({ rules: rules ?? [], account });
}

// ── POST /api/traffic/budget-rules ───────────────────────────
// Upsert: cria ou substitui o conjunto de regras de uma conta.
// Body: { adAccountId, isPrepaid?, spendCap?, rules: [...], phone?, pixKey? }

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let body: {
    adAccountId: string;
    isPrepaid?: boolean;
    spendCap?: number | null;
    rules: {
      severity: "warning" | "critical";
      threshold_value: number;
      repeat_interval_hours: number;
      max_notifications: number;
      channels: string[];
      is_active: boolean;
    }[];
    phone?: string | null;
    pixKey?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { adAccountId, isPrepaid, spendCap, rules, phone, pixKey } = body;
  if (!adAccountId) return NextResponse.json({ error: "adAccountId obrigatório" }, { status: 400 });

  // ── Validações ───────────────────────────────────────────
  const warningRule = rules.find((r) => r.severity === "warning");
  const criticalRule = rules.find((r) => r.severity === "critical");

  if (warningRule && criticalRule) {
    if (criticalRule.threshold_value >= warningRule.threshold_value) {
      return NextResponse.json(
        { error: "Threshold crítico deve ser menor que o de atenção" },
        { status: 422 },
      );
    }
  }

  for (const rule of rules) {
    if (rule.channels.length === 0) {
      return NextResponse.json({ error: "Ao menos 1 canal de notificação obrigatório" }, { status: 422 });
    }
    if (rule.repeat_interval_hours < 1 || rule.repeat_interval_hours > 24) {
      return NextResponse.json({ error: "Intervalo entre avisos: 1–24h" }, { status: 422 });
    }
    if (rule.max_notifications < 1 || rule.max_notifications > 20) {
      return NextResponse.json({ error: "Máximo de avisos: 1–20" }, { status: 422 });
    }
  }

  // ── Atualizar ad_account (tipo de cobrança + spend_cap) ──
  const accountUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (isPrepaid !== undefined) accountUpdate.is_prepaid = isPrepaid;
  if (spendCap !== undefined) accountUpdate.spend_cap = spendCap;
  await supabaseAdmin.from("ad_accounts").update(accountUpdate).eq("id", adAccountId);

  // ── Atualizar phone/pix no client ───────────────────────
  if (phone !== undefined || pixKey !== undefined) {
    const { data: acct } = await supabaseAdmin
      .from("ad_accounts")
      .select("client_id")
      .eq("id", adAccountId)
      .single();
    if (acct?.client_id) {
      const clientUpdate: Record<string, unknown> = {};
      if (phone !== undefined) clientUpdate.client_finance_phone = phone;
      if (pixKey !== undefined) clientUpdate.client_pix_key = pixKey;
      await supabaseAdmin.from("clients").update(clientUpdate).eq("id", acct.client_id);
    }
  }

  // ── Upsert regras (delete antigas, insert novas) ─────────
  await supabaseAdmin
    .from("budget_alert_rules")
    .delete()
    .eq("ad_account_id", adAccountId);

  if (rules.length > 0) {
    const toInsert = rules.map((r) => ({
      ad_account_id:          adAccountId,
      severity:               r.severity,
      threshold_value:        r.threshold_value,
      repeat_interval_hours:  r.repeat_interval_hours,
      max_notifications:      r.max_notifications,
      channels:               r.channels,
      is_active:              r.is_active,
    }));
    const { error } = await supabaseAdmin.from("budget_alert_rules").insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
