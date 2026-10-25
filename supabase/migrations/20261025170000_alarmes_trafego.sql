-- 20261025170000_alarmes_trafego.sql — os dois alarmes de tráfego (etapa 1 do plano de 25/10/2026).
--
-- avisos_trafego guarda cada ocorrência (único por tipo + conta + dia) e mede quanto tempo leva até resolver.
-- Novos tipos:
--   sem_conversa      — campanhas de mensagem gastando sem receber conversa (WhatsApp do anúncio caiu, número
--                       errado, página desligada do WhatsApp Business). Um evento por dia enquanto durar.
--   verba_estourando  — no ritmo de agora, a verba do mês acaba em até 3 dias (antes do fim do mês).
--   verba_estourou    — o gasto do mês passou da verba.
-- O app (lib/traffic/alarmes/servidor.ts) só grava estes tipos depois desta migração; antes dela o insert é
-- recusado e a rotina devolve erro (nada sai para o grupo sem o registro que impede repetir).

alter table public.avisos_trafego drop constraint if exists avisos_trafego_tipo_check;
alter table public.avisos_trafego add constraint avisos_trafego_tipo_check
  check (tipo = any (array['conta_parada', 'saldo_zerado', 'sem_conversa', 'verba_estourando', 'verba_estourou']::text[]));

-- Detalhe do momento do aviso (gasto sem conversa, limite, custo de referência; verba, gasto, diária
-- necessária) — é o que a fila de prioridades e a medição leem depois, sem refazer a conta.
alter table public.avisos_trafego add column if not exists detalhe jsonb;
