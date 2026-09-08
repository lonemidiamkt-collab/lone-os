// QUEM O AGENTE PODE ABORDAR POR CONTA PRÓPRIA.
//
// Roberto (08/09), lendo a documentação: "Dia 15 é a primeira vez que o agente vai puxar conversa
// por conta própria, em cerca de 40 grupos. Eu não faria isso. Faria lançamento progressivo:
// simulação → 5 clientes → 10 → 20 → todos. Você encontra um bug com 5 clientes em vez de
// descobrir o mesmo bug simultaneamente em 40 grupos."
//
// Ele está certo, e o mesmo dia provou: o agente abriu uma conversa de agendamento no grupo do
// Império dos Pisos a partir de uma mensagem sobre CRM. Um bug desses em 40 grupos ao mesmo tempo
// não se desfaz — cada grupo é um cliente que leu.
//
// ESTE PORTÃO VALE SÓ PARA A INICIATIVA DO AGENTE (oferta e reoferta no grupo do cliente).
// Responder a quem perguntou, cobrar o time no grupo interno e mandar lembrete de reunião já
// combinada continuam funcionando para todo mundo: não são o agente puxando conversa.

import { supabaseAdmin } from "@/lib/supabase/server";

export type ModoAbordagem =
  /** O agente não inicia conversa com cliente nenhum. É o padrão, e é onde se começa. */
  | "off"
  /** Só a lista. É o lançamento progressivo. */
  | "piloto"
  /** Todos os elegíveis. Só depois do piloto ter rodado limpo. */
  | "todos";

export interface Abordagem {
  modo: ModoAbordagem;
  /** IDs de cliente. Só significa alguma coisa no modo `piloto`. */
  clientes: string[];
}

/** A chave em `agency_settings`. */
export const CHAVE = "reuniao_abordagem";

/**
 * O padrão é `off`, de propósito.
 *
 * Se a chave sumir, ou vier escrita errada, ou o banco responder estranho, o agente CALA. A
 * alternativa — cair em "todos" no silêncio — é exatamente o acidente que este portão existe para
 * impedir, e ele aconteceria justamente no dia em que ninguém está olhando.
 */
export const PADRAO: Abordagem = { modo: "off", clientes: [] };

export async function lerAbordagem(): Promise<Abordagem> {
  const { data } = await supabaseAdmin
    .from("agency_settings").select("value").eq("key", CHAVE).maybeSingle();
  return interpretar((data?.value as string) ?? null);
}

/** Separado da consulta para poder ser testado sem banco. */
export function interpretar(bruto: string | null): Abordagem {
  if (!bruto) return PADRAO;
  try {
    const v = JSON.parse(bruto) as Partial<Abordagem>;
    const modo = v.modo === "todos" || v.modo === "piloto" || v.modo === "off" ? v.modo : "off";
    const clientes = Array.isArray(v.clientes) ? v.clientes.filter((x) => typeof x === "string") : [];
    // Piloto sem ninguém na lista é o mesmo que desligado — e dizer isso explicitamente evita
    // alguém achar que ligou o piloto e ficar esperando mensagem que não vai sair.
    return { modo, clientes };
  } catch {
    return PADRAO;
  }
}

export function podeAbordar(a: Abordagem, clientId: string): boolean {
  if (a.modo === "todos") return true;
  if (a.modo === "piloto") return a.clientes.includes(clientId);
  return false;
}

/** Uma linha para o log e para a resposta da rota: o que está valendo agora. */
export function descrever(a: Abordagem): string {
  if (a.modo === "todos") return "abordagem LIBERADA para todos os clientes elegíveis";
  if (a.modo === "piloto") {
    return a.clientes.length
      ? `abordagem em PILOTO — ${a.clientes.length} cliente(s) na lista`
      : "abordagem em PILOTO mas a lista está VAZIA — ninguém será abordado";
  }
  return "abordagem DESLIGADA — o agente não inicia conversa com cliente";
}
