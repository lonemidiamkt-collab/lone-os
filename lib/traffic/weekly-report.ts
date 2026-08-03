// lib/traffic/weekly-report.ts — núcleo reutilizável do relatório semanal (7d).
// Usado pelo relatório interno (/api/system/weekly-reports) e pelo envio aos
// grupos dos clientes (/api/system/client-messages).

import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchCampaignInsights, fetchAccountDemographics, fetchAccountReach } from "@/lib/meta/insights-server";
import { buildTrafficReportData, buildClientReportHtml } from "@/lib/exportTrafficPdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { getIgSnapshotCached, type IgSnapshot } from "@/lib/meta/igSnapshot";
import { igSectionHtml, buildIgOnlyHtml } from "@/lib/traffic/igReportSection";
import type { AdCampaign } from "@/lib/types";

export interface ReportClientRow {
  id: string;
  name: string;
  nome_fantasia: string | null;
  meta_ad_account_id: string | null;
  ig_business_account_id?: string | null;
  ig_public_username?: string | null;
  whatsapp_group_jid?: string | null;
  whatsapp_group_name?: string | null;
}

export function clientDisplayName(c: { nome_fantasia: string | null; name: string }): string {
  return c.nome_fantasia || c.name;
}

export function periodLabelDays(n: number): string {
  // A janela da Meta NÃO inclui hoje: cobre os N dias que terminam ONTEM.
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() - 1); // último dia fechado
  const since = new Date(now);
  since.setDate(since.getDate() - n);
  return `${since.toLocaleDateString("pt-BR")} – ${until.toLocaleDateString("pt-BR")}`;
}
/** "01/07/2026 – 31/07/2026" a partir de datas ISO. Sem fuso: são datas puras, não instantes —
 *  usar new Date("2026-07-01") daria 30/06 no Brasil. */
export function rotuloIntervalo(de: string, ate: string): string {
  const br = (iso: string) => iso.split("-").reverse().join("/");
  return `${br(de)} – ${br(ate)}`;
}

export function periodLabel7d(): string {
  // Rodando na segunda, isso é exatamente segunda → domingo da semana passada.
  return periodLabelDays(7);
}
// Períodos do relatório automático: 7 (semanal) e 30 (mensal). O 14 fica pro seletor do portal.
export const IG_PERIOD_FOR_DAYS: Record<number, "7d" | "14d" | "30d"> = { 7: "7d", 14: "14d", 30: "30d" };

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** Clientes ativos com conta Meta de ANÚNCIO **ou** Instagram orgânico vinculado (mesma noção de
 *  "ativo" dos broadcasts). O relatório monta o que o cliente tiver: tráfego, IG, ou os dois juntos. */
export async function selectActiveMetaClients(onlyClientId?: string | null): Promise<ReportClientRow[]> {
  let q = supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, meta_ad_account_id, ig_business_account_id, ig_public_username, status, draft_status, whatsapp_group_jid, whatsapp_group_name")
    .or("meta_ad_account_id.not.is.null,ig_business_account_id.not.is.null,ig_public_username.not.is.null")
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
    .neq("active", false) // ex-clientes (churned) não recebem mensagem/relatório
    .order("nome_fantasia");
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportClientRow[];
}

/**
 * Gera o PDF (Buffer) do relatório de 7 dias de UM cliente. Nunca lança. Monta o que o cliente
 * tiver: tráfego (anúncios Meta) + Instagram orgânico. Se tem os dois → UM PDF com as duas seções.
 * Só tráfego → só tráfego. Só social → só Instagram. O IG vem do cache (evita rate limit).
 */
export async function buildClientPdf(
  token: string,
  client: ReportClientRow,
  periodDays = 7,
  /** Intervalo EXATO (YYYY-MM-DD). Quando vem, manda nos anúncios em vez do preset de N dias —
   *  é como se pede "julho fechado" em vez de "últimos 30 dias".
   *  O Instagram NÃO acompanha: a API só oferece janelas fixas (7d/28d), então o bloco de IG
   *  continua no preset e o PDF passa a escrever o período de CADA bloco, pra ninguém ler um
   *  número de julho ao lado de um número de 28 dias achando que são a mesma janela. */
  dateFrom?: string,
  dateTo?: string,
): Promise<{ ok: boolean; buffer?: Buffer; error?: string }> {
  const accountId = client.meta_ad_account_id;
  const clientName = clientDisplayName(client);
  const intervaloExato = !!(dateFrom && dateTo);
  const periodo = intervaloExato ? rotuloIntervalo(dateFrom!, dateTo!) : periodLabelDays(periodDays);
  // A JANELA DO INSTAGRAM SAI DO INTERVALO, NÃO DO periodDays. No primeiro envio de julho eu
  // passei só since/until e esqueci o period=month: os anúncios vieram do mês fechado e o bloco de
  // IG veio de 7 DIAS, no mesmo PDF. Derivar do intervalo tira essa pegadinha do chamador.
  // (A API do IG só tem janelas fixas — pega a mais próxima do tamanho pedido.)
  const diasDoIntervalo = intervaloExato
    ? Math.round((Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000) + 1
    : periodDays;
  const igPeriodo: "7d" | "14d" | "30d" =
    diasDoIntervalo >= 21 ? "30d" : diasDoIntervalo >= 11 ? "14d" : "7d";

  // ── Instagram orgânico (do cache; não bate na Meta ao vivo). Vale p/ conta no BM (owned) OU
  //    perfil público via @ (business_discovery). ──
  let igSnap: IgSnapshot | null = null;
  if ((client.ig_business_account_id || client.ig_public_username) && client.id) {
    try {
      const s = await getIgSnapshotCached(client.id, igPeriodo, false);
      if (s.mapped && !s.error && s.conta) igSnap = s;
    } catch { /* IG é best-effort — se falhar, sai só o tráfego */ }
  }

  // ── Tráfego (anúncios) ──
  let trafficHtml: string | null = null;
  if (accountId) {
    const raw = await fetchCampaignInsights(token, accountId, periodDays, dateFrom, dateTo);
    const campaigns = (raw as Array<{ error?: boolean }>).filter((c) => !c.error) as unknown as AdCampaign[];
    if (campaigns.length > 0) {
      let demographics: ReturnType<typeof buildTrafficReportData>["demographics"] | undefined;
      try {
        const demo = await fetchAccountDemographics(token, accountId, periodDays, dateFrom, dateTo);
        demographics = demo ?? undefined;
      } catch { /* demografia é opcional */ }
      // Alcance deduplicado no nível da conta (não somar campanha a campanha).
      // TENTA DUAS VEZES antes de desistir: sem ele o PDF omite a métrica, e perder o alcance do
      // relatório do cliente por um soluço de rede seria bobo. Se falhar de novo, fica sem — e
      // aparece no log, porque relatório saindo torto em silêncio foi o problema de junho.
      let accountReach = await fetchAccountReach(token, accountId, periodDays, dateFrom, dateTo);
      if (accountReach == null) {
        await new Promise((r) => setTimeout(r, 1500));
        accountReach = await fetchAccountReach(token, accountId, periodDays, dateFrom, dateTo);
        if (accountReach == null) {
          console.error(`[relatorio] ${clientName}: alcance deduplicado indisponível — PDF sai SEM a métrica de alcance`);
        }
      }
      const reportData = buildTrafficReportData(clientName, campaigns, periodo, undefined, demographics, undefined, periodDays, accountReach ?? undefined);
      trafficHtml = buildClientReportHtml(reportData);
    }
  }

  // ── Combina: tráfego + (IG encaixado antes do rodapé) / só um / nenhum ──
  let html: string;
  if (trafficHtml) {
    // Combinado: Instagram SEMPRE numa página nova (page 1 = anúncios, page 2 = Instagram) — não mistura.
    html = igSnap
      ? trafficHtml.replace("<!-- FOOTER -->", `<div style="break-before:page;page-break-before:always;">${igSectionHtml(igSnap)}</div>\n  <!-- FOOTER -->`)
      : trafficHtml;
  } else if (igSnap) {
    html = buildIgOnlyHtml(clientName, periodo, igSnap);
  } else {
    return { ok: false, error: accountId ? "sem campanhas nem Instagram no período" : "cliente sem tráfego nem Instagram" };
  }

  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) return { ok: false, error: pdf.error ?? "falha no render" };
  return { ok: true, buffer: pdf.buffer };
}
