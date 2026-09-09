// A TRILHA DE AUDITORIA DAS REUNIÕES.
//
// Roberto (09/09): "hoje não podemos simplesmente perder informação silenciosamente […] quando
// houver erro de sincronização, quero conseguir descobrir: cliente, usuário, operação, campo,
// payload, horário, erro retornado."
//
// A reunião realizada virou indicador da empresa. A partir daqui, alguém vai olhar um número e
// perguntar de onde ele veio — e "não sei" não é resposta aceitável sobre a própria operação.

import { supabaseAdmin } from "@/lib/supabase/server";

export type AcaoReuniao =
  | "MEETING_CREATED" | "MEETING_UPDATED" | "MEETING_COMPLETED" | "MEETING_BACKFILLED"
  | "MEETING_CANCELLED" | "MEETING_NO_SHOW" | "MEETING_DELETED" | "MEETING_SYNC_FAILED";

/** Campos que NUNCA entram no log, mesmo se vierem no payload. */
const PROIBIDOS = new Set([
  "password", "senha", "metaPassword", "instagramPassword", "googlePassword",
  "transcricao", "arquivo", "base64", "token",
]);

/**
 * Tira do detalhe o que não pode ser guardado.
 *
 * Auditoria não é lugar de credencial nem de transcrição de reunião com cliente: são os dois
 * conteúdos mais sensíveis do sistema, e um log é lido por mais gente e guardado por mais tempo
 * que a tabela original. Guarda-se o TAMANHO da transcrição, que é o que interessa para auditar.
 */
export function limpar(detalhe: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detalhe)) {
    if (PROIBIDOS.has(k)) { out[k] = typeof v === "string" ? `<${v.length} caracteres>` : "<omitido>"; continue; }
    if (typeof v === "string" && v.length > 300) { out[k] = `${v.slice(0, 300)}…`; continue; }
    out[k] = v;
  }
  return out;
}

/**
 * Registra e NUNCA derruba a operação.
 *
 * Se a auditoria falhar, o que estava sendo feito continua: perder o registro de uma reunião
 * marcada porque o log caiu seria trocar um problema por outro pior.
 */
export async function registrar(e: {
  meetingId?: string | null;
  clientId?: string | null;
  acao: AcaoReuniao;
  ator?: string | null;
  origem?: string | null;
  detalhe?: Record<string, unknown>;
  erro?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from("meeting_events").insert({
      meeting_id: e.meetingId ?? null,
      client_id: e.clientId ?? null,
      acao: e.acao,
      ator: e.ator ?? null,
      origem: e.origem ?? null,
      detalhe: e.detalhe ? limpar(e.detalhe) : null,
      erro: e.erro ?? null,
    });
  } catch (err) {
    // Vai para o log do container, que é onde se procura quando a própria auditoria falha.
    console.error("[meeting_events] não consegui registrar:", e.acao, err);
  }
}


// ── A TIMELINE DO CLIENTE ────────────────────────────────────────────────
//
// Roberto (09/09, §17): "na ficha do cliente quero uma visão temporal — 08/09 reunião realizada,
// 01/09 relatório enviado, 28/08 reunião realizada, 15/08 alteração cadastral."
//
// A tela já existia e o tipo `meeting` também; o que faltava era a reunião ESCREVER nela. Uma
// timeline que não registra o evento mais importante do relacionamento não é uma timeline.
//
// Separado da auditoria de propósito: `meeting_events` é trilha técnica (payload, erro, origem) e
// esta é a linha do tempo que o time lê. Misturar faria uma virar ruído da outra.

/** Data e hora no formato que a coluna `timestamp` (texto) já usa nas outras entradas. */
function carimbo(iso?: string | null): string {
  return new Date(iso ?? Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function timelineReuniao(e: {
  clientId: string;
  ator: string;
  descricao: string;
  /** Quando o fato aconteceu. Reunião de sexta lançada na segunda aparece na SEXTA. */
  quando?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from("timeline_entries").insert({
      client_id: e.clientId,
      type: "meeting",
      actor: e.ator,
      description: e.descricao,
      timestamp: carimbo(e.quando),
    });
  } catch (err) {
    console.error("[timeline] não consegui registrar reunião:", err);
  }
}
