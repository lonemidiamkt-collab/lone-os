-- ═══════════════════════════════════════════════════════════
-- Lone OS — Complete Onboarding Infrastructure
-- Creates missing columns, tables, and storage for onboarding flow
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Missing columns on clients table ────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'lone_growth';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS draft_status TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_role TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS idade TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_rua TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_bairro TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_cidade TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_estado TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_cep TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_corporativo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS doc_contrato_social TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS doc_identidade TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS doc_logo TEXT;

-- ─── 2. Onboarding Submissions table (the missing link) ────
CREATE TABLE IF NOT EXISTS client_onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',

  -- Personal data
  contact_name TEXT,
  contact_cpf TEXT,
  contact_whatsapp TEXT,

  -- Business data
  nome_fantasia TEXT,
  razao_social TEXT,
  cnpj TEXT,

  -- Address
  endereco_rua TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_estado TEXT,
  endereco_cep TEXT,

  -- Platform credentials
  meta_login TEXT,
  meta_password TEXT,
  meta_status TEXT DEFAULT 'pending',
  instagram_login TEXT,
  instagram_password TEXT,
  instagram_status TEXT DEFAULT 'pending',
  google_login TEXT,
  google_password TEXT,
  google_status TEXT DEFAULT 'pending',

  -- Documents
  doc_contrato_social TEXT,
  doc_identidade TEXT,
  doc_logo TEXT,

  -- Extra
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sub_client ON client_onboarding_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sub_token ON client_onboarding_submissions(token);

-- ─── 3. RLS policies ────────────────────────────────────────
ALTER TABLE client_onboarding_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'onboarding_sub_anon' AND tablename = 'client_onboarding_submissions') THEN
    CREATE POLICY "onboarding_sub_anon" ON client_onboarding_submissions FOR ALL TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'onboarding_sub_auth' AND tablename = 'client_onboarding_submissions') THEN
    CREATE POLICY "onboarding_sub_auth" ON client_onboarding_submissions FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- ─── 4. Storage bucket for onboarding documents ─────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-docs',
  'onboarding-docs',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read + anon upload on the bucket
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'onboarding_docs_read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "onboarding_docs_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'onboarding-docs');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'onboarding_docs_insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "onboarding_docs_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'onboarding-docs');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'onboarding_docs_update' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "onboarding_docs_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'onboarding-docs');
  END IF;
END $$;
