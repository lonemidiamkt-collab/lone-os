-- Geração de arte por IA com a identidade do cliente (Roberto, 14/09 à noite: "saiu nada com nada").
-- ia_geracoes = cada geração, com o que entrou (logo? quantas artes de estilo? textos?) e o veredito
-- do designer (serviu / não serviu + motivo) — é o dado que calibra o prompt por cliente.
-- clients.ia_instrucoes = instruções fixas da equipe para a IA daquele cliente ("logo sempre no canto
-- superior direito", "preço em selo amarelo"), somadas ao estilo lido das artes.
create table if not exists public.ia_geracoes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  design_request_id uuid,
  ad_id text,
  origem text not null,
  prompt text not null,
  entradas jsonb not null default '{}'::jsonb,
  urls text[] not null default '{}',
  modelo text not null default 'gpt-image-1',
  qualidade text not null default 'medium',
  ms integer,
  created_by text,
  created_at timestamptz not null default now(),
  feedback text check (feedback in ('serviu','nao_serviu')),
  feedback_motivo text,
  feedback_por text,
  feedback_em timestamptz
);
create index if not exists idx_ia_geracoes_client on public.ia_geracoes (client_id, created_at desc);
create index if not exists idx_ia_geracoes_request on public.ia_geracoes (design_request_id);
alter table public.ia_geracoes enable row level security;
drop policy if exists ia_geracoes_leitura on public.ia_geracoes;
create policy ia_geracoes_leitura on public.ia_geracoes for select to authenticated using (true);
alter table public.clients add column if not exists ia_instrucoes text;
notify pgrst, 'reload schema';
