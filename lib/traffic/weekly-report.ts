// lib/traffic/weekly-report.ts — núcleo reutilizável do relatório semanal (7d).
// Usado pelo relatório interno (/api/system/weekly-reports) e pelo envio aos
// grupos dos clientes (/api/system/client-messages).

import { supabaseAdmin } from "@/lib/supabase/server";
import { estaPausado, hojeSP, type ClienteComPausa } from "@/lib/clients/pausa";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { getIgSnapshotCached, type IgSnapshot } from "@/lib/meta/igSnapshot";
import { janelaDoRelatorio, janelaDosUltimosDias } from "@/lib/reports/relatorioCliente";
import { lerRelatorioAnuncios } from "@/lib/reports/relatorioClienteDados";
import { relatorioClienteHtml } from "@/lib/reports/relatorioClientePdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";

export interface ReportClientRow {
  id: string;
  name: string;
  nome_fantasia: string | null;
  /** O pacote contratado. É o ÚNICO campo que autoriza falar de anúncio — ver lib/clients/servico.ts. */
  service_type: string | null;
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

/**
 * Clientes ativos com conta Meta de ANÚNCIO **ou** Instagram orgânico vinculado.
 * O relatório monta o que o cliente tiver: tráfego, IG, ou os dois juntos.
 *
 * @param apenasTrafego exige conta de anúncios. É o que vale no relatório SEMANAL: o contrato de
 *   `assessoria_social` promete relatório MENSAL, não semanal. Sem isso o CIIL — que é só social,
 *   sem conta de anúncios, mas com Instagram vinculado — recebia relatório toda segunda, e o
 *   Roberto pegou: "a automação mandou relatório para CIIL, CIIL não é tráfego".
 */
export async function selectActiveMetaClients(
  onlyClientId?: string | null,
  apenasTrafego = false,
): Promise<ReportClientRow[]> {
  let q = supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, service_type, meta_ad_account_id, ig_business_account_id, ig_public_username, status, draft_status, whatsapp_group_jid, whatsapp_group_name, paused_at, paused_until")
    .in("status", ["good", "average", "onboarding"])
    .is("draft_status", null)
    .order("nome_fantasia");
  // `apenasTrafego` filtrava por "tem conta de anúncio" — o mesmo proxy errado que mandou mensagem
  // de campanha pro Dumar. Agora exige o CONTRATO e a conta: o contrato autoriza, a conta viabiliza.
  q = apenasTrafego
    ? q.in("service_type", ["lone_growth", "assessoria_trafego", "trafego_pago", "trafego_social_site"])
        .not("meta_ad_account_id", "is", null)
    : q.or("meta_ad_account_id.not.is.null,ig_business_account_id.not.is.null,ig_public_username.not.is.null");
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // PAUSA (23/09): cliente pausado continua na carteira do time, mas NÃO recebe mensagem, relatório
  // nem alerta até a pausa vencer (paused_until no passado volta sozinho). Ver lib/clients/pausa.ts.
  return (data ?? []).filter((c) => !estaPausado(c as ClienteComPausa)) as ReportClientRow[];
}

/**
 * Clientes ativos COM grupo de WhatsApp confirmado — independente de ter conta Meta.
 * Usado pelas mensagens de suporte (qua/sex), que vão pra clientes só-suporte
 * (ex.: CIIL/Portuga, sem conta de anúncio vinculada).
 */
export async function selectActiveClientsWithGroup(onlyClientId?: string | null): Promise<ReportClientRow[]> {
  // NÃO filtra por grupo aqui de propósito. Quem chama separa em withGroup/withoutGroup e REPORTA
  // quem ficou sem — com o filtro na query, `semGrupo` vinha sempre vazio e 4 clientes reais
  // (Veneza Estofados, UNAFER, Varejão da Construção, Dr. Junior Vargas — todos com conta Meta)
  // simplesmente não recebiam o relatório de segunda, sem ninguém saber. Roberto pegou na mão.
  //
  // `at_risk` também entra: era excluído pela lista de status, então o cliente que MAIS precisa de
  // atenção era justamente o que parava de receber relatório.
  let q = supabaseAdmin
    .from("clients")
    // service_type é OBRIGATÓRIO aqui: é ele que autoriza falar de anúncio (lib/clients/servico.ts).
    // Sem esse campo no select, `podeFalarDeAnuncio` receberia undefined e — por ser prudente por
    // desenho — calaria a mensagem de tráfego de TODO MUNDO. O silêncio geral seria pior que o erro
    // que ele corrige.
    .select("id, name, nome_fantasia, service_type, meta_ad_account_id, status, draft_status, whatsapp_group_jid, whatsapp_group_name, paused_at, paused_until")
    .in("status", ["good", "average", "onboarding", "at_risk"])
    .is("draft_status", null)
    .neq("active", false) // ex-clientes (churned) não recebem mensagem/relatório
    .order("nome_fantasia");
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // PAUSA (23/09): cliente pausado continua na carteira do time, mas NÃO recebe mensagem, relatório
  // nem alerta até a pausa vencer (paused_until no passado volta sozinho). Ver lib/clients/pausa.ts.
  return (data ?? []).filter((c) => !estaPausado(c as ClienteComPausa)) as ReportClientRow[];
}

/** Um cliente pelo id, SEM os filtros de envio (status, pausa, contrato) — só pra PRÉVIA do relatório. */
export async function selectReportClient(id: string): Promise<ReportClientRow | null> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, service_type, meta_ad_account_id, ig_business_account_id, ig_public_username, whatsapp_group_jid, whatsapp_group_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReportClientRow | null) ?? null;
}

const contaGraph = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);

function baseUrlPublica(): string {
  return process.env.NEXT_PUBLIC_PORTAL_DOMAIN || process.env.NEXT_PUBLIC_SITE_URL || "https://painel.lonemidia.com";
}

/**
 * Monta o HTML do relatório de UM cliente. Nunca lança. Monta o que o cliente tiver: anúncios
 * (Meta) + Instagram orgânico. Tem os dois → uma folha de anúncios e uma de Instagram. Só um → só ele.
 * O IG vem do cache (evita rate limit).
 *
 * Desenho e contas: lib/reports/relatorioCliente*.ts (24/09 — comparação com o período anterior,
 * público corrigido, conjunto com nome, gráfico honesto).
 */
export async function montarHtmlRelatorioCliente(
  token: string,
  client: ReportClientRow,
  periodDays = 7,
  /** Intervalo EXATO (YYYY-MM-DD). Quando vem, manda nos anúncios em vez da janela de N dias —
   *  é como se pede "julho fechado" em vez de "últimos 30 dias".
   *  O Instagram NÃO acompanha: a API só oferece janelas fixas (7d/28d), então o bloco de IG
   *  continua no preset e o PDF escreve o período de CADA bloco, pra ninguém ler um
   *  número de julho ao lado de um número de 28 dias achando que são a mesma janela. */
  dateFrom?: string,
  dateTo?: string,
): Promise<{ ok: boolean; html?: string; error?: string }> {
  const accountId = client.meta_ad_account_id;
  const clientName = clientDisplayName(client);
  const intervaloExato = !!(dateFrom && dateTo);
  const hoje = hojeSP();
  // A janela de N dias termina ONTEM (a Meta não fecha o dia de hoje) — a mesma do date_preset
  // last_7d/last_30d que o relatório usava. Rodando na segunda, é segunda → domingo da semana passada.
  const janela = intervaloExato ? janelaDoRelatorio(dateFrom!, dateTo!) : janelaDosUltimosDias(periodDays, hoje);
  // A JANELA DO INSTAGRAM SAI DO INTERVALO, NÃO DO periodDays. No primeiro envio de julho eu
  // passei só since/until e esqueci o period=month: os anúncios vieram do mês fechado e o bloco de
  // IG veio de 7 DIAS, no mesmo PDF. Derivar do intervalo tira essa pegadinha do chamador.
  // (A API do IG só tem janelas fixas — pega a mais próxima do tamanho pedido.)
  const diasDoIntervalo = janela.dias;
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

  // ── Anúncios ──
  // Falha na leitura do período atual NÃO vira relatório só de Instagram: pro cliente de tráfego,
  // um PDF sem os anúncios pareceria "não anunciamos nada". Vira erro nomeado pro time.
  let anuncios: Awaited<ReturnType<typeof lerRelatorioAnuncios>> = null;
  if (accountId) {
    try {
      anuncios = await lerRelatorioAnuncios(token, contaGraph(accountId), janela, clientName);
    } catch (e) {
      return { ok: false, error: `Meta: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` };
    }
  }
  if (!anuncios && !igSnap) {
    return { ok: false, error: accountId ? "sem veiculação nem Instagram no período" : "cliente sem tráfego nem Instagram" };
  }

  const logo = (await loadLoneLogo().catch(() => "")) || `${baseUrlPublica()}/logo.png`;
  const html = relatorioClienteHtml({ clienteNome: clientName, logo, geradoEm: hoje, janela, anuncios, instagram: igSnap });
  return { ok: true, html };
}

/** Gera o PDF (Buffer) do relatório de UM cliente. Nunca lança. Ver montarHtmlRelatorioCliente. */
export async function buildClientPdf(
  token: string,
  client: ReportClientRow,
  periodDays = 7,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ ok: boolean; buffer?: Buffer; error?: string }> {
  const h = await montarHtmlRelatorioCliente(token, client, periodDays, dateFrom, dateTo);
  if (!h.ok || !h.html) return { ok: false, error: h.error ?? "falha ao montar o relatório" };
  const pdf = await htmlToPdf(h.html);
  if (!pdf.ok || !pdf.buffer) return { ok: false, error: pdf.error ?? "falha no render" };
  return { ok: true, buffer: pdf.buffer };
}
