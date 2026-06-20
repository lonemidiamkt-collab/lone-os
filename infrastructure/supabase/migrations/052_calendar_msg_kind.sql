-- 052_calendar_msg_kind.sql
-- Permite kind='calendar' no log de mensagens de grupo, usado pelo disparo
-- mensal de planejamento (dia 20 → próximo dia útil): calendário do mês seguinte
-- + pergunta da promoção. Idempotência por cliente/dia reusa a mesma tabela.

alter table public.client_group_message_log
  drop constraint if exists client_group_message_log_kind_check;

alter table public.client_group_message_log
  add constraint client_group_message_log_kind_check
  check (kind in ('report', 'support', 'calendar'));
