-- Agency settings: proper columns for juridical data
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS signatario_nome TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS signatario_cpf TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS signatario_email TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS d4sign_token TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS d4sign_crypt_key TEXT;
ALTER TABLE agency_settings ALTER COLUMN value DROP NOT NULL;

-- Contract templates with D4Sign mapping
CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service_type TEXT NOT NULL UNIQUE,
  d4sign_template_id TEXT,
  d4sign_safe_id TEXT,
  duration_months INTEGER NOT NULL DEFAULT 3,
  description TEXT,
  clauses_summary TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO contract_templates (name, service_type, duration_months, description) VALUES
  ('Trafego Pago', 'assessoria_trafego', 3, 'Gestao de campanhas Meta Ads e Google Ads'),
  ('Social Media', 'assessoria_social', 3, 'Gestao de redes sociais, conteudo e engajamento'),
  ('Lone Growth', 'lone_growth', 3, 'Combo completo: Trafego + Social + Design')
ON CONFLICT (service_type) DO NOTHING;

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contract_templates_anon" ON contract_templates FOR ALL TO anon USING (true);
CREATE POLICY "contract_templates_auth" ON contract_templates FOR ALL TO authenticated USING (true);

-- D4Sign tracking on contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS d4sign_document_id TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS d4sign_status TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES contract_templates(id);
