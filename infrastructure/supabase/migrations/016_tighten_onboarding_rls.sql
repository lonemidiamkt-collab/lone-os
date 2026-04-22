-- Restrict RLS on `client_onboarding_submissions`.
--
-- Context: this table holds CPF, CNPJ, endereços, senhas de Meta/Google/Instagram dos clientes.
-- Before this migration, the policy was `FOR ALL TO anon USING (true)` — ou seja, qualquer um
-- com a chave anon do Supabase (que sai no bundle do browser) conseguia SELECT/UPDATE em todos os registros.
--
-- Fluxo legítimo da aplicação:
--   - Formulário público de onboarding: usa `/api/onboarding/*` que roda no server com service_role
--     (bypassa RLS). Browser nunca toca a tabela diretamente com anon.
--   - Página admin `/clients/pending`: usa supabase client autenticado (role = authenticated).
--
-- Este migration:
--   - Remove a policy anon permissiva (fecha o vazamento)
--   - Mantém a policy authenticated aberta (admin pending page continua funcionando)
--
-- TODO (próximo ciclo de segurança): restringir a policy authenticated pra só admins/managers,
-- usando claim JWT ou função que cheque role.

-- A policy permissiva pode ter sido nomeada `onboarding_sub_anon` (migration 005 em dev) ou
-- `sub_anon` (em prod self-hosted). Droppamos ambos os nomes pra cobrir as duas instâncias.
DROP POLICY IF EXISTS "onboarding_sub_anon" ON client_onboarding_submissions;
DROP POLICY IF EXISTS "sub_anon" ON client_onboarding_submissions;

-- Nega explicitamente qualquer acesso anon (defesa em profundidade).
-- CREATE POLICY não aceita IF NOT EXISTS em PG<15 — daí o DROP antes pra garantir idempotência.
DROP POLICY IF EXISTS "onboarding_sub_anon_deny" ON client_onboarding_submissions;
CREATE POLICY "onboarding_sub_anon_deny" ON client_onboarding_submissions
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);
