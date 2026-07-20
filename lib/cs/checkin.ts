// lib/cs/checkin.ts — check-in do cliente: coleta info de NEGÓCIO (qualidade de leads, atendimento,
// objeções, prioridades, problemas) — SEM financeiro. 3 modos: agente pergunta ao CLIENTE (grupo
// dele), agente pergunta ao TIME (grupo interno), ou o time registra na ficha. Guarda em client_checkins.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface PerguntaCheckin {
  key: string;
  cliente: string; // frase pro CLIENTE (grupo dele)
  time: string;    // frase pro TIME (grupo interno)
  porque: string;  // por que essa info importa (anexada, evita cobrança seca)
}

// Rotação de perguntas. Uma por vez, progressiva. Nada de dinheiro/valor.
export const PERGUNTAS_CHECKIN: PerguntaCheckin[] = [
  { key: "qualidade_leads",
    cliente: "dos contatos que chegaram essa semana, quantos tinham perfil real de compra?",
    time: "como tá a qualidade dos leads? tão chegando com perfil de compra ou muito curioso?",
    porque: "isso mostra se estamos atraindo o público certo — não só volume de mensagem." },
  { key: "atendimentos",
    cliente: "vocês conseguiram atender/responder todos os contatos que chegaram?",
    time: "o cliente tá conseguindo atender os leads rápido, ou tá acumulando?",
    porque: "gargalo no atendimento derruba o resultado independente da campanha." },
  { key: "objecoes",
    cliente: "qual foi a dúvida ou objeção que mais apareceu no atendimento?",
    time: "que objeção o cliente mais ouviu dos leads essa semana?",
    porque: "com a objeção mais comum a gente ajusta a oferta e a comunicação." },
  { key: "produtos_prioritarios",
    cliente: "tem algum produto ou serviço que é prioridade pra divulgar agora?",
    time: "tem produto/serviço prioritário do cliente pra semana?",
    porque: "direciona a comunicação pro que é prioridade comercial, não pro genérico." },
  { key: "mudancas",
    cliente: "mudou algo aí que a gente precisa saber? (estoque, preço, promoção, horário)",
    time: "mudou algo no cliente (estoque/preço/promoção/horário) que a gente precisa considerar?",
    porque: "evita anunciar oferta desatualizada e mantém a comunicação alinhada." },
];

export function perguntaPorKey(key: string): PerguntaCheckin | undefined {
  return PERGUNTAS_CHECKIN.find((p) => p.key === key);
}

// Próxima pergunta: a que foi perguntada há mais tempo (round-robin), pra não repetir.
export async function proximaPergunta(clientId: string): Promise<PerguntaCheckin> {
  const { data } = await supabaseAdmin.from("client_checkins")
    .select("pergunta_key, enviado_em").eq("client_id", clientId).order("enviado_em", { ascending: false }).limit(20);
  const ultimoDe = new Map<string, number>();
  (data ?? []).forEach((r, i) => { const k = r.pergunta_key as string; if (!ultimoDe.has(k)) ultimoDe.set(k, i); });
  // pega a pergunta nunca feita (não está no mapa) ou a mais antiga (maior índice)
  let escolha = PERGUNTAS_CHECKIN[0]; let pior = -1;
  for (const p of PERGUNTAS_CHECKIN) {
    const idx = ultimoDe.has(p.key) ? (ultimoDe.get(p.key) as number) : Number.MAX_SAFE_INTEGER;
    if (idx > pior) { pior = idx; escolha = p; }
  }
  return escolha;
}

export function textoParaEnvio(p: PerguntaCheckin, origem: "cliente" | "time", nome: string): string {
  if (origem === "cliente") {
    return `Oi! Pra afinar a campanha da semana, me ajuda com 1 coisa rápida: ${p.cliente}\n\n_(${p.porque})_`;
  }
  return `📋 *Check-in ${nome}* — ${p.time}\n_(${p.porque})_\nResponde aqui que eu registro na ficha do cliente.`;
}

export async function registrarEnvio(clientId: string, origem: "cliente" | "time", p: PerguntaCheckin, groupJid: string | null): Promise<string | null> {
  const { data } = await supabaseAdmin.from("client_checkins")
    .insert({ client_id: clientId, origem, pergunta_key: p.key, pergunta: origem === "cliente" ? p.cliente : p.time, group_jid: groupJid, status: "aguardando" })
    .select("id").maybeSingle();
  return (data?.id as string) ?? null;
}

// Captura a resposta pro check-in aguardando mais recente do cliente (por origem).
export async function capturarResposta(clientId: string, origem: "cliente" | "time", resposta: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("client_checkins")
    .select("id, enviado_em").eq("client_id", clientId).eq("origem", origem).eq("status", "aguardando")
    .order("enviado_em", { ascending: false }).limit(1).maybeSingle();
  if (!data?.id) return false;
  // só captura se o check-in é recente (48h) — evita casar com pergunta velha
  if (data.enviado_em && Date.now() - new Date(data.enviado_em as string).getTime() > 48 * 3600 * 1000) return false;
  const { error } = await supabaseAdmin.from("client_checkins")
    .update({ resposta: resposta.slice(0, 1000), status: "respondido", respondido_em: new Date().toISOString() }).eq("id", data.id);
  return !error;
}

export async function temCheckinAguardando(clientId: string, origem: "cliente" | "time"): Promise<boolean> {
  const { data } = await supabaseAdmin.from("client_checkins")
    .select("id").eq("client_id", clientId).eq("origem", origem).eq("status", "aguardando")
    .gte("enviado_em", new Date(Date.now() - 48 * 3600 * 1000).toISOString()).limit(1);
  return !!(data && data.length);
}

// Registro MANUAL (o time anota o que o cliente falou): captura o aguardando mais recente (time ou
// cliente); se não houver, cria uma entrada avulsa já respondida.
export async function registrarRespostaManual(clientId: string, resposta: string): Promise<boolean> {
  if (await capturarResposta(clientId, "time", resposta)) return true;
  if (await capturarResposta(clientId, "cliente", resposta)) return true;
  const { error } = await supabaseAdmin.from("client_checkins").insert({
    client_id: clientId, origem: "time", pergunta_key: "manual", pergunta: "(registro do time)",
    status: "respondido", resposta: resposta.slice(0, 1000), respondido_em: new Date().toISOString(),
  });
  return !error;
}

export interface CheckinResumo { pergunta_key: string; pergunta: string; origem: string; status: string; resposta: string | null; enviado_em: string }
export async function checkinsRecentes(clientId: string, n = 5): Promise<CheckinResumo[]> {
  const { data } = await supabaseAdmin.from("client_checkins")
    .select("pergunta_key, pergunta, origem, status, resposta, enviado_em")
    .eq("client_id", clientId).order("enviado_em", { ascending: false }).limit(n);
  return (data ?? []) as CheckinResumo[];
}
