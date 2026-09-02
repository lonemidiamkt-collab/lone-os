// Provider da Marketing API (Graph). É a infraestrutura principal de execução, como o documento
// define — e hoje a única disponível, já que o MCP recusa o token da Lone com 401.

import { countMessagesFromActions } from "@/lib/meta/messages";
import type { CapacidadeMeta, InsightEntidade, NivelEntidade, ProviderMeta } from "./index";

const GRAPH = "https://graph.facebook.com/v21.0";

interface LinhaGraph {
  campaign_id?: string; campaign_name?: string;
  adset_id?: string; adset_name?: string;
  ad_id?: string; ad_name?: string;
  spend?: string; impressions?: string; clicks?: string;
  ctr?: string; cpm?: string; frequency?: string;
  actions?: { action_type: string; value: string }[];
  date_start?: string;
}

export const marketingApiProvider: ProviderMeta = {
  nome: "marketing-api",

  async disponivel(token: string): Promise<CapacidadeMeta> {
    try {
      const res = await fetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => null) as { data?: { permission: string; status: string }[]; error?: unknown } | null;
      if (!json || json.error || !json.data) {
        return { fonte: "marketing-api", disponivel: false, detalhe: "token não responde", verificadoEm: new Date().toISOString() };
      }
      const concedidas = new Set(json.data.filter((p) => p.status === "granted").map((p) => p.permission));
      const falta = ["ads_read"].filter((p) => !concedidas.has(p));
      return {
        fonte: "marketing-api",
        disponivel: falta.length === 0,
        detalhe: falta.length ? `sem permissão: ${falta.join(", ")}` : `escopos: ${[...concedidas].join(", ")}`,
        verificadoEm: new Date().toISOString(),
      };
    } catch (e) {
      return { fonte: "marketing-api", disponivel: false, detalhe: String(e).slice(0, 80), verificadoEm: new Date().toISOString() };
    }
  },

  async insightsPorEntidade({ token, accountId, nivel, desde, ate }): Promise<InsightEntidade[]> {
    const campos = [
      "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
      "spend", "impressions", "clicks", "ctr", "cpm", "frequency", "actions",
    ].join(",");
    const timeRange = encodeURIComponent(JSON.stringify({ since: desde, until: ate }));
    // time_increment=1 → uma linha por DIA. Sem isso a Meta agrega o período e some com o "quando
    // o problema começou", que é metade do diagnóstico.
    const url = `${GRAPH}/${accountId}/insights?access_token=${encodeURIComponent(token)}` +
      `&level=${nivel}&time_range=${timeRange}&time_increment=1&fields=${campos}&limit=500`;

    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const json = await res.json().catch(() => null) as { data?: LinhaGraph[]; error?: { message?: string } } | null;
    if (json?.error) throw new Error(String(json.error.message ?? "graph api falhou").slice(0, 120));

    return (json?.data ?? []).map((r) => {
      const id = nivel === "campaign" ? r.campaign_id : nivel === "adset" ? r.adset_id : r.ad_id;
      const nome = nivel === "campaign" ? r.campaign_name : nivel === "adset" ? r.adset_name : r.ad_name;
      return {
        entityId: String(id ?? ""),
        entityName: nome ?? undefined,
        campaignName: r.campaign_name ?? undefined,
        adsetName: r.adset_name ?? undefined,
        date: String(r.date_start ?? ""),
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        ctr: r.ctr ? Number(r.ctr) : undefined,
        cpm: r.cpm ? Number(r.cpm) : undefined,
        frequency: r.frequency ? Number(r.frequency) : undefined,
        conversions: countMessagesFromActions(r.actions),
      };
    }).filter((r) => r.entityId && r.date);
  },
};
