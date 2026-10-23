-- 21/10/2026 — auditoria de erro recuperável, item 5.9.
--
-- Confirmar uma demanda marcava "confirmada" mesmo quando o card NÃO era criado: a nova tentativa
-- caía em "já foi decidida" e o pedido sumia sem card. Agora a demanda só vira "confirmada" com card
-- criado; se falhar, continua "pendente" e o motivo fica gravado aqui para quem for tentar de novo.
--
-- Sem esta migration a demanda continua pendente do mesmo jeito (o código grava o erro à parte e
-- ignora se a coluna não existir) — só o motivo não fica registrado. Idempotente.

alter table public.cs_demandas add column if not exists erro_card text;
alter table public.cs_demandas add column if not exists erro_card_em timestamptz;

comment on column public.cs_demandas.erro_card is
  'Por que o último "ok" não conseguiu criar o card (a demanda segue pendente). Vazio = nunca falhou.';

notify pgrst, 'reload schema';
