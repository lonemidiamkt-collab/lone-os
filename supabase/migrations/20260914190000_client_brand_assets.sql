-- 14/09/2026 — MATERIAIS DA MARCA por cliente: todas as versões da logo (e links de Figma/Drive)
-- num lugar só, para designer e social verem e baixarem. Antes: uma logo por cliente (doc_logo, do
-- onboarding) e 20 de 52 clientes tinham; as variantes ficavam no computador de alguém.
create table if not exists public.client_brand_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  tipo text not null check (tipo in ('logo','logo_variante','marca_dagua','link_figma','link_drive','outro')),
  nome text not null,
  url text not null,
  path text,
  mime text,
  bytes integer,
  largura integer,
  altura integer,
  origem text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_brand_assets_client on public.client_brand_assets (client_id, created_at desc);
alter table public.client_brand_assets enable row level security;
drop policy if exists client_brand_assets_leitura on public.client_brand_assets;
create policy client_brand_assets_leitura on public.client_brand_assets for select to authenticated using (true);
notify pgrst, 'reload schema';
