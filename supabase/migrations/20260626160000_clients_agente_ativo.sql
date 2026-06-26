-- Pausa do Agente CS por cliente. agente_ativo=false → o agente IGNORA o cliente por completo
-- (captação de demanda E vigilância de fluxo) até religar. Pra cliente em renegociação, contrato
-- pausado, férias coletivas, etc. Default = true (todos ativos).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS agente_ativo boolean NOT NULL DEFAULT true;
