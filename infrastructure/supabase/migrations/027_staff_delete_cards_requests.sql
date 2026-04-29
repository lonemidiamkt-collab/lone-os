-- ═══════════════════════════════════════════════════════════
-- DELETE policies para content_cards e design_requests
-- ═══════════════════════════════════════════════════════════
-- Contexto: o fluxo principal (UI → /api/.../delete) usa service_role e
-- bypassa RLS. Esta migration é DEFENSE-IN-DEPTH — caso algum código
-- futuro tente DELETE direto via cliente Supabase (sem passar pela API),
-- a policy abaixo permite que staff (designer/social/traffic/manager/admin)
-- excluam suas próprias demandas, mantendo consistência com as policies
-- de SELECT/UPDATE já existentes (migrations 002 e 020).
--
-- Regra de negócio:
--   - Admin / Manager / service_role → podem deletar qualquer card/request.
--   - Social → pode deletar cards onde social_media = user_name dele.
--   - Designer → pode deletar requests dos clientes onde
--     clients.assigned_designer = user_name dele.
--   - Traffic → idem para clients.assigned_traffic.
--
-- Idempotente. Pode rodar várias vezes.
-- ═══════════════════════════════════════════════════════════

-- ─── content_cards ─────────────────────────────────────────
DROP POLICY IF EXISTS "cards_admin_delete" ON content_cards;
CREATE POLICY "cards_admin_delete" ON content_cards
  FOR DELETE TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'));

DROP POLICY IF EXISTS "cards_social_delete" ON content_cards;
CREATE POLICY "cards_social_delete" ON content_cards
  FOR DELETE TO authenticated
  USING (
    auth.user_role() = 'social'
    AND social_media = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
  );

DROP POLICY IF EXISTS "cards_designer_delete" ON content_cards;
CREATE POLICY "cards_designer_delete" ON content_cards
  FOR DELETE TO authenticated
  USING (
    auth.user_role() = 'designer'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_designer = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );

-- ─── design_requests ───────────────────────────────────────
-- Migration 002 já tem 'design_delete_admin' (admin/manager). Adicionamos staff.
DROP POLICY IF EXISTS "design_designer_delete" ON design_requests;
CREATE POLICY "design_designer_delete" ON design_requests
  FOR DELETE TO authenticated
  USING (
    auth.user_role() = 'designer'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_designer = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );

DROP POLICY IF EXISTS "design_social_delete" ON design_requests;
CREATE POLICY "design_social_delete" ON design_requests
  FOR DELETE TO authenticated
  USING (
    auth.user_role() = 'social'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_social = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );

DROP POLICY IF EXISTS "design_traffic_delete" ON design_requests;
CREATE POLICY "design_traffic_delete" ON design_requests
  FOR DELETE TO authenticated
  USING (
    auth.user_role() = 'traffic'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_traffic = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );
