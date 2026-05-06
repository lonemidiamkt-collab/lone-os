-- 023_defesa_ativa.sql
-- Defesa Ativa — snapshots 15min de métricas Meta Ads + detecção de anomalias.
-- Histórico permite baseline rolling 7d pra comparação.

-- Snapshots: 1 linha por cliente por dia por captura (4x/hr via cron).
-- Armazenamos o DIA inteiro agregado (não só o último 15min) — Meta API retorna o dia corrente.
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  meta_ad_account_id text NOT NULL,
  metric_date date NOT NULL,                -- dia de referência (hoje, na maioria das capturas)
  spend numeric(12,2) NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  ctr numeric(8,4) NOT NULL DEFAULT 0,       -- calculado no cliente da API (%)
  cpm numeric(10,2) NOT NULL DEFAULT 0,
  cpc numeric(10,2) NOT NULL DEFAULT 0,
  cpl numeric(10,2),                          -- null se conversions = 0
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_client_date
  ON metric_snapshots(client_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_captured
  ON metric_snapshots(captured_at DESC);

-- Alertas de anomalia: 1 row por (cliente, métrica, dia) — dedup natural
CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  meta_ad_account_id text NOT NULL,
  metric text NOT NULL,                       -- spend | cpl | ctr | impressions
  severity text NOT NULL,                     -- critical | high | medium
  current_value numeric(12,4) NOT NULL,
  baseline_value numeric(12,4) NOT NULL,
  percent_change numeric(8,2) NOT NULL,       -- +/- vs baseline (%)
  description text NOT NULL,
  metric_date date NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  CONSTRAINT anomaly_alerts_unique_per_day UNIQUE (client_id, metric, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_unack
  ON anomaly_alerts(detected_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_client
  ON anomaly_alerts(client_id, detected_at DESC);

-- RLS: snapshots = admin/manager/traffic leem; alertas = mesma coisa
ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metric_snapshots_staff_read ON metric_snapshots;
CREATE POLICY metric_snapshots_staff_read ON metric_snapshots
  FOR SELECT TO authenticated
  USING (public.is_admin() OR COALESCE((auth.jwt() ->> 'email') LIKE '%@lonemidia.com', false));

DROP POLICY IF EXISTS metric_snapshots_service_write ON metric_snapshots;
CREATE POLICY metric_snapshots_service_write ON metric_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anomaly_alerts_staff_read ON anomaly_alerts;
CREATE POLICY anomaly_alerts_staff_read ON anomaly_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin() OR COALESCE((auth.jwt() ->> 'email') LIKE '%@lonemidia.com', false));

DROP POLICY IF EXISTS anomaly_alerts_auth_ack ON anomaly_alerts;
CREATE POLICY anomaly_alerts_auth_ack ON anomaly_alerts
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR COALESCE((auth.jwt() ->> 'email') LIKE '%@lonemidia.com', false))
  WITH CHECK (public.is_admin() OR COALESCE((auth.jwt() ->> 'email') LIKE '%@lonemidia.com', false));

DROP POLICY IF EXISTS anomaly_alerts_service_write ON anomaly_alerts;
CREATE POLICY anomaly_alerts_service_write ON anomaly_alerts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
