-- Avisos falados v2 (05/10/2026) — lib/avisos/regras.ts.
-- Só conta parada e saldo zerado falam, só pra quem cuida da conta (sócio por opção), com teto por
-- dia, horário comercial, uma aba falando e MEDIÇÃO do tempo até a conta voltar (com grupo de controle).
-- Tudo aditivo: a versão anterior do painel continua funcionando com estas colunas a mais.

alter table public.notifications add column if not exists falar boolean not null default false;
alter table public.notifications add column if not exists aviso_id uuid;
comment on column public.notifications.falar is 'Aviso de tráfego que a voz do painel deve falar (decidido no servidor: tipo, teto, horário, teste).';

alter table public.team_members add column if not exists ouvir_avisos boolean;
comment on column public.team_members.ouvir_avisos is 'Voz dos avisos. null = padrão do papel (quem cuida de conta ouve; sócio não).';

create table if not exists public.avisos_trafego (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('conta_parada', 'saldo_zerado')),
  client_id uuid references public.clients(id) on delete cascade,
  meta_account_id text not null,
  dia date not null,
  titulo text not null,
  detectado_em timestamptz not null default now(),
  braco text not null check (braco in ('voz', 'controle')),
  destinatarios text[] not null default '{}',
  falado_para text[] not null default '{}',
  ouvido_em timestamptz,
  ouvido_por text[] not null default '{}',
  resolvido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (tipo, meta_account_id, dia)
);
create index if not exists idx_avisos_trafego_abertos on public.avisos_trafego (tipo, dia) where resolvido_em is null;
alter table public.avisos_trafego enable row level security; -- sem policy: só o servidor (service_role)
comment on table public.avisos_trafego is 'Cada conta parada / saldo zerado: quem recebeu, se a voz tocou e quando resolveu. Medição dos avisos falados.';

notify pgrst, 'reload schema';

-- Voz natural (OpenAI gpt-4o-mini-tts): a mesma frase na mesma voz é gerada UMA vez e servida do
-- cache — "A conta do X parou de rodar" repetida não paga de novo. Base64 porque bytea no PostgREST
-- vira texto hex de qualquer jeito. ~40 KB por frase; volume baixo (dezenas por dia no máximo).
create table if not exists public.avisos_audio (
  chave text primary key,
  voz text not null,
  texto text not null,
  mp3_base64 text not null,
  created_at timestamptz not null default now()
);
alter table public.avisos_audio enable row level security; -- sem policy: só o servidor

notify pgrst, 'reload schema';

-- Lote (05/10, tarde): as ocorrências de uma mesma rodada viram UMA frase; ouvir a frase marca todas.
alter table public.avisos_trafego add column if not exists lote uuid;
create index if not exists idx_avisos_trafego_lote on public.avisos_trafego (lote);

notify pgrst, 'reload schema';
