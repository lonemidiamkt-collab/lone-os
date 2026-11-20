-- 20261119150000_trafego_google.sql — o Google dentro do Tráfego (Tráfego › Google Ads e Tráfego › Google Meu Negócio).
--
-- Pedido (19/11/2026): o Tráfego Pago só tinha a Meta. O Google Ads e o Perfil da Empresa já eram lidos todo dia
-- (20261118120000_google_relatorios.sql), mas só apareciam no relatório e no portal do cliente: o gestor não tinha
-- onde ver a verba do Google, o ritmo do mês, a campanha travada por orçamento nem a avaliação sem resposta.
--
-- O que entra:
--   · clients.google_ads_verba_mensal — a verba do mês que o cliente separou para o Google (a da Meta mora em
--     ad_accounts.monthly_budget). Sem ela, o ritmo do mês aparece como "sem verba", nunca como "no ritmo".
--   · google_ads_campanha_estado — retrato de cada campanha (status, orçamento do dia, parcela de impressões e a
--     parcela PERDIDA por orçamento × por classificação, últimos 7 dias). Uma linha por campanha, refeita a cada leitura.
--   · google_perfil_resumo + google_perfil_avaliacao — nota, total e as avaliações recentes do Perfil da Empresa
--     (My Business API v4, reviews). É de onde sai a fila "avaliação sem resposta".
--
-- Só ACRESCENTA: nada existente muda. Tabelas com RLS ligado e sem policy: só o servidor (service role) lê.
-- O código pergunta se as colunas/tabelas existem antes de usá-las (lib/google/colunas.ts): subir o código antes desta
-- migração não quebra nada — as partes novas aparecem como "aguardando a migração".

alter table public.clients
  add column if not exists google_ads_verba_mensal numeric(12,2);

comment on column public.clients.google_ads_verba_mensal is 'Verba mensal do cliente para o Google Ads (R$) — Tráfego › Google Ads';

create table if not exists public.google_ads_campanha_estado (
  customer_id            text not null,
  campaign_id            text not null,
  campanha               text,
  canal                  text,              -- SEARCH, PERFORMANCE_MAX, DISPLAY, VIDEO...
  status                 text,              -- ENABLED | PAUSED
  status_principal       text,              -- campaign.primary_status (ELIGIBLE, LIMITED, NOT_ELIGIBLE, LEARNING...)
  motivos_status         text[],            -- campaign.primary_status_reasons (BUDGET_CONSTRAINED, HAS_ADS_DISAPPROVED...)
  orcamento_diario       numeric(14,2),     -- campaign_budget.amount_micros / 1e6
  -- Últimos 7 dias. null = o Google não informa (PMax/Display não têm parcela de Pesquisa) — nunca zero.
  impressoes_7d          bigint,
  custo_7d               numeric(14,2),
  parcela_impressoes     numeric(6,4),      -- metrics.search_impression_share (0–1)
  perdida_orcamento      numeric(6,4),      -- metrics.search_budget_lost_impression_share
  perdida_classificacao  numeric(6,4),      -- metrics.search_rank_lost_impression_share
  lido_em                timestamptz not null default now(),
  primary key (customer_id, campaign_id)
);
alter table public.google_ads_campanha_estado enable row level security;

create table if not exists public.google_perfil_resumo (
  local            text primary key,        -- locations/<id>
  conta            text,                    -- accounts/<id> (a v4 das avaliações pede o caminho com a conta)
  nota_media       numeric(3,2),
  total_avaliacoes integer,
  lido_em          timestamptz,
  erro             text                     -- frase pronta quando a leitura das avaliações falha
);
alter table public.google_perfil_resumo enable row level security;

create table if not exists public.google_perfil_avaliacao (
  local          text not null,
  review_id      text not null,
  nota           smallint,                  -- 1 a 5 (null = o Google não mandou a nota)
  comentario     text,
  autor          text,
  criada_em      timestamptz,
  atualizada_em  timestamptz,
  resposta       text,
  respondida_em  timestamptz,
  atualizado_em  timestamptz not null default now(),
  primary key (local, review_id)
);
create index if not exists google_perfil_avaliacao_local_data on public.google_perfil_avaliacao (local, criada_em desc);
alter table public.google_perfil_avaliacao enable row level security;

notify pgrst, 'reload schema';
