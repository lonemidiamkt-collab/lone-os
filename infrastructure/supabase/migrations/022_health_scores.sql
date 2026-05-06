-- 022_health_scores.sql
-- Termômetro de Churn — snapshot diário + cache no client.
-- Score 0-100 onde maior = mais risco. Persiste histórico pra trendline.

-- Cache no próprio cliente (lido em toda renderização; evita join no histórico)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS current_health_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS current_health_level text,    -- safe | attention | high | critical
  ADD COLUMN IF NOT EXISTS health_computed_at timestamptz;

-- Histórico — 1 linha por cliente por dia (snapshot do cron). Permite trendline.
CREATE TABLE IF NOT EXISTS client_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  score numeric(5,2) NOT NULL,                     -- 0-100, maior = mais risco
  level text NOT NULL,                             -- safe | attention | high | critical
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {signal_name: weight_added}
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_for_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  CONSTRAINT client_health_scores_unique_per_day UNIQUE (client_id, computed_for_date)
);

CREATE INDEX IF NOT EXISTS idx_health_scores_client ON client_health_scores(client_id, computed_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_scores_date ON client_health_scores(computed_for_date DESC);

-- Controle de alerta pra anti-spam: última vez que disparou notification crítica
-- (cron re-alerta semanalmente enquanto score >= 75)
CREATE TABLE IF NOT EXISTS client_health_alerts (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  last_alert_at timestamptz NOT NULL,
  last_alert_score numeric(5,2) NOT NULL,
  last_alert_level text NOT NULL
);

-- RLS: histórico lido só por admin/manager (é derivado de signals sensíveis)
ALTER TABLE client_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_health_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_health_scores_admin_read ON client_health_scores;
CREATE POLICY client_health_scores_admin_read ON client_health_scores
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS client_health_scores_service_write ON client_health_scores;
CREATE POLICY client_health_scores_service_write ON client_health_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS client_health_alerts_admin_read ON client_health_alerts;
CREATE POLICY client_health_alerts_admin_read ON client_health_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS client_health_alerts_service_write ON client_health_alerts;
CREATE POLICY client_health_alerts_service_write ON client_health_alerts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
