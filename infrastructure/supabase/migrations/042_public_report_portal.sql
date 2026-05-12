-- Migration 042: portal público de resultados para clientes
-- Aplicar via: psql $DATABASE_URL -f infrastructure/supabase/migrations/042_public_report_portal.sql
--
-- ATENÇÃO: o portal público não usa RLS. Acessa via service_role no
-- Server Component (app/portal/[token]/page.tsx) após validar o token.
-- Nenhuma rota pública expõe dados sem antes verificar token + revoked_at.

-- ── 1. Campos novos em clients ────────────────────────────────────────────────

alter table clients
  add column if not exists public_report_token              uuid unique,
  add column if not exists public_report_token_created_at   timestamptz,
  add column if not exists public_report_token_revoked_at   timestamptz,
  add column if not exists public_report_enabled            boolean not null default false,
  add column if not exists whatsapp_team_phone              text,
  add column if not exists portal_welcome_message           text;

-- Lookup rápido por token na rota pública (O(log n))
create unique index if not exists idx_clients_report_token
  on clients(public_report_token)
  where public_report_token is not null;

-- ── 2. Snapshots por período ──────────────────────────────────────────────────
-- Snapshots são gerados on-demand ou via cron às 06:00 BRT e cacheados aqui.
-- period_kind mapeia 1:1 ao seletor de período do portal (4 opções fixas).

create table if not exists client_report_snapshots (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  period_kind  text not null check (period_kind in (
                 'last_week', 'last_2_weeks', 'this_month', 'last_month')),
  period_start date not null,
  period_end   date not null,
  data         jsonb not null,
  generated_at timestamptz not null default now(),
  constraint uq_snapshot unique (client_id, period_kind, period_start)
);

create index if not exists idx_snapshots_client_period
  on client_report_snapshots(client_id, period_end desc);

-- Índice para cleanup futuro (purgar snapshots antigos)
create index if not exists idx_snapshots_generated_at
  on client_report_snapshots(generated_at);

alter table client_report_snapshots enable row level security;

create policy "team_read_snapshots"
  on client_report_snapshots for select
  to authenticated using (true);

create policy "service_write_snapshots"
  on client_report_snapshots for all
  to service_role using (true) with check (true);

-- ── 3. Ações da agência (timeline manual visível ao cliente) ──────────────────
-- Preenchida pela equipe interna no Lone OS. Exibida no portal como timeline.
-- icon: 'new_creative' | 'budget_change' | 'pause' | 'optimization'

create table if not exists agency_actions (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  created_by        uuid references team_members(id) on delete set null,
  action_date       date not null,
  title             text not null,
  description       text,
  icon              text,
  visible_to_client boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists idx_agency_actions_client
  on agency_actions(client_id, action_date desc);

alter table agency_actions enable row level security;

create policy "team_read_agency_actions"
  on agency_actions for select
  to authenticated using (true);

create policy "traffic_insert_agency_actions"
  on agency_actions for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.auth_user_id = auth.uid()
        and tm.role in ('admin', 'manager', 'traffic')
    )
  );

create policy "traffic_update_agency_actions"
  on agency_actions for update
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.auth_user_id = auth.uid()
        and tm.role in ('admin', 'manager', 'traffic')
    )
  );

-- ── 4. Log de acessos ao portal ───────────────────────────────────────────────
-- ip_truncated: apenas prefixo /24 sem o quarto octeto (LGPD).
-- Exemplo: "189.28.10" (não "189.28.10.55").

create table if not exists public_report_access_log (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references clients(id) on delete set null,
  token_used   uuid,
  ip_truncated text,
  user_agent   text,
  accessed_at  timestamptz not null default now(),
  was_valid    boolean not null default true
);

create index if not exists idx_access_log_client
  on public_report_access_log(client_id, accessed_at desc);

create index if not exists idx_access_log_at
  on public_report_access_log(accessed_at desc);

alter table public_report_access_log enable row level security;

create policy "team_read_access_log"
  on public_report_access_log for select
  to authenticated using (true);

create policy "service_write_access_log"
  on public_report_access_log for insert
  to service_role with check (true);
