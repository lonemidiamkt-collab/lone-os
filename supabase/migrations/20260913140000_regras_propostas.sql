-- 13/09/2026 — Fase 0A do Lone Agent V2: regra permanente de cliente NÃO nasce mais ativa a partir
-- de uma mensagem. Nasce PROPOSTA e só vira ativa com ok de alguém do time.
--
-- Medido: 354 das 356 regras ativas em cs_client_rules têm origem = 'aprendido' — vieram de uma
-- única mensagem no grupo, sem confirmação. A auditoria anterior do aprendizado já tinha achado 378
-- regras com só 10 acionáveis. É memória permanente contaminada por observação pontual.
--
-- As regras existentes ficam como estão (estado = 'ativa' por padrão): desativar 354 de uma vez
-- mudaria o comportamento do agente em todos os clientes sem ninguém ter olhado. Revisão delas é
-- trabalho à parte.
alter table cs_client_rules add column if not exists estado text not null default 'ativa';
alter table cs_client_rules add column if not exists codigo text;
alter table cs_client_rules add column if not exists msg_id_proposta text;
alter table cs_client_rules add column if not exists confirmada_por text;
alter table cs_client_rules add column if not exists confirmada_em timestamptz;

alter table cs_client_rules drop constraint if exists cs_client_rules_estado_check;
alter table cs_client_rules add constraint cs_client_rules_estado_check
  check (estado in ('proposta', 'ativa', 'descartada'));

create index if not exists idx_cs_client_rules_codigo on cs_client_rules (codigo) where codigo is not null;
create index if not exists idx_cs_client_rules_proposta on cs_client_rules (client_id, created_at desc) where estado = 'proposta';

comment on column cs_client_rules.estado is 'proposta = detectada, aguarda ok; ativa = vale para o agente; descartada = alguém disse não';
comment on column cs_client_rules.codigo is 'Código curto (4 hex) para responder "ok xxxx" / "não xxxx" no grupo';
