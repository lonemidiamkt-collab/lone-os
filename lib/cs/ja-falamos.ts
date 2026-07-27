// lib/cs/ja-falamos.ts — "a gente já falou com esse grupo hoje?"
//
// Em 27/07/2026 o cliente recebeu, no mesmo grupo:
//   08:48  "Olá, bom dia, amigos! Estou enviando o relatório da última semana..."
//   10:02  "Oi, pessoal! 👋 Bom começo de semana! Agosto tá chegando..."
//
// Duas saudações de abertura em 1h14, cada uma se apresentando como a primeira conversa do dia.
// É o retrato do problema: cada rotina fala sozinha, sem saber que outra já falou.
//
// A causa técnica: `cs_outbound` registra o que sai pelo número do AGENTE (csSendGroupText), mas
// relatório, suporte, calendário e broadcast saem pelo número do GESTOR (lib/whatsapp/evolution),
// que não registrava nada. Metade da conversa era invisível pro sistema.
//
// Aqui o registro passa a valer pros dois números, e quem escreve consulta antes de saudar.

import { supabaseAdmin } from "@/lib/supabase/server";

const hojeBRT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export interface RegistroSaida {
  origem: string;
  destino?: "interno" | "cliente" | "setor";
  clientId?: string | null;
}

/** Grava o que saiu. Best-effort absoluto: registro nunca derruba um envio que deu certo. */
export async function registrarSaida(
  jid: string, texto: string, enviado: boolean, erro: string | null, meta: RegistroSaida,
): Promise<void> {
  try {
    await supabaseAdmin.from("cs_outbound").insert({
      origem: meta.origem, group_jid: jid, destino: meta.destino ?? "cliente",
      client_id: meta.clientId ?? null, texto: texto.slice(0, 8000),
      assinatura: assinatura(texto), enviado, erro, dia: hojeBRT(),
    });
  } catch { /* silencioso de propósito */ }
}

/** Assinatura do assunto: ignora emoji, pontuação e número — serve pra "isso eu já falei". */
export function assinatura(texto: string): string {
  return (texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter((w) => w.length > 3).slice(0, 24).join(" ");
}

export interface ContatoDeHoje {
  jaFalamos: boolean;
  quantas: number;
  /** Origens que já falaram hoje: ["client-messages", "broadcast-agosto"]. */
  origens: string[];
}

/** O grupo já ouviu a gente hoje? Consultado ANTES de escrever, pra decidir se cabe saudação. */
export async function contatoDeHoje(jid: string): Promise<ContatoDeHoje> {
  try {
    const { data } = await supabaseAdmin
      .from("cs_outbound").select("origem")
      .eq("group_jid", jid).eq("dia", hojeBRT()).eq("enviado", true);
    const origens = [...new Set((data ?? []).map((r) => r.origem as string))];
    return { jaFalamos: (data ?? []).length > 0, quantas: (data ?? []).length, origens };
  } catch {
    // Em dúvida, assume que JÁ falou: repetir "bom dia" incomoda mais do que faltar um.
    return { jaFalamos: true, quantas: 0, origens: [] };
  }
}

/** Em lote, pra quem varre 43 grupos e não pode fazer 43 consultas. */
export async function contatosDeHoje(jids: string[]): Promise<Set<string>> {
  if (!jids.length) return new Set();
  try {
    const { data } = await supabaseAdmin
      .from("cs_outbound").select("group_jid")
      .in("group_jid", jids).eq("dia", hojeBRT()).eq("enviado", true);
    return new Set((data ?? []).map((r) => r.group_jid as string));
  } catch {
    return new Set(jids); // em dúvida, ninguém saúda de novo
  }
}

/**
 * Abertura da mensagem, ciente do que já foi dito hoje.
 *
 * Primeira fala do dia  → "Oi, pessoal! Bom começo de semana!"
 * Já falamos hoje       → emenda, sem saudar de novo: "Ah, e aproveitando..."
 */
export function abertura(jaFalamos: boolean, primeira: string, emenda: string): string {
  return jaFalamos ? emenda : primeira;
}
