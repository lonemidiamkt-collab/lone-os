// lib/contracts/oferta.ts — de qual cliente é o contrato que estão pedindo?
//
// POR QUE ISTO EXISTE (06/08). O agente ofereceu no grupo: "Veneza concluiu o cadastro — quer que
// eu gere o contrato?". O Roberto respondeu "dia de vencimento dia 10, sao 3 meses de contrato no
// valor de 1797" e o agente FICOU MUDO. Duas coisas quebraram:
//
//   1. eu exigia verbo de comando ("gera o contrato") — mas ele estava RESPONDENDO uma pergunta;
//   2. a frase não tem nome de cliente nenhum, porque o cliente é óbvio no contexto da conversa.
//
// Quem pergunta assume que a resposta é entendida. Então a oferta fica registrada e a resposta
// seguinte herda o cliente dela.
//
// NA DÚVIDA, PERGUNTA — nunca chuta o cliente. Contrato do cliente errado é pior que uma pergunta.

import { supabaseAdmin } from "@/lib/supabase/server";

export const ORIGEM_OFERTA = "contrato-oferta";

/** Depois disso a oferta esfria: responder hoje a uma oferta de semana passada é outra conversa. */
const VALIDADE_HORAS = 48;

/**
 * Registra que o agente ofereceu gerar o contrato de um cliente naquele grupo.
 *
 * `dia` é NOT NULL na tabela — omitir derruba o insert, e como o supabase-js devolve `{error}` em
 * vez de lançar, a oferta simplesmente não existiria e o silêncio voltaria pelo mesmo caminho.
 */
export async function registrarOferta(groupJid: string, clientId: string, cliente: string) {
  const { ymd, spNow } = await import("@/lib/cs/vigilancia");
  const { error } = await supabaseAdmin.from("cs_outbound").insert({
    origem: ORIGEM_OFERTA,
    group_jid: groupJid,
    destino: "interno",
    client_id: clientId,
    dia: ymd(spNow()),
    texto: `(oferta de contrato registrada — ${cliente})`,
    enviado: true,
  });
  if (error) console.error("[contrato/oferta] não registrou:", error.message);
}

export interface OfertaPendente {
  clientId: string;
  cliente: string;
}

/** A oferta mais recente ainda válida naquele grupo. `null` quando não há. */
export async function ofertaPendente(groupJid: string): Promise<OfertaPendente | null> {
  const desde = new Date(Date.now() - VALIDADE_HORAS * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("cs_outbound")
    .select("client_id, created_at")
    .eq("origem", ORIGEM_OFERTA)
    .eq("group_jid", groupJid)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);

  const linha = data?.[0];
  if (!linha?.client_id) return null;

  const { data: cli } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia").eq("id", linha.client_id).maybeSingle();
  if (!cli) return null;

  return {
    clientId: cli.id as string,
    cliente: (cli.nome_fantasia as string) || (cli.name as string) || "cliente",
  };
}

// ── O que já foi dito sobre ESTE contrato ────────────────────────────────────
//
// SEGUNDA VOLTA DO MESMO PROBLEMA (24/08). O agente perguntou "ainda falta: dia de vencimento",
// o Roberto respondeu "vencimento dia 24" — e o agente perguntou de novo. Depois "montou?" e
// silêncio. Motivo: cada mensagem era lida sozinha. "vencimento dia 24" tem o dia mas não tem o
// valor (que veio na mensagem anterior), então virava um pedido novo e incompleto, para sempre.
//
// Quem responde uma pergunta não repete o que já disse. Então o que o agente entendeu fica
// guardado, e a próxima mensagem COMPLETA em vez de recomeçar.

export const ORIGEM_PARCIAL = "contrato-parcial";

/** Resposta a uma pergunta vem em minutos, não em dias — janela curta evita casar "dia 24" de
 *  uma conversa completamente diferente com um contrato esquecido de ontem. */
const VALIDADE_PARCIAL_MIN = 120;

export interface ParcialContrato {
  clientId: string;
  cliente: string;
  valorMensal?: number;
  duracaoMeses?: number;
  diaPagamento?: number;
}

/** Guarda o que já se sabe do contrato depois de pedir o que falta. */
export async function registrarParcial(
  groupJid: string,
  clientId: string,
  cliente: string,
  dados: { valorMensal?: number; duracaoMeses?: number; diaPagamento?: number },
) {
  const { ymd, spNow } = await import("@/lib/cs/vigilancia");
  const { error } = await supabaseAdmin.from("cs_outbound").insert({
    origem: ORIGEM_PARCIAL,
    group_jid: groupJid,
    destino: "interno",
    client_id: clientId,
    dia: ymd(spNow()),
    texto: JSON.stringify({ cliente, ...dados }),
    enviado: true,
  });
  if (error) console.error("[contrato/parcial] não registrou:", error.message);
}

/** O que ficou pendente naquele grupo. `null` quando não há nada recente. */
export async function parcialPendente(groupJid: string): Promise<ParcialContrato | null> {
  const desde = new Date(Date.now() - VALIDADE_PARCIAL_MIN * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("cs_outbound")
    .select("client_id, texto, created_at")
    .eq("origem", ORIGEM_PARCIAL)
    .eq("group_jid", groupJid)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);

  const linha = data?.[0];
  if (!linha?.client_id) return null;
  try {
    const d = JSON.parse(String(linha.texto || "{}"));
    return {
      clientId: linha.client_id as string,
      cliente: d.cliente || "cliente",
      valorMensal: d.valorMensal, duracaoMeses: d.duracaoMeses, diaPagamento: d.diaPagamento,
    };
  } catch { return null; }
}

/** Fecha o assunto — o contrato saiu, o que estava pendente não vale mais. */
export async function limparParcial(groupJid: string) {
  await supabaseAdmin.from("cs_outbound")
    .delete().eq("origem", ORIGEM_PARCIAL).eq("group_jid", groupJid);
}

/** O que veio agora vence o que estava guardado — a pessoa pode estar corrigindo. */
export function mesclarParcial(
  parcial: ParcialContrato | null,
  agora: { valorMensal?: number; duracaoMeses?: number; diaPagamento?: number },
): { valorMensal?: number; duracaoMeses?: number; diaPagamento?: number } {
  return {
    valorMensal: agora.valorMensal ?? parcial?.valorMensal,
    duracaoMeses: agora.duracaoMeses ?? parcial?.duracaoMeses,
    diaPagamento: agora.diaPagamento ?? parcial?.diaPagamento,
  };
}
