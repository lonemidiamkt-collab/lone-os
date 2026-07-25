-- Fase 4 — fechar leitura direta de dado sensível pela API pública do Supabase.
--
-- Situação encontrada (pg_policies em produção):
--   · crm_leads / crm_lead_activities → policy "ALL" para `authenticated` com USING(true).
--     Qualquer pessoa logada no Lone OS (designer, social) podia LER **E ESCREVER** o funil comercial
--     inteiro — contatos, valor negociado, motivo de perda — direto no PostgREST, sem passar pela API.
--   · cs_demandas → SELECT para `authenticated` com USING(true): reclamações nominais de clientes.
--
-- A aplicação NÃO depende disso: toda leitura dessas tabelas passa por `supabaseAdmin` (service_role),
-- que ignora RLS. Confirmado por grep — nenhum `supabase.from("crm_leads"|"cs_demandas")` no browser.
-- As demais tabelas sensíveis (cs_message_corpus, client_journey, client_checkins, client_ig_snapshots)
-- já estão com RLS ligada e SEM policy, o que nega tudo por padrão — corretas.

DROP POLICY IF EXISTS crm_leads_all ON crm_leads;
DROP POLICY IF EXISTS crm_lead_activities_all ON crm_lead_activities;
DROP POLICY IF EXISTS cs_demandas_auth_read ON cs_demandas;

-- Garante o caminho que a aplicação realmente usa.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_leads' AND policyname='crm_leads_service') THEN
    CREATE POLICY crm_leads_service ON crm_leads FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_lead_activities' AND policyname='crm_lead_activities_service') THEN
    CREATE POLICY crm_lead_activities_service ON crm_lead_activities FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

REVOKE ALL ON crm_leads, crm_lead_activities, cs_demandas FROM anon, authenticated;
