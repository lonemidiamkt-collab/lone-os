-- ═══════════════════════════════════════════════════════════
-- Lone OS — Broadcasts (email em massa pra clientes)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  content_html TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'all_active',  -- 'all_active' | 'industry:<name>' | 'custom'
  status TEXT NOT NULL DEFAULT 'draft',                -- 'draft' | 'sending' | 'sent' | 'failed'
  sent_by TEXT,                                         -- name of admin who triggered
  sent_at TIMESTAMPTZ,
  recipients_total INTEGER NOT NULL DEFAULT 0,
  recipients_success INTEGER NOT NULL DEFAULT 0,
  recipients_failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  contact_name TEXT,
  company_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed' | 'skipped'
  error_message TEXT,
  resend_message_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_recipients(status);

-- RLS: autenticados podem ler/escrever (gate real acontece na API via email admin)
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'broadcasts_auth' AND tablename = 'broadcasts') THEN
    CREATE POLICY "broadcasts_auth" ON broadcasts FOR ALL TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'broadcast_recipients_auth' AND tablename = 'broadcast_recipients') THEN
    CREATE POLICY "broadcast_recipients_auth" ON broadcast_recipients FOR ALL TO authenticated USING (true);
  END IF;
END $$;
