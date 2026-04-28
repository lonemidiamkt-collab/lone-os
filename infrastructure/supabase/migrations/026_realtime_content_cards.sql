-- ═══════════════════════════════════════════════════════════
-- Realtime: habilita publication de content_cards e design_requests
-- ═══════════════════════════════════════════════════════════
-- Pra Supabase Realtime broadcast de INSERT/UPDATE/DELETE, a tabela
-- precisa estar na publication "supabase_realtime".
--
-- Idempotente — pode rodar várias vezes.
-- ═══════════════════════════════════════════════════════════

DO $$
BEGIN
  -- content_cards
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'content_cards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE content_cards;
  END IF;

  -- design_requests
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'design_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE design_requests;
  END IF;
END $$;

-- REPLICA IDENTITY FULL — pra que payloads de UPDATE/DELETE incluam
-- todos os campos (não só PK). Necessário pra o cliente reconstruir
-- o estado completo via realtime.
ALTER TABLE content_cards REPLICA IDENTITY FULL;
ALTER TABLE design_requests REPLICA IDENTITY FULL;
