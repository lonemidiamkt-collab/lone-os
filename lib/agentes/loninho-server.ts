// lib/agentes/loninho-server.ts — O INTERRUPTOR GERAL DO LONINHO. Só servidor.
//
// Até 25/10/2026 havia interruptor em cinco lugares (variáveis do servidor, configurações, Central de
// Automações, pausa por cliente e até uma constante no código) e nenhum desligava o Loninho inteiro.
// Quando a OpenAI ficou sem crédito, ou quando ele errou num grupo, o único jeito era mexer no servidor.
//
// Agora é uma linha em automation_settings (job "agente:loninho", a mesma tabela e o mesmo formato da
// Central de Automações: ligado, pausado até, quem mexeu e quando), com o botão na Central de Agentes.
// Desligado, o webhook (/api/cs/inbound) não lê nada dos grupos: nem cliente, nem time, nem vendas.
// As rotinas agendadas têm o interruptor próprio delas, na Central de Automações.

import { supabaseAdmin } from "@/lib/supabase/server";
import { JOB_LONINHO } from "./catalogo";

export interface InterruptorLoninho {
  ligado: boolean;
  pausadoAte: string | null;
  alteradoPor: string | null;
  alteradoEm: string | null;
}

/** Sem linha = ligado (é o estado de sempre, de antes do interruptor existir). */
export function interpretarLinha(
  linha: { enabled: boolean; paused_until: string | null; updated_by: string | null; updated_at: string | null } | null,
  agora: Date,
): InterruptorLoninho {
  if (!linha) return { ligado: true, pausadoAte: null, alteradoPor: null, alteradoEm: null };
  const pausado = !!linha.paused_until && new Date(linha.paused_until).getTime() > agora.getTime();
  return {
    ligado: linha.enabled !== false && !pausado,
    pausadoAte: linha.enabled !== false && pausado ? linha.paused_until : null,
    alteradoPor: linha.updated_by,
    alteradoEm: linha.updated_at,
  };
}

/** Lê o interruptor. Lança se o banco falhar — quem chama decide o que fazer sem saber. */
export async function lerInterruptorLoninho(agora = new Date()): Promise<InterruptorLoninho> {
  const { data, error } = await supabaseAdmin
    .from("automation_settings")
    .select("enabled, paused_until, updated_by, updated_at")
    .eq("job", JOB_LONINHO).maybeSingle();
  if (error) throw new Error(error.message);
  return interpretarLinha(data as Parameters<typeof interpretarLinha>[0], agora);
}

export const MOTIVO_DESLIGADO = "Loninho desligado na Central de Agentes";

/**
 * O webhook pode seguir? Se o banco falhar, SEGUE (e registra no log): um soluço do banco não pode
 * calar o Loninho em todos os grupos sem ninguém ter pedido. Desligar é decisão de pessoa.
 */
export async function loninhoPodeLer(agora = new Date()): Promise<{ ler: true } | { ler: false; motivo: string }> {
  try {
    const i = await lerInterruptorLoninho(agora);
    if (i.ligado) return { ler: true };
    const ate = i.pausadoAte
      ? ` até ${new Date(i.pausadoAte).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
      : "";
    return { ler: false, motivo: `${MOTIVO_DESLIGADO}${ate}` };
  } catch (e) {
    console.error("[loninho] não consegui ler o interruptor — sigo ligado:", e instanceof Error ? e.message : e);
    return { ler: true };
  }
}
