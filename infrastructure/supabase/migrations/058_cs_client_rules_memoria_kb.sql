-- 058_cs_client_rules_memoria_kb.sql — memória do cliente conforme o KB (M1/M2):
-- além de origem+created_at, guardar a MENSAGEM-FONTE, o AUTOR e a VALIDADE (TTL).
-- Aplicar manual no banco (deploy.sh não roda migrations).
ALTER TABLE cs_client_rules ADD COLUMN IF NOT EXISTS source_message text; -- a frase do cliente que originou a regra
ALTER TABLE cs_client_rules ADD COLUMN IF NOT EXISTS author        text;  -- quem disse (nome/jid)
ALTER TABLE cs_client_rules ADD COLUMN IF NOT EXISTS expires_at    timestamptz; -- NULL = permanente; senão expira
CREATE INDEX IF NOT EXISTS idx_cs_client_rules_expires ON cs_client_rules(expires_at) WHERE expires_at IS NOT NULL;
