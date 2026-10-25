-- UM AVISO DE SALDO POR (CONTA, SEVERIDADE, DIA), MESMO COM DUAS RODADAS JUNTAS (25/10/2026).
-- Auditoria de erro recuperável, item 9.8.
--
-- O alerta em tempo real (lib/traffic/sync-core.ts) e os alertas urgentes (app/api/system/urgent-alerts)
-- conferiam o log, ENVIAVAM e só depois gravavam. O cron das 2h e o "Sincronizar"/"Adicionar conta" da tela
-- liam "ainda não avisado" juntos e o grupo do tráfego recebia em dobro. Agora o código grava a linha ANTES de
-- enviar (é a reserva) — e é este índice único que faz a segunda rodada esbarrar nela (23505) e não enviar.
--
-- O código funciona sem este índice (confere antes de reservar; a janela de corrida fica de milissegundos).
-- Pode ser aplicada antes ou depois do deploy. Idempotente.

-- Duplicatas antigas (do próprio bug) impediriam o índice: fica a mais antiga de cada chave.
delete from public.budget_alert_log
 where id in (
   select id from (
     select id, row_number() over (partition by cycle_key order by sent_at nulls last, id) as n
       from public.budget_alert_log
   ) t
   where t.n > 1
 );

create unique index if not exists budget_alert_log_cycle_key_unico
  on public.budget_alert_log (cycle_key);

comment on index public.budget_alert_log_cycle_key_unico is
  'Reserva do aviso: a linha é gravada antes do envio; a segunda rodada esbarra aqui e não manda em dobro (auditoria 9.8).';
