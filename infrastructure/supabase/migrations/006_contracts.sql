-- Contracts table for generated service contracts
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  service_type TEXT NOT NULL,
  monthly_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'draft',
  pdf_url TEXT,
  generated_by TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts_anon" ON contracts FOR ALL TO anon USING (true);
CREATE POLICY "contracts_auth" ON contracts FOR ALL TO authenticated USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('contracts', 'contracts', true, 10485760)
ON CONFLICT (id) DO NOTHING;
