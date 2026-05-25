-- Adiciona coluna current_month_spend em ad_accounts
-- Armazena o gasto acumulado do mês corrente (Meta Insights, date_preset=this_month)
-- em reais (não centavos). Usado para calcular saldo real de contas pós-pagas com
-- monthly_budget contratado — evita usar amount_spent que pode ser vitalício.

ALTER TABLE ad_accounts
  ADD COLUMN IF NOT EXISTS current_month_spend NUMERIC(14, 2) DEFAULT NULL;

COMMENT ON COLUMN ad_accounts.current_month_spend IS
  'Gasto acumulado no mês corrente em reais (Insights date_preset=this_month). Null enquanto não sincronizado.';
