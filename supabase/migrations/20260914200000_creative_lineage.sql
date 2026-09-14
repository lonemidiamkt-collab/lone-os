-- Lone Creative Intelligence (brief do Roberto, 14/09/2026) — Fase 3 do workflow:
-- "Replicar vencedor → escolher variável → tarefa para o designer", com genealogia.
--   · design_requests ganha origem/pai/variável: a demanda sabe de onde veio.
--   · creative_lineage: a árvore (pai → filho, uma variável por filho). child_ad_id entra quando a
--     variação vai ao ar e é casada com o anúncio na Meta; resultado entra na medição (pai × filho).
--   · creative_attributes: cada criativo como OBJETO (produto, oferta, preço visível, headline, CTA,
--     layout, pessoa, cor, destaque) — extraído por visão para TODOS os anúncios, não só vencedores.
--     É o que permite "Creative Pattern" e a memória em três níveis depois.
alter table public.design_requests add column if not exists origem text not null default 'humano';
alter table public.design_requests add column if not exists parent_ad_id text;
alter table public.design_requests add column if not exists variavel text;
create index if not exists idx_design_requests_parent on public.design_requests (parent_ad_id) where parent_ad_id is not null;

create table if not exists public.creative_lineage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  parent_ad_id text not null,
  parent_hash text,
  child_design_request_id uuid references public.design_requests(id) on delete set null,
  child_ad_id text,
  variavel text not null,
  hipotese text,
  mantem text,
  muda text,
  criado_por text,
  resultado jsonb,
  medido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_creative_lineage_parent on public.creative_lineage (parent_ad_id, created_at desc);
create index if not exists idx_creative_lineage_client on public.creative_lineage (client_id, created_at desc);
alter table public.creative_lineage enable row level security;
drop policy if exists creative_lineage_leitura on public.creative_lineage;
create policy creative_lineage_leitura on public.creative_lineage for select to authenticated using (true);

create table if not exists public.creative_attributes (
  ad_id text not null,
  hash text not null,
  client_id uuid,
  produto text,
  oferta text,
  preco_visivel boolean,
  headline text,
  cta text,
  layout text,
  pessoa boolean,
  cor_predominante text,
  elemento_destaque text,
  texto_na_imagem text,
  formato text,
  tags text[],
  modelo text,
  created_at timestamptz not null default now(),
  primary key (ad_id, hash)
);
create index if not exists idx_creative_attributes_client on public.creative_attributes (client_id);
alter table public.creative_attributes enable row level security;
drop policy if exists creative_attributes_leitura on public.creative_attributes;
create policy creative_attributes_leitura on public.creative_attributes for select to authenticated using (true);
notify pgrst, 'reload schema';
