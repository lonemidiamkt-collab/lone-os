-- billing_type_source: 'auto' (Meta detects) or 'manual' (gestor set by hand)
-- last_3d_avg_spend: average daily spend over last 3 days from Meta Insights API
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS billing_type_source TEXT DEFAULT 'auto'
    CHECK (billing_type_source IN ('auto', 'manual'));

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS last_3d_avg_spend NUMERIC(12,4);

NOTIFY pgrst, 'reload schema';
