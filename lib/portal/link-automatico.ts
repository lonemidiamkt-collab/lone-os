// lib/portal/link-automatico.ts — TODO CLIENTE NOVO NASCE COM O LINK DO PORTAL, e o grupo de cadastro
// fica sabendo. Uma função só para todos os caminhos em que um cliente vira cliente:
//
//   · cadastro manual pela gestão ............ POST /api/data/clients            (origem "cadastro")
//   · rascunho/onboarding aprovado ........... /api/onboarding approve|provision  (origem "aprovacao")
//                                              /api/clients/update draftStatus=null
//   · lead ganho convertido no CRM (Leva 7C) . /api/onboarding generate_link_with_draft + leadId ("crm")
//   · cliente criado pelo grupo do WhatsApp .. /api/cs/inbound (onboarding pelo grupo) ("grupo_whatsapp")
//   · cliente arquivado que volta ............ /api/clients/[id]/lifecycle reactivate ("reativacao")
//   · backfill manual ........................ /api/system/portal-links-backfill   ("backfill")
//
// O que faz: gera o token do portal se não houver (a mesma escrita da rota generate-token, com o portal
// ligado) e manda UMA mensagem curta ao grupo INTERNO de cadastro (CS_CADASTRO_GROUP_JID, ou o interno
// se ele não existir — a mesma regra do onboarding e do ciclo de vida).
//
// Regras que não se negociam:
//   · UMA VEZ por cliente. A trava é clients.portal_link_avisado_em (migration
//     20260927100000_portal_link_automatico.sql), marcada ANTES do envio com
//     `update … where portal_link_avisado_em is null` — duas ativações ao mesmo tempo, uma mensagem só.
//     Envio que falha solta a trava (a próxima ativação ou o backfill tentam de novo). Sem a migration,
//     a trava é o registro de envios (cs_outbound.idem_key) e só se avisa link criado na hora.
//   · NUNCA para grupo de cliente: destino "interno" e, antes de mandar, confere que o JID configurado
//     não é o grupo de nenhum cliente. Ao cliente o link vai pelas mãos do time (ficha → Portal).
//   · Link desativado de propósito (revogado) não é recriado nem anunciado.
//
// Testado em tests/portal-link-automatico.test.ts.

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { estaPausado } from "@/lib/clients/pausa";
import { urlDoPortal } from "./link";

export type OrigemLinkPortal = "cadastro" | "aprovacao" | "crm" | "grupo_whatsapp" | "reativacao" | "backfill";

const COLUNA = "portal_link_avisado_em";
const ORIGEM_ENVIO = "portal-link-automatico";
export const idemDoLink = (clientId: string) => `portal-link:${clientId}`;

/** Grupo interno de cadastro — o mesmo de app/api/onboarding e do ciclo de vida. */
export function jidDoGrupoCadastro(env: Record<string, string | undefined> = process.env): string | null {
  return env.CS_CADASTRO_GROUP_JID || env.CS_INTERNAL_GROUP_JID || null;
}

/** A mensagem do grupo de cadastro: o nome, o link e o que ele é. */
export function mensagemLinkDoPortal(nome: string, url: string): string {
  return `🔗 Portal do cliente — *${nome}*\n${url}\n`
    + "É a página de resultados que o cliente abre sem login (anúncios, Instagram e posts). "
    + "Para enviar a ele: ficha do cliente → Portal.";
}

export interface ClienteLinkPortal {
  id: string;
  name?: string | null;
  nome_fantasia?: string | null;
  active?: boolean | null;
  churned_at?: string | null;
  draft_status?: string | null;
  paused_at?: string | null;
  paused_until?: string | null;
  public_report_token?: string | null;
  public_report_token_revoked_at?: string | null;
  public_report_enabled?: boolean | null;
  portal_link_avisado_em?: string | null;
}

export interface OpcoesLinkPortal {
  origem: OrigemLinkPortal;
  /** Gera o token quando não houver (padrão: sim). */
  gerar?: boolean;
  /** Avisa o grupo de cadastro (padrão: sim). */
  enviar?: boolean;
}

export interface DecisaoLinkPortal { gerar: boolean; enviar: boolean; motivo: string | null }

/**
 * O que fazer com este cliente. Pura. `semColuna` = a migration da trava ainda não foi aplicada: aí só
 * se avisa o link criado nesta chamada (link antigo nunca é anunciado sem a trava de verdade).
 */
export function decidirLinkAutomatico(
  c: ClienteLinkPortal,
  opts: OpcoesLinkPortal & { semColuna?: boolean },
  agora: Date = new Date(),
): DecisaoLinkPortal {
  const nada = (motivo: string): DecisaoLinkPortal => ({ gerar: false, enviar: false, motivo });
  if (c.active === false || c.churned_at) return nada("cliente arquivado");
  // A conversão do CRM cria o cliente como rascunho (pending_invite) — e o CEO quer o link já ali.
  // Qualquer outro rascunho espera a aprovação.
  if (c.draft_status && opts.origem !== "crm") return nada("rascunho: o link sai quando o cadastro for aprovado");
  const token = c.public_report_token || null;
  if (token && c.public_report_token_revoked_at) return nada("link desativado de propósito");
  if (token && c.public_report_enabled === false) return nada("portal desligado");

  const gerar = !token && opts.gerar !== false;
  if (!token && !gerar) return nada("sem link");
  if (opts.enviar === false) return { gerar, enviar: false, motivo: "envio não pedido" };
  if (c.portal_link_avisado_em) return { gerar, enviar: false, motivo: "o grupo de cadastro já recebeu este link" };
  if (estaPausado(c, agora)) return { gerar, enviar: false, motivo: "cliente pausado: o link só abre quando retomar" };
  if (opts.semColuna && !gerar) return { gerar, enviar: false, motivo: "migração da trava pendente: só aviso link criado agora" };
  return { gerar, enviar: true, motivo: null };
}

type ResultadoGravacao = { ok: true; token: string; criado: boolean } | { ok: false; erro: string };

/**
 * Grava um token novo do portal (e liga o portal). É a escrita das rotas generate-token e rotate.
 * `soSeNaoExiste`: não troca um link que já existe — se outra chamada gerou no meio, devolve o dela.
 */
export async function gravarTokenDoPortal(clientId: string, opts: { soSeNaoExiste?: boolean } = {}): Promise<ResultadoGravacao> {
  const token = crypto.randomUUID();
  let q = supabaseAdmin.from("clients").update({
    public_report_token: token,
    public_report_token_created_at: new Date().toISOString(),
    public_report_token_revoked_at: null,
    public_report_enabled: true,
  }).eq("id", clientId);
  if (opts.soSeNaoExiste) q = q.is("public_report_token", null);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, erro: error.message };
  if (data?.length) return { ok: true, token, criado: true };
  if (!opts.soSeNaoExiste) return { ok: false, erro: "Cliente não encontrado" };
  const { data: atual } = await supabaseAdmin.from("clients").select("public_report_token").eq("id", clientId).maybeSingle();
  const existente = (atual?.public_report_token as string | null | undefined) ?? null;
  return existente ? { ok: true, token: existente, criado: false } : { ok: false, erro: "Cliente não encontrado" };
}

const COLS = "id, name, nome_fantasia, active, churned_at, draft_status, paused_at, paused_until, "
  + "public_report_token, public_report_token_revoked_at, public_report_enabled";

/** A coluna da trava ainda não existe (migration não aplicada)? */
export function faltaColunaDaTrava(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.message ?? "").includes(COLUNA);
}

/** Lê o cliente com a trava; sem a coluna, lê sem ela e avisa. */
async function lerCliente(clientId: string): Promise<{ c: ClienteLinkPortal | null; semColuna: boolean; erro: string | null }> {
  const r = await supabaseAdmin.from("clients").select(`${COLS}, ${COLUNA}`).eq("id", clientId).maybeSingle();
  if (!r.error) return { c: (r.data as ClienteLinkPortal | null) ?? null, semColuna: false, erro: null };
  if (!faltaColunaDaTrava(r.error)) return { c: null, semColuna: false, erro: r.error.message };
  const r2 = await supabaseAdmin.from("clients").select(COLS).eq("id", clientId).maybeSingle();
  return { c: (r2.data as ClienteLinkPortal | null) ?? null, semColuna: true, erro: r2.error?.message ?? null };
}

/** O JID configurado é o grupo de algum cliente? Na dúvida (consulta falhou), trata como se fosse. */
async function ehGrupoDeCliente(jid: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("clients").select("id").eq("whatsapp_group_jid", jid).limit(1);
  if (error) return true;
  return (data?.length ?? 0) > 0;
}

export interface ResultadoLinkPortal {
  clientId: string;
  nome: string | null;
  /** Endereço do portal (tem o token — não devolver para fora do servidor sem necessidade). */
  url: string | null;
  /** O token foi criado nesta chamada. */
  gerado: boolean;
  /** O grupo de cadastro recebeu a mensagem nesta chamada. */
  enviado: boolean;
  /** Por que não gerou ou não mandou. null quando fez tudo o que foi pedido. */
  motivo: string | null;
}

/** Garante o link do portal e avisa o grupo de cadastro uma vez. Nunca lança. */
export async function garantirLinkDoPortal(clientId: string, opts: OpcoesLinkPortal): Promise<ResultadoLinkPortal> {
  const base: ResultadoLinkPortal = { clientId, nome: null, url: null, gerado: false, enviado: false, motivo: null };
  try {
    const { c, semColuna, erro } = await lerCliente(clientId);
    if (erro) return { ...base, motivo: `não consegui ler o cliente: ${erro}` };
    if (!c) return { ...base, motivo: "cliente não encontrado" };
    const nome = (c.nome_fantasia || c.name || "Cliente").trim() || "Cliente";
    const d = decidirLinkAutomatico(c, { ...opts, semColuna });

    let token = c.public_report_token || null;
    let gerado = false;
    if (d.gerar) {
      const g = await gravarTokenDoPortal(clientId, { soSeNaoExiste: true });
      if (!g.ok) return { ...base, nome, motivo: `não gerei o link: ${g.erro}` };
      token = g.token;
      gerado = g.criado;
    }
    const url = token ? urlDoPortal(token) : null;
    const feito = { ...base, nome, url, gerado };
    if (!d.enviar || !url) return { ...feito, motivo: d.motivo };
    // Sem a trava de verdade, só se anuncia o link que ESTA chamada criou.
    if (semColuna && !gerado) return { ...feito, motivo: "migração da trava pendente: só aviso link criado agora" };

    const jid = jidDoGrupoCadastro();
    if (!jid) return { ...feito, motivo: "grupo de cadastro não configurado (CS_CADASTRO_GROUP_JID)" };
    if (await ehGrupoDeCliente(jid)) return { ...feito, motivo: "o grupo configurado é de um cliente — não mando" };

    const idem = idemDoLink(clientId);
    const marca = new Date().toISOString();
    if (!semColuna) {
      const { data, error } = await supabaseAdmin.from("clients")
        .update({ [COLUNA]: marca }).eq("id", clientId).is(COLUNA, null).select("id");
      if (error) return { ...feito, motivo: `não consegui travar o envio: ${error.message}` };
      if (!data?.length) return { ...feito, motivo: "o grupo de cadastro já recebeu este link" };
    } else {
      const { data: ja } = await supabaseAdmin.from("cs_outbound").select("id").eq("idem_key", idem).eq("enviado", true).limit(1);
      if (ja?.length) return { ...feito, motivo: "o grupo de cadastro já recebeu este link" };
    }

    const r = await csSendGroupText(jid, mensagemLinkDoPortal(nome, url), undefined,
      { origem: ORIGEM_ENVIO, destino: "interno", clientId, idem });
    if (!r.ok) {
      // Solta a trava (só a nossa): a próxima ativação ou o backfill tentam de novo.
      if (!semColuna) await supabaseAdmin.from("clients").update({ [COLUNA]: null }).eq("id", clientId).eq(COLUNA, marca);
      return { ...feito, motivo: `o aviso não saiu: ${r.error ?? "erro no WhatsApp"}` };
    }
    return { ...feito, enviado: true, motivo: null };
  } catch (e) {
    return { ...base, motivo: e instanceof Error ? e.message : "erro" };
  }
}

/**
 * Para as rotas: dispara sem segurar a resposta (o WhatsApp pode levar segundos). O servidor é Node
 * persistente (VPS), então termina em segundo plano. Só loga quando algo ficou por fazer.
 */
export function dispararLinkDoPortal(clientId: string, origem: OrigemLinkPortal): void {
  void garantirLinkDoPortal(clientId, { origem })
    .then((r) => {
      if (r.motivo && !["o grupo de cadastro já recebeu este link", "link desativado de propósito"].includes(r.motivo)) {
        console.log(`[portal-link] ${clientId} (${origem}): ${r.motivo}`);
      }
    })
    .catch((e) => console.error(`[portal-link] ${clientId} (${origem}) falhou:`, e));
}

// ── Backfill (/api/system/portal-links-backfill) ─────────────────────────────────────────────────

export type SituacaoBackfill = "sem_link" | "sem_aviso" | "desativado" | "ok";

/**
 * Onde um cliente ATIVO está: sem link; com link que o grupo de cadastro nunca recebeu (só dá pra
 * saber com a coluna da trava — links anteriores à automação já vêm marcados pela migration);
 * desativado de propósito; ou em dia. Pura.
 */
export function situacaoParaBackfill(c: ClienteLinkPortal, semColuna = false): SituacaoBackfill {
  if (!c.public_report_token) return "sem_link";
  if (c.public_report_token_revoked_at || c.public_report_enabled === false) return "desativado";
  if (!semColuna && !c.portal_link_avisado_em) return "sem_aviso";
  return "ok";
}
