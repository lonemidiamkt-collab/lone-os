// lib/cs/regras-propostas.ts — REGRA PERMANENTE DE CLIENTE PEDE OK. Fase 0A do Lone Agent V2.
//
// Antes (até 13/09/2026): três pontos do inbound gravavam em cs_client_rules com ativo = true a
// partir de UMA mensagem — o modelo devolvia `ensino` ou `aprendizado`, e virava regra. Medido:
// 354 das 356 regras ativas nasceram assim. Auditoria anterior: 378 regras, 10 acionáveis. É a
// memória do agente sendo escrita por observação pontual, sem ninguém olhar.
//
// Agora a regra nasce PROPOSTA (ativo = false) e o grupo vê:
//   📌 Parece uma regra nova para *Quero Tintas*: _usar preço na primeira arte_
//      Salvar como regra permanente? *ok a1b2* / *não a1b2*
// Todos os leitores de regra já filtram ativo = true, então a proposta é invisível até o ok.
//
// Fato TEMPORÁRIO ("fechado até dia 20", "promoção até sexta") continua automático, com a
// expiração de 14 dias que já existia — não é regra permanente, e pedir ok para cada aviso
// passageiro seria o ruído que o Roberto já cortou duas vezes.

import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";

// Fato com prazo embutido ("semana que vem", "até dia 15") não pode virar regra ETERNA da memória
// do cliente — ganha TTL de 14 dias. "a partir de hoje/amanhã" é mudança permanente, não casa.
export function ehFatoTemporario(texto: string): boolean {
  if (/a partir de/i.test(texto)) return false;
  return /semana que vem|essa semana|esta semana|este m[êe]s|esse m[êe]s|pr[óo]xim[ao]s? (semana|m[êe]s)|at[ée] (o )?dia \d|s[óo] (essa|esta) semana|f[ée]rias|recesso|balan[çc]o/i.test(texto);
}

export interface PedidoDeRegra {
  clientId: string;
  clienteNome: string;
  texto: string;
  escopo: "sempre" | "roteiro" | "social" | "promocao";
  sourceMessage: string;
  author: string | null;
  /** Grupo onde perguntar. Sem grupo (ex.: rotina), a proposta fica só no banco. */
  groupJid?: string | null;
}

export type ResultadoProposta =
  | { tipo: "ja_existe" }
  | { tipo: "temporaria_ativa"; id: string }
  | { tipo: "proposta"; id: string; codigo: string };

/**
 * Propõe uma regra. Temporária → ativa com expiração (como antes). Permanente → proposta + pergunta.
 * Idempotente por (cliente, texto): regra igual já ativa ou já proposta não gera outra.
 */
export async function proporRegra(p: PedidoDeRegra): Promise<ResultadoProposta> {
  const texto = p.texto.trim().slice(0, 200);
  if (!texto) return { tipo: "ja_existe" };

  const { data: ex } = await supabaseAdmin.from("cs_client_rules")
    .select("id").eq("client_id", p.clientId).eq("texto", texto).in("estado", ["ativa", "proposta"]).limit(1);
  if (ex && ex.length) return { tipo: "ja_existe" };

  const temporaria = ehFatoTemporario(texto);
  if (temporaria) {
    const { data } = await supabaseAdmin.from("cs_client_rules").insert({
      client_id: p.clientId, texto, escopo: p.escopo, origem: "aprendido", ativo: true, estado: "ativa",
      source_message: p.sourceMessage, author: p.author,
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    }).select("id").single();
    return { tipo: "temporaria_ativa", id: (data?.id as string) ?? "" };
  }

  const codigo = randomBytes(2).toString("hex");
  const { data, error } = await supabaseAdmin.from("cs_client_rules").insert({
    client_id: p.clientId, texto, escopo: p.escopo, origem: "aprendido", ativo: false, estado: "proposta",
    codigo, source_message: p.sourceMessage, author: p.author,
  }).select("id").single();
  if (error || !data) return { tipo: "ja_existe" };

  if (p.groupJid) {
    const pergunta =
      `📌 Parece uma regra nova para *${p.clienteNome}*:\n_${texto}_\n\n` +
      `Salvar como regra permanente? Responde *ok ${codigo}* ou *não ${codigo}* — ou responde nesta mensagem.`;
    const r = await csSendGroupText(p.groupJid, pergunta, undefined, { origem: "regra-proposta", destino: "interno" })
      .catch(() => ({ ok: false as const, id: undefined as string | undefined }));
    const msgId = (r as { id?: string }).id;
    if (msgId) await supabaseAdmin.from("cs_client_rules").update({ msg_id_proposta: msgId }).eq("id", data.id as string);
  }
  return { tipo: "proposta", id: data.id as string, codigo };
}

export interface DecisaoDeRegra {
  acao: "confirmar" | "descartar";
  codigo?: string | null;
  quotedMsgId?: string | null;
  quem: string | null;
}

export type ResultadoDecisao =
  | { tipo: "nao_achei" }
  | { tipo: "ja_decidida"; estado: string; texto: string; cliente: string }
  | { tipo: "ativada" | "descartada"; texto: string; cliente: string; clientId: string };

/** Resolve "ok xxxx" / "não xxxx" (ou resposta à mensagem da proposta) para uma regra proposta. */
export async function decidirRegra(d: DecisaoDeRegra): Promise<ResultadoDecisao> {
  let q = supabaseAdmin.from("cs_client_rules")
    .select("id, texto, estado, client_id, clients(nome_fantasia, name)")
    .order("created_at", { ascending: false }).limit(1);
  if (d.quotedMsgId) q = q.eq("msg_id_proposta", d.quotedMsgId);
  else if (d.codigo) q = q.eq("codigo", d.codigo);
  else return { tipo: "nao_achei" };

  const { data } = await q.maybeSingle();
  if (!data) return { tipo: "nao_achei" };
  const cli = data.clients as { nome_fantasia?: string; name?: string } | null;
  const cliente = cli?.nome_fantasia || cli?.name || "cliente";
  if (data.estado !== "proposta") return { tipo: "ja_decidida", estado: data.estado as string, texto: data.texto as string, cliente };

  const ativar = d.acao === "confirmar";
  await supabaseAdmin.from("cs_client_rules").update({
    estado: ativar ? "ativa" : "descartada", ativo: ativar,
    confirmada_por: d.quem, confirmada_em: new Date().toISOString(),
    ...(ativar ? {} : { motivo_desativacao: "descartada na proposta", desativada_em: new Date().toISOString() }),
  }).eq("id", data.id as string);
  return { tipo: ativar ? "ativada" : "descartada", texto: data.texto as string, cliente, clientId: data.client_id as string };
}
