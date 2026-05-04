-- Adiciona coluna attachments em design_requests para persistir URLs de arte enviadas pelo designer.
-- Antes desta migration, o array existia apenas em memória (React state) e era perdido no reload.

ALTER TABLE design_requests
  ADD COLUMN IF NOT EXISTS attachments TEXT[] NOT NULL DEFAULT '{}';

-- Habilita Realtime para UPDATE/INSERT (INSERT já estava via migration 026 se a tabela estava listada,
-- mas garantimos REPLICA IDENTITY FULL para que o payload inclua os valores antigos em UPDATE).
ALTER TABLE design_requests REPLICA IDENTITY FULL;
