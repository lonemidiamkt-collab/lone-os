-- Creative Intelligence — medir filho × pai (14/09/2026).
-- phash na arte entregue e no anúncio: é assim que o sistema descobre sozinho que a arte que o
-- designer entregou é o anúncio que subiu na Meta. Com o elo, a variação (creative_lineage) ganha
-- child_ad_id e o resultado pode ser comparado ao do pai. creative_learnings guarda o veredito por
-- cliente (nível 1) — segmento e Lone saem por agregação.
alter table public.creative_snapshots add column if not exists phash text;
alter table public.creative_snapshots add column if not exists design_request_id uuid;
alter table public.creative_snapshots add column if not exists content_card_id uuid;
alter table public.creative_snapshots add column if not exists casado_em timestamptz;
create index if not exists idx_creative_snapshots_phash on public.creative_snapshots (phash) where phash is not null;
alter table public.card_attachments add column if not exists phash text;
create index if not exists idx_card_attachments_phash on public.card_attachments (phash) where phash is not null;

create table if not exists public.creative_learnings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  nicho text,
  lineage_id uuid references public.creative_lineage(id) on delete set null,
  variavel text not null,
  hipotese text,
  veredito text not null check (veredito in ('validada','refutada','inconclusiva')),
  evidencia jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_creative_learnings_client on public.creative_learnings (client_id, created_at desc);
alter table public.creative_learnings enable row level security;
drop policy if exists creative_learnings_leitura on public.creative_learnings;
create policy creative_learnings_leitura on public.creative_learnings for select to authenticated using (true);
notify pgrst, 'reload schema';
