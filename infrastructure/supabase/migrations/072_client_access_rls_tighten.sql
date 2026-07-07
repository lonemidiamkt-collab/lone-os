-- 072_client_access_rls_tighten.sql — CORREÇÃO DE SEGURANÇA.
--
-- Achado: a policy de client_access (cofre com senhas em TEXTO PLANO) era
-- `FOR ALL TO authenticated USING (true)` → QUALQUER usuário logado (designer, tráfego,
-- comercial/SDR) podia ler/editar o cofre de todos os clientes direto pela API REST
-- (/supabase/rest/v1/client_access) com a chave pública + um JWT qualquer.
--
-- O app acessa client_access SEMPRE via supabaseAdmin (service_role, que ignora RLS) —
-- pelas rotas /api/client-vault (com checagem de dono) e /api/data/operational (agora
-- gateada por papel). Então restringir a RLS a admin não quebra nada.

DROP POLICY IF EXISTS client_access_all ON client_access;
CREATE POLICY client_access_admin ON client_access
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
