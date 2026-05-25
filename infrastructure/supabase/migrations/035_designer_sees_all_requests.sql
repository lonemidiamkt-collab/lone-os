-- Designer deve ver TODAS as design_requests, independente do cliente atribuído.
-- O filtro anterior (queued OR assigned_client) fazia requests desaparecerem
-- ao mudar de status quando o cliente não estava atribuído ao designer.
-- Como a agência tem um designer que atende todos os clientes, removemos o filtro.

DROP POLICY IF EXISTS "design_designer_read" ON design_requests;

CREATE POLICY "design_designer_read" ON design_requests
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'designer');
