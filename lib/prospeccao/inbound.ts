// lib/prospeccao/inbound.ts — DM que chega no número do agente.
//
// O webhook da Evolution entrega TUDO da instância no /api/cs/inbound; até hoje o `parseUpsert`
// jogava fora o que não era grupo. Este módulo recebe esse resto: se o remetente é um prospect,
// a conversa segue; se não é, some com um log (não criamos prospect a partir de DM desconhecida —
// pode ser cliente, fornecedor, engano).
//
// `fromMe` = alguém mandou pelo próprio número (o Roberto no celular do Loninho). Se não foi o
// agente (id não está em prospect_messages), é HUMANO assumindo: grava e pausa o agente 24h.

import { supabaseAdmin } from "@/lib/supabase/server";
import { extractText, type EvolutionUpsert } from "@/lib/cs/ingest";
import { buscarProspectPorJid, gravarMensagem, atualizarProspect } from "./db";
import { registrarEvento } from "./maquina";
import { decidirEResponder } from "./conversa";
import { anotar } from "@/lib/obs/correlacao";

type Key = NonNullable<NonNullable<EvolutionUpsert["data"]>["key"]> & { remoteJidAlt?: string; senderPn?: string };

export function ehDm(payload: EvolutionUpsert): boolean {
  const jid = payload.data?.key?.remoteJid ?? "";
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

/** Todos os identificadores possíveis do remetente (JID de telefone, LID, número real). */
export function jidsDoRemetente(payload: EvolutionUpsert): string[] {
  const k = (payload.data?.key ?? {}) as Key;
  const extra = (payload.data ?? {}) as { senderPn?: string; remoteJidAlt?: string };
  const lista = [k.remoteJid, k.remoteJidAlt, k.senderPn, k.participantPn, k.participantAlt, extra.senderPn, extra.remoteJidAlt]
    .filter((x): x is string => !!x)
    .map((x) => (x.includes("@") ? x : `${x.replace(/\D/g, "")}@s.whatsapp.net`));
  return Array.from(new Set(lista));
}

export interface ResultadoDm { ok: true; skip?: string; prospect?: string; respondeu?: boolean; estagio?: string; humano?: boolean }

export async function tratarDmProspeccao(payload: EvolutionUpsert): Promise<ResultadoDm> {
  const d = payload.data;
  const messageId = d?.key?.id ?? "";
  const remoteJid = d?.key?.remoteJid ?? "";
  if (!messageId || !remoteJid) return { ok: true, skip: "dm sem id" };
  const jids = jidsDoRemetente(payload);
  const fromMe = !!d?.key?.fromMe;

  // O próprio agente gera webhook das mensagens que manda. Se o id já está em prospect_messages, é ele.
  if (fromMe) {
    const { data: minha } = await supabaseAdmin.from("prospect_messages").select("id").eq("message_id", messageId).maybeSingle();
    if (minha) return { ok: true, skip: "eco do próprio agente" };
  }

  const prospect = await buscarProspectPorJid(jids);
  if (!prospect) {
    console.log(`[prospeccao/inbound] dm de ${remoteJid} não é prospect — ignorada`);
    return { ok: true, skip: "remetente não é prospect" };
  }
  anotar(`prospect:${prospect.id}`);

  // Claim por message_id (a Evolution reenvia enquanto a IA responde).
  const { error: claimErr } = await supabaseAdmin.from("cs_processed_messages").insert({ message_id: messageId, group_jid: remoteJid });
  if (claimErr?.code === "23505") return { ok: true, skip: "message_id já processado", prospect: prospect.id };

  // Guarda o LID quando aparece — a próxima DM pode vir só com ele.
  const lid = jids.find((j) => j.endsWith("@lid"));
  const jidTel = jids.find((j) => j.endsWith("@s.whatsapp.net"));
  const patch: Record<string, unknown> = {};
  if (lid && prospect.whatsapp_lid !== lid) patch.whatsapp_lid = lid;
  if (jidTel && !prospect.whatsapp_jid) patch.whatsapp_jid = jidTel;
  if (Object.keys(patch).length) await atualizarProspect(prospect.id, patch);

  let texto = extractText(d?.message);
  const isAudio = !!d?.message?.audioMessage;
  const isImage = !!d?.message?.imageMessage;
  if (!texto && isAudio && !fromMe) {
    try {
      const { csFetchMediaBase64 } = await import("@/lib/cs/notify");
      const { transcribeAudio } = await import("@/lib/cs/transcribe");
      const media = await csFetchMediaBase64(d ?? {});
      if (media.base64 && media.base64.length <= 8_000_000) texto = await transcribeAudio(media.base64, media.mimetype, `Áudio de um empresário respondendo a uma abordagem comercial da Lone Mídia.`);
    } catch (err) { console.error("[prospeccao/inbound] transcrição falhou:", err instanceof Error ? err.message : err); }
  }
  if (!texto && isImage) texto = "[imagem recebida]";
  if (!texto) return { ok: true, skip: "sem texto", prospect: prospect.id };
  if (texto.length > 3000) texto = texto.slice(0, 3000);

  if (fromMe) {
    // Humano falou pelo número: registra e pausa o agente por 24h neste prospect.
    const ate = new Date(Date.now() + 24 * 3600_000).toISOString();
    await gravarMensagem({ prospect_id: prospect.id, direcao: "out", autor: "humano", texto, message_id: messageId, estagio_antes: prospect.estagio });
    await atualizarProspect(prospect.id, { modo_agente: "pausado", pausado_ate: ate, precisa_humano: false, motivo_humano: null });
    await registrarEvento(prospect.id, { tipo: "humano_assumiu", mensagem: texto, responsavel: "humano (celular)", motivo: "mensagem enviada pelo próprio número; agente pausado 24h" });
    return { ok: true, prospect: prospect.id, humano: true };
  }

  if (texto === "[imagem recebida]") {
    await gravarMensagem({ prospect_id: prospect.id, direcao: "in", autor: "prospect", texto, message_id: messageId, estagio_antes: prospect.estagio });
    return { ok: true, prospect: prospect.id, skip: "imagem sem texto" };
  }

  const r = await decidirEResponder(prospect, texto, { messageId });
  console.log(`[prospeccao/inbound] ${prospect.nome}: ${r.intent?.intent ?? "?"} ${r.estagio_antes}→${r.estagio_depois} respondeu=${r.respondeu}${r.precisa_humano ? " HUMANO" : ""}`);
  return { ok: true, prospect: prospect.id, respondeu: r.respondeu, estagio: r.estagio_depois };
}
