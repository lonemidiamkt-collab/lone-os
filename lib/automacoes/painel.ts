// lib/automacoes/painel.ts — lê o banco e monta a Central (usado pela rota e pelo vigia). Só servidor.

import { supabaseAdmin } from "@/lib/supabase/server";
import { montarLinhas, podeRodar, type ConfigJob, type LinhaPainel, type ResumoJob } from "./saude";

export const MIGRACAO_PENDENTE =
  "A Central ainda não tem as tabelas no banco — aplique supabase/migrations/20260924100000_automacoes.sql.";

export async function lerConfigs(): Promise<ConfigJob[]> {
  const { data, error } = await supabaseAdmin
    .from("automation_settings")
    .select("job, enabled, paused_until, updated_by, updated_at, ultimo_alerta_em");
  if (error) throw new Error(error.message);
  return (data ?? []) as ConfigJob[];
}

export async function lerConfig(job: string): Promise<ConfigJob | null> {
  const { data, error } = await supabaseAdmin
    .from("automation_settings")
    .select("job, enabled, paused_until, updated_by, updated_at, ultimo_alerta_em")
    .eq("job", job).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConfigJob | null) ?? null;
}

export async function montarPainel(agora = new Date()): Promise<{ linhas: LinhaPainel[]; configs: ConfigJob[]; inicioMonitoramento: string | null }> {
  const [resumo, configs, primeira] = await Promise.all([
    supabaseAdmin.rpc("automation_resumo"),
    lerConfigs(),
    supabaseAdmin.from("automation_runs").select("finished_at").order("finished_at", { ascending: true }).limit(1),
  ]);
  if (resumo.error) throw new Error(resumo.error.message);
  if (primeira.error) throw new Error(primeira.error.message);
  const inicio = (primeira.data?.[0]?.finished_at as string | undefined) ?? null;
  return { linhas: montarLinhas((resumo.data ?? []) as ResumoJob[], configs, agora, inicio), configs, inicioMonitoramento: inicio };
}

export async function podeRodarJob(job: string, agora = new Date()) {
  return podeRodar(await lerConfig(job), agora);
}

export interface NovaExecucao {
  job: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  http_status?: number | null;
  ok: boolean | null;
  skipped?: boolean;
  ensaio?: boolean;
  resumo?: string | null;
}

const MANTER_POR_JOB = 200;

/** Grava uma execução e poda o histórico do job às 200 mais recentes. */
export async function gravarExecucao(e: NovaExecucao): Promise<void> {
  const { error } = await supabaseAdmin.from("automation_runs").insert({
    job: e.job,
    started_at: e.started_at ?? null,
    finished_at: e.finished_at ?? new Date().toISOString(),
    duration_ms: e.duration_ms ?? null,
    http_status: e.http_status ?? null,
    ok: e.ok,
    skipped: !!e.skipped,
    ensaio: !!e.ensaio,
    resumo: e.resumo ?? null,
  });
  if (error) throw new Error(error.message);
  const { data: corte } = await supabaseAdmin
    .from("automation_runs").select("finished_at").eq("job", e.job)
    .order("finished_at", { ascending: false }).range(MANTER_POR_JOB - 1, MANTER_POR_JOB - 1);
  const limite = corte?.[0]?.finished_at as string | undefined;
  if (limite) {
    await supabaseAdmin.from("automation_runs").delete().eq("job", e.job).lt("finished_at", limite);
  }
}
