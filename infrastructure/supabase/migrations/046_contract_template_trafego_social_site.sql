-- Novo tipo de contrato: Trafego + Social + Site (gestao e atualizacao de website).
-- Complementa os 3 existentes (assessoria_trafego, assessoria_social, lone_growth)
-- sem alterar nenhum deles. O DOCX oficial fica em
-- contract-templates/Contrato - Trafego Social Site.docx (mapeado em lib/contracts/generateDocx.ts).
-- service_type em contracts/clients e' TEXT livre (sem enum/check), entao nao ha constraint a atualizar.

INSERT INTO contract_templates (name, service_type, duration_months, description) VALUES
  ('Trafego + Social + Site', 'trafego_social_site', 3, 'Combo: Trafego + Social + Gestao e atualizacao de Website')
ON CONFLICT (service_type) DO NOTHING;
