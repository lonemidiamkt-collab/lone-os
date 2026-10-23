-- 21/10/2026 — auditoria de erro recuperável, item 5.1 (docs/AUDITORIA_ERRO_RECUPERAVEL_2026-10-21.md).
--
-- Até aqui qualquer "ok/sim/👍" no grupo interno confirmava a ÚNICA reunião esperando o social, e o
-- cliente recebia "📅 Confirmado!" — mesmo quando o "ok" era para um card. E qualquer link de Meet
-- colado ia para o cliente da única reunião sem link. Agora o agente só aceita a resposta que CITA a
-- pergunta dele. Estas colunas guardam o id (WhatsApp) dessas perguntas para casar a citação pelo id.
--
-- Sem esta migration o código continua funcionando: casa a citação pelo TEXTO citado (o nome do
-- cliente entre asteriscos + o pedido de "ok"/link), que o webhook também entrega. Idempotente.

alter table public.meetings add column if not exists msg_id_pergunta_social text;
alter table public.meetings add column if not exists msg_id_pedido_link text;

comment on column public.meetings.msg_id_pergunta_social is
  'Id da última mensagem do agente no grupo interno perguntando ao social se o horário serve (o "ok" precisa citar esta mensagem).';
comment on column public.meetings.msg_id_pedido_link is
  'Id da mensagem do agente pedindo o link da chamada (o link colado precisa citar esta mensagem).';

notify pgrst, 'reload schema';
