-- Rastreio do ciclo de assinatura do contrato.
--
-- Contexto: o admin baixa o DOCX oficial (gerado pelo Lone OS), sobe no D4Sign pra
-- coletar assinaturas, e agora precisa devolver o PDF assinado pro sistema + marcar
-- o contrato como ativo. Fecha o loop que antes era gerenciado por WhatsApp/Drive.
--
-- Colunas adicionadas em `contracts`:
--   signed_pdf_path      — path relativo no bucket legal-docs
--                          formato: "legal://contracts-signed/{clientId}/{contractId}-v{N}-signed.pdf"
--   signed_at            — quando foi marcado como assinado (não confundir com quando o
--                          cliente efetivamente assinou no D4Sign — o upload pode acontecer
--                          horas/dias depois da assinatura real)
--   signed_uploaded_by   — admin (email) que fez o upload do PDF assinado
--   signature_method     — como foi assinado: 'd4sign_manual' (default), 'outros',
--                          'presencial'. Reservado pra futuras integrações.
--
-- Fluxo de status:
--   draft       (gerado, ainda sem assinatura)
--   active      (signed_at preenchido OU admin ativou manualmente)
--   expired    (end_date ultrapassado — cron diário atualiza)

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_pdf_path TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_uploaded_by TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signature_method TEXT DEFAULT 'd4sign_manual';

-- Index pra acelerar a query "contratos pendentes de assinatura" no dashboard
CREATE INDEX IF NOT EXISTS contracts_pending_signature_idx
  ON contracts (client_id, created_at DESC)
  WHERE signed_at IS NULL;

-- Index pra ordenação geral do dashboard admin (mais recentes primeiro)
CREATE INDEX IF NOT EXISTS contracts_all_created_idx
  ON contracts (created_at DESC);
