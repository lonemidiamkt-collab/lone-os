// lib/trafego/mudancas-server.ts — lê na Meta o ESTADO de campanhas e conjuntos de uma conta
// (status + orçamento) para o retrato diário do "O que mudou" (Leva 7A, N2). Server-only.
//
// Duas leituras paginadas por conta (campanhas e conjuntos). Arquivadas/excluídas ficam de fora da
// leitura — sumir dela é justamente o sinal "saiu do ar" que a comparação procura.

import { getGraphUrl } from "@/lib/meta/config";
import { metaJson } from "@/lib/meta/fetch";
import type { EstadoEntidade, NivelEstado } from "@/lib/trafego/mudancas";

const STATUS_LIDOS = [
  "ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "WITH_ISSUES", "IN_PROCESS",
  "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO",
];

interface LinhaGraph {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  updated_time?: string;
  campaign_id?: string;
  campaign?: { name?: string };
}

const reais = (centavos?: string) => {
  const n = centavos ? parseFloat(centavos) : NaN;
  return Number.isFinite(n) && n > 0 ? n / 100 : null;
};

async function lerNivel(accountId: string, token: string, nivel: NivelEstado): Promise<LinhaGraph[]> {
  const edge = nivel === "campaign" ? "campaigns" : "adsets";
  const campos = nivel === "campaign"
    ? "id,name,status,effective_status,daily_budget,lifetime_budget,updated_time"
    : "id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,campaign_id,campaign{name}";
  const params = new URLSearchParams({
    access_token: token,
    fields: campos,
    effective_status: JSON.stringify(STATUS_LIDOS),
    limit: "200",
  });
  let url: string | null = `${getGraphUrl(`/${accountId}/${edge}`)}?${params}`;
  const out: LinhaGraph[] = [];
  let paginas = 0;
  while (url && paginas < 25) {
    const json: { data?: LinhaGraph[]; paging?: { next?: string } } =
      await metaJson(url, { label: `estado ${edge} ${accountId}`, timeoutMs: 30_000 });
    out.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
    paginas++;
  }
  return out;
}

/** Estado atual de campanhas e conjuntos da conta. Lança se a leitura falhar (nunca devolve vazio disfarçado). */
export async function lerEstadoDaConta(accountId: string, token: string): Promise<Omit<EstadoEntidade, "client_id">[]> {
  const [campanhas, conjuntos] = await Promise.all([
    lerNivel(accountId, token, "campaign"),
    lerNivel(accountId, token, "adset"),
  ]);
  const nomeCampanha = new Map(campanhas.map((c) => [c.id, c.name ?? null]));
  return [
    ...campanhas.map((c) => ({
      nivel: "campaign" as const, entity_id: c.id, entity_name: c.name ?? null, campaign_id: c.id, campaign_name: c.name ?? null,
      status: c.status ?? null, effective_status: c.effective_status ?? null,
      daily_budget: reais(c.daily_budget), lifetime_budget: reais(c.lifetime_budget), updated_time: c.updated_time ?? null,
    })),
    ...conjuntos.map((a) => ({
      nivel: "adset" as const, entity_id: a.id, entity_name: a.name ?? null, campaign_id: a.campaign_id ?? null,
      campaign_name: a.campaign?.name ?? (a.campaign_id ? nomeCampanha.get(a.campaign_id) ?? null : null),
      status: a.status ?? null, effective_status: a.effective_status ?? null,
      daily_budget: reais(a.daily_budget), lifetime_budget: reais(a.lifetime_budget), updated_time: a.updated_time ?? null,
    })),
  ];
}
