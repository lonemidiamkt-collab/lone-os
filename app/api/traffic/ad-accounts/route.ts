export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAccountBalances, detectAccountType } from "@/lib/meta/account-balance";
import { requireCronOrUser } from "@/lib/api/cron-guard";

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

// GET /api/traffic/ad-accounts
// Returns Meta ad accounts accessible with the stored token, filtered to exclude already-linked ones.
// Also returns all clients for the selector.
export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
  try {
    const token = await getMetaToken();
    if (!token) {
      return NextResponse.json({ error: "Token Meta não configurado ou expirado" }, { status: 400 });
    }

    // Fetch Business accounts accessible by the token
    const meUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,amount_spent,balance,spend_cap,funding_source_details&limit=200&access_token=${token}`;
    const meRes = await fetch(meUrl);
    const meJson = await meRes.json();

    if (!meRes.ok || meJson.error) {
      const err = meJson?.error;
      return NextResponse.json({
        error: err ? `${err.message} (code ${err.code})` : `HTTP ${meRes.status}`,
      }, { status: 502 });
    }

    const metaAccounts: Array<{
      id: string;
      name: string;
      account_status: number;
      currency: string;
    }> = meJson.data ?? [];

    // Get already-linked account IDs from DB
    const { data: linked } = await supabaseAdmin
      .from("ad_accounts")
      .select("meta_account_id");

    const linkedSet = new Set((linked ?? []).map((r: { meta_account_id: string }) => r.meta_account_id));

    // Filter out already-linked accounts and closed/inactive ones
    const available = metaAccounts.filter(
      (a) => !linkedSet.has(a.id) && a.account_status !== 100,
    );

    // Get all clients for the selector
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, name, nome_fantasia")
      .order("name");

    return NextResponse.json({
      accounts: available,
      clients: clients ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/traffic/ad-accounts
// Links a Meta ad account to a client and triggers an immediate sync.
export async function POST(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const { clientId, metaAccountId, accountName, isPrepaid } = body as {
      clientId: string;
      metaAccountId: string;
      accountName: string;
      isPrepaid?: boolean;
    };

    if (!clientId || !metaAccountId) {
      return NextResponse.json({ error: "clientId e metaAccountId são obrigatórios" }, { status: 400 });
    }

    // Check for duplicates
    const { data: existing } = await supabaseAdmin
      .from("ad_accounts")
      .select("id")
      .eq("meta_account_id", metaAccountId)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Conta já cadastrada no sistema" }, { status: 409 });
    }

    // Try to auto-detect billing type from Meta if we have a token
    let resolvedIsPrepaid = isPrepaid ?? true;
    const token = await getMetaToken();
    if (token) {
      const metaData = await fetchAccountBalances(token, [metaAccountId]);
      const raw = metaData.get(metaAccountId);
      if (raw && !("error" in raw)) {
        const detected = detectAccountType(raw);
        if (detected !== "unknown") resolvedIsPrepaid = detected === "prepaid";
      }
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("ad_accounts")
      .insert({
        client_id:      clientId,
        meta_account_id: metaAccountId,
        account_name:   accountName || null,
        is_prepaid:     resolvedIsPrepaid,
        billing_type_source: token ? "auto" : null,
      })
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: inserted.id, synced: false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/traffic/ad-accounts
// Persiste os dados de investimento do cliente (verba mensal, verba diária, forma de
// pagamento) no banco — em clients (exibição + cross-device) e sincroniza a verba mensal
// em ad_accounts (fonte dos alertas). Usado pelo editor de investimento da tela de Tráfego,
// em vez de salvar só no localStorage.
export async function PATCH(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const { clientId, monthlyBudget, dailyBudget, paymentMethod } = body as {
      clientId?: string;
      monthlyBudget?: number | null;
      dailyBudget?: number | null;
      paymentMethod?: string | null;
    };
    if (!clientId) {
      return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
    }

    // 1) Persiste no cliente (exibição + carrega em qualquer dispositivo)
    const clientUpdate: Record<string, unknown> = {};
    if (monthlyBudget !== undefined) clientUpdate.monthly_budget = monthlyBudget;
    if (dailyBudget !== undefined) clientUpdate.daily_budget = dailyBudget;
    if (paymentMethod !== undefined) clientUpdate.payment_method = paymentMethod;
    if (Object.keys(clientUpdate).length > 0) {
      const { error: cErr } = await supabaseAdmin.from("clients").update(clientUpdate).eq("id", clientId);
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    // 2) Sincroniza a VERBA na conta de anúncio (fonte dos alertas de saldo/verba)
    let alertsWired = false;
    if (monthlyBudget !== undefined) {
      const { data: acct } = await supabaseAdmin
        .from("ad_accounts")
        .select("id")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();
      if (acct?.id) {
        await supabaseAdmin
          .from("ad_accounts")
          .update({ monthly_budget: monthlyBudget, updated_at: new Date().toISOString() })
          .eq("id", acct.id);
        alertsWired = true;
      }
    }

    return NextResponse.json({ ok: true, alertsWired });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
