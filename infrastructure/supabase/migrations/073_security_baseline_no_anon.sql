-- 073_security_baseline_no_anon.sql — BASELINE DE SEGURANÇA (governança).
--
-- Problema: migrations antigas (003/006/007) criam policies `FOR ALL TO anon USING(true)` em ~20
-- tabelas (incl. clients, client_access, contracts) e buckets `public=true` (contracts/reports/
-- onboarding-docs). Em produção isso já foi removido MANUALMENTE, mas os arquivos continuam — se o
-- banco for recriado do zero a partir das migrations, TODO o vazamento reabre. Esta migration roda
-- por último e garante o estado seguro num rebuild (idempotente; no banco atual é no-op).
--
-- Não reescreve o histórico (não edita 003/006/007) — só neutraliza o resultado inseguro no fim.

-- 1) Derruba QUALQUER policy que libere o papel `anon` em tabela do schema public
--    (nome-agnóstico: pega o que 003/006/007 criaram, sejam quais forem os nomes).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND 'anon' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2) Revoga privilégio direto do anon nas tabelas com dado sensível (defesa em profundidade:
--    mesmo se a RLS for desligada por engano, o anon não alcança).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','client_access','contracts','contract_templates',
    'client_financial_results','client_diagnostics','client_briefings'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- 3) Buckets sensíveis SEMPRE privados (identidade/contrato/relatório não são baixáveis por URL).
UPDATE storage.buckets SET public = false
WHERE id IN ('contracts', 'reports', 'onboarding-docs', 'legal-docs');
