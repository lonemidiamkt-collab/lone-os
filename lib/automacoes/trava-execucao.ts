// lib/automacoes/trava-execucao.ts — um job por vez: o cron e o "Rodar agora" da Central não se atropelam.
//
// 25/10/2026 (auditoria de erro recuperável, 10.3). O "Rodar agora" não tinha trava: depois de 80 s a Central
// respondia "ainda rodando" e o botão destravava sem mostrar que seguia. O segundo clique, outro gestor ou o
// cron disparavam de novo — e cs-desempenho, traffic-diagnostico, cs-roteiro-semanal e cs-relatorio (sem
// dedup próprio) mandavam o PDF de novo ao grupo.
//
// A trava é a mesma de lib/system/trava-rodada.ts (chave primária em routine_runs, sem migration nova):
//   · "Rodar agora" reserva antes de chamar a rota e solta quando ela termina (mesmo depois do 202);
//   · o portão do cron (automacoes/pode-rodar) também reserva, e o registro do fim (automacoes/registrar) solta;
//   · reserva presa (processo morreu) se solta sozinha depois de 90 min.
// Erro de banco na reserva NÃO bloqueia (trava-rodada segue em frente): a Central fora do ar nunca para um job.

import { supabaseAdmin } from "@/lib/supabase/server";
import { reservarRodada, fecharRodada, type Reserva } from "@/lib/system/trava-rodada";

// Uma reserva por job (não por dia): a chave do "dia" é fixa. Fica no formato de data porque é assim que
// routine_runs.date_key é usada por todas as outras travas (a coluna pode ser do tipo date).
const DIA_CHAVE = "2000-01-01";
const MINUTOS_PRESA = 90;
export const rotinaDoJob = (job: string) => `exec:${job}`;

export function reservarExecucao(job: string): Promise<Reserva> {
  return reservarRodada(rotinaDoJob(job), DIA_CHAVE, { permitirNovaRodada: true });
}

export function liberarExecucao(job: string, ok: boolean, detalhe?: string): Promise<void> {
  return fecharRodada(rotinaDoJob(job), DIA_CHAVE, ok, detalhe);
}

/** Jobs rodando agora → desde quando (ISO). Leitura que falha devolve vazio: a rota ainda recusa com 409. */
export async function execucoesEmAndamento(agora = new Date()): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("routine_runs").select("routine, started_at, finished_at")
    .like("routine", "exec:%").eq("date_key", DIA_CHAVE).is("finished_at", null);
  if (error) {
    console.error("[trava-execucao] não li as execuções em andamento:", error.message);
    return {};
  }
  const limite = agora.getTime() - MINUTOS_PRESA * 60_000;
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { routine: string; started_at: string }[]) {
    if (new Date(r.started_at).getTime() < limite) continue; // presa: não conta como rodando
    out[r.routine.slice("exec:".length)] = r.started_at;
  }
  return out;
}
