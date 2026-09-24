-- PRÓXIMA AÇÃO PREENCHIDA PELO SISTEMA (Leva 6A, 25/09/2026).
--
-- Só 7 de 60 clientes tinham "próxima ação" escrita à mão na Jornada CS. O feed de prioridades do
-- Agente (tabela recommendations) já calcula a coisa mais importante a fazer por cliente; agora ela
-- vira a próxima ação SUGERIDA de cada cliente, e a pessoa só confirma ou edita
-- (lib/clientes/proxima-acao.ts). Aqui fica o "quem confirmou, quando, e de qual recomendação".
--
-- O texto continua em client_journey.proxima_acao (+ responsável e prazo, que já existiam).
-- Idempotente: pode rodar de novo sem erro. Sem esta migration a tela funciona — só não guarda
-- quem/quando confirmou.

-- A tabela foi criada à mão em produção (docs/cs-jornada-plano.md §4) e nunca teve migration: o
-- "if not exists" deixa esta migration de pé sozinha num banco novo e não mexe no de produção.
create table if not exists public.client_journey (
  client_id uuid primary key references public.clients(id) on delete cascade,
  estado text,
  proxima_acao text,
  proxima_acao_responsavel text,
  proxima_acao_prazo date,
  pendencias_cliente jsonb,
  ultima_reuniao date,
  proxima_reuniao date,
  notas text,
  risco_cache jsonb,
  updated_at timestamptz default now(),
  updated_by text
);

-- "manual" = alguém escreveu a própria; "sugerida" = confirmou a do sistema. NULL = gravada antes.
alter table public.client_journey add column if not exists proxima_acao_origem text;
alter table public.client_journey add column if not exists proxima_acao_confirmada_por text;
alter table public.client_journey add column if not exists proxima_acao_confirmada_em timestamptz;
-- Fingerprint da recomendação confirmada (recommendations.fingerprint): continua o mesmo enquanto o
-- problema durar, então a tela sabe se a sugestão atual é a mesma que foi confirmada.
alter table public.client_journey add column if not exists proxima_acao_fingerprint text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_journey_proxima_acao_origem_check'
  ) then
    alter table public.client_journey
      add constraint client_journey_proxima_acao_origem_check
      check (proxima_acao_origem is null or proxima_acao_origem in ('manual', 'sugerida'));
  end if;
end $$;

-- O app lê e grava com o service role; ninguém lê direto (a nota de handoff do comercial mora aqui).
alter table public.client_journey enable row level security;

comment on column public.client_journey.proxima_acao_origem is 'manual = escrita por alguém; sugerida = confirmada a partir do feed de prioridades (lib/clientes/proxima-acao.ts).';
comment on column public.client_journey.proxima_acao_confirmada_por is 'Nome (team_members) de quem confirmou ou escreveu a próxima ação.';
comment on column public.client_journey.proxima_acao_confirmada_em is 'Quando a próxima ação foi confirmada ou escrita.';
comment on column public.client_journey.proxima_acao_fingerprint is 'recommendations.fingerprint da sugestão confirmada (null quando escrita à mão).';

notify pgrst, 'reload schema';
