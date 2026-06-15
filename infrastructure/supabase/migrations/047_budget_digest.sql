-- ═══════════════════════════════════════════════════════════
-- Lone OS — Digest de saldos via Evolution API (seg/qua/sex)
-- + alerta em tempo real com aviso de antecedência por % de verba
-- ═══════════════════════════════════════════════════════════
-- Contexto: contas zeradas (ex: Imperio dos Pisos) ficavam verdes "Ativa"
-- e ninguém era avisado. Esta migration cria o log do digest agendado e
-- semeia a configuração de alerta em agency_settings.

-- ── 1. Log do digest agendado ────────────────────────────────
-- Uma linha por execução do /api/system/budget-digest.
-- date_key garante idempotência (não manda 2x no mesmo dia).
create table if not exists public.budget_digest_log (
  id               uuid primary key default gen_random_uuid(),
  date_key         text not null,                 -- "YYYY-MM-DD" (BRT) — 1 digest/dia
  status           text not null default 'sent'   -- 'sent' | 'failed' | 'skipped' | 'dry_run'
                     check (status in ('sent', 'failed', 'skipped', 'dry_run')),
  severity_counts  jsonb,                          -- {"critical":2,"warning":1,"ok":10,"error":0}
  message          text,                           -- corpo enviado (auditoria)
  error            text,                           -- mensagem de erro quando status='failed'
  sent_at          timestamptz default now()
);

create index if not exists idx_budget_digest_log_date on public.budget_digest_log(date_key);

-- ── 2. RLS (mesmo padrão de 032_budget_monitoring) ───────────
alter table public.budget_digest_log enable row level security;

create policy "service_role full access budget_digest_log"
  on public.budget_digest_log for all
  to service_role using (true) with check (true);

create policy "authenticated read budget_digest_log"
  on public.budget_digest_log for select
  to authenticated using (true);

-- ── 3. Configuração de alerta em agency_settings (key/value) ──
-- Editável sem redeploy. Segredos da Evolution (URL/API key/instance)
-- ficam em env vars; aqui só o que o operador ajusta.
insert into public.agency_settings (key, value) values
  ('traffic_alert_enabled',      'true'),  -- liga/desliga todo o disparo
  ('traffic_alert_group_jid',    ''),      -- JID do grupo WhatsApp (ex: 12036xxxx@g.us)
  ('traffic_alert_warning_pct',  '20'),    -- aviso de antecedência: saldo <= 20% da verba
  ('traffic_alert_critical_pct', '5')      -- crítico: saldo <= 5% da verba
on conflict (key) do nothing;
