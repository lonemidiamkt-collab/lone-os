// lib/prospeccao/piloto.ts — o piloto como entidade (§6 e V2 §2).
//
// 30 dias corridos, 10 novas abordagens/dia, e no fim ele PARA sozinho: sem descoberta, sem
// abordagem, sem follow-up, sem resposta. Os dados ficam. Só o Roberto reativa — e quando reativa,
// fica registrado quem e quando.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { CampanhaRow } from "./tipos";
import { somarDias } from "./tempo";

export async function campanhaAtual(): Promise<CampanhaRow | null> {
  // A "atual" é a mais recente que não seja rascunho; um rascunho novo só entra quando iniciado.
  const { data } = await supabaseAdmin.from("prospect_campanhas").select("*")
    .in("status", ["running", "paused", "completed"]).order("created_at", { ascending: false }).limit(1);
  const c = ((data ?? [])[0] as CampanhaRow | undefined) ?? null;
  if (c) return c;
  const { data: draft } = await supabaseAdmin.from("prospect_campanhas").select("*")
    .eq("status", "draft").order("created_at", { ascending: false }).limit(1);
  return ((draft ?? [])[0] as CampanhaRow | undefined) ?? null;
}

/** Rodando = status running E dentro do prazo. Fora disso o agente não faz nada proativo. */
export function pilotoRodando(c: CampanhaRow | null, agora = new Date()): boolean {
  if (!c || c.status !== "running") return false;
  if (c.termina_em && new Date(c.termina_em).getTime() <= agora.getTime()) return false;
  return true;
}

export function diaDoPiloto(c: CampanhaRow | null, agora = new Date()): { dia: number; total: number } | null {
  if (!c?.iniciado_em) return null;
  const ini = new Date(c.iniciado_em).getTime();
  const dia = Math.min(c.duracao_dias, Math.max(1, Math.floor((agora.getTime() - ini) / 86_400_000) + 1));
  return { dia, total: c.duracao_dias };
}

export async function criarCampanha(p: { nome: string; duracao_dias?: number; limite_dia?: number; created_by?: string | null }): Promise<CampanhaRow> {
  const { data, error } = await supabaseAdmin.from("prospect_campanhas").insert({
    nome: p.nome.trim() || "Piloto SDR", duracao_dias: p.duracao_dias ?? 30, limite_dia: p.limite_dia ?? 10,
    status: "draft", created_by: p.created_by ?? null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data as CampanhaRow;
}

export async function iniciarCampanha(id: string, por: string, agora = new Date()): Promise<CampanhaRow> {
  const { data: c } = await supabaseAdmin.from("prospect_campanhas").select("*").eq("id", id).single();
  if (!c) throw new Error("campanha não encontrada");
  const camp = c as CampanhaRow;
  const patch: Record<string, unknown> = {
    status: "running", updated_at: agora.toISOString(),
  };
  if (camp.status === "draft") {
    patch.iniciado_em = agora.toISOString();
    patch.termina_em = somarDias(agora, camp.duracao_dias).toISOString();
    patch.created_by = camp.created_by ?? por;
  } else {
    // Reativação (pausada ou concluída): novo prazo a partir de agora, e fica registrado quem mandou.
    patch.reativado_em = agora.toISOString();
    patch.reativado_por = por;
    patch.finalizado_em = null;
    patch.finalizado_motivo = null;
    if (camp.status === "completed" || !camp.termina_em || new Date(camp.termina_em) <= agora) {
      patch.termina_em = somarDias(agora, camp.duracao_dias).toISOString();
      if (!camp.iniciado_em) patch.iniciado_em = agora.toISOString();
    }
  }
  const { data, error } = await supabaseAdmin.from("prospect_campanhas").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as CampanhaRow;
}

export async function pausarCampanha(id: string, por: string, motivo?: string): Promise<CampanhaRow> {
  const { data, error } = await supabaseAdmin.from("prospect_campanhas").update({
    status: "paused", finalizado_em: new Date().toISOString(), finalizado_motivo: motivo ? `pausado por ${por}: ${motivo}` : `pausado por ${por}`,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as CampanhaRow;
}

export async function atualizarCampanha(id: string, patch: Partial<CampanhaRow>): Promise<CampanhaRow> {
  const permitidos: (keyof CampanhaRow)[] = ["nome", "limite_dia", "duracao_dias", "auto_stop", "janela_abordagem", "janela_resposta"];
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of permitidos) if (k in patch) row[k] = patch[k];
  const { data, error } = await supabaseAdmin.from("prospect_campanhas").update(row).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as CampanhaRow;
}

/**
 * Venceu o prazo? Marca `completed`. Quem chama (cron `prospect-piloto`) gera o relatório final.
 * Devolve true quando acabou AGORA (para o relatório sair uma única vez).
 */
export async function encerrarSeVenceu(c: CampanhaRow | null, agora = new Date()): Promise<boolean> {
  if (!c || c.status !== "running" || !c.auto_stop || !c.termina_em) return false;
  if (new Date(c.termina_em).getTime() > agora.getTime()) return false;
  const { error } = await supabaseAdmin.from("prospect_campanhas").update({
    status: "completed", finalizado_em: agora.toISOString(),
    finalizado_motivo: `fim do piloto (${c.duracao_dias} dias)`, updated_at: agora.toISOString(),
  }).eq("id", c.id).eq("status", "running");
  if (error) { console.error("[prospeccao/piloto] não encerrei:", error.message); return false; }
  console.log(`[prospeccao/piloto] piloto "${c.nome}" encerrado — só o Roberto reativa`);
  return true;
}
