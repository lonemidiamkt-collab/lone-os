-- NPS DE VERDADE DEPOIS DA REUNIÃO (Leva 6B, E6 — 24/09/2026).
--
-- Depois de uma reunião marcada como realizada, o Agente pergunta ao cliente, no grupo dele, a nota
-- de 0 a 10 (e "o que faria virar 10?" quando a nota é até 8). A resposta é lida pelo inbound e a
-- última nota entra na saúde do cliente (/api/scores, componente "Satisfação").
-- Regras em lib/cs/nps.ts; banco e WhatsApp em lib/cs/nps-server.ts; job em app/api/system/cs-nps.
--
-- POR QUE UMA TABELA NOVA e não a `client_nps`: aquela guardava estrelas dadas pelo PRÓPRIO time
-- (client_id, score, month, rated_by) e nunca teve nota de cliente. Fica como está — nada é apagado.
--
-- O JOB NASCE DESLIGADO: a linha em automation_settings abaixo grava enabled=false. Para ligar, é na
-- Central de Automações (/automations). E mesmo sem esta migration o job não manda nada: a rota exige
-- o job ligado EXPLICITAMENTE (lib/cs/nps-server.ts → npsLigado).
--
-- Idempotente. RLS ligada sem policy: só o service role lê e grava (a resposta do cliente é conversa).

create table if not exists public.cs_nps_pesquisas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- A reunião que motivou a pergunta. Sem FK de propósito: reunião é apagada por deleted_at, e a
  -- pesquisa é histórico do relacionamento, não deve sumir junto.
  meeting_id uuid,
  group_jid text not null,
  status text not null default 'aguardando',
  pergunta text not null,
  perguntado_em timestamptz not null default now(),
  message_id text,
  nota smallint,
  resposta text,
  respondido_em timestamptz,
  respondido_por text,
  motivo_perguntado_em timestamptz,
  motivo_message_id text,
  motivo text,
  motivo_em timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cs_nps_pesquisas_status_check') then
    alter table public.cs_nps_pesquisas add constraint cs_nps_pesquisas_status_check
      check (status in ('aguardando', 'aguardando_motivo', 'respondido', 'sem_resposta', 'falhou'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cs_nps_pesquisas_nota_check') then
    alter table public.cs_nps_pesquisas add constraint cs_nps_pesquisas_nota_check
      check (nota is null or nota between 0 and 10);
  end if;
end $$;

-- Uma pergunta por reunião: duas rodadas cruzadas não perguntam duas vezes.
create unique index if not exists cs_nps_pesquisas_reuniao_unica
  on public.cs_nps_pesquisas (meeting_id) where meeting_id is not null;
-- O inbound procura a pesquisa pendente do grupo a cada mensagem de cliente.
create index if not exists idx_cs_nps_pesquisas_pendente
  on public.cs_nps_pesquisas (group_jid, perguntado_em desc) where status in ('aguardando', 'aguardando_motivo');
create index if not exists idx_cs_nps_pesquisas_cliente
  on public.cs_nps_pesquisas (client_id, perguntado_em desc);

alter table public.cs_nps_pesquisas enable row level security;

comment on table public.cs_nps_pesquisas is
  'NPS pós-reunião perguntado pelo Agente no grupo do cliente (lib/cs/nps.ts). Uma linha por pergunta.';
comment on column public.cs_nps_pesquisas.status is
  'aguardando (nota) → aguardando_motivo (nota até 8, perguntou o que faria virar 10) → respondido | sem_resposta (72h sem nota)';

-- O job cs-nps nasce DESLIGADO na Central de Automações. "on conflict do nothing": se alguém já
-- ligou/desligou antes desta migration rodar de novo, a escolha dele vale.
do $$
begin
  if to_regclass('public.automation_settings') is not null then
    insert into public.automation_settings (job, enabled, updated_by, updated_at)
    values ('cs-nps', false, 'migration 20260924213000 (nasce desligado)', now())
    on conflict (job) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
