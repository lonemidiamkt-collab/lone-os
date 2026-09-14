-- Fase 1 do Lone Agent V2 (14/09/2026): RECOMENDAÇÃO É ENTIDADE, não mensagem.
-- Uma linha por coisa a fazer, com fonte, evidência, dono, score comparável e estado. O feed em
-- /agente e o "Lone, o que preciso fazer hoje?" leem daqui. Aberta = nova/vista/aceita; a mesma
-- coisa (fingerprint) não entra duas vezes enquanto estiver aberta.
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  fonte text not null,
  client_id uuid,
  cliente text not null,
  entity_ref text,
  motivo text not null,
  titulo text not null,
  fato text[] not null,
  inferencia text[],
  hipotese text,
  recomendacao text not null,
  acao_proposta jsonb,
  severidade integer not null,
  urgencia integer not null,
  confianca numeric(3,2) not null,
  exposicao_rs numeric(12,2),
  reversivel boolean not null default true,
  score numeric(6,1) not null,
  explicacao_score jsonb,
  nivel_policy text not null default 'B',
  owner_role text not null,
  owner text,
  estado text not null default 'nova' check (estado in ('nova','vista','aceita','ignorada','incorreta','executada','resolvida','expirada')),
  decidido_por text,
  decidido_em timestamptz,
  motivo_decisao text,
  resultado text,
  medido_em timestamptz,
  correlation_id uuid,
  vezes_reportada integer not null default 1,
  primeira_vez timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolvida_em timestamptz
);
create unique index if not exists idx_recommendations_aberta on public.recommendations (fingerprint) where estado in ('nova','vista','aceita');
create index if not exists idx_recommendations_estado_score on public.recommendations (estado, score desc);
create index if not exists idx_recommendations_owner on public.recommendations (owner, estado);
create index if not exists idx_recommendations_client on public.recommendations (client_id, estado);
alter table public.recommendations enable row level security;
drop policy if exists recommendations_leitura on public.recommendations;
create policy recommendations_leitura on public.recommendations for select to authenticated using (true);
notify pgrst, 'reload schema';
