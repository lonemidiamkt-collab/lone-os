export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/okr/traffic-metrics
// Agrega o investimento REAL (gasto ÷ verba) das contas de anúncio dos clientes
// em operação (exclui draft e onboarding). Usado em Metas & OKRs para o
// "Investimento Executado" deixar de ser mock e passar a refletir ad_accounts.
export async function GET() {
  try {
    const [{ data: accounts }, { data: clients }] = await Promise.all([
      supabaseAdmin.from("ad_accounts").select("meta_account_id, monthly_budget, current_month_spend"),
      supabaseAdmin.from("clients").select("meta_ad_account_id, status, draft_status"),
    ]);

    // Contas de clientes em operação (exclui draft e onboarding)
    const activeAcctIds = new Set(
      (clients ?? [])
        .filter((c) => c.draft_status == null && c.status !== "onboarding" && c.meta_ad_account_id)
        .map((c) => c.meta_ad_account_id as string),
    );

    let totalBudget = 0;
    let totalSpend = 0;
    let accountsCounted = 0;
    let hasRealSpend = false;
    for (const a of accounts ?? []) {
      if (!activeAcctIds.has(a.meta_account_id as string)) continue;
      const budget = Number(a.monthly_budget) || 0;
      if (budget <= 0) continue;
      totalBudget += budget;
      if (a.current_month_spend != null) {
        totalSpend += Number(a.current_month_spend) || 0;
        hasRealSpend = true;
      }
      accountsCounted++;
    }

    const investmentExecutedPct = totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : 0;

    return NextResponse.json({
      investmentExecutedPct,
      totalBudget,
      totalSpend: Math.round(totalSpend),
      accountsCounted,
      isReal: hasRealSpend && totalBudget > 0,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
