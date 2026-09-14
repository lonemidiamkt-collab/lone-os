-- Product Library (brief 14/09, item 13): "principalmente para os clientes de construção civil —
-- fotos, marca, código, preço, categoria, descrição; criativos onde apareceu". O designer não
-- procura a foto toda vez; a IA pesquisa referência só quando não existe uma boa aqui.
create table if not exists public.client_products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nome text not null,
  marca text,
  codigo text,
  categoria text,
  preco numeric(12,2),
  descricao text,
  fotos text[] not null default '{}',
  ativo boolean not null default true,
  origem text not null default 'painel',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_products_client on public.client_products (client_id, ativo, nome);
alter table public.client_products enable row level security;
drop policy if exists client_products_leitura on public.client_products;
create policy client_products_leitura on public.client_products for select to authenticated using (true);

-- Semente: os produtos que já estão no briefing estruturado viram linhas (sem foto) — é um começo,
-- não uma lista definitiva. origem='briefing' distingue do que a equipe cadastrar.
insert into public.client_products (client_id, nome, origem, created_by)
select b.client_id, trim(p) as nome, 'briefing', 'migration 20260914220000'
  from public.client_briefings b, unnest(b.produtos) as p
 where b.is_current = true and length(trim(p)) between 2 and 120
   and not exists (select 1 from public.client_products cp where cp.client_id = b.client_id and lower(cp.nome) = lower(trim(p)));
notify pgrst, 'reload schema';
