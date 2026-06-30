-- 059_cs_onboarding_sessions.sql — sessões de onboarding conduzidas pelo agente Lone NO grupo
-- do cliente novo. Multi-turno: guarda em que pergunta está + as respostas. Aplicar manual.
CREATE TABLE IF NOT EXISTS cs_onboarding_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  cliente_nome  text,
  group_jid     text NOT NULL,                 -- grupo do cliente onde o onboarding acontece
  status        text NOT NULL DEFAULT 'coletando', -- coletando | concluido | cancelado
  step          int  NOT NULL DEFAULT 0,        -- índice da pergunta atual
  answers       jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{pergunta, resposta}]
  iniciado_por  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- No máx UMA sessão ativa por grupo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cs_onboarding_ativa ON cs_onboarding_sessions(group_jid) WHERE status = 'coletando';
