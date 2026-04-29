-- ═══════════════════════════════════════════════════════════
-- Relaxa UPDATE em content_cards e design_requests
-- ═══════════════════════════════════════════════════════════
-- Contexto:
--   Migration 002 criou cards_social_update / cards_designer_update com
--   match exato por social_media/designer_name. Numa equipe de 2 social
--   + 1 designer compartilhando clientes, isso bloqueia edição cruzada
--   no dia-a-dia (Carlos não edita card sem social_media setado, ou de
--   Pedro). Pior: o erro vai pro console.error, UI atualiza otimisticamente
--   e Realtime depois reverte — usuário relata "edição some sozinha".
--
--   A compartimentação por cliente continua sendo feita pelas policies de
--   SELECT em migration 020 (cards_social_read, cards_designer_read,
--   cards_traffic_read) — staff só LÊ cards dos clientes que lhe foram
--   atribuídos. Permitir UPDATE de qualquer card que ele consegue ler
--   é coerente com o escopo de SELECT.
--
-- Mudança:
--   Qualquer social → UPDATE em qualquer content_card.
--   Qualquer designer → UPDATE em qualquer content_card e design_request.
--   Qualquer social/traffic → UPDATE em qualquer design_request.
--
-- Idempotente. Pode rodar várias vezes.
-- ═══════════════════════════════════════════════════════════

-- ─── content_cards ─────────────────────────────────────────
DROP POLICY IF EXISTS "cards_social_update" ON content_cards;
CREATE POLICY "cards_social_update" ON content_cards
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'social')
  WITH CHECK (auth.user_role() = 'social');

DROP POLICY IF EXISTS "cards_designer_update" ON content_cards;
CREATE POLICY "cards_designer_update" ON content_cards
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'designer')
  WITH CHECK (auth.user_role() = 'designer');

DROP POLICY IF EXISTS "cards_traffic_update" ON content_cards;
CREATE POLICY "cards_traffic_update" ON content_cards
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'traffic')
  WITH CHECK (auth.user_role() = 'traffic');

-- ─── design_requests ───────────────────────────────────────
-- Migration 002 já tem 'design_update' que permite admin/manager/designer/service_role.
-- Adicionamos social e traffic — eles criam demandas e precisam editá-las.
DROP POLICY IF EXISTS "design_social_update" ON design_requests;
CREATE POLICY "design_social_update" ON design_requests
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'social')
  WITH CHECK (auth.user_role() = 'social');

DROP POLICY IF EXISTS "design_traffic_update" ON design_requests;
CREATE POLICY "design_traffic_update" ON design_requests
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'traffic')
  WITH CHECK (auth.user_role() = 'traffic');
