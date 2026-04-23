-- Restringe a policy permissiva `sub_auth` em client_onboarding_submissions.
--
-- Situação anterior:
--   `sub_auth` FOR ALL TO authenticated USING (true)
--   → Qualquer usuário logado (designer, social, tráfego) conseguia SELECT em senhas
--     de Meta/Google/Instagram de todos os clientes. Só admin/manager deveria.
--
-- Solução:
--   - Função `is_admin()` lê o email do JWT via `auth.jwt()` e valida contra allowlist
--   - Policy nova usa `is_admin()` → só admin/manager leem dados sensíveis
--
-- Manutenção:
--   Quando adicionar novo admin, atualize a allowlist aqui E em `lib/supabase/auth-server.ts`
--   (manter em sync manual até termos tabela de roles).

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'email') IN (
      'lonemidiamkt@gmail.com',
      'lucas@lonemidia.com',
      'julio@lonemidia.com'
    ),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Re-aplicar a policy de authenticated: só admins podem ler/escrever
-- (a tabela continua acessível via service_role no backend, que bypassa RLS)
DROP POLICY IF EXISTS "sub_auth" ON client_onboarding_submissions;
DROP POLICY IF EXISTS "sub_auth_admin_only" ON client_onboarding_submissions;
CREATE POLICY "sub_auth_admin_only" ON client_onboarding_submissions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Mesma lógica pra clients: conhecidamente tinha policies permissivas
-- (verificar em prod — se sim, apertar. Se não, este bloco é no-op).
-- Comentado por enquanto pra evitar travar operação: ligar manualmente
-- após validar que nenhum staff role precisa ler dados sensíveis diretamente.
--
-- DROP POLICY IF EXISTS "clients_auth_permissive" ON clients;
-- CREATE POLICY "clients_auth_admin_only" ON clients
--   FOR ALL TO authenticated
--   USING (public.is_admin())
--   WITH CHECK (public.is_admin());
