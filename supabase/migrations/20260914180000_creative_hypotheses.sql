-- Fase 2 (14/09/2026): o que o vencedor tem (fato), por que pode ter funcionado (hipótese), duas
-- variações e o roteiro pronto — uma análise por versão do criativo vencedor. Em sombra: aparece
-- em Tráfego › Saúde dos Criativos, não vira demanda nem mensagem até a fase 3.
create table if not exists public.creative_hypotheses (
  id uuid primary key default gen_random_uuid(),
  ad_id text not null,
  hash text not null,
  client_id uuid,
  data date not null,
  resultado jsonb,
  elementos jsonb not null,
  hipoteses jsonb not null,
  variacoes jsonb not null,
  resumo text,
  roteiros jsonb,
  modelo text,
  created_at timestamptz not null default now(),
  unique (ad_id, hash)
);
create index if not exists idx_creative_hypotheses_client on public.creative_hypotheses (client_id, data desc);
alter table public.creative_hypotheses enable row level security;
drop policy if exists creative_hypotheses_leitura on public.creative_hypotheses;
create policy creative_hypotheses_leitura on public.creative_hypotheses for select to authenticated using (true);
notify pgrst, 'reload schema';
