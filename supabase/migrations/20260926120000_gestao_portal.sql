-- LEVA 7D — GESTÃO E PORTAL DO CLIENTE (26/09/2026).
--
-- 1) client_uploads.card_id / usado_em (N37): em que post o material que o cliente mandou foi usado.
--    O portal mostra "usado em: <post>" só quando o time ligou (POST /api/materiais/uso). Sem ligação,
--    nada é inventado.
-- 2) goal_results (N33): o FECHAMENTO de cada mês das metas — valor, alvo do trimestre e status, por
--    meta. É o histórico que a tela Metas & OKRs mostra (antes: snapshot no localStorage de cada um,
--    com baseline escrito no código). Quem grava: o job metas-fechamento (dia 1º).
-- 3) metas_trafego_mes(inicio, fim) (N33): conversas e investido do mês pela Meta, UMA leitura por
--    conta e dia (metric_snapshots guarda ~96 capturas por dia — somar tudo inflaria 96 vezes).
-- 4) O job revisao-semanal (N31) NASCE DESLIGADO na Central de Automações. A rota também exige o job
--    ligado explicitamente: sem esta migration, ele não manda nada.
--
-- Idempotente. RLS ligada sem policy nas tabelas novas: só o service role (as rotas do servidor).
-- Nenhum dado financeiro da agência: "investido" é o dinheiro do CLIENTE na Meta.

-- ── 1) Material do cliente → post ────────────────────────────────────────────
alter table public.client_uploads
  add column if not exists card_id uuid references public.content_cards(id) on delete set null,
  add column if not exists usado_em timestamptz;
create index if not exists client_uploads_card on public.client_uploads (card_id) where card_id is not null;

comment on column public.client_uploads.card_id is
  'Card (post) em que o time usou este material. O portal mostra "usado em" a partir daqui (N37).';

-- ── 2) Histórico das metas ───────────────────────────────────────────────────
create table if not exists public.goal_results (
  periodo text not null,              -- "2026-08"
  chave text not null,                -- lib/goals/catalogo.ts (ex.: "churn_pct")
  valor numeric,                      -- null = sem fonte naquele mês (nunca 0 inventado)
  alvo numeric,                       -- alvo do trimestre do mês, no momento do fechamento
  status text not null default 'sem_dado',
  sem_fonte text,                     -- por que não há valor
  detalhe text,                       -- base da conta ("12 de 40 clientes")
  calculado_em timestamptz not null default now(),
  primary key (periodo, chave)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goal_results_status_check') then
    alter table public.goal_results add constraint goal_results_status_check
      check (status in ('batida', 'perto', 'longe', 'sem_dado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'goal_results_periodo_check') then
    alter table public.goal_results add constraint goal_results_periodo_check
      check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;

alter table public.goal_results enable row level security;

comment on table public.goal_results is
  'Fechamento mensal das metas (N33): uma linha por mês e meta. Escrito pelo job metas-fechamento; lido por /api/goals.';

-- ── 3) Tráfego do mês, sem repetir captura ───────────────────────────────────
create index if not exists idx_metric_snapshots_data on public.metric_snapshots (metric_date);

create or replace function public.metas_trafego_mes(p_inicio date, p_fim date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- Uma linha por CONTA e dia (a última captura do dia): a mesma conta ligada a dois cadastros de
  -- cliente não conta duas vezes.
  with diario as (
    select distinct on (meta_ad_account_id, metric_date)
      meta_ad_account_id, spend, conversions
    from metric_snapshots
    where metric_date between p_inicio and p_fim
    order by meta_ad_account_id, metric_date, captured_at desc
  )
  select json_build_object(
    'conversas', coalesce(sum(conversions), 0)::bigint,
    'investido', round(coalesce(sum(spend), 0)::numeric, 2),
    'contas', count(distinct meta_ad_account_id)::int
  )
  from diario;
$$;

revoke all on function public.metas_trafego_mes(date, date) from public, anon, authenticated;
grant execute on function public.metas_trafego_mes(date, date) to service_role;

-- ── 4) Revisão semanal de operação: nasce DESLIGADA ──────────────────────────
-- "on conflict do nothing": se alguém já ligou/desligou antes desta migration rodar de novo, vale a
-- escolha dela.
do $$
begin
  if to_regclass('public.automation_settings') is not null then
    insert into public.automation_settings (job, enabled, updated_by, updated_at)
    values ('revisao-semanal', false, 'migration 20260926120000 (nasce desligado)', now())
    on conflict (job) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
