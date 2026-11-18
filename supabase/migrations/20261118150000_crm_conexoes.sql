-- CRM DO CLIENTE NOS RELATÓRIOS (18/11/2026) — lib/crm-externo/, docs/CRM_INTEGRACOES.md
--
-- Pedido do Roberto: "preparar o nosso sistema para ter API de integração com esses outros CRMs. Pode ser o
-- Kommo, pode ser qualquer outro" — e as métricas (tempo de resposta, ciclo, vendas, orçamentos, etapas do funil)
-- entrando no relatório semanal, no mensal e no painel de resultados do cliente quando estiver conectado.
--
-- Três jeitos de conectar, uma tabela:
--   ancora     — Âncora CRM, pela porta de parceiro (assinatura HMAC; o segredo é de AMBIENTE, nunca daqui).
--                Nasce sozinha quando o cliente se cadastra pelo link do Lone OS (origem 'automatica').
--   kommo      — API v4 do Kommo: subdomínio em `config`, token de longa duração CIFRADO em `segredo`
--                (AES-256-GCM, VAULT_KEY — lib/crypto/vault.ts).
--   api_aberta — qualquer outro CRM (ou n8n/Make): manda eventos para POST /api/crm-externo/eventos com o
--                token da conexão. Do token só o HASH fica aqui; o token aparece uma vez, na hora de gerar.
--
-- Uma conexão por cliente (unique client_id): o relatório lê um CRM só, sem somar dois sistemas.
-- RLS ligada e SEM policy: só o servidor (service role) lê e escreve.
--
-- Reverter: drop table public.crm_leituras, public.crm_eventos, public.crm_conexoes;

create table if not exists public.crm_conexoes (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null unique references public.clients(id) on delete cascade,
  provedor          text not null check (provedor in ('ancora', 'kommo', 'api_aberta')),
  ativa             boolean not null default true,
  -- kommo: { subdominio, funil_id?, etapa_orcamento_id? }. NUNCA segredo aqui.
  config            jsonb not null default '{}'::jsonb,
  -- kommo: token cifrado (v1:iv:tag:ct)
  segredo           text,
  -- api_aberta: sha256 hex do token; o prefixo é só para a tela reconhecer qual token está valendo
  token_hash        text unique,
  token_prefixo     text,
  origem            text not null default 'manual' check (origem in ('manual', 'automatica')),
  criado_em         timestamptz not null default now(),
  criado_por        text,
  atualizado_em     timestamptz not null default now(),
  ultima_leitura_em timestamptz,
  ultimo_erro       text
);
comment on table public.crm_conexoes is 'CRM de cada cliente para o relatório e o portal (lib/crm-externo). Segredo só cifrado; token só em hash.';

create table if not exists public.crm_eventos (
  conexao_id      uuid not null references public.crm_conexoes(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  -- id do evento no sistema de lá: reenviar o mesmo evento não conta duas vezes
  id_externo      text not null,
  tipo            text not null check (tipo in ('lead', 'resposta', 'orcamento', 'venda', 'perda', 'etapa')),
  ocorreu_em      timestamptz not null,
  -- id OPACO do negócio/lead no CRM de lá (nunca telefone, e-mail ou nome — a rota recusa)
  negocio_ref     text,
  valor_centavos  bigint check (valor_centavos is null or valor_centavos >= 0),
  -- resposta: segundos entre a chegada do lead e a primeira resposta
  segundos        integer check (segundos is null or segundos >= 0),
  -- etapa: para qual etapa do funil o negócio foi
  etapa           text,
  recebido_em     timestamptz not null default now(),
  primary key (conexao_id, id_externo)
);
create index if not exists crm_eventos_cliente_dia on public.crm_eventos (client_id, ocorreu_em);
create index if not exists crm_eventos_negocio on public.crm_eventos (conexao_id, negocio_ref, ocorreu_em);
comment on table public.crm_eventos is 'Eventos recebidos pela API aberta de CRM (POST /api/crm-externo/eventos). Sem dado pessoal.';

-- Cache curto das leituras (portal é público: não bate no CRM do cliente a cada visita).
create table if not exists public.crm_leituras (
  conexao_id  uuid not null references public.crm_conexoes(id) on delete cascade,
  de          date not null,
  ate         date not null,
  metricas    jsonb not null,
  lido_em     timestamptz not null default now(),
  primary key (conexao_id, de, ate)
);

alter table public.crm_conexoes enable row level security;
alter table public.crm_eventos  enable row level security;
alter table public.crm_leituras enable row level security;
