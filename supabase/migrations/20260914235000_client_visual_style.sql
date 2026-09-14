-- Item 12 do brief (14/09): print do Instagram/feed interpretado por visão → estilo visual do
-- cliente (paleta, tipografia, composição, elementos recorrentes) guardado como parte do DNA.
-- Manual (a equipe sobe o print) hoje; a coleta automática do IG já existe em client_ig_snapshots.
create table if not exists public.client_visual_style (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  fonte text not null default 'print',
  imagens text[] not null default '{}',
  analise jsonb not null,
  resumo text,
  modelo text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_visual_style_client on public.client_visual_style (client_id, created_at desc);
alter table public.client_visual_style enable row level security;
drop policy if exists client_visual_style_leitura on public.client_visual_style;
create policy client_visual_style_leitura on public.client_visual_style for select to authenticated using (true);
-- prévias de imagem por hipótese (gestor pede antes de mandar pro designer)
alter table public.creative_hypotheses add column if not exists previas jsonb;
notify pgrst, 'reload schema';
