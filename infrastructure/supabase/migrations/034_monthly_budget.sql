-- Verba mensal configurada pelo gestor para contas pós-pago.
-- Quando definida, o saldo disponível passa a ser monthly_budget - amount_spent
-- (em vez de spend_cap - amount_spent, que pode ser um teto de segurança alto).
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2);

NOTIFY pgrst, 'reload schema';
