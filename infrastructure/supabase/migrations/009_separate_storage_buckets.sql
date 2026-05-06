-- ═══════════════════════════════════════════════════════════
-- Lone OS — Split storage into brand-assets (public) + legal-docs (private)
-- brand-assets:  logos, public read, anon upload (onboarding)
-- legal-docs:    contratos/RG, privado, acesso somente via signed URL
-- Mantemos o bucket onboarding-docs existente para compat com arquivos ja carregados.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. brand-assets (public) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets',
  'brand-assets',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_assets_read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "brand_assets_read" ON storage.objects FOR SELECT
      TO anon, authenticated USING (bucket_id = 'brand-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_assets_insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "brand_assets_insert" ON storage.objects FOR INSERT
      TO anon, authenticated WITH CHECK (bucket_id = 'brand-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_assets_update' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "brand_assets_update" ON storage.objects FOR UPDATE
      TO anon, authenticated USING (bucket_id = 'brand-assets');
  END IF;
END $$;

-- ─── 2. legal-docs (private) ────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legal-docs',
  'legal-docs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Nao criamos policies de SELECT/INSERT para anon ou authenticated.
-- Todo o acesso ao bucket legal-docs acontece exclusivamente via service_role
-- (rotas de API admin-only), garantindo que o conteudo nao fique publicamente
-- acessivel mesmo se alguem vazar um path.
--
-- service_role bypassa RLS por design. Nao precisamos definir policy para ele.

-- ─── 3. Indice auxiliar no clients para lookup rapido de docs ─────
CREATE INDEX IF NOT EXISTS idx_clients_doc_logo ON clients(doc_logo) WHERE doc_logo IS NOT NULL;
