export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { agregarVerba, lerAoVivo, type ClienteConta, type ContaVerba } from "@/lib/goals/ao-vivo";

// GET /api/okr/traffic-metrics
// Agrega o investimento REAL (gasto ÷ verba) das contas de anúncio dos clientes
// em operação (exclui draft e onboarding). Usado em Metas & OKRs para o
// "Investimento Executado" deixar de ser mock e passar a refletir ad_accounts.
// Exige login: expõe orçamento/gasto consolidado (financeiro).
//
// 25/10/2026 (auditoria 7.4): leitura ou função que falha NÃO cai em zeros. O campo vem null, a falha vai em `falhas`,
// e a tela mostra "—" com o motivo — antes "Sem contato +15d: 0 de 0" aparecia em verde e "Contas no orçamento 0%".
export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
  try {
    const falhas: string[] = [];
    const [contasQ, clientesQ, liveQ] = await Promise.all([
      supabaseAdmin.from("ad_accounts").select("meta_account_id, monthly_budget, current_month_spend"),
      supabaseAdmin.from("clients").select("meta_ad_account_id, status, draft_status"),
      // Métricas REAIS agregadas (função deduplicada — evita o bug do 95× de capturas/dia):
      // qualidade de tráfego (CTR/alcance) e relacionamento. Ver 074/075_okr_live_metrics.
      supabaseAdmin.rpc("okr_live_metrics"),
    ]);
    if (contasQ.error) falhas.push(`contas de anúncio: ${contasQ.error.message}`);
    if (clientesQ.error) falhas.push(`clientes: ${clientesQ.error.message}`);
    if (liveQ.error) falhas.push(`indicadores ao vivo (okr_live_metrics): ${liveQ.error.message}`);

    const verbaLida = !contasQ.error && !clientesQ.error;
    const verba = verbaLida ? agregarVerba((contasQ.data ?? []) as ContaVerba[], (clientesQ.data ?? []) as ClienteConta[]) : null;
    const vivo = lerAoVivo(liveQ.error ? null : liveQ.data);

    return NextResponse.json({
      investmentExecutedPct: verba?.investmentExecutedPct ?? null,
      totalBudget: verba?.totalBudget ?? null,
      totalSpend: verba?.totalSpend ?? null,
      accountsCounted: verba?.accountsCounted ?? null,
      accountsWithinBudgetPct: verba?.accountsWithinBudgetPct ?? null,
      isReal: verba?.isReal ?? false,
      ctrPct: vivo.ctrPct,
      impressionsMonth: vivo.impressionsMonth,
      trafficQualIsReal: vivo.trafficQualIsReal,
      activeClients: vivo.activeClients,
      staleContacts: vivo.staleContacts,
      falhas,
    });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui calcular os indicadores ao vivo: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
