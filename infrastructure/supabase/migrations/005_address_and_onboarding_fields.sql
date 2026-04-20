-- Add granular address fields to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_rua TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_bairro TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_cidade TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_estado TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS endereco_cep TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS doc_logo TEXT;

-- Add new fields to client_onboarding_submissions
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS endereco_rua TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS endereco_bairro TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS endereco_cidade TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS endereco_estado TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS endereco_cep TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS doc_logo TEXT;
