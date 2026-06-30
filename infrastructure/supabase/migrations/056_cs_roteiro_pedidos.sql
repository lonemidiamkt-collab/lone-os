-- 056_cs_roteiro_pedidos.sql — corpus de aprendizado do Agente Criativo (Lone).
-- Cada pedido de roteiro on-demand no grupo vira uma linha; o feedback da equipe alimenta
-- a melhoria por cliente. Aplicar manual no banco (deploy.sh não roda migrations).
CREATE TABLE IF NOT EXISTS cs_roteiro_pedidos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  cliente_nome text,
  solicitante  text,             -- quem pediu (nome/jid)
  pedido       text,             -- a mensagem original ("Lone, roteiro pro Império da promo")
  roteiros     jsonb,            -- os roteiros gerados (pra auditoria/aprendizado)
  scorecard    int,              -- scorecard do 1º roteiro
  feedback     text,             -- reação da equipe (preenchido depois — loop de aprendizado)
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_roteiro_pedidos_client ON cs_roteiro_pedidos(client_id);
CREATE INDEX IF NOT EXISTS idx_cs_roteiro_pedidos_created ON cs_roteiro_pedidos(created_at DESC);
