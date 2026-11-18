-- 20261118120000_google_relatorios.sql — Google Ads e Perfil da Empresa (Google Meu Negócio) nos relatórios
-- semanal e mensal e no painel de resultados do cliente (lib/google/).
--
-- Roberto (18/11/2026): "nos relatórios semanais, mensal, e nos painéis de resultados dos clientes eu preciso
-- [...] os clientes que têm anúncio no Google [...] não só dos anúncios como do Google Meu Negócio, como
-- ligações, rotas de endereços que foram solicitadas, entradas em site".
--
-- Como os números chegam: uma rotina diária (POST /api/system/google-sync) lê o Google e GRAVA DIA A DIA aqui.
-- Relatório e painel leem daqui, nunca do Google ao vivo:
--   · o Perfil da Empresa libera os números com dias de atraso — guardado dia a dia, dá para saber até que dia
--     o Google já entregou e não mostrar "zero" onde o Google ainda não respondeu;
--   · a conversão do Google Ads chega depois do clique — a rotina relê os últimos 30 dias todo dia;
--   · o relatório, o PDF e o painel mostram os MESMOS números (mesma leitura, mesma conta).
--
-- Só ACRESCENTA: nada existente muda. Tabelas com RLS ligado e sem policy: só o servidor (service role) lê.

alter table public.clients
  add column if not exists google_ads_customer_id text,   -- só dígitos, sem hífen (1234567890)
  add column if not exists google_ads_nome        text,
  -- a conta de administrador (MCC) por onde o acesso chega; vai no cabeçalho login-customer-id de toda leitura.
  -- null = a conta Google conectada acessa a conta do cliente direto.
  add column if not exists google_ads_login_id    text,
  add column if not exists google_perfil_local    text,   -- "locations/123…"
  add column if not exists google_perfil_nome     text;

comment on column public.clients.google_ads_customer_id is 'Conta do Google Ads do cliente (ID sem hífen) — lib/google/ads-api.ts';
comment on column public.clients.google_perfil_local is 'Perfil da Empresa no Google (locations/<id>) — lib/google/perfil-api.ts';

-- Estado da leitura de cada cliente: quando leu, o que falhou (frase pronta) e até que dia o Perfil já tem número.
create table if not exists public.google_sincronia (
  client_id               uuid primary key references public.clients(id) on delete cascade,
  ads_sincronizado_em     timestamptz,
  ads_erro                text,
  ads_moeda               text,
  perfil_sincronizado_em  timestamptz,
  perfil_erro             text,
  perfil_ultimo_dia       date,
  atualizado_em           timestamptz not null default now()
);
alter table public.google_sincronia enable row level security;

-- Google Ads: campanha × dia. Chave pela CONTA (não pelo cliente): trocar a conta do cliente não mistura números.
create table if not exists public.google_ads_campanha_dia (
  customer_id       text not null,
  campaign_id       text not null,
  dia               date not null,
  campanha          text,
  canal             text,               -- SEARCH, PERFORMANCE_MAX, DISPLAY, VIDEO, LOCAL...
  impressoes        bigint not null default 0,
  cliques           bigint not null default 0,
  custo             numeric(14,2) not null default 0,   -- na moeda da conta (cost_micros / 1e6)
  conversoes        numeric(14,2) not null default 0,   -- coluna "Conversões" do Google Ads
  valor_conversoes  numeric(14,2) not null default 0,
  ligacoes          bigint,                              -- chamadas pelo anúncio (phone_calls); null = o Google não informou
  atualizado_em     timestamptz not null default now(),
  primary key (customer_id, campaign_id, dia)
);
create index if not exists google_ads_campanha_dia_conta_dia on public.google_ads_campanha_dia (customer_id, dia);
alter table public.google_ads_campanha_dia enable row level security;

-- Google Ads: ações de conversão × dia (ligação, rota, WhatsApp/contato, formulário, compra...).
create table if not exists public.google_ads_acao_dia (
  customer_id       text not null,
  dia               date not null,
  categoria         text not null,       -- conversion_action_category (PHONE_CALL_LEAD, GET_DIRECTIONS, CONTACT...)
  acao              text not null,       -- nome da ação de conversão na conta
  conversoes        numeric(14,2) not null default 0,   -- "Conversões" (ações principais)
  todas_conversoes  numeric(14,2) not null default 0,   -- "Todas as conv." (inclui as secundárias, como rotas da PMax)
  atualizado_em     timestamptz not null default now(),
  primary key (customer_id, dia, categoria, acao)
);
create index if not exists google_ads_acao_dia_conta_dia on public.google_ads_acao_dia (customer_id, dia);
alter table public.google_ads_acao_dia enable row level security;

-- Perfil da Empresa: um dia por linha. O Google não manda o zero (campo ausente = 0).
create table if not exists public.google_perfil_dia (
  local                         text not null,
  dia                           date not null,
  impressoes_busca_celular      integer not null default 0,
  impressoes_busca_computador   integer not null default 0,
  impressoes_mapas_celular      integer not null default 0,
  impressoes_mapas_computador   integer not null default 0,
  ligacoes                      integer not null default 0,   -- CALL_CLICKS
  rotas                         integer not null default 0,   -- BUSINESS_DIRECTION_REQUESTS
  cliques_site                  integer not null default 0,   -- WEBSITE_CLICKS
  conversas                     integer not null default 0,   -- BUSINESS_CONVERSATIONS (conversas iniciadas pelo perfil)
  reservas                      integer not null default 0,   -- BUSINESS_BOOKINGS
  cardapio                      integer not null default 0,   -- BUSINESS_FOOD_MENU_CLICKS
  atualizado_em                 timestamptz not null default now(),
  primary key (local, dia)
);
alter table public.google_perfil_dia enable row level security;

-- Perfil da Empresa: termos de busca que mostraram o perfil, por mês. O Google esconde número pequeno:
-- vem `limiar` ("menos de 15") no lugar de `valor`.
create table if not exists public.google_perfil_buscas (
  local          text not null,
  mes            date not null,          -- 1º dia do mês
  termo          text not null,
  valor          integer,
  limiar         integer,
  atualizado_em  timestamptz not null default now(),
  primary key (local, mes, termo)
);
alter table public.google_perfil_buscas enable row level security;

-- Vínculo automático (lib/google/detectar.ts): a rotina diária procura, entre as contas de anúncio e os perfis que a
-- Lone gerencia, os que parecem ser de cada cliente sem vínculo. Certeza alta e escolha única → vincula sozinha.
-- O resto fica aqui como SUGESTÃO para a pessoa confirmar na ficha. Refeita a cada procura.
create table if not exists public.google_sugestoes (
  client_id   uuid not null references public.clients(id) on delete cascade,
  tipo        text not null check (tipo in ('ads', 'perfil')),
  chave       text not null,          -- ID da conta (10 dígitos) ou locations/<id>
  nome        text,
  login_id    text,                   -- MCC por onde a conta chega (só ads)
  motivo      text,                   -- "mesmo nome", "nome parecido", "mesmo telefone"
  criado_em   timestamptz not null default now(),
  primary key (client_id, tipo, chave)
);
alter table public.google_sugestoes enable row level security;
