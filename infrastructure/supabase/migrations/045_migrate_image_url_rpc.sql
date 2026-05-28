BEGIN;

-- ----------------------------------------------------------------
-- 045_migrate_image_url_rpc.sql
-- Função para migração silenciosa e atômica de image_url →
-- card_attachments quando um card legado recebe seu primeiro
-- attachment.
--
-- Chamada exclusivamente via supabaseAdmin.rpc() nas API routes.
-- Nunca chamar diretamente de código de aplicação.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION migrate_image_url_to_attachment(
  p_card_id UUID,
  p_url     TEXT,
  p_path    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Insere a arte legada como position 0 (capa do card)
  INSERT INTO card_attachments (card_id, url, path, position)
  VALUES (p_card_id, p_url, p_path, 0);

  -- Remove image_url para evitar coexistência com card_attachments
  UPDATE content_cards
  SET image_url = NULL
  WHERE id = p_card_id;
END;
$$;

COMMENT ON FUNCTION migrate_image_url_to_attachment(uuid, text, text) IS
  'Migração silenciosa e atômica de image_url → card_attachments. '
  'Executada quando um card legado (com image_url preenchido) recebe '
  'seu primeiro attachment via POST /api/upload-art. '
  'Garante atomicidade: INSERT + UPDATE ocorrem na mesma transação. '
  'Nunca chamar de código de aplicação — exclusivo para BFF via supabaseAdmin.rpc().';

-- Restringe execução: apenas service_role (supabaseAdmin das API routes)
REVOKE EXECUTE ON FUNCTION migrate_image_url_to_attachment(uuid, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION migrate_image_url_to_attachment(uuid, text, text) TO service_role;

COMMIT;
