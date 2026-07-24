-- Handoff comercial→CS: vínculo do cliente com o lead do CRM que o originou.
-- Antes a conversão "Ganho→Cliente" (app/api/onboarding generate_link_with_draft) copiava só
-- name/contact_name e o cliente ficava DESCONECTADO do lead — o CS não tinha como puxar o histórico
-- do SDR (dor, promessa, valor). Este vínculo permite rastrear de volta e carregar o contexto.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS source_lead_id uuid REFERENCES crm_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_source_lead_id ON clients(source_lead_id);
