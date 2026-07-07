-- 071_cs_tables_rls_fix.sql — CORREÇÃO DE SEGURANÇA (vazamento de dados).
--
-- Achado: as 6 tabelas do agente CS foram criadas SEM Row Level Security. Como a role `anon`
-- tem grant padrão no schema public e a API REST do Supabase é acessível (chave anon é pública,
-- vai no bundle do site + proxy /supabase/rest), QUALQUER UM podia LER e APAGAR o conteúdo delas
-- (mensagens de clientes, briefings, cobranças, etc.).
--
-- O app acessa essas tabelas SEMPRE via supabaseAdmin (service_role, que ignora RLS) — logo,
-- habilitar RLS + revogar o anon NÃO quebra nada. Fecha a leitura/escrita anônima.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cs_demandas','cs_processed_messages','cs_cobrancas',
    'cs_rework_events','cs_roteiro_pedidos','cs_onboarding_sessions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_auth_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_all', t);
  END LOOP;
END $$;

-- Storage de CONTRATOS: a policy deixava `anon` LER/INSERIR objetos (bucket privado, mas a RLS do
-- storage continuava aberta → dava pra baixar contrato com a chave anon). O app serve contrato por
-- SIGNED URL (service_role) — então basta restringir a authenticated e tirar o anon.
DROP POLICY IF EXISTS contracts_storage_read ON storage.objects;
CREATE POLICY contracts_storage_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'contracts');
DROP POLICY IF EXISTS contracts_storage_insert ON storage.objects;
CREATE POLICY contracts_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contracts');
