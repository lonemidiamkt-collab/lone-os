-- Lifecycle / churn de clientes.
-- O enum `client_status` {onboarding, good, average, at_risk} é SAÚDE do cliente,
-- não ciclo de vida. Aqui adicionamos o ciclo de vida (ativo vs. ex-cliente) sem
-- apagar histórico — base para métricas de carteira/churn.
--
-- Offboarding de ex-cliente = active=false + churned_at (em vez de deletar dados).
-- Todos os filtros de "cliente ativo" passam a exigir active=true.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS churned_at timestamptz,
  ADD COLUMN IF NOT EXISTS churn_reason text;

-- A automação consulta active=true com frequência (mensagens, sync, relatórios).
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);

COMMENT ON COLUMN clients.active IS 'false = ex-cliente (churned). Filtros de cliente ativo exigem true.';
COMMENT ON COLUMN clients.churned_at IS 'Quando virou ex-cliente. Base para métricas mensais de churn.';
COMMENT ON COLUMN clients.churn_reason IS 'Motivo do churn (texto livre, opcional).';
