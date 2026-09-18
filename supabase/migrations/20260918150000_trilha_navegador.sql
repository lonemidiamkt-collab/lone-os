-- Trilha do navegador PERSISTIDA (18/09): ia para o stdout do container e cada deploy apagava.
create table if not exists public.trilha_navegador (
  id bigserial primary key,
  quem text,
  pagina text,
  acao text not null,
  detalhe jsonb,
  tipo text not null default 'trilha',
  created_at timestamptz not null default now()
);
create index if not exists idx_trilha_navegador_quando on public.trilha_navegador (created_at desc);
create index if not exists idx_trilha_navegador_quem on public.trilha_navegador (quem, created_at desc);
alter table public.trilha_navegador enable row level security;
notify pgrst, 'reload schema';
