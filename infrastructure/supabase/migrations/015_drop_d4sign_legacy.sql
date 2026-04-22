-- Drop D4Sign legacy columns.
-- Context: migrated from D4Sign API integration to local DOCX merge (docxtemplater).
-- The contract flow is now: generate DOCX locally → admin uploads manually to D4Sign.
-- These columns are no longer referenced anywhere in the app code.
--
-- KEPT intentionally (for historical data on contracts already sent via old API):
--   contracts.d4sign_document_id
--   contracts.d4sign_status
-- These are null for all new contracts and safe to keep as read-only archive.

ALTER TABLE contract_templates DROP COLUMN IF EXISTS d4sign_template_id;
ALTER TABLE contract_templates DROP COLUMN IF EXISTS d4sign_safe_id;

ALTER TABLE agency_settings DROP COLUMN IF EXISTS d4sign_token;
ALTER TABLE agency_settings DROP COLUMN IF EXISTS d4sign_crypt_key;
