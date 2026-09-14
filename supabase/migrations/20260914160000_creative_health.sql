-- Fase 2 do Lone Agent V2 (14/09/2026): estado de saúde por criativo, por dia — em SHADOW.
-- lib/traffic/creative-health.ts decide (função pura, multi-métrica); esta tabela guarda o
-- histórico para (a) a máquina de estados ter "estado anterior", (b) o Julio rotular os 14 dias de
-- shadow e (c) medir precisão antes de ligar no feed. Nada daqui vira recomendação ainda.
create table if not exists public.creative_health (
  ad_id text not null,
  data date not null,
  client_id uuid,
  meta_ad_account_id text,
  ad_name text,
  estado text not null,
  severidade integer not null default 0,
  confianca numeric(3,2) not null default 0,
  sinais jsonb,
  evidencias text[],
  amostra jsonb,
  baseline jsonb,
  vencedor boolean not null default false,
  vencedor_evidencias text[],
  -- rótulo humano do shadow: o Julio diz se concorda (precisão ≥ 0,8 é o portão de saída)
  rotulo text check (rotulo in ('concordo','discordo','sem_opiniao')),
  rotulado_por text,
  rotulado_em timestamptz,
  created_at timestamptz not null default now(),
  primary key (ad_id, data)
);
create index if not exists idx_creative_health_client_data on public.creative_health (client_id, data desc);
create index if not exists idx_creative_health_estado on public.creative_health (data desc, estado);
alter table public.creative_health enable row level security;
drop policy if exists creative_health_leitura on public.creative_health;
create policy creative_health_leitura on public.creative_health for select to authenticated using (true);
notify pgrst, 'reload schema';
