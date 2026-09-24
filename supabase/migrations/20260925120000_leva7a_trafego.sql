-- LEVA 7A — TRÁFEGO (25/09/2026). Idempotente. Antes de rodar, o painel funciona igual: cada peça
-- abaixo tem o seu "ainda não existe" tratado no código (a tela avisa, o job grava sem a coluna nova).
--
-- 1) N4 — RESULTADO PELO OBJETIVO. `conversions` continua sendo CONVERSAS (relatórios dos clientes
--    dizem "conversas"); o resultado do objetivo da campanha (conversa, lead de formulário ou compra)
--    vai em `results`, e `result_kind` diz qual. O defense-scan grava; Hoje, "Resultado de ontem",
--    referência por nicho e ranking leem. No meta_entity_snapshots, `conversions` passa a ser o
--    resultado do objetivo e `result_kind` diz o tipo (para campanha de mensagem, nada muda).

alter table public.metric_snapshots add column if not exists leads bigint;
alter table public.metric_snapshots add column if not exists purchases bigint;
alter table public.metric_snapshots add column if not exists results bigint;
alter table public.metric_snapshots add column if not exists result_kind text;
comment on column public.metric_snapshots.results is 'Resultado pelo objetivo de cada campanha (conversas + leads + compras, sem dupla contagem). Leva 7A.';
comment on column public.metric_snapshots.result_kind is 'mensagens | leads | compras | misto — o que `results` conta.';

alter table public.meta_entity_snapshots add column if not exists result_kind text;
comment on column public.meta_entity_snapshots.result_kind is 'O que `conversions` conta (pelo objetivo da campanha): mensagens | leads | compras. Leva 7A.';

-- 2) N2 — RETRATO DIÁRIO DE CAMPANHAS E CONJUNTOS (status + orçamento), tirado às 0h10 pelo job
--    estado-campanhas. A aba Tráfego › O que mudou compara dois retratos seguidos. Só o servidor lê e
--    escreve (RLS ligada, sem policy).

create table if not exists public.meta_campaign_estado (
  entity_id text not null,
  dia date not null,
  client_id uuid references public.clients(id) on delete cascade,
  meta_ad_account_id text,
  nivel text not null check (nivel in ('campaign', 'adset')),
  entity_name text,
  campaign_id text,
  campaign_name text,
  status text,
  effective_status text,
  daily_budget numeric(12,2),
  lifetime_budget numeric(12,2),
  updated_time timestamptz,
  captured_at timestamptz not null default now(),
  primary key (entity_id, dia)
);
create index if not exists idx_meta_campaign_estado_dia on public.meta_campaign_estado (dia, client_id);
alter table public.meta_campaign_estado enable row level security;
comment on table public.meta_campaign_estado is 'Retrato diário (0h10 SP) de status e orçamento de campanhas e conjuntos. Leva 7A — O que mudou.';

-- 3) N9 — VENDAS DO CLIENTE vindas dos anúncios, lançadas pelo time (interno) ou pelo cliente no
--    portal. Dinheiro do CLIENTE (o que ele vendeu); nada da agência. Só pelas rotas do servidor.

create table if not exists public.client_sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  sold_on date not null,
  quantity integer not null default 1 check (quantity between 1 and 999),
  amount numeric(12,2) check (amount is null or amount >= 0),
  channel text,
  note text,
  source text not null default 'interno' check (source in ('interno', 'portal')),
  created_by text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_client_sales_cliente on public.client_sales (client_id, sold_on desc) where deleted_at is null;
create index if not exists idx_client_sales_dia on public.client_sales (sold_on) where deleted_at is null;
alter table public.client_sales enable row level security;
comment on table public.client_sales is 'Vendas que o cliente fechou vindas dos anúncios (time ou portal). Custo por venda = gasto ÷ vendas. Leva 7A.';

-- 4) N1 — o job vigia-entrega manda no grupo de tráfego: nasce DESLIGADO na Central de Automações.
--    "on conflict do nothing": se alguém já ligou/desligou, a escolha dele vale.
do $$
begin
  if to_regclass('public.automation_settings') is not null then
    insert into public.automation_settings (job, enabled, updated_by, updated_at)
    values ('vigia-entrega', false, 'migration 20260925120000 (nasce desligado)', now())
    on conflict (job) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
