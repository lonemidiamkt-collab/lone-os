-- 20261126120000_llm_amostras.sql — leva 1-M (Plano Inteligência), 26/11/2026.
--
-- POR QUE. gpt-4o e gpt-4o-mini saem da API em 14/01/2027. Para trocar sem quebrar agente, cada um é
-- comparado (modelo atual × candidato) com entradas REAIS. O llm_calls só guarda tokens e custo, não o
-- pedido. Com o interruptor agency_settings.ia_amostra ligado (valor N = guardar 1 de cada N chamadas),
-- o chatJson guarda aqui o pedido e a resposta. A comparação roda no próprio servidor (a chave já está
-- lá): texto de cliente não sai do banco.
--
-- Privado: RLS ligada e sem policy — só a service role (servidor) lê e grava. Cada amostra vive 14 dias
-- (o gravador apaga as velhas). A comparação some junto com a amostra (on delete cascade).

create table if not exists public.llm_amostras (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  modelo text not null,
  corpo jsonb not null,
  resposta text,
  ok boolean not null,
  -- false quando o pedido levava imagem embutida (data:), que não é guardada: não dá para reenviar.
  reenviavel boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists llm_amostras_origem_idx on public.llm_amostras (origem, created_at desc);
create index if not exists llm_amostras_criada_idx on public.llm_amostras (created_at);

create table if not exists public.llm_comparacoes (
  id uuid primary key default gen_random_uuid(),
  lote uuid not null,
  amostra_id uuid not null references public.llm_amostras (id) on delete cascade,
  candidato text not null,
  ok boolean not null,
  resposta text,
  erro text,
  duracao_ms integer,
  tokens_prompt integer not null default 0,
  tokens_completion integer not null default 0,
  custo_usd numeric(12,6),
  json_valido boolean,
  -- fração (0–1) dos campos de primeiro nível da resposta atual que saíram iguais no candidato.
  campos_iguais numeric(5,4),
  created_at timestamptz not null default now()
);
create index if not exists llm_comparacoes_lote_idx on public.llm_comparacoes (lote);

alter table public.llm_amostras enable row level security;
alter table public.llm_comparacoes enable row level security;
revoke all on public.llm_amostras from anon, authenticated;
revoke all on public.llm_comparacoes from anon, authenticated;
