// lib/defense/insights-hoje.ts — a linha de HOJE da conta, que o getAccountInsights não traz
// (a janela dele termina ontem). Sem isso a Defesa comparava ontem com o ritmo de hoje.

import { getGraphUrl } from "@/lib/meta/config";
import type { getAccountInsights } from "@/lib/meta/api";

export type MetaInsight = Awaited<ReturnType<typeof getAccountInsights>>[number];

/** Linha de hoje, ou null quando a Meta não devolveu linha (dia sem entrega). Lança se a leitura falhar. */
export async function buscarInsightHoje(
  accountId: string,
  accessToken: string,
  hoje: string,
): Promise<MetaInsight | null> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    time_range: JSON.stringify({ since: hoje, until: hoje }),
    action_attribution_windows: '["7d_click"]',
    time_increment: "1",
  });
  const res = await fetch(`${getGraphUrl(`/${accountId}/insights`)}?${params}`);
  if (!res.ok) throw new Error(`Meta insights de hoje: HTTP ${res.status}`);
  const data = (await res.json()) as { data?: MetaInsight[] };
  return (data.data ?? []).find((r) => r.date_start === hoje) ?? null;
}
