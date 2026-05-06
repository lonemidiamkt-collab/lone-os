-- ═══════════════════════════════════════════════════════════
-- Lone OS — Contract renewal pricing
-- ═══════════════════════════════════════════════════════════

-- has_renewal  : true quando o contrato tem reajuste apos o periodo inicial
-- renewal_value: novo valor mensal que entra em vigor apos end_date
-- renewal_draft_of: id do contrato pai quando o registro e uma RENOVACAO automatica
--                   (criada pelo cron, aguardando envio manual)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS has_renewal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_value NUMERIC;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_draft_of UUID REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_renewal_draft_of ON contracts(renewal_draft_of);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date) WHERE status = 'active';
