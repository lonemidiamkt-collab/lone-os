-- ═══════════════════════════════════════════════════════════
-- Tighten RLS em user_read_updates
-- ═══════════════════════════════════════════════════════════
--
-- Estado anterior:
--   Policy "user_read_updates_all" FOR ALL TO authenticated USING (true)
--   → qualquer usuário autenticado podia ler/escrever linha de qualquer
--     outro user_email. Vulnerabilidade leve (impacto: esconder o widget
--     de "Novidades" pra outro user, ou ver o que outros leram).
--
-- Estado novo:
--   Cada user só pode ler/escrever linhas com seu próprio email.
--
-- Defesa em profundidade — a rota POST /api/platform-updates usa
-- supabaseAdmin (service_role) que bypassa RLS, então essas policies
-- só impactam acesso direto via client anon/authenticated key (ex.:
-- alguém usando supabase.from(...) no frontend pra mexer direto).
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "user_read_updates_all" ON user_read_updates;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_read_updates_self_select' AND tablename = 'user_read_updates') THEN
    CREATE POLICY "user_read_updates_self_select" ON user_read_updates
      FOR SELECT TO authenticated
      USING (user_email = lower(auth.jwt() ->> 'email'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_read_updates_self_insert' AND tablename = 'user_read_updates') THEN
    CREATE POLICY "user_read_updates_self_insert" ON user_read_updates
      FOR INSERT TO authenticated
      WITH CHECK (user_email = lower(auth.jwt() ->> 'email'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_read_updates_self_update' AND tablename = 'user_read_updates') THEN
    CREATE POLICY "user_read_updates_self_update" ON user_read_updates
      FOR UPDATE TO authenticated
      USING (user_email = lower(auth.jwt() ->> 'email'))
      WITH CHECK (user_email = lower(auth.jwt() ->> 'email'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_read_updates_self_delete' AND tablename = 'user_read_updates') THEN
    CREATE POLICY "user_read_updates_self_delete" ON user_read_updates
      FOR DELETE TO authenticated
      USING (user_email = lower(auth.jwt() ->> 'email'));
  END IF;
END $$;
