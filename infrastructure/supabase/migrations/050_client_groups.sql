-- ═══════════════════════════════════════════════════════════
-- Lone OS — Relatórios + suporte nos GRUPOS DOS CLIENTES
-- ═══════════════════════════════════════════════════════════

-- ── 1. Vínculo cliente ↔ grupo WhatsApp ──────────────────────
-- Preenchido por mapeamento revisado (humano). Sem JID = não envia.
alter table public.clients
  add column if not exists whatsapp_group_jid  text,
  add column if not exists whatsapp_group_name text;

-- ── 2. Log de mensagens aos grupos dos clientes ──────────────
create table if not exists public.client_group_message_log (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.clients(id) on delete cascade,
  date_key   text not null,                          -- "YYYY-MM-DD" (BRT)
  kind       text not null check (kind in ('report', 'support')),
  status     text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error      text,
  sent_at    timestamptz default now()
);

create index if not exists idx_client_group_msg_log on public.client_group_message_log(date_key, kind);

alter table public.client_group_message_log enable row level security;

create policy "service_role full access client_group_message_log"
  on public.client_group_message_log for all
  to service_role using (true) with check (true);

create policy "authenticated read client_group_message_log"
  on public.client_group_message_log for select
  to authenticated using (true);

-- ── 3. Trava de segurança: envio aos clientes começa DESLIGADO ─
-- Só ligar (true) após o mapeamento cliente↔grupo ser revisado/confirmado.
insert into public.agency_settings (key, value) values
  ('traffic_client_msgs_enabled', 'false')
on conflict (key) do nothing;
