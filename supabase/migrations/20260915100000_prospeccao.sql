-- Piloto SDR Lone — agente de prospecção B2B (Roberto, 15/09/2026).
--
-- O Supabase é o CRM de verdade: uma linha por empresa em `prospects`, cada mensagem em
-- `prospect_messages`, cada mudança de etapa em `prospect_events` (regra §27: nunca sobrescrever
-- histórico). A planilha do Google é ESPELHO, nunca fonte. O piloto é uma entidade
-- (`prospect_campanhas`): 30 dias, 10 novas abordagens/dia, desliga sozinho no fim e só o Roberto
-- reativa.

create table if not exists public.prospect_campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  iniciado_em timestamptz,
  termina_em timestamptz,
  duracao_dias integer not null default 30,
  limite_dia integer not null default 10,
  auto_stop boolean not null default true,
  janela_abordagem jsonb not null default '{"ini":"09:00","fim":"11:00"}'::jsonb,
  janela_resposta jsonb not null default '{"ini":"09:00","fim":"18:00"}'::jsonb,
  finalizado_em timestamptz,
  finalizado_motivo text,
  reativado_em timestamptz,
  reativado_por text,
  relatorio_final jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prospect_campanhas_status on public.prospect_campanhas (status, created_at desc);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid references public.prospect_campanhas(id) on delete set null,
  -- empresa
  nome text not null,
  razao_social text,
  cnpj text,
  cnae text,
  cnae_descricao text,
  segmento text,
  cidade text,
  uf text,
  endereco text,
  cep text,
  lat double precision,
  lng double precision,
  distancia_km numeric(7,1),
  modalidade_preferida text check (modalidade_preferida in ('visita','online')),
  site text,
  instagram text,
  telefone text,
  whatsapp_jid text,
  whatsapp_lid text,
  whatsapp_verificado boolean,
  email text,
  google_maps_url text,
  google_nota numeric(3,1),
  google_avaliacoes integer,
  unidades integer,
  porte text,
  capital_social numeric(14,2),
  abertura date,
  -- de onde veio cada campo (campo -> fonte). §8: "sempre registrar a origem de cada informação".
  fontes jsonb not null default '{}'::jsonb,
  dados_cnpj jsonb,
  presenca jsonb,
  -- {faixa, confianca, is_estimate, sinais[]} — estimativa NUNCA vira número "de fato" (§19/§20).
  faturamento_sinal jsonb,
  diagnostico jsonb,
  score integer,
  score_detalhe jsonb,
  classe text check (classe in ('A','B','C','NP')),
  -- decisor
  decisor_nome text,
  decisor_cargo text,
  decisor_confianca numeric(3,2),
  decisor_fontes text[],
  decisor_telefone text,
  decisor_instagram text,
  -- máquina de estados + pipeline 01–17 derivado
  estagio text not null default 'descoberto',
  etapa_pipeline text,
  owner text not null default 'SDR_AI' check (owner in ('SDR_AI','ROBERTO')),
  modo_agente text not null default 'ativo' check (modo_agente in ('ativo','observacao','pausado')),
  pausado_ate timestamptz,
  precisa_humano boolean not null default false,
  motivo_humano text,
  -- regra de ouro (§33): lead ativo sempre com próxima ação
  next_action_type text,
  next_action_at timestamptz,
  next_action_owner text,
  next_action_reason text,
  ultima_interacao_em timestamptz,
  ultima_msg_de text,
  followups integer not null default 0,
  cadencia_cancelada boolean not null default false,
  contexto_comercial jsonb not null default '{}'::jsonb,
  objecoes text[] not null default '{}',
  -- presente (§12): só se reservado é que a mensagem pode citar
  gift_reserved boolean not null default false,
  gift_type text,
  gift_status text,
  -- reunião
  reuniao_em timestamptz,
  reuniao_tipo text check (reuniao_tipo in ('visita','online')),
  meeting_id uuid,
  google_event_id text,
  meet_url text,
  crm_lead_id uuid,
  resultado_reuniao text,
  motivo_perda text,
  variante_abordagem text,
  primeira_abordagem_em timestamptz,
  ranking_dia date,
  ranking_pos integer,
  quality_gate jsonb,
  origem text,
  origem_query text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_prospects_cnpj on public.prospects (cnpj) where cnpj is not null;
create index if not exists idx_prospects_estagio on public.prospects (estagio);
create index if not exists idx_prospects_classe on public.prospects (classe, score desc);
create index if not exists idx_prospects_cidade on public.prospects (cidade);
create index if not exists idx_prospects_jid on public.prospects (whatsapp_jid) where whatsapp_jid is not null;
create index if not exists idx_prospects_lid on public.prospects (whatsapp_lid) where whatsapp_lid is not null;
create index if not exists idx_prospects_next_action on public.prospects (next_action_at) where next_action_at is not null;
create index if not exists idx_prospects_ranking on public.prospects (ranking_dia, ranking_pos);
create index if not exists idx_prospects_campanha on public.prospects (campanha_id);

create table if not exists public.prospect_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  direcao text not null check (direcao in ('in','out')),
  autor text not null check (autor in ('prospect','agente','humano')),
  texto text not null,
  message_id text,
  intent jsonb,
  estagio_antes text,
  estagio_depois text,
  enviado boolean not null default true,
  erro text,
  correlation_id uuid,
  dia date not null,
  eh_primeira_abordagem boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_prospect_messages_msgid on public.prospect_messages (message_id) where message_id is not null;
create index if not exists idx_prospect_messages_prospect on public.prospect_messages (prospect_id, created_at);
create index if not exists idx_prospect_messages_dia on public.prospect_messages (dia) where eh_primeira_abordagem;

create table if not exists public.prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  tipo text not null,
  de text,
  para text,
  motivo text,
  mensagem text,
  responsavel text,
  proxima_acao text,
  detalhe jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_prospect_events_prospect on public.prospect_events (prospect_id, created_at);
create index if not exists idx_prospect_events_tipo on public.prospect_events (tipo, created_at desc);

create table if not exists public.prospect_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid,
  provider text not null,
  query text,
  segmento text,
  cidade text,
  achados integer not null default 0,
  novos integer not null default 0,
  duplicados integer not null default 0,
  excluidos integer not null default 0,
  erro text,
  created_at timestamptz not null default now()
);
create index if not exists idx_prospect_discovery_runs_created on public.prospect_discovery_runs (created_at desc);

-- §34: métricas do dia, recalculadas pelo relatório das 18:30 (idempotente por dia).
create table if not exists public.prospect_daily_metrics (
  dia date not null,
  campanha_id uuid,
  encontrados integer not null default 0,
  icp_aprovados integer not null default 0,
  abordados integer not null default 0,
  respostas integer not null default 0,
  decisores integer not null default 0,
  interessados integer not null default 0,
  reunioes_online integer not null default 0,
  visitas integer not null default 0,
  realizadas integer not null default 0,
  no_shows integer not null default 0,
  propostas integer not null default 0,
  vendas integer not null default 0,
  followups integer not null default 0,
  opt_outs integer not null default 0,
  sem_interesse integer not null default 0,
  custo_usd numeric(12,6) not null default 0,
  tempo_medio_resposta_min integer,
  melhor_lead jsonb,
  detalhe jsonb,
  created_at timestamptz not null default now(),
  primary key (dia, campanha_id)
);

-- Reunião do prospect entra na MESMA agenda do time (conflito de horário do Roberto é checado ali).
alter table public.meetings alter column client_id drop not null;
alter table public.meetings add column if not exists prospect_id uuid references public.prospects(id) on delete set null;
alter table public.meetings add column if not exists google_event_id text;
alter table public.meetings add column if not exists meet_url text;
create index if not exists idx_meetings_prospect on public.meetings (prospect_id) where prospect_id is not null;

-- Reunião marcada vira lead no funil comercial (origem "Prospecção ativa").
alter table public.crm_leads add column if not exists prospect_id uuid references public.prospects(id) on delete set null;

-- RLS: gestão lê; escrita só pelo service_role (BFF).
alter table public.prospect_campanhas enable row level security;
alter table public.prospects enable row level security;
alter table public.prospect_messages enable row level security;
alter table public.prospect_events enable row level security;
alter table public.prospect_discovery_runs enable row level security;
alter table public.prospect_daily_metrics enable row level security;
drop policy if exists prospect_campanhas_gestao on public.prospect_campanhas;
create policy prospect_campanhas_gestao on public.prospect_campanhas for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));
drop policy if exists prospects_gestao on public.prospects;
create policy prospects_gestao on public.prospects for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));
drop policy if exists prospect_messages_gestao on public.prospect_messages;
create policy prospect_messages_gestao on public.prospect_messages for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));
drop policy if exists prospect_events_gestao on public.prospect_events;
create policy prospect_events_gestao on public.prospect_events for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));
drop policy if exists prospect_discovery_runs_gestao on public.prospect_discovery_runs;
create policy prospect_discovery_runs_gestao on public.prospect_discovery_runs for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));
drop policy if exists prospect_daily_metrics_gestao on public.prospect_daily_metrics;
create policy prospect_daily_metrics_gestao on public.prospect_daily_metrics for select to authenticated
  using (auth.user_role() = any (array['admin','manager','service_role']));

notify pgrst, 'reload schema';
