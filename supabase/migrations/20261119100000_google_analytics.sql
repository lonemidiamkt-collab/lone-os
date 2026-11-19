-- 20261119100000_google_analytics.sql — Google Analytics (GA4) do site do cliente no painel de resultados
-- (aba Google › "Seu site"). Mesma conexão de marketing do Google Ads e do Perfil (lib/google/marketing-auth.ts),
-- com o escopo analytics.readonly a mais.
--
-- Roberto (18/11/2026): "essa métrica [...] já no Analytics" — quantas pessoas visitaram o site e clicaram no botão do
-- WhatsApp / ligaram / mandaram formulário pelo site. Clique, não "conversão".
--
-- Como os números chegam: a mesma rotina diária (POST /api/system/google-sync) lê a Data API do GA4 e GRAVA DIA A DIA
-- aqui (lib/google/analytics-api.ts + sincronizar.ts). O painel lê daqui, nunca do Google ao vivo.
--
-- Só ACRESCENTA: nada existente muda. Tabelas com RLS ligado e sem policy: só o servidor (service role) lê.

alter table public.clients
  add column if not exists google_analytics_propriedade text,   -- "properties/123456789"
  add column if not exists google_analytics_nome        text;

comment on column public.clients.google_analytics_propriedade is 'Propriedade do Google Analytics 4 do site do cliente (properties/<id>) — lib/google/analytics-api.ts';

alter table public.google_sincronia
  add column if not exists analytics_sincronizado_em timestamptz,
  add column if not exists analytics_erro            text;

-- Visitas por dia e por canal (de onde a pessoa veio: Busca orgânica, Anúncio no Google, Redes sociais, Direto...).
-- Chave pela PROPRIEDADE (não pelo cliente): trocar a propriedade do cliente não mistura números.
create table if not exists public.google_analytics_dia (
  propriedade        text not null,
  dia                date not null,
  canal              text not null,        -- sessionDefaultChannelGroup, como o GA4 devolve ("Organic Search", "Direct"...)
  sessoes            integer not null default 0,   -- visitas
  sessoes_engajadas  integer not null default 0,   -- visitas de verdade (10 s+, 2 páginas ou uma ação)
  visualizacoes      integer not null default 0,   -- páginas vistas
  novos_usuarios     integer not null default 0,   -- pessoas que entraram pela 1ª vez (somável entre dias)
  atualizado_em      timestamptz not null default now(),
  primary key (propriedade, dia, canal)
);
create index if not exists google_analytics_dia_prop_dia on public.google_analytics_dia (propriedade, dia);
alter table public.google_analytics_dia enable row level security;

-- Eventos por dia. Duas leituras gravadas aqui:
--   · evento × dia (link = ''): os eventos do site (generate_lead, form_submit, clique_whatsapp...);
--   · clique em link × dia (evento = 'click'): só os links de WhatsApp (wa.me) e de telefone (tel:).
-- O que é "clique no WhatsApp", "ligação" ou "formulário" é decidido na leitura (lib/google/relatorio.ts, acaoDoEvento).
create table if not exists public.google_analytics_evento_dia (
  propriedade    text not null,
  dia            date not null,
  evento         text not null,
  link           text not null default '',
  contagem       integer not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (propriedade, dia, evento, link)
);
create index if not exists google_analytics_evento_dia_prop_dia on public.google_analytics_evento_dia (propriedade, dia);
alter table public.google_analytics_evento_dia enable row level security;

-- Sugestões de vínculo agora também para o Analytics.
alter table public.google_sugestoes drop constraint if exists google_sugestoes_tipo_check;
alter table public.google_sugestoes add constraint google_sugestoes_tipo_check check (tipo in ('ads', 'perfil', 'analytics'));
