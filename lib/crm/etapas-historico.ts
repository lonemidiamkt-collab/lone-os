// lib/crm/etapas-historico.ts — grava e lê o histórico de etapa do lead (crm_lead_etapas, migração 20261023100000).
// É a base da taxa de fechamento e do ciclo de venda (lib/crm/taxas.ts). Gravar NUNCA derruba a mudança de etapa:
// se falhar, registra no log e segue (a etapa do lead já foi salva).

import { supabaseAdmin } from "@/lib/supabase/server";
import type { EtapaHist } from "@/lib/crm/taxas";

export type OrigemEtapa = "tela" | "criacao" | "reuniao" | "lote";

export async function registrarEtapa(p: { leadId: string; de: string | null; para: string; autor?: string | null; origem?: OrigemEtapa }): Promise<void> {
  if (p.de === p.para) return;
  const { error } = await supabaseAdmin.from("crm_lead_etapas").insert({
    lead_id: p.leadId, de: p.de, para: p.para, autor: p.autor ?? null, origem: p.origem ?? "tela",
  });
  if (error) console.error("[crm] histórico de etapa não gravado:", error.message);
}

/** Histórico de todos os leads (o comercial tem dezenas, não milhares). Falha NÃO vira lista vazia: a tela diz que
 *  a taxa está indisponível em vez de mostrar "0 oportunidades" (falha silenciosa é a causa mais comum de número errado). */
export async function lerHistoricoDeEtapas(): Promise<{ ok: true; itens: EtapaHist[] } | { ok: false; erro: string }> {
  const { data, error } = await supabaseAdmin.from("crm_lead_etapas").select("lead_id, para, em").order("em");
  if (error) {
    console.error("[crm] histórico de etapa não lido:", error.message);
    return { ok: false, erro: "O histórico de etapas não carregou; a taxa de fechamento fica indisponível até recarregar." };
  }
  return { ok: true, itens: (data ?? []).map((r) => ({ leadId: r.lead_id as string, para: r.para as string, em: r.em as string })) };
}
