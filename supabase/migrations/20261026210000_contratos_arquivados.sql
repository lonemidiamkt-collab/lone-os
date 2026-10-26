-- Contrato que não vai ser assinado sai da lista sem ser apagado (Roberto, 26/10/2026: os rascunhos de
-- maio a julho de Quero Tintas, Complexo Vida, Império e Óticas Raki apareciam como "Pendente" e
-- escondiam os que faltam assinar de verdade). Arquivar é reversível: as duas colunas voltam a null.
alter table contracts add column if not exists archived_at timestamptz;
alter table contracts add column if not exists archived_by text;
create index if not exists contracts_arquivados_idx on contracts (archived_at) where archived_at is not null;
