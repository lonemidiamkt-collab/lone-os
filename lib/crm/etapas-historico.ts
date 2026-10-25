// lib/crm/etapas-historico.ts — grava e lê o histórico de etapa do lead (crm_lead_etapas, migração 20261023100000).
// É a base da taxa de fechamento e do ciclo de venda (lib/crm/taxas.ts). Gravar NUNCA derruba a mudança de etapa:
// se falhar, registra no log e segue (a etapa do lead já foi salva).
//
// TODO CAMINHO QUE MUDA A ETAPA GRAVA AQUI (25/10/2026, onda 5). Antes só a tela (PATCH), a criação pela tela e a
// reunião marcada gravavam. Ficavam de fora: o primeiro contato que tira o lead de Novo (tela e Loninho), o Desfazer
// desse registro, a proposta gerada pelo painel (→ Proposta: é a entrada na oportunidade), a importação/Rota Lagos,
// o lead que chega pelo site ou pelo Loninho e o lead da prospecção com reunião. Mapa completo e teste em
// tests/crm-etapas-historico.test.ts.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { EtapaHist } from "@/lib/crm/taxas";

/**
 * De onde veio a mudança. As quatro últimas nasceram em 25/10/2026 e precisam da migration 20261025110000 (amplia o
 * CHECK da coluna). Sem ela aplicada, a gravação cai na origem antiga equivalente (ORIGEM_ANTES_DA_MIGRATION) em vez
 * de perder a linha.
 */
export type OrigemEtapa = "tela" | "criacao" | "reuniao" | "lote" | "contato" | "proposta" | "importacao" | "desfazer";

export const ORIGEM_ANTES_DA_MIGRATION: Partial<Record<OrigemEtapa, OrigemEtapa>> = {
  contato: "tela", proposta: "tela", importacao: "lote", desfazer: "tela",
};

/** Grava uma mudança de etapa. Devolve se a linha entrou (true também quando não houve mudança a gravar). */
export async function registrarEtapa(p: { leadId: string; de: string | null; para: string; autor?: string | null; origem?: OrigemEtapa }): Promise<boolean> {
  if (!p.para || p.de === p.para) return true;
  const origem = p.origem ?? "tela";
  const inserir = (o: OrigemEtapa) => supabaseAdmin.from("crm_lead_etapas").insert({
    lead_id: p.leadId, de: p.de, para: p.para, autor: p.autor ?? null, origem: o,
  });
  try {
    let { error } = await inserir(origem);
    // 23514 = check_violation: a migration das origens novas ainda não foi aplicada → grava com a antiga.
    const antiga = ORIGEM_ANTES_DA_MIGRATION[origem];
    if (error?.code === "23514" && antiga) ({ error } = await inserir(antiga));
    if (error) { console.error("[crm] histórico de etapa não gravado:", error.message); return false; }
    return true;
  } catch (e) {
    console.error("[crm] histórico de etapa não gravado:", e instanceof Error ? e.message : e);
    return false;
  }
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
