-- O defense-scan detecta queda de resultado a cada 15 min e grava em anomaly_alerts desde sempre,
-- mas nunca avisou ninguém: 58 alertas em uma semana parados no banco esperando alguém abrir a
-- tela. Roberto: "alerta de queda antes do cliente perceber, isso é bom pra gente".
--
-- Esta coluna é o que impede o aviso de repetir. Sem ela, um alerta que persiste por dias vira
-- uma mensagem por dia no grupo — e mensagem repetida é a forma mais rápida de ensinar o time a
-- ignorar o alerta.
ALTER TABLE anomaly_alerts ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS anomaly_alerts_pendentes
  ON anomaly_alerts (detected_at DESC)
  WHERE notified_at IS NULL AND acknowledged_at IS NULL;
