-- Fase 2 do Lone Agent V2 (14/09/2026), base: O CRIATIVO de cada anúncio, guardado.
-- Nenhuma tabela tinha miniatura, texto, tipo ou vídeo do anúncio — só métrica. A Meta entrega tudo
-- isso com o token atual (testado: object_type, thumbnail 1080×1080, video_id, body, title, CTA).
-- Uma linha por (anúncio, versão do criativo): mudou o texto ou o vídeo, nasce outra linha; a
-- mesma versão só atualiza a miniatura (URL assinada, vence em dias) e o capturado_em.
create table if not exists public.creative_snapshots (
  ad_id text not null,
  hash text not null,
  client_id uuid,
  meta_ad_account_id text,
  ad_name text,
  effective_status text,
  creative_id text,
  tipo text,
  thumb_url text,
  image_url text,
  video_id text,
  body text,
  title text,
  cta text,
  asset_feed_spec jsonb,
  primeira_vez timestamptz not null default now(),
  capturado_em timestamptz not null default now(),
  primary key (ad_id, hash)
);
create index if not exists idx_creative_snapshots_client on public.creative_snapshots (client_id, capturado_em desc);
create index if not exists idx_creative_snapshots_ad on public.creative_snapshots (ad_id, capturado_em desc);
alter table public.creative_snapshots enable row level security;
drop policy if exists creative_snapshots_leitura on public.creative_snapshots;
create policy creative_snapshots_leitura on public.creative_snapshots for select to authenticated using (true);
notify pgrst, 'reload schema';
