-- ═══════════════════════════════════════════════════════════
-- Lone OS — Add contact_email to onboarding submissions
-- Required for welcome email + D4Sign signer + all downstream automation
-- ═══════════════════════════════════════════════════════════

ALTER TABLE client_onboarding_submissions
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Backfill email on clients table when missing (email_corporativo already exists)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_onboarding_sub_email
  ON client_onboarding_submissions(contact_email);
