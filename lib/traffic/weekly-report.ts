// lib/traffic/weekly-report.ts — núcleo reutilizável do relatório semanal (7d).
// Usado pelo relatório interno (/api/system/weekly-reports) e pelo envio aos
// grupos dos clientes (/api/system/client-messages).

import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchCampaignInsights, fetchAccountDemographics, fetchAccountReach } from "@/lib/meta/insights-server";
import { buildTrafficReportData, buildClientReportHtml } from "@/lib/exportTrafficPdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import type { AdCampaign } from "@/lib/types";

export interface ReportClientRow {
  id: string;
  name: string;
  nome_fantasia: string | null;
  meta_ad_account_id: string | null;
  whatsapp_group_jid?: string | null;
  whatsapp_group_name?: string | null;
}

export function clientDisplayName(c: { nome_fantasia: string | null; name: string }): string {
  return c.nome_fantasia || c.name;
}

export function periodLabel7d(): string {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 7);
  return `${since.toLocaleDateString("pt-BR")} – ${now.toLocaleDateString("pt-BR")}`;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** Clientes ativos com conta Meta vinculada (mesma noção de "ativo" dos broadcasts). */
export async function selectActiveMetaClients(onlyClientId?: string | null): Promise<ReportClientRow[]> {
  let q = supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, meta_ad_account_id, status, draft_status, whatsapp_group_jid, whatsapp_group_name")
    .not("meta_ad_account_id", "is", null)
    .in("status", ["good", "average", "onboarding"])
    .is("draft_status", null)
    .order("nome_fantasia");
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportClientRow[];
}

/**
 * Clientes ativos COM grupo de WhatsApp confirmado — independente de ter conta Meta.
 * Usado pelas mensagens de suporte (qua/sex), que vão pra clientes só-suporte
 * (ex.: CIIL/Portuga, sem conta de anúncio vinculada).
 */
export async function selectActiveClientsWithGroup(onlyClientId?: string | null): Promise<ReportClientRow[]> {
  let q = supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, meta_ad_account_id, status, draft_status, whatsapp_group_jid, whatsapp_group_name")
    .not("whatsapp_group_jid", "is", null)
    .in("status", ["good", "average", "onboarding"])
    .is("draft_status", null)
    .order("nome_fantasia");
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportClientRow[];
}

/** Gera o PDF (Buffer) do relatório de 7 dias de UM cliente. Nunca lança. */
export async function buildClientPdf(
  token: string,
  client: ReportClientRow,
): Promise<{ ok: boolean; buffer?: Buffer; error?: string }> {
  const accountId = client.meta_ad_account_id;
  const clientName = clientDisplayName(client);

  if (!accountId) return { ok: false, error: "cliente sem conta de anúncio" };

  const raw = await fetchCampaignInsights(token, accountId, 7);
  const campaigns = (raw as Array<{ error?: boolean }>).filter((c) => !c.error) as unknown as AdCampaign[];
  if (campaigns.length === 0) return { ok: false, error: "sem campanhas no período" };
  // DEBUG temporário p/ diagnosticar subcontagem
  console.log(`[DEBUG-REPORT] ${clientName} ${accountId}: raw=${(raw as unknown[]).length} campanhas=${campaigns.length} msgs=${campaigns.reduce((s, c) => s + ((c as unknown as { messages?: number }).messages ?? 0), 0)} spend=${campaigns.reduce((s, c) => s + ((c as unknown as { spend?: number }).spend ?? 0), 0).toFixed(2)}`);

  let demographics: ReturnType<typeof buildTrafficReportData>["demographics"] | undefined;
  try {
    const demo = await fetchAccountDemographics(token, accountId, 7);
    demographics = demo ?? undefined;
  } catch { /* demografia é opcional */ }

  // Alcance deduplicado no nível da conta (não somar campanha a campanha).
  const accountReach = await fetchAccountReach(token, accountId, 7);

  const reportData = buildTrafficReportData(clientName, campaigns, periodLabel7d(), undefined, demographics, undefined, 7, accountReach ?? undefined);
  const html = buildClientReportHtml(reportData);
  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) return { ok: false, error: pdf.error ?? "falha no render" };
  return { ok: true, buffer: pdf.buffer };
}
