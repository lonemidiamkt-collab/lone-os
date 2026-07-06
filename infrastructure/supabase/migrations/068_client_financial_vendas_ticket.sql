-- 068_client_financial_vendas_ticket.sql
-- Ficha Viva 360 — Fase 1 (Painel de Crescimento).
--
-- A aba "Resultados" do cliente já registra faturamento (revenue) + investimento por
-- mês em client_financial_results. Aqui acrescentamos a dimensão que faltava pra medir
-- o crescimento do NEGÓCIO do cliente (não só o ROI de anúncio):
--   • vendas  = nº de vendas/pedidos do cliente no mês (informado no check-in mensal)
--   • ticket  = ticket médio (faturamento / vendas) — coluna GERADA, nunca digitada
--
-- O "Health de crescimento" (tendência de faturamento) é derivado na própria tela
-- a partir do histórico — sem cron nesta fase. A persistência do score (pro Radar da
-- Fase 2) fica pra depois.

ALTER TABLE client_financial_results
  ADD COLUMN IF NOT EXISTS vendas integer,
  ADD COLUMN IF NOT EXISTS ticket numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN vendas IS NOT NULL AND vendas > 0 THEN revenue / vendas ELSE NULL END
    ) STORED;

COMMENT ON COLUMN client_financial_results.vendas IS
  'Nº de vendas/pedidos do cliente no mês (informado no check-in). Base do ticket médio.';
COMMENT ON COLUMN client_financial_results.ticket IS
  'Ticket médio = faturamento / vendas (coluna gerada). NULL quando vendas ausente ou zero.';
