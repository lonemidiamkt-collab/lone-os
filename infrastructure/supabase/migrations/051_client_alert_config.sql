-- ═══════════════════════════════════════════════════════════
-- Lone OS — Configuração de alertas POR CLIENTE (Central de Automação)
-- ═══════════════════════════════════════════════════════════
-- Cada cliente pode ter sua verba mínima, destino do alerta e quais alertas
-- estão ligados. Sem linha = usa os defaults globais (comportamento atual).

create table if not exists public.client_alert_config (
  client_id              uuid primary key references public.clients(id) on delete cascade,
  -- Verba mínima ABSOLUTA (R$) p/ "verba baixa". null = usa o % global (traffic_alert_warning_pct).
  verba_minima           numeric(12,2),
  -- Onde os alertas deste cliente são enviados: grupo interno da equipe ou o grupo do cliente.
  destino                text not null default 'interno' check (destino in ('interno', 'cliente')),
  -- Liga/desliga por tipo de alerta.
  alert_verba_baixa      boolean not null default true,
  alert_verba_zerada     boolean not null default true,
  alert_erro_conta       boolean not null default true,   -- cartão/cobrança/status da conta
  alert_sem_gasto        boolean not null default true,   -- conta ativa sem gastar
  alert_campanha_parada  boolean not null default false,  -- precisa fetch de campanhas (1b)
  alert_meta_erro        boolean not null default true,   -- sync_error / integração Meta
  -- Parâmetro do "sem gasto": nº de dias sem gasto p/ alertar.
  sem_gasto_dias         int not null default 3,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

alter table public.client_alert_config enable row level security;

create policy "service_role full access client_alert_config"
  on public.client_alert_config for all
  to service_role using (true) with check (true);

create policy "authenticated read client_alert_config"
  on public.client_alert_config for select
  to authenticated using (true);
