-- Add missing columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta_ad_account_name TEXT;
