-- Fase 2 (14/09/2026): alcance e FREQUÊNCIA reais do período por anúncio.
-- A frequência diária de meta_entity_snapshots é ~1,2 sempre (uma pessoa raramente vê o mesmo
-- anúncio 2× no mesmo dia) e não mede saturação. A Meta só devolve a frequência do período numa
-- leitura sem time_increment — é o que fica aqui, 7 dias, um ponto por dia de sync.
create table if not exists public.meta_ad_period (
  ad_id text not null,
  ate date not null,
  dias integer not null default 7,
  client_id uuid,
  reach integer,
  impressions integer,
  frequency numeric(6,2),
  spend numeric(12,2),
  created_at timestamptz not null default now(),
  primary key (ad_id, ate, dias)
);
create index if not exists idx_meta_ad_period_client on public.meta_ad_period (client_id, ate desc);
alter table public.meta_ad_period enable row level security;
drop policy if exists meta_ad_period_leitura on public.meta_ad_period;
create policy meta_ad_period_leitura on public.meta_ad_period for select to authenticated using (true);
notify pgrst, 'reload schema';
