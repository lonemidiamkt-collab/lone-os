-- ═══════════════════════════════════════════════════════════
-- Lone OS — Módulo Monitoramento de Saldos (v1)
-- ═══════════════════════════════════════════════════════════

-- ── 1. Campos adicionais em clients ──────────────────────────
alter table public.clients
  add column if not exists client_finance_phone text,
  add column if not exists client_pix_key       text;

-- ── 2. Tabela ad_accounts ─────────────────────────────────────
-- Uma linha por conta Meta (act_XXXX) vinculada a um cliente.
-- Um cliente pode ter mais de uma conta (ex: loja A e loja B).
create table if not exists public.ad_accounts (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  meta_account_id     text not null unique,           -- "act_1234567890"
  account_name        text,
  is_prepaid          boolean default true,
  spend_cap           numeric(12,2),                  -- só pós-pago
  last_balance        numeric(12,2),                  -- saldo em R$ (pré-pago) ou saldo disponível calculado (pós-pago)
  last_amount_spent   numeric(12,2),                  -- gasto acumulado no ciclo
  daily_spend_3d      numeric[],                      -- gastos dos últimos 3 dias (mais recente = último índice)
  last_synced_at      timestamptz,
  currency            text default 'BRL',
  account_status      int,                            -- 1=Ativa 2=Desativada 3=Em revisão 7=Pendente 9=Grace period
  sync_error          text,                           -- mensagem do último erro de sync (null = ok)
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_ad_accounts_client    on public.ad_accounts(client_id);
create index if not exists idx_ad_accounts_meta_id   on public.ad_accounts(meta_account_id);

-- Auto-upsert ad_accounts a partir de clients.meta_ad_account_id existentes
-- (garante que clientes já cadastrados ganhem linha na nova tabela)
insert into public.ad_accounts (client_id, meta_account_id, account_name)
select
  id                  as client_id,
  meta_ad_account_id  as meta_account_id,
  meta_ad_account_name as account_name
from public.clients
where meta_ad_account_id is not null
on conflict (meta_account_id) do nothing;

-- ── 3. Tabela budget_alert_rules ─────────────────────────────
create table if not exists public.budget_alert_rules (
  id                     uuid primary key default gen_random_uuid(),
  ad_account_id          uuid not null references public.ad_accounts(id) on delete cascade,
  severity               text not null check (severity in ('warning', 'critical')),
  threshold_value        numeric(12,2) not null,
  repeat_interval_hours  int default 6   check (repeat_interval_hours between 1 and 24),
  max_notifications      int default 3   check (max_notifications between 1 and 20),
  channels               text[] default array['whatsapp'],
  is_active              boolean default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create index if not exists idx_budget_alert_rules_account on public.budget_alert_rules(ad_account_id);

-- ── 4. Tabela budget_alert_log ───────────────────────────────
create table if not exists public.budget_alert_log (
  id                 uuid primary key default gen_random_uuid(),
  rule_id            uuid references public.budget_alert_rules(id) on delete cascade,
  ad_account_id      uuid not null references public.ad_accounts(id) on delete cascade,
  balance_at_trigger numeric(12,2) not null,
  channel            text not null,
  sent_at            timestamptz default now(),
  cycle_key          text not null  -- ex: "act_123|warning|2025-05-07"
);

create index if not exists idx_budget_alert_log_cycle on public.budget_alert_log(ad_account_id, cycle_key);

-- ── 5. RLS: apenas admin/manager/traffic podem ler/escrever ──
alter table public.ad_accounts        enable row level security;
alter table public.budget_alert_rules enable row level security;
alter table public.budget_alert_log   enable row level security;

-- Política permissiva para service_role (API routes server-side)
create policy "service_role full access ad_accounts"
  on public.ad_accounts for all
  to service_role using (true) with check (true);

create policy "service_role full access budget_alert_rules"
  on public.budget_alert_rules for all
  to service_role using (true) with check (true);

create policy "service_role full access budget_alert_log"
  on public.budget_alert_log for all
  to service_role using (true) with check (true);

-- Política para usuários autenticados (leitura das suas próprias contas)
create policy "authenticated read ad_accounts"
  on public.ad_accounts for select
  to authenticated using (true);

create policy "authenticated read budget_alert_rules"
  on public.budget_alert_rules for select
  to authenticated using (true);

create policy "authenticated read budget_alert_log"
  on public.budget_alert_log for select
  to authenticated using (true);
