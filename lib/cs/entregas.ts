// lib/cs/entregas.ts — CONFERÊNCIA DE ENTREGA. O sistema já registrava cada envio ao cliente em
// client_group_message_log (sent/failed/skipped), mas ninguém lia esse registro. Resultado real:
//
//   • 01/07 — TODAS as mensagens falharam ("Bad Request", Evolution fora). Ficou no banco. Silêncio.
//   • 20/07 — CIIL e Dumar não receberam o relatório. Ninguém soube.
//   • Dumar — 11 dias sem relatório porque o @ do Instagram tinha mudado.
//
// O e-mail de alerta que existia só disparava quando NENHUMA mensagem saía (`totalSent === 0`) —
// falha parcial passava batido, e e-mail não é onde o time olha. Aqui a conferência roda DEPOIS do
// envio, compara quem era elegível com quem realmente recebeu, e avisa no grupo interno.
//
// Nunca lança: conferência quebrada não pode derrubar o cron que acabou de entregar tudo certo.

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { ehIncerto } from "@/lib/whatsapp/desfecho-envio";

export type EntregaKind = "report" | "support" | "calendar";

const ROTULO: Record<EntregaKind, string> = {
  report: "relatório",
  support: "mensagem de suporte",
  calendar: "calendário do mês",
};

export interface ConferenciaEntrega {
  kind: EntregaKind;
  dateKey: string;
  entregues: number;
  /** Elegível, mas o envio deu erro — tem motivo registrado. */
  falharam: { cliente: string; motivo: string }[];
  /** Elegível e sem NENHUM registro no dia: o loop nem chegou nele (o pior caso, o mais invisível). */
  semRegistro: string[];
  /** O WhatsApp não confirmou a tempo: PODE ter chegado. Conferir no grupo antes de reenviar
   *  (21/10/2026 — reenviar às cegas era o que mandava em dobro). */
  incertos?: string[];
}

/**
 * Compara os clientes que DEVIAM receber com o que o log registrou no dia.
 * `elegiveis` vem de quem chamou (cada entrega tem sua própria regra de elegibilidade —
 * `selectActiveMetaClients` pro relatório, `selectActiveClientsWithGroup` pro resto).
 */
export async function conferirEntrega(
  kind: EntregaKind,
  dateKey: string,
  elegiveis: { id: string; nome: string }[],
): Promise<ConferenciaEntrega> {
  const vazio: ConferenciaEntrega = { kind, dateKey, entregues: 0, falharam: [], semRegistro: [] };
  if (!elegiveis.length) return vazio;

  const { data, error } = await supabaseAdmin
    .from("client_group_message_log")
    .select("client_id, status, error")
    .eq("date_key", dateKey)
    .eq("kind", kind)
    .in("client_id", elegiveis.map((c) => c.id));
  if (error) return vazio;

  const porCliente = new Map<string, { status: string; error: string | null }[]>();
  for (const r of data ?? []) {
    const arr = porCliente.get(r.client_id as string) ?? [];
    arr.push({ status: r.status as string, error: (r.error as string) ?? null });
    porCliente.set(r.client_id as string, arr);
  }

  const conf: ConferenciaEntrega = { kind, dateKey, entregues: 0, falharam: [], semRegistro: [], incertos: [] };
  for (const c of elegiveis) {
    const linhas = porCliente.get(c.id);
    if (!linhas?.length) { conf.semRegistro.push(c.nome); continue; }
    // "skipped" é entrega legítima (cliente que divide o grupo com outro já recebeu o texto).
    if (linhas.some((l) => l.status === "sent" || l.status === "skipped")) { conf.entregues++; continue; }
    if (linhas.some((l) => l.status === "failed" && ehIncerto(l.error))) { conf.incertos!.push(c.nome); continue; }
    const falha = linhas.find((l) => l.status === "failed");
    conf.falharam.push({ cliente: c.nome, motivo: falha?.error || "erro não registrado" });
  }
  return conf;
}

/** Monta o aviso. Devolve string vazia quando está tudo entregue — aí não se manda nada. */
export function textoConferencia(conf: ConferenciaEntrega): string {
  const incertos = conf.incertos ?? [];
  const problemas = conf.falharam.length + conf.semRegistro.length;
  if (!problemas && !incertos.length) return "";
  const total = conf.entregues + problemas + incertos.length;
  const linhas: string[] = [
    problemas
      ? `⚠️ *${ROTULO[conf.kind]} não chegou em ${problemas} de ${total} clientes* — ${conf.dateKey}`
      : `❓ *${ROTULO[conf.kind]}: não sei se chegou em ${incertos.length} de ${total} clientes* — ${conf.dateKey}`,
    "",
  ];
  if (conf.falharam.length) {
    linhas.push("*Deu erro no envio:*");
    for (const f of conf.falharam.slice(0, 8)) linhas.push(`• *${f.cliente}* — ${f.motivo}`);
    if (conf.falharam.length > 8) linhas.push(`• …e mais ${conf.falharam.length - 8}`);
    linhas.push("");
  }
  if (conf.semRegistro.length) {
    linhas.push("*Nem chegou a ser tentado:*");
    for (const n of conf.semRegistro.slice(0, 8)) linhas.push(`• *${n}*`);
    if (conf.semRegistro.length > 8) linhas.push(`• …e mais ${conf.semRegistro.length - 8}`);
    linhas.push("");
  }
  if (problemas) linhas.push("_Vale reenviar pra esses antes que o cliente perceba a falta._");
  // O incerto vem À PARTE e com a instrução oposta: aqui reenviar sem olhar é o erro.
  if (incertos.length) {
    if (problemas) linhas.push("");
    linhas.push("*Não sei se chegou* (o WhatsApp não confirmou a tempo — pode ter saído):");
    for (const n of incertos.slice(0, 8)) linhas.push(`• *${n}*`);
    if (incertos.length > 8) linhas.push(`• …e mais ${incertos.length - 8}`);
    linhas.push("_Não reenviei para não mandar em dobro. Confira no grupo antes de reenviar._");
  }
  return linhas.join("\n");
}

/** Confere e, se houver buraco, avisa no grupo interno. Devolve a conferência pra resposta do cron. */
export async function conferirEAvisar(
  kind: EntregaKind,
  dateKey: string,
  elegiveis: { id: string; nome: string }[],
): Promise<ConferenciaEntrega | null> {
  try {
    const conf = await conferirEntrega(kind, dateKey, elegiveis);
    const texto = textoConferencia(conf);
    const jid = process.env.CS_INTERNAL_GROUP_JID;
    if (texto && jid) await csSendGroupText(jid, texto);
    return conf;
  } catch {
    return null; // conferência nunca derruba a entrega
  }
}
