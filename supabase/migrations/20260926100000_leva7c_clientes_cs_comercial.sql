-- LEVA 7C — CLIENTES, CS E COMERCIAL (26/09/2026).
--
-- 1. COFRE DE ACESSOS COM STATUS (N24). Cada plataforma do cliente (Meta, Instagram, Google Ads) ganha
--    um estado que alguém confere — ok / pendente / inválido —, com quem marcou e quando. E o pedido de
--    acesso por LINK: o cliente abre /onboarding/acesso/<token>, digita login e senha, e a credencial
--    entra CIFRADA direto no cofre (clients.*_password), sem passar por WhatsApp.
--    Quem revelou a senha já é registrado em vault_access_log (/api/client-vault); aqui não muda nada disso.
--
-- 2. NOTA A/B/C E CADÊNCIA NOS LEADS (N28). A mesma régua da prospecção (lib/prospeccao/score.ts)
--    aplicada ao lead cadastrado à mão, a partir de uma qualificação rápida. E o início da cadência de
--    follow-up (dia 2 / 5 / 12), que por padrão é a data de criação do lead.
--
-- 3. GANHO → ONBOARDING SEM CONVERSÃO DUPLA (N27). Um lead vira no máximo UM cliente. O código já
--    confere antes de criar; o índice fecha a corrida de dois cliques. Só é criado se o banco não tiver
--    duplicata hoje (se tiver, a checagem do código continua valendo e a migration não falha).
--
-- Idempotente: pode rodar de novo sem erro. RLS ligada sem policy nas tabelas novas: só o service
-- role lê e grava (as rotas do app). Sem esta migration o app funciona: o status do cofre aparece
-- como "não conferido", o link de acesso avisa que falta a migration e a nota do lead não é salva.

-- ── 1. Cofre ────────────────────────────────────────────────────────────────
create table if not exists public.client_access_status (
  client_id uuid not null references public.clients(id) on delete cascade,
  plataforma text not null,
  status text not null default 'pendente',
  nota text,
  atualizado_por text,
  atualizado_em timestamptz not null default now(),
  primary key (client_id, plataforma)
);

create table if not exists public.client_access_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  plataforma text not null,
  status text not null default 'aberto',
  criado_por text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '14 days'),
  recebido_em timestamptz,
  recebido_ip text
);
create index if not exists idx_client_access_requests_cliente
  on public.client_access_requests (client_id, criado_em desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_access_status_plataforma_check') then
    alter table public.client_access_status add constraint client_access_status_plataforma_check
      check (plataforma in ('meta', 'instagram', 'google'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_access_status_status_check') then
    alter table public.client_access_status add constraint client_access_status_status_check
      check (status in ('ok', 'pendente', 'invalido'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_access_requests_plataforma_check') then
    alter table public.client_access_requests add constraint client_access_requests_plataforma_check
      check (plataforma in ('meta', 'instagram', 'google'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_access_requests_status_check') then
    alter table public.client_access_requests add constraint client_access_requests_status_check
      check (status in ('aberto', 'recebido', 'cancelado'));
  end if;
end $$;

alter table public.client_access_status enable row level security;
alter table public.client_access_requests enable row level security;

comment on table public.client_access_status is
  'Estado conferido de cada acesso do cliente (ok/pendente/invalido), por plataforma. Leva 7C, N24.';
comment on table public.client_access_requests is
  'Pedido de acesso por link: o cliente preenche em /onboarding/acesso/<token> e a senha entra cifrada no cofre. Leva 7C, N24.';

-- ── 2. Leads: nota e cadência ───────────────────────────────────────────────
do $$
begin
  if to_regclass('public.crm_leads') is not null then
    alter table public.crm_leads add column if not exists nota text;
    alter table public.crm_leads add column if not exists nota_score int;
    alter table public.crm_leads add column if not exists nota_detalhe jsonb;
    alter table public.crm_leads add column if not exists qualificacao jsonb;
    alter table public.crm_leads add column if not exists cadencia_inicio date;
    if not exists (select 1 from pg_constraint where conname = 'crm_leads_nota_check') then
      alter table public.crm_leads add constraint crm_leads_nota_check
        check (nota is null or nota in ('A', 'B', 'C', 'NP'));
    end if;
    comment on column public.crm_leads.nota is 'Classe da régua da prospecção (A/B/C/NP), calculada da qualificação do lead (lib/crm/nota.ts).';
    comment on column public.crm_leads.cadencia_inicio is 'Dia zero da cadência de follow-up (toques no dia 2, 5 e 12). Nulo = data de criação.';
  end if;
end $$;

-- ── 3. Um lead, um cliente ──────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'source_lead_id'
  ) and not exists (
    select 1 from public.clients where source_lead_id is not null
    group by source_lead_id having count(*) > 1
  ) then
    create unique index if not exists clients_source_lead_unico
      on public.clients (source_lead_id) where source_lead_id is not null;
  end if;
end $$;

notify pgrst, 'reload schema';
