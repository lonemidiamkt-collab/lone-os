-- Reuniões de VENDA do Comercial (out/2026): marcar pela Agenda, pela ficha ou pelo Loninho do grupo de vendas,
-- com evento no Google Agenda da Lone (Meet quando é online), aviso no grupo de vendas e lembretes na véspera
-- (9h) e 1 hora antes. Tabela PRÓPRIA, separada de `meetings` (reuniões com CLIENTE, que aparecem em seis telas
-- da equipe e alimentam o indicador de cobertura): a reunião de venda tem nome de prospect e negociação e é
-- só dos sócios. RLS ligado sem política: só o servidor (service role) lê e escreve.
begin;

create table if not exists public.crm_reunioes (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.crm_leads(id) on delete cascade,
  inicio              timestamptz not null,
  fim                 timestamptz not null,
  formato             text not null default 'meet' check (formato in ('meet', 'presencial', 'ligacao')),
  local               text,
  convidados          text[] not null default '{}',
  pauta               text,
  estado              text not null default 'agendada' check (estado in ('agendada', 'realizada', 'nao_veio', 'cancelada')),
  resultado           text,
  google_event_id     text,
  meet_url            text,
  html_link           text,
  criado_por          text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  lembrete_vespera_em timestamptz,
  lembrete_hora_em    timestamptz,
  constraint crm_reunioes_fim_depois check (fim > inicio)
);
comment on table public.crm_reunioes is 'Reuniões de venda do Comercial (privadas dos sócios). Evento no Google Agenda da Lone; lembretes no grupo de vendas.';

create index if not exists crm_reunioes_inicio on public.crm_reunioes (inicio);
create index if not exists crm_reunioes_lead on public.crm_reunioes (lead_id);
-- Duplo clique no "Marcar" não cria duas: uma reunião agendada por lead e horário.
create unique index if not exists crm_reunioes_unica on public.crm_reunioes (lead_id, inicio) where estado = 'agendada';

alter table public.crm_reunioes enable row level security;
revoke all on public.crm_reunioes from anon, authenticated;

commit;
notify pgrst, 'reload schema';
