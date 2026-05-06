-- Restringe RLS em content_cards e design_requests pra evitar vazamento cruzado
-- entre clientes concorrentes.
--
-- Problema atual:
--   `cards_read_all` e `design_read_all` permitem ANY authenticated user ler
--   TODOS os cards/requests. Designer vê briefing da construtora X e Y no mesmo feed
--   (clientes concorrentes entre si). Viola compartimentação de informação.
--
-- Política nova (por papel):
--   - Admin/manager/service_role → tudo (inalterado)
--   - Social → só cards onde social_media = user_name dele
--   - Designer → só cards/requests de clientes onde clients.assigned_designer = user_name dele
--   - Traffic → só cards/requests de clientes onde clients.assigned_traffic = user_name dele
--
-- Policies de INSERT/UPDATE/DELETE já existentes permanecem — só trocamos SELECT.

-- ─── content_cards ─────────────────────────────────────────
DROP POLICY IF EXISTS "cards_read_all" ON content_cards;

DROP POLICY IF EXISTS "cards_admin_read" ON content_cards;
CREATE POLICY "cards_admin_read" ON content_cards
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'));

DROP POLICY IF EXISTS "cards_social_read" ON content_cards;
CREATE POLICY "cards_social_read" ON content_cards
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'social'
    AND social_media = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
  );

DROP POLICY IF EXISTS "cards_designer_read" ON content_cards;
CREATE POLICY "cards_designer_read" ON content_cards
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'designer'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_designer = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );

DROP POLICY IF EXISTS "cards_traffic_read" ON content_cards;
CREATE POLICY "cards_traffic_read" ON content_cards
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'traffic'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_traffic = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );

-- ─── design_requests ────────────────────────────────────────
DROP POLICY IF EXISTS "design_read_all" ON design_requests;

DROP POLICY IF EXISTS "design_admin_read" ON design_requests;
CREATE POLICY "design_admin_read" ON design_requests
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'));

-- Designer vê requests dos clientes dele OU requests geral em status 'queued' (precisa ver fila)
DROP POLICY IF EXISTS "design_designer_read" ON design_requests;
CREATE POLICY "design_designer_read" ON design_requests
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'designer'
    AND (
      status = 'queued'
      OR client_id IN (
        SELECT id FROM clients
        WHERE assigned_designer = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
      )
    )
  );

DROP POLICY IF EXISTS "design_traffic_read" ON design_requests;
CREATE POLICY "design_traffic_read" ON design_requests
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'traffic'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_traffic = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );

DROP POLICY IF EXISTS "design_social_read" ON design_requests;
CREATE POLICY "design_social_read" ON design_requests
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'social'
    AND client_id IN (
      SELECT id FROM clients
      WHERE assigned_social = (current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
    )
  );
