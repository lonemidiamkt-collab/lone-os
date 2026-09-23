-- ESTADO "PAUSADO" (Roberto, 23/09/2026). Até aqui só existia ativo × desativado, e desativar tira o
-- cliente de TUDO — inclusive da carteira do time. Faltava o meio: cliente que para temporariamente
-- (férias, pagamento atrasado, campanha suspensa) mas continua sendo do Carlos, do Thiago, do Rodrigo.
--
-- Regra: PAUSADO não recebe nada (mensagem no grupo, relatório, alerta de verba, portal, Loninho),
-- mas CONTINUA visível para a equipe, com o motivo e a data de retomada à vista.
alter table public.clients add column if not exists paused_at timestamptz;
alter table public.clients add column if not exists paused_reason text;
alter table public.clients add column if not exists paused_until date;
alter table public.clients add column if not exists paused_by text;
create index if not exists idx_clients_paused on public.clients (paused_at) where paused_at is not null;

comment on column public.clients.paused_at is 'Cliente pausado: nada é enviado a ele, mas continua na carteira do time. NULL = operando.';

notify pgrst, 'reload schema';
