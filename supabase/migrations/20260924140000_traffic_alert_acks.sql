-- ALERTAS DE TRÁFEGO: "VISTO" (Leva 4, 24/09/2026). O mesmo problema de um cliente aparecia em ~5
-- lugares (Hoje do Tráfego, Defesa Ativa, alerta de saldo no WhatsApp, PDF do diagnóstico, feed do
-- Início) e marcar em um não calava os outros. Aqui fica UM registro por (cliente, tipo de alerta):
-- quem viu, quando, com que gravidade e até quando vale.
--
-- A regra (lib/traffic/hoje/visto.ts, com testes): o visto vale até `until` (padrão: 24h depois de
-- marcado) e cai na hora se o alerta PIORAR (atenção → crítico). Enquanto vale, o alerta aparece
-- apagado no Hoje e na Defesa Ativa e não sai no WhatsApp, no PDF do diagnóstico nem no Início.
--
-- Idempotente: pode rodar de novo sem erro. Só o service role lê/escreve (RLS ligada, sem policy).
-- Sem esta tabela o painel continua funcionando — só não mostra nem grava "visto".

create table if not exists public.traffic_alert_acks (
  id uuid primary key default gen_random_uuid(),
  -- client_id|tipo — um visto por cliente e tipo; marcar de novo sobrescreve.
  chave text not null unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- conta | saldo | entrega | acima_meta | desperdicio | fadiga | verba
  tipo text not null,
  -- gravidade do alerta no momento em que foi visto: se piorar, o visto deixa de valer
  nivel text not null check (nivel in ('critical', 'warning', 'info')),
  seen_by text,
  seen_by_name text,
  seen_at timestamptz not null default now(),
  -- até quando vale (padrão 24h). Nulo = seen_at + 24h.
  until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_traffic_alert_acks_client on public.traffic_alert_acks (client_id);

alter table public.traffic_alert_acks enable row level security;

comment on table public.traffic_alert_acks is 'Alerta de tráfego marcado como visto (Hoje / Defesa Ativa). Vale até until (24h) ou até piorar; enquanto vale, WhatsApp, PDF do diagnóstico e Início não repetem o alerta.';

notify pgrst, 'reload schema';
