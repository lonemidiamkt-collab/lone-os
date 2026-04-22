-- Adiciona campo `nicho` (ex: "varejo de moda", "odontologia", "restaurante")
-- Usado pra preencher a Cláusula 1.1 dos contratos de Tráfego e Lone Growth
-- ("...metodologia voltada para {{cliente_nicho}}...").

ALTER TABLE clients ADD COLUMN IF NOT EXISTS nicho TEXT;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS nicho TEXT;
