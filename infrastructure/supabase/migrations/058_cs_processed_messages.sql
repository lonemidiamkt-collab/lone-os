-- 058: claim atômico de mensagens do webhook CS (dedup do reenvio da Evolution).
-- O inbound insere o message_id AQUI logo após os filtros baratos (antes de qualquer chamada de
-- IA); o reenvio do webhook conflita no PK (23505) e é ignorado. Resolve a corrida
-- check-then-insert que duplicava sugestão/card e dobrava gasto de IA.
create table if not exists cs_processed_messages (
  message_id   text primary key,
  group_jid    text,
  processed_at timestamptz not null default now()
);

-- Higiene: índice pra permitir poda periódica (linhas > 30 dias podem ser apagadas sem risco —
-- o retry da Evolution acontece em segundos/minutos).
create index if not exists idx_cs_processed_messages_at on cs_processed_messages (processed_at);

-- Motivo do descarte de uma demanda (preenchido pelo interpretador): só "nao_e_demanda" alimenta
-- o aprendizado NEGATIVO do A1. "equipe_resolve"/"cliente_desistiu" são demandas REAIS tratadas
-- fora do sistema — usá-las como recusa ensinava o A1 a silenciar pedidos legítimos iguais.
alter table cs_demandas add column if not exists motivo_descarte text;
