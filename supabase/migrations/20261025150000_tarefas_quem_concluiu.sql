-- 25/10/2026 — auditoria de erro recuperável, item 13.1 (docs/AUDITORIA_ERRO_RECUPERAVEL_2026-10-25.md).
--
-- O agente fecha tarefa quando alguém avisa no grupo da equipe ("já fiz a arte da Imperio"). Antes bastava o
-- nome do cliente aparecer para fechar a tarefa de outra pessoa, e não ficava registrado quem fechou nem por
-- qual mensagem. Agora a regra é mais estrita (lib/tarefas/auto-marcar.ts) e estas colunas anotam a conclusão
-- feita pelo grupo — o "reabre" limpa a anotação.
--
-- Sem esta migration o código continua funcionando: a tarefa fecha e reabre do mesmo jeito, só a anotação é
-- pulada (fica um aviso no log). Idempotente.

alter table public.tasks add column if not exists concluida_por text;
alter table public.tasks add column if not exists concluida_via text;
alter table public.tasks add column if not exists concluida_msg_id text;
alter table public.tasks add column if not exists concluida_em timestamptz;

comment on column public.tasks.concluida_por is
  'Quem concluiu, pelo nome na Gestão da Equipe (preenchido quando a conclusão veio do aviso no grupo).';
comment on column public.tasks.concluida_via is
  'Por onde foi concluída: "grupo" = o agente marcou pelo aviso no WhatsApp da equipe.';
comment on column public.tasks.concluida_msg_id is
  'Id (WhatsApp) da mensagem que avisou a conclusão.';
comment on column public.tasks.concluida_em is
  'Quando o agente marcou a tarefa como feita pelo aviso no grupo.';

notify pgrst, 'reload schema';
