-- Monday Traffic Brief (plano V2, adotado; brief 14/09 item 23): toda segunda, cinco linhas por
-- conta + uma proposta concreta ("posso mandar para o designer?"). O gestor responde "pode" no
-- grupo e a demanda nasce — a proposta fica aqui para o inbound saber o que "pode" significa.
create table if not exists public.traffic_briefs (
  id uuid primary key default gen_random_uuid(),
  semana date not null,
  texto text not null,
  contas jsonb not null,
  proposta jsonb,
  enviado_whatsapp boolean not null default false,
  msg_id text,
  estado text not null default 'aberto' check (estado in ('aberto','aprovado','recusado','expirado')),
  decidido_por text,
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_traffic_briefs_semana on public.traffic_briefs (semana desc);
create index if not exists idx_traffic_briefs_msg on public.traffic_briefs (msg_id) where msg_id is not null;
alter table public.traffic_briefs enable row level security;
drop policy if exists traffic_briefs_leitura on public.traffic_briefs;
create policy traffic_briefs_leitura on public.traffic_briefs for select to authenticated using (true);
notify pgrst, 'reload schema';
