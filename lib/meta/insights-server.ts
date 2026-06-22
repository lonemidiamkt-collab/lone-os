/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/meta/insights-server.ts — versão SERVER-SAFE da busca de insights da Meta.
// Cópia das funções de lib/meta/useMetaAds.ts (que é "use client" e não pode ser
// chamada no servidor). Usada pela geração agendada do PDF semanal de tráfego.
// ⚠️ Manter em sync com useMetaAds.ts se a lógica de insights/campanhas mudar.

import { countMessagesFromActions } from "@/lib/meta/messages";

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}

function isMetaAuthError(status: number, body: { error?: { code?: number } }): boolean {
  return status === 401 || status === 400 && body?.error?.code === 190;
}

const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_complete_registration",
  "onsite_conversion.lead",
] as const;

const PURCHASE_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "omni_purchase",
] as const;

const TRAFFIC_ACTION_TYPES = [
  "link_click",
  "inline_link_click",
  "landing_page_view",
] as const;

function safeFloat(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = typeof val === "number" ? val : parseFloat(val);
  return isFinite(n) ? n : 0;
}

function safeInt(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = typeof val === "number" ? val : parseInt(val as string, 10);
  return isFinite(n) ? n : 0;
}

function countActions(
  actions: { action_type: string; value: string }[] | undefined,
  types: readonly string[],
): number {
  if (!actions) return 0;
  let total = 0;
  for (const action of actions) {
    if (types.includes(action.action_type)) {
      total += safeInt(action.value);
    }
  }
  return total;
}

function countMessages(actions: { action_type: string; value: string }[] | undefined): number {
  return countMessagesFromActions(actions);
}

/** Conta campanhas ativas x total de uma conta (p/ alerta "campanha parada"). */
export async function fetchActiveCampaignCount(
  token: string,
  accountId: string,
): Promise<{ active: number; total: number } | null> {
  try {
    const params = new URLSearchParams({ access_token: token, fields: "effective_status", limit: "200" });
    const res = await fetch(`https://graph.facebook.com/v21.0/${accountId}/campaigns?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const camps = (data.data ?? []) as Array<{ effective_status?: string }>;
    return { total: camps.length, active: camps.filter((c) => c.effective_status === "ACTIVE").length };
  } catch {
    return null;
  }
}

/**
 * Alcance (reach) DEDUPLICADO no nível da CONTA, numa única chamada. Somar o reach
 * de cada campanha super-conta (a mesma pessoa atingida por 2 campanhas é contada
 * 2x). Aqui pegamos o reach real da conta no período. Retorna null se indisponível
 * (caller cai no fallback de somar).
 */
export async function fetchAccountReach(
  token: string,
  accountId: string,
  days: number = 7,
  dateFrom?: string,
  dateTo?: string,
): Promise<number | null> {
  try {
    const PRESET_MAP: Record<number, string> = { 7: "last_7d", 14: "last_14d", 30: "last_30d", 90: "last_90d" };
    const usePreset = !dateFrom && !dateTo && days in PRESET_MAP;
    const params = new URLSearchParams({
      access_token: token,
      fields: "reach",
      ...(usePreset
        ? { date_preset: PRESET_MAP[days] }
        : { time_range: JSON.stringify({ since: dateFrom ?? "", until: dateTo ?? "" }) }),
      limit: "1",
    });
    const res = await fetch(`https://graph.facebook.com/v21.0/${accountId}/insights?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const reach = safeInt(data.data?.[0]?.reach);
    return reach > 0 ? reach : null;
  } catch {
    return null;
  }
}

// ── Funções abaixo copiadas verbatim de useMetaAds.ts (via sed) ──────────────

export async function fetchCampaignInsights(
  token: string,
  accountId: string,
  days: number = 7,
  dateFrom?: string,
  dateTo?: string,
) {
  const syncTimestamp = new Date().toISOString();

  // PAGINA todas as campanhas ACTIVE/PAUSED. Antes parava em limit=100 sem seguir
  // paging.next → contas com >100 campanhas (ex.: Imperio, 165) perdiam METADE dos
  // dados (gasto/impressões/cliques/mensagens). Agora busca todas as páginas.
  const campaigns: any[] = [];
  let campUrl: string | null =
    `https://graph.facebook.com/v21.0/${accountId}/campaigns?` +
    new URLSearchParams({
      access_token: token,
      fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
      effective_status: '["ACTIVE","PAUSED"]',
      limit: "100",
    }).toString();
  let campPages = 0;
  while (campUrl && campPages < 30) {
    const campRes = await fetch(campUrl);
    if (!campRes.ok) {
      const err = await campRes.json().catch(() => ({}));
      if (isMetaAuthError(campRes.status, err)) {
        throw new TokenExpiredError(`Token inválido ou expirado (code ${err?.error?.code ?? campRes.status})`);
      }
      throw new Error(`Failed to fetch campaigns: ${err?.error?.message ?? campRes.status}`);
    }
    const campData = await campRes.json();
    campaigns.push(...(campData.data ?? []));
    campUrl = campData.paging?.next ?? null;
    campPages++;
  }

  // For preset periods (no custom date range), use Meta's native date_preset so the API
  // respects the account's timezone rather than UTC midnight boundaries.
  const PRESET_MAP: Record<number, string> = { 7: "last_7d", 14: "last_14d", 30: "last_30d", 90: "last_90d" };
  const usePreset = !dateFrom && !dateTo && days in PRESET_MAP;
  const datePreset = usePreset ? PRESET_MAP[days] : null;

  // For custom date ranges, compute explicit since/until strings in local time.
  const sinceStr = dateFrom ?? "";
  const untilStr = dateTo ?? "";

  console.log(`[Meta API] fetchCampaignInsights: ${usePreset ? `date_preset=${datePreset}` : `${sinceStr} → ${untilStr}`}`);

  return Promise.all(
    campaigns.map(async (campaign: any) => {
      try {
        const timeRangeParam = !usePreset ? JSON.stringify({ since: sinceStr, until: untilStr }) : null;

        // Janela de atribuição fixa em 7d_click — espelha a coluna "Resultados" do
        // Gerenciador. Sem isso, a Meta usava o default (podia incluir 1d_view) e os
        // leads/conversões divergiam do painel. (Mensagens já vêm fixas pelo action_type _7d.)
        const dailyParams = new URLSearchParams({
          access_token: token,
          fields: "date_start,date_stop,spend,impressions,reach,clicks,inline_link_clicks,actions",
          action_attribution_windows: '["7d_click"]',
          ...(datePreset ? { date_preset: datePreset } : { time_range: timeRangeParam! }),
          time_increment: "1",
          limit: "100",
        });

        const totalParams = new URLSearchParams({
          access_token: token,
          fields: "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,actions",
          action_attribution_windows: '["7d_click"]',
          ...(datePreset ? { date_preset: datePreset } : { time_range: timeRangeParam! }),
          limit: "1",
        });

        // Insights por conjunto de anúncios — usado para encontrar o conjunto mais barato de mensagens
        const adsetParams = new URLSearchParams({
          access_token: token,
          fields: "adset_id,adset_name,effective_status,spend,actions",
          action_attribution_windows: '["7d_click"]',
          ...(datePreset ? { date_preset: datePreset } : { time_range: timeRangeParam! }),
          level: "adset",
          limit: "50",
        });

        const [dailyRes, totalRes, adsetRes] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${dailyParams}`),
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${totalParams}`),
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${adsetParams}`),
        ]);

        const dailyData = dailyRes.ok ? await dailyRes.json() : { data: [] };
        const totalData = totalRes.ok ? await totalRes.json() : { data: [] };
        const adsetData = adsetRes.ok ? await adsetRes.json() : { data: [] };

        const dailyInsights = dailyData.data ?? [];
        const total = totalData.data?.[0];

        const hasData = !!total;

        const totalSpend = safeFloat(total?.spend);
        const totalImpressions = safeInt(total?.impressions);
        const totalReach = safeInt(total?.reach);
        const totalClicks = safeInt(total?.clicks);
        // inline_link_clicks = somente cliques em links (exclui reações, comentários, etc.)
        // Usado para CTR e CPC mais precisos.
        const inlineLinkClicks = safeInt(total?.inline_link_clicks);
        const frequency = safeFloat(total?.frequency);

        // Preferimos ctr/cpc da Meta quando disponíveis (calculados sobre inline_link_clicks).
        // Se a Meta não retornar, calculamos manualmente com inline_link_clicks.
        const linkClicks = inlineLinkClicks > 0 ? inlineLinkClicks : totalClicks;
        const ctr = safeFloat(total?.ctr) || (totalImpressions > 0 ? (linkClicks / totalImpressions) * 100 : 0);
        const cpc = safeFloat(total?.cpc) || (linkClicks > 0 ? totalSpend / linkClicks : 0);
        const cpm = safeFloat(total?.cpm) || (totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0);

        const totalActions = total?.actions as { action_type: string; value: string }[] | undefined;
        const totalMessages = countMessages(totalActions);
        const totalLeads = countActions(totalActions, LEAD_ACTION_TYPES);
        const totalPurchases = countActions(totalActions, PURCHASE_ACTION_TYPES);
        const totalConversions = totalLeads + totalPurchases;
        const totalLinkClicks = countActions(totalActions, TRAFFIC_ACTION_TYPES) || linkClicks;

        const objective = (campaign.objective ?? "").toUpperCase();
        let results = 0;
        let costPerResult = 0;
        if (objective.includes("MESSAGE") || objective.includes("OUTCOME_ENGAGEMENT")) {
          results = totalMessages > 0 ? totalMessages : totalLinkClicks;
        } else if (objective.includes("LEAD") || objective.includes("OUTCOME_LEADS")) {
          results = totalLeads > 0 ? totalLeads : totalMessages;
        } else if (objective.includes("CONVERSION") || objective.includes("SALES") || objective.includes("OUTCOME_SALES")) {
          results = totalPurchases > 0 ? totalPurchases : totalConversions;
        } else if (objective.includes("TRAFFIC") || objective.includes("OUTCOME_TRAFFIC") || objective.includes("LINK_CLICKS")) {
          results = totalLinkClicks;
        } else if (objective.includes("AWARENESS") || objective.includes("OUTCOME_AWARENESS") || objective.includes("REACH")) {
          results = totalReach;
        } else {
          // Fallback: usa o resultado mais relevante disponível
          results = totalMessages > 0 ? totalMessages
            : totalLeads > 0 ? totalLeads
            : totalConversions > 0 ? totalConversions
            : totalLinkClicks;
        }
        costPerResult = results > 0 ? totalSpend / results : 0;

        // Conjunto Campeão: menor CPA de mensagens entre os conjuntos com volume real.
        // 1. Mapeamos todos os adsets com spend e mensagens > 0
        // 2. Aplicamos filtro mínimo de volume para excluir outliers (ex: R$1 + 1 msg)
        // 3. Priorizamos effective_status=ACTIVE; se nenhum estiver ativo, usamos qualquer um que passou o filtro
        type AdsetRow = { name: string; spend: number; messages: number; effectiveStatus: string };
        const allAdsetRows: AdsetRow[] = (adsetData.data ?? [])
          .map((a: any) => ({
            name: (a.adset_name as string) ?? "",
            spend: safeFloat(a.spend),
            messages: countMessages(a.actions as { action_type: string; value: string }[] | undefined),
            effectiveStatus: (a.effective_status as string) ?? "",
          }))
          // Volume mínimo: ao menos 2 mensagens OU R$10 gastos — filtra conjuntos com amostragem irrelevante
          .filter((a: AdsetRow) => a.messages > 0 && a.spend > 0 && (a.messages >= 2 || a.spend > 10));

        // Prefere ativos; se não houver, aceita qualquer candidato que passou o filtro de volume
        const activeAdsets = allAdsetRows.filter((a) => a.effectiveStatus === "ACTIVE");
        const candidateAdsets = activeAdsets.length > 0 ? activeAdsets : allAdsetRows;

        let cheapestAdSetCostPerMessage = totalMessages > 0 ? totalSpend / totalMessages : 0;
        let cheapestAdSetName = "";
        if (candidateAdsets.length > 0) {
          const best = candidateAdsets.reduce((min, a) =>
            a.spend / a.messages < min.spend / min.messages ? a : min
          );
          cheapestAdSetCostPerMessage = best.spend / best.messages;
          cheapestAdSetName = best.name;
        }

        const dailyMetrics = dailyInsights.map((i: any) => {
          const dayActions = i.actions as { action_type: string; value: string }[] | undefined;
          const dayInlineLinkClicks = safeInt(i.inline_link_clicks);
          return {
            date: i.date_start,
            spend: safeFloat(i.spend),
            impressions: safeInt(i.impressions),
            clicks: safeInt(i.clicks),
            linkClicks: dayInlineLinkClicks,
            conversions: countActions(dayActions, [...LEAD_ACTION_TYPES, ...PURCHASE_ACTION_TYPES]),
            messages: countMessages(dayActions),
            leads: countActions(dayActions, LEAD_ACTION_TYPES),
          };
        });

        return {
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status?.toLowerCase() ?? "unknown",
          dailyBudget: campaign.daily_budget ? safeFloat(campaign.daily_budget) / 100 : 0,
          totalBudget: campaign.lifetime_budget ? safeFloat(campaign.lifetime_budget) / 100 : 0,
          startDate: campaign.start_time?.slice(0, 10) ?? "",
          endDate: campaign.stop_time?.slice(0, 10) ?? undefined,
          spend: totalSpend,
          impressions: totalImpressions,
          reach: totalReach,
          clicks: totalClicks,
          ctr,
          cpc,
          cpm,
          frequency,
          conversions: totalConversions,
          costPerConversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
          messages: totalMessages,
          // Always recompute from raw spend/messages of this same request — never use
          // pre-rounded API values or adset-level figures that drift from the Meta dashboard.
          costPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
          cheapestAdSetCostPerMessage,
          cheapestAdSetName,
          leads: totalLeads,
          costPerLead: totalLeads > 0 ? totalSpend / totalLeads : 0,
          results,
          costPerResult,
          dailyMetrics,
          hasData,
          lastSyncAt: syncTimestamp,
        };
      } catch {
        return { id: campaign.id, name: campaign.name, error: true };
      }
    })
  );
}

export async function fetchAccountDemographics(
  token: string,
  accountId: string,
  days: number = 30,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ ageRanges: { range: string; percentage: number }[]; genderSplit: { women: number; men: number } } | null> {
  try {
    const PRESET_MAP: Record<number, string> = { 7: "last_7d", 14: "last_14d", 30: "last_30d", 90: "last_90d" };
    const usePreset = !dateFrom && !dateTo && days in PRESET_MAP;
    const timeRange = !usePreset && dateFrom && dateTo
      ? JSON.stringify({ since: dateFrom, until: dateTo })
      : null;
    const params = new URLSearchParams({
      access_token: token,
      fields: "impressions,reach",
      breakdowns: "age,gender",
      ...(usePreset
        ? { date_preset: PRESET_MAP[days] }
        : { time_range: timeRange! }),
      limit: "200",
    });
    const res = await fetch(`https://graph.facebook.com/v21.0/${accountId}/insights?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[Demographics] API error:", res.status, err?.error?.message ?? "");
      return null;
    }
    const json = await res.json();
    const rows: { age?: string; gender?: string; impressions?: string; reach?: string }[] = json.data ?? [];
    if (rows.length === 0) return null;

    const ageMap: Record<string, number> = {};
    const genderMap: Record<string, number> = { male: 0, female: 0, unknown: 0 };
    for (const row of rows) {
      const imp = safeInt(row.impressions);
      const age = row.age ?? "unknown";
      const gender = (row.gender ?? "unknown").toLowerCase();
      ageMap[age] = (ageMap[age] ?? 0) + imp;
      if (gender === "male" || gender === "female") genderMap[gender] += imp;
      else genderMap.unknown += imp;
    }

    const totalImpressions = Object.values(ageMap).reduce((s, v) => s + v, 0);
    if (totalImpressions === 0) return null;

    const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
    const ageRanges = AGE_ORDER
      .filter((r) => r in ageMap)
      .map((r) => ({ range: r, percentage: parseFloat(((ageMap[r] / totalImpressions) * 100).toFixed(1)) }));
    for (const [r, v] of Object.entries(ageMap)) {
      if (!AGE_ORDER.includes(r) && r !== "unknown") {
        ageRanges.push({ range: r, percentage: parseFloat(((v / totalImpressions) * 100).toFixed(1)) });
      }
    }
    if (ageRanges.length === 0) return null;

    const totalGender = genderMap.male + genderMap.female;
    const men = totalGender > 0 ? parseFloat(((genderMap.male / totalGender) * 100).toFixed(1)) : 50;
    const women = totalGender > 0 ? parseFloat(((genderMap.female / totalGender) * 100).toFixed(1)) : 50;
    return { ageRanges, genderSplit: { women, men } };
  } catch {
    return null;
  }
}
