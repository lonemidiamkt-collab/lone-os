// GRAVAR A REUNIÃO QUE NASCE NA CONVERSA.
//
// 05/11/2026. As três gravações do ciclo usavam `.upsert(…, { onConflict: "client_id,mes_referencia" })`,
// mas `meetings_ciclo_unico` é um índice PARCIAL (WHERE mes_referencia IS NOT NULL AND meeting_type =
// 'mensal'). O Postgres só aceita ON CONFLICT em índice parcial repetindo esse WHERE, que o PostgREST
// não tem como mandar. Toda gravação voltava "there is no unique or exclusion constraint matching
// the ON CONFLICT specification" e, sem nada gravado:
//   • o cliente propunha um horário e ficava sem resposta (o erro só ia para o log);
//   • a oferta saía, a reunião seguia "pendente" e a mesma oferta saía de novo na manhã seguinte.
//
// Aqui: procura, atualiza ou insere. Sem migration, para valer em qualquer estado do índice.

import { supabaseAdmin } from "@/lib/supabase/server";
import { componentesSP } from "@/lib/prospeccao/tempo";

type Campos = Record<string, unknown>;

export interface Gravacao { id: string | null; erro: string | null }

/** Horário novo invalida lembrete antigo, dos dois lados. */
export const SEM_LEMBRETES = {
  lembrete_vespera_em: null, lembrete_hora_em: null,
  lembrete_cliente_vespera_em: null, lembrete_cliente_hora_em: null,
};

export async function atualizarReuniao(id: string, campos: Campos): Promise<Gravacao> {
  const { error } = await supabaseAdmin.from("meetings").update(campos).eq("id", id);
  return error ? { id: null, erro: error.message } : { id, erro: null };
}

/** A reunião do ciclo daquele cliente naquele mês: atualiza se existe, cria se não existe. */
export async function gravarReuniaoDoCiclo(clientId: string, mes: string, campos: Campos): Promise<Gravacao> {
  const acharDoCiclo = () => supabaseAdmin.from("meetings").select("id")
    .eq("client_id", clientId).eq("mes_referencia", mes).eq("meeting_type", "mensal").maybeSingle();

  const { data: existente, error: erroBusca } = await acharDoCiclo();
  if (erroBusca) return { id: null, erro: erroBusca.message };
  if (existente) return atualizarReuniao(existente.id as string, campos);

  const { data: nova, error } = await supabaseAdmin.from("meetings").insert({
    client_id: clientId, mes_referencia: mes, meeting_type: "mensal",
    status: "scheduled", created_by: "agente-cs", meeting_source: "agente", ...campos,
  }).select("id").single();
  if (!error && nova) return { id: nova.id as string, erro: null };

  // Duas mensagens chegaram juntas e a outra criou primeiro: o índice único segura, e esta atualiza.
  if (error?.code === "23505") {
    const { data: outra } = await acharDoCiclo();
    if (outra) return atualizarReuniao(outra.id as string, campos);
  }
  return { id: null, erro: error?.message ?? "a reunião não foi gravada" };
}

export interface ReuniaoAtiva {
  id: string; estado: string; start_at: string; responsavel: string | null;
  horario_proposto: string | null; proposto_lado: string | null;
}

/**
 * A próxima reunião deste cliente que já tem horário: marcada, ou esperando o social confirmar.
 *
 * De qualquer tipo. A reunião mensal marcada à mão pela tela nasce como "alinhamento", sem
 * `mes_referencia`: olhando só o ciclo, o pedido de mudar o horário criava uma segunda reunião e a
 * primeira continuava gerando lembrete.
 */
export async function reuniaoAtivaDoCliente(clientId: string, agora = new Date()): Promise<ReuniaoAtiva | null> {
  const { data } = await supabaseAdmin.from("meetings")
    .select("id, estado, start_at, responsavel, horario_proposto, proposto_lado")
    .eq("client_id", clientId)
    .in("estado", ["agendada", "aguardando_social"])
    .is("deleted_at", null)
    .gte("start_at", agora.toISOString())
    .order("start_at", { ascending: true })
    .limit(1).maybeSingle();
  return (data as ReuniaoAtiva | null) ?? null;
}

export interface Proposta {
  clientId: string;
  cliente: string;
  iso: string;
  responsavel: string | null;
  groupJid: string;
  trecho: string;
  estado: "ofertada" | "aguardando_social";
  lado: "agente" | "cliente";
  /** A reunião já marcada que esta proposta muda. O horário antigo fica até o social confirmar. */
  agendadaId?: string | null;
  /** A linha que esta mensagem responde: a proposta, a oferta ou a reunião esperando o social. */
  alvoId?: string | null;
}

/** Grava o horário que veio na conversa. `start_at` só muda de verdade quando os dois concordam. */
export async function gravarProposta(p: Proposta): Promise<Gravacao> {
  const agoraIso = new Date().toISOString();
  const quando = new Date(p.iso);
  const campos: Campos = {
    estado: p.estado,
    horario_proposto: p.iso,
    proposto_lado: p.lado,
    proposto_em: agoraIso,
    ...(p.estado === "aguardando_social" ? { perguntado_social_em: agoraIso } : {}),
    group_jid: p.groupJid,
    trecho_origem: p.trecho.slice(0, 300),
    ...SEM_LEMBRETES,
  };
  if (p.agendadaId) return atualizarReuniao(p.agendadaId, campos);

  // start_at é NOT NULL: sem reunião marcada, guarda o horário proposto como provisório. Quem manda
  // é o `estado`.
  const provisorio = { start_at: p.iso, end_at: new Date(quando.getTime() + 3600_000).toISOString() };
  if (p.alvoId) return atualizarReuniao(p.alvoId, { ...campos, ...provisorio });

  return gravarReuniaoDoCiclo(p.clientId, componentesSP(quando).ymd.slice(0, 7), {
    title: `Reunião mensal — ${p.cliente}`,
    responsavel: p.responsavel,
    ...campos,
    ...provisorio,
  });
}
