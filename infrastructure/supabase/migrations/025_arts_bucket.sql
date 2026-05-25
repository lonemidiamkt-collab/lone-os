-- ═══════════════════════════════════════════════════════════
-- Bucket "arts" + RLS pro storage de artes finalizadas
-- ═══════════════════════════════════════════════════════════
-- Cole este SQL inteiro no painel do Supabase (SQL Editor) e rode.
-- Idempotente — pode rodar várias vezes sem efeitos colaterais.
--
-- Cobertura:
--   1. Cria/atualiza o bucket "arts" (público, 25MB, mimes whitelisted)
--   2. RLS pro storage.objects no bucket arts:
--      - SELECT (read): público (qualquer um lê — necessário pra preview)
--      - INSERT/UPDATE/DELETE: authenticated (qualquer logado pode escrever)
--      - service_role: sempre passa (já tem bypass nativo)
-- ═══════════════════════════════════════════════════════════

-- 1. Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'arts',
  'arts',
  true,
  26214400,  -- 25 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Policies (idempotentes via DO block)
DO $$
BEGIN
  -- Limpa policies antigas (renomeadas) antes de recriar — só pra "arts"
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'arts_public_read' AND tablename = 'objects') THEN
    DROP POLICY "arts_public_read" ON storage.objects;
  END IF;

  -- READ público (qualquer pessoa lê o bucket)
  CREATE POLICY "arts_select_public" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'arts');

  -- INSERT pra authenticated (qualquer user logado faz upload)
  CREATE POLICY "arts_insert_authenticated" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'arts');

  -- UPDATE pra authenticated (sobrescrita/upsert)
  CREATE POLICY "arts_update_authenticated" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'arts')
    WITH CHECK (bucket_id = 'arts');

  -- DELETE pra authenticated (só admin via API real, mas a policy permite)
  CREATE POLICY "arts_delete_authenticated" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'arts');
EXCEPTION
  WHEN duplicate_object THEN
    -- policies já existem — silencioso (idempotência)
    NULL;
END $$;
