-- ═══════════════════════════════════════════════════════════
-- Lone OS — Relatório semanal (7d) por cliente em PDF no grupo
-- ═══════════════════════════════════════════════════════════

-- ── 1. Log de execução (idempotência por semana/dia) ─────────
create table if not exists public.weekly_report_log (
  id        uuid primary key default gen_random_uuid(),
  week_key  text not null,                  -- "YYYY-MM-DD" (BRT) do envio
  status    text not null default 'sent'    -- 'sent' | 'failed' | 'skipped' | 'preview'
              check (status in ('sent', 'failed', 'skipped', 'preview')),
  message   text,
  error     text,
  sent_at   timestamptz default now()
);

create index if not exists idx_weekly_report_log_week on public.weekly_report_log(week_key);

alter table public.weekly_report_log enable row level security;

create policy "service_role full access weekly_report_log"
  on public.weekly_report_log for all
  to service_role using (true) with check (true);

create policy "authenticated read weekly_report_log"
  on public.weekly_report_log for select
  to authenticated using (true);

-- ── 2. Bucket público p/ os PDFs (preview + auditoria) ───────
insert into storage.buckets (id, name, public)
values ('reports', 'reports', true)
on conflict (id) do nothing;
