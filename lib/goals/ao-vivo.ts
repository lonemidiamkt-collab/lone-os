// lib/goals/ao-vivo.ts — os "Indicadores ao vivo" do /goals (verba das contas). Módulo PURO (25/10/2026, auditoria 7.4).
//
// A rota /api/okr/traffic-metrics ignorava o erro das leituras e da função `okr_live_metrics` ("se falhar, cai em
// zeros"): a tela mostrava "Sem contato +15d: 0 de 0" em verde e "Contas no orçamento 0%". Agora o que não tem fonte
// vem null e a tela mostra "—"; conta nenhuma com verba também é null (não é "0% no orçamento").

export interface ContaVerba { meta_account_id: string | null; monthly_budget: number | string | null; current_month_spend: number | string | null }
export interface ClienteConta { meta_ad_account_id: string | null; status: string | null; draft_status: string | null }

export interface Verba {
  investmentExecutedPct: number | null;
  accountsWithinBudgetPct: number | null;
  accountsCounted: number;
  totalBudget: number;
  totalSpend: number;
  isReal: boolean;
}

export function agregarVerba(contas: readonly ContaVerba[], clientes: readonly ClienteConta[]): Verba {
  // Contas de clientes em operação (exclui rascunho e onboarding).
  const ativas = new Set(clientes
    .filter((c) => c.draft_status == null && c.status !== "onboarding" && c.meta_ad_account_id)
    .map((c) => c.meta_ad_account_id as string));
  let totalBudget = 0, totalSpend = 0, accountsCounted = 0, withinBudget = 0, comGasto = 0;
  for (const a of contas) {
    if (!ativas.has(a.meta_account_id as string)) continue;
    const budget = Number(a.monthly_budget) || 0;
    if (budget <= 0) continue;
    totalBudget += budget;
    accountsCounted++;
    if (a.current_month_spend != null) {
      const spend = Number(a.current_month_spend) || 0;
      totalSpend += spend;
      comGasto++;
      if (spend <= budget) withinBudget++;
    }
  }
  return {
    investmentExecutedPct: totalBudget > 0 && comGasto > 0 ? Math.round((totalSpend / totalBudget) * 100) : null,
    // Só as contas COM gasto lido entram: conta sem leitura de gasto não está "fora do orçamento".
    accountsWithinBudgetPct: comGasto > 0 ? Math.round((withinBudget / comGasto) * 100) : null,
    accountsCounted,
    totalBudget,
    totalSpend: Math.round(totalSpend),
    isReal: comGasto > 0 && totalBudget > 0,
  };
}

/** Os campos da função `okr_live_metrics`; o que não veio (ou a função falhou) é null — nunca 0. */
export function lerAoVivo(live: unknown): {
  ctrPct: number | null; impressionsMonth: number | null; trafficQualIsReal: boolean;
  activeClients: number | null; staleContacts: number | null;
} {
  const l = (live && typeof live === "object" ? live : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    ctrPct: n(l.ctrPct), impressionsMonth: n(l.impressionsMonth), trafficQualIsReal: l.trafficQualIsReal === true,
    activeClients: n(l.activeClients), staleContacts: n(l.staleContacts),
  };
}
