// lib/traffic/weekly-report.ts — núcleo reutilizável do relatório semanal (7d).
// Usado pelo relatório interno (/api/system/weekly-reports) e pelo envio aos
// grupos dos clientes (/api/system/client-messages).

import { supabaseAdmin } from "@/lib/supabase/server";
import { estaPausado, hojeSP, type ClienteComPausa } from "@/lib/clients/pausa";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { getIgSnapshotCached, type IgSnapshot } from "@/lib/meta/igSnapshot";
import { janelaDoRelatorio, janelaDosUltimosDias, type RelatorioAnuncios } from "@/lib/reports/relatorioCliente";
import { lerRelatorioAnuncios } from "@/lib/reports/relatorioClienteDados";
import { relatorioClienteHtml } from "@/lib/reports/relatorioClientePdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { podeFalarDeAnuncio } from "@/lib/clients/servico";
import { lerRelatorioGoogle, temGoogleNoRelatorio } from "@/lib/google/relatorio-dados";
import { temColunasGoogle } from "@/lib/google/colunas";
import { folhasGoogle } from "@/lib/reports/relatorioGooglePdf";
import type { RelatorioGoogle } from "@/lib/google/relatorio";
import { lerRelatorioCrm } from "@/lib/crm-externo/servidor";
import type { RelatorioCrm } from "@/lib/crm-externo/relatorio";

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
  /** Ramo e CNAE: decidem como o placar da segunda fala com o dono (lib/traffic/placar-semanal.ts). */
  nicho?: string | null;
  cnae_principal?: string | null;
  /** Google Ads (só entra com contrato de tráfego) e Perfil da Empresa — lib/google/relatorio-dados.ts. */
  google_ads_customer_id?: string | null;
  google_perfil_local?: string | null;
}

const COLUNAS_GOOGLE = ", google_ads_customer_id, google_perfil_local";

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
  const g = await temColunasGoogle(); // migração do Google ainda não aplicada = lista de antes, sem quebrar
  let q = supabaseAdmin
    .from("clients")
    .select(`id, name, nome_fantasia, service_type, meta_ad_account_id, ig_business_account_id, ig_public_username, status, draft_status, whatsapp_group_jid, whatsapp_group_name, paused_at, paused_until${g ? COLUNAS_GOOGLE : ""}`)
    // `at_risk` ENTRA (24/10/2026, auditoria 5.11): o cliente que mais precisa de atenção ficava sem relatório. Com
    // ele entra também o filtro de ex-cliente — o encerramento grava active=false e mantém o status (muitas vezes
    // at_risk); sem isso, quem saiu voltaria a receber relatório. Mesma regra de selectActiveClientsWithGroup.
    .in("status", ["good", "average", "onboarding", "at_risk"])
    .is("draft_status", null)
    .neq("active", false)
    .order("nome_fantasia");
  // `apenasTrafego` filtrava por "tem conta de anúncio" — o mesmo proxy errado que mandou mensagem
  // de campanha pro Dumar. Agora exige o CONTRATO e a conta: o contrato autoriza, a conta viabiliza.
  // Google (18/11/2026): conta do Google Ads também viabiliza o semanal (com contrato de tráfego); o Perfil da
  // Empresa entra no mensal como o Instagram (presença, não anúncio).
  q = apenasTrafego
    ? q.in("service_type", ["lone_growth", "assessoria_trafego", "trafego_pago", "trafego_social_site"])
        .or(g ? "meta_ad_account_id.not.is.null,google_ads_customer_id.not.is.null" : "meta_ad_account_id.not.is.null")
    : q.or(`meta_ad_account_id.not.is.null,ig_business_account_id.not.is.null,ig_public_username.not.is.null${g ? ",google_ads_customer_id.not.is.null,google_perfil_local.not.is.null" : ""}`);
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // PAUSA (23/09): cliente pausado continua na carteira do time, mas NÃO recebe mensagem, relatório
  // nem alerta até a pausa vencer (paused_until no passado volta sozinho). Ver lib/clients/pausa.ts.
  // Select montado em tempo de execução (colunas do Google só com a migração): o tipo vem daqui, não do parser.
  return ((data ?? []) as unknown as ReportClientRow[]).filter((c) => !estaPausado(c as unknown as ClienteComPausa));
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
  const g = await temColunasGoogle();
  let q = supabaseAdmin
    .from("clients")
    // service_type é OBRIGATÓRIO aqui: é ele que autoriza falar de anúncio (lib/clients/servico.ts).
    // Sem esse campo no select, `podeFalarDeAnuncio` receberia undefined e — por ser prudente por
    // desenho — calaria a mensagem de tráfego de TODO MUNDO. O silêncio geral seria pior que o erro
    // que ele corrige.
    .select(`id, name, nome_fantasia, service_type, meta_ad_account_id, status, draft_status, whatsapp_group_jid, whatsapp_group_name, paused_at, paused_until, nicho, cnae_principal${g ? COLUNAS_GOOGLE : ""}`)
    .in("status", ["good", "average", "onboarding", "at_risk"])
    .is("draft_status", null)
    .neq("active", false) // ex-clientes (churned) não recebem mensagem/relatório
    .order("nome_fantasia");
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // PAUSA (23/09): cliente pausado continua na carteira do time, mas NÃO recebe mensagem, relatório
  // nem alerta até a pausa vencer (paused_until no passado volta sozinho). Ver lib/clients/pausa.ts.
  // Select montado em tempo de execução (colunas do Google só com a migração): o tipo vem daqui, não do parser.
  return ((data ?? []) as unknown as ReportClientRow[]).filter((c) => !estaPausado(c as unknown as ClienteComPausa));
}

/** Um cliente pelo id, SEM os filtros de envio (status, pausa, contrato) — só pra PRÉVIA do relatório. */
export async function selectReportClient(id: string): Promise<ReportClientRow | null> {
  const g = await temColunasGoogle();
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select(`id, name, nome_fantasia, service_type, meta_ad_account_id, ig_business_account_id, ig_public_username, whatsapp_group_jid, whatsapp_group_name, nicho, cnae_principal${g ? COLUNAS_GOOGLE : ""}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReportClientRow | null) ?? null;
}

const contaGraph = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);

/**
 * A conta de anúncios que ENTRA no relatório — só com contrato de tráfego (21/10/2026).
 *
 * O mensal sai pra todo cliente com conta OU Instagram vinculado, e a folha de anúncios era montada
 * sempre que havia conta. Cliente só de social com conta vinculada (o caso do Dumar) recebia, no
 * relatório do mês, a página de campanhas que ele não contratou. A conta viabiliza; quem autoriza é
 * o contrato (lib/clients/servico.ts).
 */
export function contaDeAnunciosDoRelatorio(c: Pick<ReportClientRow, "service_type" | "meta_ad_account_id">): string | null {
  if (!c.meta_ad_account_id) return null;
  return podeFalarDeAnuncio(c) ? c.meta_ad_account_id : null;
}

/** Por que não há relatório quando não sobra nem anúncio nem Instagram. */
export function motivoSemRelatorio(c: Pick<ReportClientRow, "service_type" | "meta_ad_account_id">): string {
  if (contaDeAnunciosDoRelatorio(c)) return "sem veiculação nem Instagram no período";
  if (c.meta_ad_account_id) return "sem Instagram vinculado — e os anúncios ficam de fora, porque o contrato não inclui tráfego";
  return "cliente sem tráfego nem Instagram";
}

function baseUrlPublica(): string {
  return process.env.NEXT_PUBLIC_PORTAL_DOMAIN || process.env.NEXT_PUBLIC_SITE_URL || "https://painel.lonemidia.com";
}

/**
 * Monta o HTML do relatório de UM cliente. Nunca lança. Monta o que o cliente tiver: anúncios
 * (Meta, só com contrato de tráfego) + Instagram orgânico. Tem os dois → uma folha de anúncios e uma
 * de Instagram. Só um → só ele. O IG vem do cache (evita rate limit).
 *
 * Desenho e contas: lib/reports/relatorioCliente*.ts (24/09 — comparação com o período anterior,
 * público corrigido, conjunto com nome, gráfico honesto).
 */
export async function montarHtmlRelatorioCliente(
  /** Token da Meta. null = sem token: cliente só de Google sai normalmente; quem tem anúncio na Meta falha nomeado. */
  token: string | null,
  client: ReportClientRow,
  periodDays = 7,
  /** Intervalo EXATO (YYYY-MM-DD). Quando vem, manda nos anúncios em vez da janela de N dias —
   *  é como se pede "julho fechado" em vez de "últimos 30 dias".
   *  O Instagram NÃO acompanha: a API só oferece janelas fixas (7d/28d), então o bloco de IG
   *  continua no preset e o PDF escreve o período de CADA bloco, pra ninguém ler um
   *  número de julho ao lado de um número de 28 dias achando que são a mesma janela. */
  dateFrom?: string,
  dateTo?: string,
): Promise<{ ok: boolean; html?: string; error?: string; anuncios?: RelatorioAnuncios | null; google?: RelatorioGoogle | null; avisos?: string[] }> {
  // Só com contrato de tráfego — ver contaDeAnunciosDoRelatorio.
  const accountId = contaDeAnunciosDoRelatorio(client);
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
  if (accountId && !token) return { ok: false, error: "Token Meta ausente/expirado" };
  if (accountId && token) {
    try {
      anuncios = await lerRelatorioAnuncios(token, contaGraph(accountId), janela, clientName);
    } catch (e) {
      return { ok: false, error: `Meta: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` };
    }
  }
  // ── Google Ads e Perfil da Empresa (do banco — a rotina google-sync grava todo dia às 7h) ──
  // Bloco que não pôde ser lido NÃO vai pro PDF do cliente: o motivo volta em `avisos` para o time.
  let google: RelatorioGoogle | null = null;
  const avisos: string[] = [];
  const temG = temGoogleNoRelatorio(client);
  if (temG.ads || temG.perfil) {
    try {
      google = await lerRelatorioGoogle(client, janela);
    } catch (e) {
      avisos.push(`Google: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }
    if (google?.adsIndisponivel) avisos.push(`Google Ads fora do relatório: ${google.adsIndisponivel.motivo}`);
    if (google?.perfilIndisponivel) avisos.push(`Perfil da Empresa fora do relatório: ${google.perfilIndisponivel.motivo}`);
  }
  const temFolhaGoogle = folhasGoogle(google, clientName).length > 0;

  // ── Atendimento e vendas (CRM do cliente: Âncora, Kommo ou API aberta — lib/crm-externo) ──
  // Lido AGORA no CRM (fresco, sem cache). Período que não pôde ser lido não vai pro PDF: vira aviso pro time.
  let crm: RelatorioCrm | null = null;
  if (client.id) {
    try {
      const c = await lerRelatorioCrm(client.id, janela, { fresco: true });
      if (c) { crm = c.relatorio && !c.relatorio.semDados ? c.relatorio : null; avisos.push(...c.avisos); }
    } catch (e) {
      avisos.push(`CRM: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }
  }

  if (!anuncios && !igSnap && !temFolhaGoogle && !crm) {
    return { ok: false, error: avisos.length ? avisos.join(" · ") : motivoSemRelatorio(client) };
  }

  const logo = (await loadLoneLogo().catch(() => "")) || `${baseUrlPublica()}/logo.png`;
  const html = relatorioClienteHtml({ clienteNome: clientName, logo, geradoEm: hoje, janela, anuncios, instagram: igSnap, google, crm });
  // Os dados voltam junto: o placar da segunda (legenda) sai dos MESMOS números do PDF.
  return { ok: true, html, anuncios, google, avisos };
}

/** Gera o PDF (Buffer) do relatório de UM cliente. Nunca lança. Ver montarHtmlRelatorioCliente. */
export async function buildClientPdf(
  token: string | null,
  client: ReportClientRow,
  periodDays = 7,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ ok: boolean; buffer?: Buffer; error?: string; anuncios?: RelatorioAnuncios | null; google?: RelatorioGoogle | null; avisos?: string[] }> {
  const h = await montarHtmlRelatorioCliente(token, client, periodDays, dateFrom, dateTo);
  if (!h.ok || !h.html) return { ok: false, error: h.error ?? "falha ao montar o relatório" };
  const pdf = await htmlToPdf(h.html);
  if (!pdf.ok || !pdf.buffer) return { ok: false, error: pdf.error ?? "falha no render" };
  return { ok: true, buffer: pdf.buffer, anuncios: h.anuncios ?? null, google: h.google ?? null, avisos: h.avisos ?? [] };
}
