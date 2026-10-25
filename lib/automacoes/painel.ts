// lib/automacoes/painel.ts — lê o banco e monta a Central (usado pela rota e pelo vigia). Só servidor.

import { supabaseAdmin } from "@/lib/supabase/server";
import { montarLinhas, podeRodar, type ConfigJob, type LinhaPainel, type ResumoJob } from "./saude";
import { ErroDaCentral, MIGRACAO_PENDENTE } from "./execucao";
import { execucoesEmAndamento } from "./trava-execucao";

// A frase da migração mora em ./execucao e só aparece quando a tabela/função falta de verdade (auditoria 10.6).
export { MIGRACAO_PENDENTE };

/** Erro do banco com o código preservado (a Central escolhe a frase por ele). */
const erroDoBanco = (e: { message: string; code?: string }) => new ErroDaCentral(e.message, e.code);

export async function lerConfigs(): Promise<ConfigJob[]> {
  const { data, error } = await supabaseAdmin
    .from("automation_settings")
    .select("job, enabled, paused_until, updated_by, updated_at, ultimo_alerta_em");
  if (error) throw erroDoBanco(error);
  return (data ?? []) as ConfigJob[];
}

export async function lerConfig(job: string): Promise<ConfigJob | null> {
  const { data, error } = await supabaseAdmin
    .from("automation_settings")
    .select("job, enabled, paused_until, updated_by, updated_at, ultimo_alerta_em")
    .eq("job", job).maybeSingle();
  if (error) throw erroDoBanco(error);
  return (data as ConfigJob | null) ?? null;
}

/** O motivo da última execução PULADA de cada job (o resumo grava "pulado: …"). Best-effort. */
async function motivosDosPulos(jobs: string[]): Promise<Record<string, string>> {
  if (!jobs.length) return {};
  const { data, error } = await supabaseAdmin
    .from("automation_runs").select("job, resumo, finished_at")
    .in("job", jobs).eq("skipped", true).eq("ensaio", false)
    .order("finished_at", { ascending: false }).limit(jobs.length * 3);
  if (error) return {};
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { job: string; resumo: string | null }[]) {
    if (out[r.job] || !r.resumo) continue;
    out[r.job] = r.resumo.split("\n")[0].replace(/^(\[[^\]]*\]\s*)?pulado:\s*/i, "").slice(0, 160);
  }
  return out;
}

export async function montarPainel(agora = new Date()): Promise<{ linhas: LinhaPainel[]; configs: ConfigJob[]; inicioMonitoramento: string | null }> {
  const [resumo, configs, primeira, rodando] = await Promise.all([
    supabaseAdmin.rpc("automation_resumo"),
    lerConfigs(),
    supabaseAdmin.from("automation_runs").select("finished_at").order("finished_at", { ascending: true }).limit(1),
    execucoesEmAndamento(agora),
  ]);
  if (resumo.error) throw erroDoBanco(resumo.error);
  if (primeira.error) throw erroDoBanco(primeira.error);
  const inicio = (primeira.data?.[0]?.finished_at as string | undefined) ?? null;
  const linhas = montarLinhas((resumo.data ?? []) as ResumoJob[], configs, agora, inicio);
  const motivos = await motivosDosPulos(linhas.filter((l) => l.ultima?.pulado).map((l) => l.id));
  return {
    linhas: linhas.map((l) => ({ ...l, rodandoDesde: rodando[l.id] ?? null, ultimaMotivo: l.ultima?.pulado ? motivos[l.id] ?? null : null })),
    configs,
    inicioMonitoramento: inicio,
  };
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
