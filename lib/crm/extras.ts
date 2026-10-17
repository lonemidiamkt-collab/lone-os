// lib/crm/extras.ts — o que o card do lead mostra além das colunas de sempre (Leva 7C, N27/N28):
// a NOTA A/B/C (da prospecção, ou da qualificação à mão), os TOQUES da cadência e se o lead já
// virou cliente. Uma ida ao banco por tabela para o funil inteiro. Nunca lança: sem a migration
// 20260926100000, a nota vem vazia e o resto funciona.

import { supabaseAdmin } from "@/lib/supabase/server";
import { TIPOS_AVANCO, TIPOS_TOQUE } from "./cadencia";
import type { Classe } from "@/lib/prospeccao/tipos";

export interface ExtrasLead {
  clienteId: string | null;
  nota: Classe | null;
  notaScore: number | null;
  /** De onde veio a nota: a leitura completa da prospecção ou a qualificação à mão. */
  notaOrigem: "prospeccao" | "qualificacao" | null;
  qualificacao: Record<string, unknown> | null;
  cadenciaInicio: string | null;
  prospectId: string | null;
  /** Datas (ISO) das atividades de CONTATO (ligação, WhatsApp, e-mail, reunião, visita): esforço,
   *  "esfriando" e tempo de resposta contam por aqui. */
  toques: string[];
  /** Contatos + "pulado" — é o que faz a régua da cadência andar (lib/crm/cadencia.ts). */
  avancos: string[];
}

export const EXTRAS_VAZIOS: ExtrasLead = {
  clienteId: null, nota: null, notaScore: null, notaOrigem: null, qualificacao: null, cadenciaInicio: null, prospectId: null, toques: [], avancos: [],
};

export async function carregarExtras(leadIds: string[]): Promise<Map<string, ExtrasLead>> {
  const out = new Map<string, ExtrasLead>(leadIds.map((id) => [id, { ...EXTRAS_VAZIOS, toques: [], avancos: [] }]));
  if (!leadIds.length) return out;

  const [colsQ, cliQ, atvQ] = await Promise.all([
    supabaseAdmin.from("crm_leads").select("id, nota, nota_score, qualificacao, cadencia_inicio, prospect_id").in("id", leadIds),
    supabaseAdmin.from("clients").select("id, source_lead_id").in("source_lead_id", leadIds),
    supabaseAdmin.from("crm_lead_activities").select("lead_id, tipo, created_at").in("lead_id", leadIds).in("tipo", [...TIPOS_AVANCO]).limit(10000),
  ]);

  // Sem a migration as colunas novas não existem: tenta só o elo com a prospecção (que já existia).
  let cols = colsQ.data as Record<string, unknown>[] | null;
  if (colsQ.error) {
    const r = await supabaseAdmin.from("crm_leads").select("id, prospect_id").in("id", leadIds);
    cols = (r.data as Record<string, unknown>[] | null) ?? [];
  }
  const prospectIds = [...new Set((cols ?? []).map((c) => c.prospect_id as string | null).filter(Boolean))] as string[];
  const classes = new Map<string, { classe: Classe | null; score: number | null }>();
  if (prospectIds.length) {
    const { data } = await supabaseAdmin.from("prospects").select("id, classe, score").in("id", prospectIds);
    for (const p of data ?? []) classes.set(p.id as string, { classe: (p.classe as Classe) ?? null, score: (p.score as number) ?? null });
  }

  for (const c of cols ?? []) {
    const e = out.get(c.id as string);
    if (!e) continue;
    e.prospectId = (c.prospect_id as string) ?? null;
    e.qualificacao = (c.qualificacao as Record<string, unknown>) ?? null;
    e.cadenciaInicio = (c.cadencia_inicio as string) ?? null;
    const doProspect = e.prospectId ? classes.get(e.prospectId) : undefined;
    if (doProspect?.classe) {
      e.nota = doProspect.classe; e.notaScore = doProspect.score; e.notaOrigem = "prospeccao";
    } else if (c.nota) {
      e.nota = c.nota as Classe; e.notaScore = (c.nota_score as number) ?? null; e.notaOrigem = "qualificacao";
    }
  }
  for (const c of cliQ.data ?? []) {
    const e = out.get(c.source_lead_id as string);
    if (e) e.clienteId = c.id as string;
  }
  for (const a of atvQ.data ?? []) {
    const e = out.get(a.lead_id as string);
    if (!e) continue;
    e.avancos.push(a.created_at as string);
    if (TIPOS_TOQUE.has(a.tipo as string)) e.toques.push(a.created_at as string);
  }
  return out;
}
