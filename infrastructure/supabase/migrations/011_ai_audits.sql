-- ═══════════════════════════════════════════════════════════
-- Lone OS — AI audits history (persistencia de analises IA)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                   -- 'campaign_analysis' | 'morning_briefing' | 'critical_alerts'
  score INTEGER,                         -- 0-100 (null when not applicable)
  status TEXT,                           -- 'otimo' | 'bom' | 'atencao' | 'critico'
  summary TEXT,                          -- Resumo executivo
  insights JSONB,                        -- Array of insights
  raw_response JSONB,                    -- Full API response for audit trail
  triggered_by TEXT,                     -- email do admin que disparou
  visible_to_client BOOLEAN NOT NULL DEFAULT false,  -- exibir no painel do cliente?
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audits_client_id ON ai_audits(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_audits_created_at ON ai_audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audits_type ON ai_audits(type);

ALTER TABLE ai_audits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ai_audits_auth' AND tablename = 'ai_audits') THEN
    CREATE POLICY "ai_audits_auth" ON ai_audits FOR ALL TO authenticated USING (true);
  END IF;
END $$;
