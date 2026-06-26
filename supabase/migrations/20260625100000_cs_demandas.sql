-- Agente CS — fila de sugestões (suggest-only). Cada demanda detectada vira uma linha
-- 'pendente'; vira card só quando um humano confirma ('ok <codigo>' no grupo interno).
-- Também serve de log p/ métricas e memória de correções (blueprint A1/A2).
CREATE TABLE IF NOT EXISTS cs_demandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,                 -- código curto p/ confirmar via WhatsApp
  group_jid text NOT NULL,
  client_id uuid,                       -- null no grupo de teste
  cliente_nome text,
  author text,
  message_id text,
  message_text text NOT NULL,
  tipo text NOT NULL,
  urgencia text NOT NULL,
  confianca numeric,
  resumo text,
  status text NOT NULL DEFAULT 'pendente',  -- pendente | confirmada | descartada
  content_card_id uuid,                 -- preenchido ao confirmar
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text
);

-- Busca rápida do código pendente (confirmação).
CREATE INDEX IF NOT EXISTS idx_cs_demandas_codigo_pendente
  ON cs_demandas (codigo) WHERE status = 'pendente';
