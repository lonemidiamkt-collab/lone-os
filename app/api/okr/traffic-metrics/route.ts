export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";

// GET /api/okr/traffic-metrics
// Agrega o investimento REAL (gasto ÷ verba) das contas de anúncio dos clientes
// em operação (exclui draft e onboarding). Usado em Metas & OKRs para o
// "Investimento Executado" deixar de ser mock e passar a refletir ad_accounts.
// Exige login: expõe orçamento/gasto consolidado (financeiro).
export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
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
    let withinBudget = 0;
    let hasRealSpend = false;
    for (const a of accounts ?? []) {
      if (!activeAcctIds.has(a.meta_account_id as string)) continue;
      const budget = Number(a.monthly_budget) || 0;
      if (budget <= 0) continue;
      totalBudget += budget;
      if (a.current_month_spend != null) {
        const spend = Number(a.current_month_spend) || 0;
        totalSpend += spend;
        if (spend <= budget) withinBudget++;
        hasRealSpend = true;
      }
      accountsCounted++;
    }

    const investmentExecutedPct = totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : 0;
    const accountsWithinBudgetPct = accountsCounted > 0 ? Math.round((withinBudget / accountsCounted) * 100) : 0;

    // Métricas REAIS agregadas (função deduplicada — evita o bug do 95× de capturas/dia):
    // leads/CPL, qualidade de tráfego (CTR/alcance), churn real e relacionamento.
    // Ver 074/075_okr_live_metrics. Se falhar, cai em zeros (não inventa).
    const { data: live } = await supabaseAdmin.rpc("okr_live_metrics");
    const l = (live ?? {}) as {
      leadsMonth?: number; spendMonth?: number; cpl?: number; leadsIsReal?: boolean;
      ctrPct?: number; impressionsMonth?: number; trafficQualIsReal?: boolean;
      engagementRate?: number; engagementIsReal?: boolean;
      activeClients?: number; churnedMonth?: number; churnRate?: number; staleContacts?: number;
    };

    return NextResponse.json({
      investmentExecutedPct,
      totalBudget,
      totalSpend: Math.round(totalSpend),
      accountsCounted,
      accountsWithinBudgetPct,
      isReal: hasRealSpend && totalBudget > 0,
      leadsMonth: l.leadsMonth ?? 0,
      cpl: l.cpl ?? 0,
      leadsIsReal: l.leadsIsReal ?? false,
      ctrPct: l.ctrPct ?? 0,
      impressionsMonth: l.impressionsMonth ?? 0,
      trafficQualIsReal: l.trafficQualIsReal ?? false,
      engagementRate: l.engagementRate ?? 0,
      engagementIsReal: l.engagementIsReal ?? false,
      activeClients: l.activeClients ?? 0,
      churnedMonth: l.churnedMonth ?? 0,
      churnRate: l.churnRate ?? 0,
      staleContacts: l.staleContacts ?? 0,
      churnIsReal: typeof l.churnRate === "number",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
