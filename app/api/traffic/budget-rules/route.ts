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
// Body: { adAccountId, isPrepaid?, spendCap?, monthlyBudget?, dailyBudget?, paymentMethod?, nextPaymentDate?,
//         verbaMinima?, phone?, pixKey? }
// Leva 4: é o ÚNICO lugar que grava verba, forma de pagamento e próximo aporte (modal "Verba e alertas"
// de Tráfego › Contas & Verba). A aba Investimento, que gravava verba num segundo lugar e o aporte só
// no navegador, saiu. ad_accounts.monthly_budget é a verba de verdade (alertas, ritmo do mês);
// clients.monthly_budget é espelho para quem ainda lê de lá (digest de verba faltando, Design).

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PAGAMENTOS = new Set(["pix", "boleto", "cartao", "transferencia"]);
const semColuna = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /next_payment_date/.test(e.message ?? ""));

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
    nextPaymentDate?: string | null;
    verbaMinima?: number | null;
    phone?: string | null;
    pixKey?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { adAccountId, isPrepaid, spendCap, monthlyBudget, dailyBudget, paymentMethod, nextPaymentDate, verbaMinima, phone, pixKey } = body;
  if (!adAccountId) return NextResponse.json({ error: "adAccountId obrigatório" }, { status: 400 });
  if (verbaMinima != null && (!Number.isFinite(verbaMinima) || verbaMinima < 0)) {
    return NextResponse.json({ error: "Limite de saldo inválido" }, { status: 422 });
  }
  for (const [nome, v] of [["Verba mensal", monthlyBudget], ["Verba diária", dailyBudget], ["Spend cap", spendCap]] as const) {
    if (v != null && (!Number.isFinite(v) || v < 0)) return NextResponse.json({ error: `${nome}: valor inválido` }, { status: 422 });
  }
  if (paymentMethod != null && !PAGAMENTOS.has(paymentMethod)) {
    return NextResponse.json({ error: "Forma de pagamento inválida" }, { status: 422 });
  }
  if (nextPaymentDate != null && nextPaymentDate !== "" && !YMD.test(nextPaymentDate)) {
    return NextResponse.json({ error: "Data do próximo aporte inválida" }, { status: 422 });
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

  const avisos: string[] = [];
  if (acct.client_id) {
    // ── cliente (contato + verba sincronizada) ──
    const clientUpdate: Record<string, unknown> = {};
    if (phone !== undefined) clientUpdate.client_finance_phone = phone;
    if (pixKey !== undefined) clientUpdate.client_pix_key = pixKey;
    // clients.monthly_budget é NOT NULL (default 0): "sem verba" no espelho é 0.
    if (monthlyBudget !== undefined) clientUpdate.monthly_budget = monthlyBudget ?? 0;
    if (dailyBudget !== undefined) clientUpdate.daily_budget = dailyBudget;
    if (paymentMethod !== undefined && paymentMethod !== null) clientUpdate.payment_method = paymentMethod;
    if (nextPaymentDate !== undefined) clientUpdate.next_payment_date = nextPaymentDate || null;
    if (Object.keys(clientUpdate).length > 0) {
      let { error: cErr } = await supabaseAdmin.from("clients").update(clientUpdate).eq("id", acct.client_id);
      // Migração 20260924160000 ainda não aplicada: grava o resto e avisa que o aporte ficou de fora.
      if (cErr && semColuna(cErr) && "next_payment_date" in clientUpdate) {
        delete clientUpdate.next_payment_date;
        avisos.push("A data do próximo aporte ainda não é salva no servidor (falta aplicar a migração 20260924160000).");
        cErr = Object.keys(clientUpdate).length > 0
          ? (await supabaseAdmin.from("clients").update(clientUpdate).eq("id", acct.client_id)).error
          : null;
      }
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

  return NextResponse.json({ ok: true, ...(avisos.length ? { avisos } : {}) });
}
