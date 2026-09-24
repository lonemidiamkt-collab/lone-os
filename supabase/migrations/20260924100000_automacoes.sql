-- CENTRAL DE AUTOMAÇÕES (Leva 2, 24/09/2026). O VPS roda ~76 jobs pelo crontab e nada registrava se
-- eles rodaram, falharam ou pararam; desligar um job exigia editar o crontab. Agora o
-- scripts/cron-call.sh pergunta aqui se pode rodar e grava cada execução.
--
-- Idempotente: pode rodar de novo sem erro. Só o service role lê/escreve (RLS ligada, sem policy).

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz,
  finished_at timestamptz default now(),
  duration_ms int,
  http_status int,
  ok boolean,
  skipped boolean default false,
  resumo text,
  created_at timestamptz default now()
);
-- Ensaio (botão "Ensaio" da Central) fica no histórico, mas não conta como execução de verdade.
alter table public.automation_runs add column if not exists ensaio boolean not null default false;
create index if not exists idx_automation_runs_job_fim on public.automation_runs (job, finished_at desc);

create table if not exists public.automation_settings (
  job text primary key,
  enabled boolean not null default true,
  paused_until timestamptz,
  updated_by text,
  updated_at timestamptz default now()
);
-- Último aviso do vigia sobre este job: no máximo um alerta por job a cada 24h.
alter table public.automation_settings add column if not exists ultimo_alerta_em timestamptz;

alter table public.automation_runs enable row level security;
alter table public.automation_settings enable row level security;

-- Um retrato por job (última execução, último sucesso, contagem de 7 dias) numa ida ao banco.
create or replace function public.automation_resumo()
returns table (
  job text,
  ultima_em timestamptz,
  ultima_ok boolean,
  ultima_skipped boolean,
  ultima_status int,
  ultima_duracao_ms int,
  ultima_real_ok boolean,
  ultimo_sucesso_em timestamptz,
  ok_7d int,
  erro_7d int,
  pulado_7d int
)
language sql stable security invoker set search_path = public as $$
  with ult as (
    select distinct on (r.job) r.job, r.finished_at, r.ok, r.skipped, r.http_status, r.duration_ms
    from automation_runs r where not r.ensaio
    order by r.job, r.finished_at desc
  ), ult_real as (
    select distinct on (r.job) r.job, r.ok
    from automation_runs r where not r.ensaio and not coalesce(r.skipped, false)
    order by r.job, r.finished_at desc
  ), suc as (
    select r.job, max(r.finished_at) as em
    from automation_runs r where r.ok and not coalesce(r.skipped, false) and not r.ensaio
    group by r.job
  ), sem as (
    select r.job,
      (count(*) filter (where r.ok and not coalesce(r.skipped, false)))::int as ok_7d,
      (count(*) filter (where r.ok is not true and not coalesce(r.skipped, false)))::int as erro_7d,
      (count(*) filter (where coalesce(r.skipped, false)))::int as pulado_7d
    from automation_runs r where not r.ensaio and r.finished_at > now() - interval '7 days'
    group by r.job
  )
  select u.job, u.finished_at, u.ok, coalesce(u.skipped, false), u.http_status, u.duration_ms,
         ur.ok, s.em, coalesce(w.ok_7d, 0), coalesce(w.erro_7d, 0), coalesce(w.pulado_7d, 0)
  from ult u
  left join ult_real ur on ur.job = u.job
  left join suc s on s.job = u.job
  left join sem w on w.job = u.job;
$$;

revoke all on function public.automation_resumo() from public, anon, authenticated;
grant execute on function public.automation_resumo() to service_role;

comment on table public.automation_runs is 'Uma linha por execução de job agendado (cron-call.sh / Central de Automações). Guarda as 200 últimas por job.';
comment on table public.automation_settings is 'Liga/desliga/pausa de cada job agendado. Sem linha = ligado.';

notify pgrst, 'reload schema';
