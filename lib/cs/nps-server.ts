// lib/cs/nps-server.ts — o lado do BANCO e do WhatsApp do NPS pós-reunião (Leva 6B, E6).
// As regras (quem recebe, como ler a nota, quanto pesa) moram em lib/cs/nps.ts, que é puro e testado.
//
// Tabela: cs_nps_pesquisas (migration 20260924213000_cs_nps_pesquisas.sql). NÃO é a antiga
// `client_nps` — aquela guardava estrelas dadas pelo próprio time e fica como está, sem uso.
//
// TRAVA DE ENVIO: nada sai para o grupo do cliente sem o job cs-nps LIGADO EXPLICITAMENTE na Central
// de Automações. "Sem linha em automation_settings" vale como ligado para os outros jobs; aqui vale
// como DESLIGADO — se a migration não tiver sido aplicada, o NPS continua mudo.

import { supabaseAdmin } from "@/lib/supabase/server";
import { lerConfig } from "@/lib/automacoes/painel";
import { estaPausado as jobPausado } from "@/lib/automacoes/saude";
import { podeReceber } from "@/lib/clients/pausa";
import { csSendGroupText } from "@/lib/cs/notify";
import {
  JOB_NPS, JANELA_REUNIAO_H, JANELA_RESPOSTA_H, JANELA_MOTIVO_H, INTERVALO_MINIMO_DIAS, VALIDADE_NO_SCORE_DIAS,
  TEXTO_FOLLOWUP, selecionarEnvios, decidirResposta,
  type ClienteParaNps, type EnvioNps, type IgnoradoNps, type PerguntaAnterior, type ReuniaoParaNps,
  type EstadoPesquisa, type RespostaNps,
} from "@/lib/cs/nps";

export const TABELA_NPS = "cs_nps_pesquisas";
export const MIGRACAO_NPS = "supabase/migrations/20260924213000_cs_nps_pesquisas.sql";

const H = 3600_000;
const DIA = 86_400_000;
const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ─── A trava ──────────────────────────────────────────────────────────────────

/** O job está LIGADO de propósito na Central? Qualquer dúvida = desligado. */
export async function npsLigado(agora = new Date()): Promise<{ ligado: boolean; motivo: string }> {
  try {
    const c = await lerConfig(JOB_NPS);
    if (!c) return { ligado: false, motivo: "nunca foi ligado na Central de Automações (nasce desligado)" };
    if (c.enabled !== true) return { ligado: false, motivo: "desligado na Central de Automações" };
    if (jobPausado(c, agora)) return { ligado: false, motivo: "pausado na Central de Automações" };
    return { ligado: true, motivo: "ligado na Central de Automações" };
  } catch (e) {
    return { ligado: false, motivo: `não consegui ler a Central (${erroDe(e)}) — sem envio, por segurança` };
  }
}

// ─── A rodada do job ──────────────────────────────────────────────────────────

/** Reuniões realizadas nas últimas 72h, os clientes delas e as perguntas já feitas → quem recebe. */
export async function montarRodada(agora = new Date()): Promise<{ envios: EnvioNps[]; ignorados: IgnoradoNps[] }> {
  const desde = new Date(agora.getTime() - JANELA_REUNIAO_H * H).toISOString();
  const { data: reunioes, error: eR } = await supabaseAdmin
    .from("meetings")
    .select("id, client_id, estado, realizada_em, meeting_type, deleted_at")
    .eq("estado", "realizada")
    .gte("realizada_em", desde)
    .not("client_id", "is", null);
  if (eR) throw new Error(`meetings: ${eR.message}`);

  const ids = [...new Set((reunioes ?? []).map((r) => r.client_id as string))];
  if (!ids.length) return { envios: [], ignorados: [] };

  const [cliQ, antQ] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, contact_name, whatsapp_group_jid, agente_ativo, active, churned_at, paused_at, paused_until")
      .in("id", ids),
    supabaseAdmin.from(TABELA_NPS)
      .select("client_id, meeting_id, perguntado_em")
      .in("client_id", ids)
      .gte("perguntado_em", new Date(agora.getTime() - INTERVALO_MINIMO_DIAS * DIA).toISOString()),
  ]);
  if (cliQ.error) throw new Error(`clients: ${cliQ.error.message}`);
  if (antQ.error) throw new Error(`${TABELA_NPS}: ${antQ.error.message} — aplique ${MIGRACAO_NPS}`);

  const clientes = new Map<string, ClienteParaNps>((cliQ.data ?? []).map((c) => [c.id as string, {
    id: c.id as string,
    nome: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
    contato: (c.contact_name as string) ?? null,
    groupJid: (c.whatsapp_group_jid as string) ?? null,
    agenteAtivo: (c.agente_ativo as boolean | null) ?? null,
    podeReceber: podeReceber(c as never, agora),
  }]));
  const anteriores: PerguntaAnterior[] = (antQ.data ?? []).map((a) => ({
    clientId: a.client_id as string, meetingId: (a.meeting_id as string) ?? null, perguntadoEm: a.perguntado_em as string,
  }));
  const lista: ReuniaoParaNps[] = (reunioes ?? []).map((r) => ({
    id: r.id as string, clientId: (r.client_id as string) ?? null, estado: (r.estado as string) ?? null,
    realizadaEm: (r.realizada_em as string) ?? null, tipo: (r.meeting_type as string) ?? null,
    deletedAt: (r.deleted_at as string) ?? null,
  }));
  return selecionarEnvios({ reunioes: lista, clientes, anteriores, agora });
}

export interface ResultadoEnvio { cliente: string; ok: boolean; erro?: string }

/**
 * Manda a pergunta. A linha nasce ANTES do envio (o índice único por reunião impede pergunta dupla
 * se duas rodadas se cruzarem); envio que falha apaga a linha, e a próxima rodada tenta de novo.
 */
export async function enviarPerguntas(envios: readonly EnvioNps[]): Promise<ResultadoEnvio[]> {
  const out: ResultadoEnvio[] = [];
  for (const e of envios) {
    const { data: linha, error } = await supabaseAdmin.from(TABELA_NPS).insert({
      client_id: e.clientId, meeting_id: e.meetingId, group_jid: e.groupJid,
      status: "aguardando", pergunta: e.texto, perguntado_em: new Date().toISOString(),
    }).select("id").maybeSingle();
    if (error) {
      out.push({ cliente: e.cliente, ok: false, erro: error.code === "23505" ? "já perguntado (outra rodada)" : error.message });
      continue;
    }
    const r = await csSendGroupText(e.groupJid, e.texto, undefined, { origem: "cs-nps", destino: "cliente", clientId: e.clientId });
    if (!r.ok || r.error) {
      await supabaseAdmin.from(TABELA_NPS).delete().eq("id", linha?.id as string);
      out.push({ cliente: e.cliente, ok: false, erro: r.error ?? "WhatsApp não confirmou o envio" });
      continue;
    }
    if (r.id && linha?.id) await supabaseAdmin.from(TABELA_NPS).update({ message_id: r.id }).eq("id", linha.id);
    out.push({ cliente: e.cliente, ok: true });
  }
  return out;
}

/** Fecha o que ficou sem resposta: pergunta com mais de 72h vira "sem_resposta"; follow-up com mais de 48h fecha sem motivo. */
export async function fecharVencidas(agora = new Date()): Promise<{ semResposta: number; semMotivo: number }> {
  const [a, b] = await Promise.all([
    supabaseAdmin.from(TABELA_NPS).update({ status: "sem_resposta" })
      .eq("status", "aguardando").lt("perguntado_em", new Date(agora.getTime() - JANELA_RESPOSTA_H * H).toISOString())
      .select("id"),
    supabaseAdmin.from(TABELA_NPS).update({ status: "respondido" })
      .eq("status", "aguardando_motivo").lt("motivo_perguntado_em", new Date(agora.getTime() - JANELA_MOTIVO_H * H).toISOString())
      .select("id"),
  ]);
  return { semResposta: a.data?.length ?? 0, semMotivo: b.data?.length ?? 0 };
}

// ─── A resposta no grupo (chamado pelo inbound) ──────────────────────────────

export interface RespostaTratada {
  /** true = a mensagem era só a nota: o inbound para aqui. */
  consumir: boolean;
  estado: "nota" | "motivo" | null;
  nota?: number;
}

/**
 * Mensagem de um CLIENTE num grupo. Só age se há pesquisa pendente PARA ESTE GRUPO — sem isso, é uma
 * consulta e nada mais. Nunca lança: o inbound não pode cair por causa do NPS.
 */
export async function tratarRespostaNps(p: {
  groupJid: string;
  texto: string;
  messageId?: string | null;
  citadaId?: string | null;
  autor?: string | null;
  agora?: Date;
}): Promise<RespostaTratada> {
  const nada: RespostaTratada = { consumir: false, estado: null };
  try {
    const agora = p.agora ?? new Date();
    const { data: pend, error } = await supabaseAdmin
      .from(TABELA_NPS)
      .select("id, client_id, status, perguntado_em, motivo_perguntado_em, message_id, motivo_message_id")
      .eq("group_jid", p.groupJid)
      .in("status", ["aguardando", "aguardando_motivo"])
      .gte("perguntado_em", new Date(agora.getTime() - (JANELA_RESPOSTA_H + JANELA_MOTIVO_H) * H).toISOString())
      .order("perguntado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !pend) return nada;

    const d = decidirResposta({
      pendente: {
        status: pend.status as EstadoPesquisa,
        perguntadoEm: pend.perguntado_em as string,
        motivoPerguntadoEm: (pend.motivo_perguntado_em as string) ?? null,
        messageId: (pend.message_id as string) ?? null,
        motivoMessageId: (pend.motivo_message_id as string) ?? null,
      },
      texto: p.texto,
      citadaId: p.citadaId ?? null,
      agora,
    });

    if (d.tipo === "nota") {
      // O follow-up também fala com o cliente: só sai com o job ligado AGORA.
      const segue = d.followUp && (await npsLigado(agora)).ligado;
      const { data: gravou } = await supabaseAdmin.from(TABELA_NPS).update({
        nota: d.nota, resposta: p.texto.slice(0, 500), respondido_em: agora.toISOString(),
        respondido_por: p.autor ?? null, status: segue ? "aguardando_motivo" : "respondido",
      }).eq("id", pend.id as string).eq("status", "aguardando").select("id");
      if (!gravou?.length) return nada; // outra entrega do mesmo webhook chegou antes
      console.log(`[cs-nps] nota ${d.nota} registrada (grupo ${p.groupJid})`);

      if (segue) {
        const r = await csSendGroupText(p.groupJid, TEXTO_FOLLOWUP, p.messageId ?? undefined,
          { origem: "cs-nps", destino: "cliente", clientId: (pend.client_id as string) ?? null });
        await supabaseAdmin.from(TABELA_NPS).update(r.ok && !r.error
          ? { motivo_perguntado_em: new Date().toISOString(), motivo_message_id: r.id ?? null }
          : { status: "respondido" }).eq("id", pend.id as string);
      }
      return { consumir: d.soANota, estado: "nota", nota: d.nota };
    }

    if (d.tipo === "motivo") {
      const { data: gravou } = await supabaseAdmin.from(TABELA_NPS).update({
        motivo: d.texto, motivo_em: agora.toISOString(), status: "respondido",
      }).eq("id", pend.id as string).eq("status", "aguardando_motivo").select("id");
      // O motivo NÃO é consumido: pode ser reclamação (o termômetro precisa ver) ou um pedido.
      return gravou?.length ? { consumir: false, estado: "motivo" } : nada;
    }
    return nada;
  } catch (e) {
    console.error("[cs-nps] tratarResposta falhou:", erroDe(e));
    return nada;
  }
}

// ─── Leitura (ficha do cliente e saúde) ──────────────────────────────────────

export interface ItemHistoricoNps {
  id: string;
  status: EstadoPesquisa;
  perguntadoEm: string;
  nota: number | null;
  respondidoEm: string | null;
  motivo: string | null;
  meetingId: string | null;
}

/** As pesquisas do cliente, mais recente primeiro. Tabela ausente → lista vazia com o aviso. */
export async function historicoNps(clientId: string, limite = 12): Promise<{ itens: ItemHistoricoNps[]; erro: string | null }> {
  const { data, error } = await supabaseAdmin
    .from(TABELA_NPS)
    .select("id, status, perguntado_em, nota, respondido_em, motivo, meeting_id")
    .eq("client_id", clientId)
    .order("perguntado_em", { ascending: false })
    .limit(limite);
  if (error) return { itens: [], erro: `NPS indisponível (${error.message})` };
  return {
    itens: (data ?? []).map((r) => ({
      id: r.id as string,
      status: r.status as EstadoPesquisa,
      perguntadoEm: r.perguntado_em as string,
      nota: typeof r.nota === "number" ? r.nota : null,
      respondidoEm: (r.respondido_em as string) ?? null,
      motivo: (r.motivo as string) ?? null,
      meetingId: (r.meeting_id as string) ?? null,
    })),
    erro: null,
  };
}

/** As notas dos últimos 120 dias por cliente — para o componente Satisfação do /api/scores. */
export async function notasParaSaude(clientIds: readonly string[], agora = new Date()): Promise<Map<string, RespostaNps[]>> {
  const out = new Map<string, RespostaNps[]>();
  if (!clientIds.length) return out;
  const { data, error } = await supabaseAdmin
    .from(TABELA_NPS)
    .select("client_id, nota, respondido_em")
    .in("client_id", clientIds as string[])
    .not("nota", "is", null)
    .gte("respondido_em", new Date(agora.getTime() - VALIDADE_NO_SCORE_DIAS * DIA).toISOString());
  if (error) {
    // Sem a tabela (migration não aplicada), a saúde segue sem o componente — nunca quebra a nota.
    console.warn(`[cs-nps] notas indisponíveis para a saúde: ${error.message}`);
    return out;
  }
  for (const r of data ?? []) {
    const k = r.client_id as string;
    (out.get(k) ?? out.set(k, []).get(k)!).push({ nota: r.nota as number, respondidoEm: r.respondido_em as string });
  }
  return out;
}
