// lib/cs/nao-lidas-server.ts — banco da fila de mensagens que a IA não conseguiu ler
// (cs_mensagens_nao_lidas, migration 20261021130003). Regras em lib/cs/nao-lidas.ts.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { NaoLida } from "@/lib/cs/nao-lidas";

/**
 * Guarda a mensagem que a classificação não leu. false = não conseguiu guardar (o inbound então
 * libera o claim do message_id, para o reenvio da Evolution ter chance — nunca some calado).
 */
export async function guardarNaoLida(m: {
  messageId: string; groupJid: string; clientId?: string | null; clienteNome?: string | null;
  authorJid?: string | null; authorName?: string | null; texto: string; recebidaEmSeg?: number | null;
  erro?: string | null;
}): Promise<boolean> {
  const recebida = m.recebidaEmSeg && m.recebidaEmSeg > 0 ? new Date(m.recebidaEmSeg * 1000) : new Date();
  const { error } = await supabaseAdmin.from("cs_mensagens_nao_lidas").upsert({
    message_id: m.messageId, group_jid: m.groupJid, client_id: m.clientId ?? null, cliente_nome: m.clienteNome ?? null,
    author_jid: m.authorJid ?? null, author_name: m.authorName ?? null, texto: m.texto.slice(0, 4000),
    recebida_em: recebida.toISOString(), erro: (m.erro ?? "").slice(0, 500) || null, status: "pendente",
  }, { onConflict: "message_id", ignoreDuplicates: true });
  if (error) {
    console.error("[CS/nao-lidas] não guardei a mensagem (migration 20261021130003 aplicada?):", error.message);
    return false;
  }
  return true;
}

/** A fila: o que falta ler e o que desistiu sem o time ter sido avisado. */
export async function lerFila(): Promise<{ fila: NaoLida[]; erro: string | null }> {
  const { data, error } = await supabaseAdmin.from("cs_mensagens_nao_lidas").select("*")
    .or("status.in.(pendente,lendo),and(status.eq.expirada,avisado_em.is.null)")
    .order("recebida_em", { ascending: true }).limit(200);
  return { fila: (data ?? []) as NaoLida[], erro: error?.message ?? null };
}

/** Trava a mensagem para esta rodada (duas rodadas não releem a mesma). */
export async function travarParaLer(m: NaoLida): Promise<boolean> {
  const { data } = await supabaseAdmin.from("cs_mensagens_nao_lidas")
    .update({ status: "lendo", ultima_tentativa_em: new Date().toISOString() })
    .eq("message_id", m.message_id).in("status", ["pendente", "lendo"]).select("message_id");
  return !!data?.length;
}

export async function marcarLida(m: NaoLida, resultado: Record<string, unknown>): Promise<void> {
  await supabaseAdmin.from("cs_mensagens_nao_lidas")
    .update({ status: "lida", lida_em: new Date().toISOString(), resultado, tentativas: m.tentativas + 1 })
    .eq("message_id", m.message_id);
}

export async function marcarFalhaDeNovo(m: NaoLida, erro: string): Promise<void> {
  await supabaseAdmin.from("cs_mensagens_nao_lidas")
    .update({ status: "pendente", erro: erro.slice(0, 500), tentativas: m.tentativas + 1 })
    .eq("message_id", m.message_id);
}

export async function marcarExpiradas(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await supabaseAdmin.from("cs_mensagens_nao_lidas").update({ status: "expirada" }).in("message_id", ids);
}

export async function marcarAvisadas(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await supabaseAdmin.from("cs_mensagens_nao_lidas").update({ avisado_em: new Date().toISOString() }).in("message_id", ids);
}
