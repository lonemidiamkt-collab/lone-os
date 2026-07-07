-- 074_okr_live_metrics_fn.sql — métricas REAIS agregadas para a tela "Metas & OKRs".
--
-- Problema: os OKRs de tráfego liam de mockAdCampaigns (vazio → 0x/0%/0 leads) e engajamento
-- não tinha fonte. Aqui expomos os números REAIS numa função só, com DEDUP obrigatório:
-- metric_snapshots tem ~95 capturas por (cliente, conta, dia) — somar cru infla ~95× (mesmo
-- bug do "reach inflado"). Deduplicamos p/ 1 linha por (cliente, conta, dia) = captura mais
-- recente, e só então somamos gasto/conversões do mês corrente (fuso São Paulo).
--
-- Segurança: SECURITY DEFINER + search_path fixo; execução só p/ service_role (a rota
-- /api/okr/traffic-metrics roda com service_role e já exige login). anon/authenticated NÃO
-- podem chamar direto (não expõe financeiro consolidado por PostgREST público).

CREATE OR REPLACE FUNCTION public.okr_live_metrics()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH daily AS (
    SELECT DISTINCT ON (client_id, meta_ad_account_id, metric_date)
      spend, conversions
    FROM metric_snapshots
    WHERE metric_date >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date
    ORDER BY client_id, meta_ad_account_id, metric_date, captured_at DESC
  ),
  traffic AS (
    SELECT COALESCE(SUM(conversions), 0)::int AS leads,
           COALESCE(SUM(spend), 0)::numeric   AS spend
    FROM daily
  ),
  social AS (
    SELECT COUNT(*)::int AS reports,
           COALESCE(AVG(engagement_rate), 0)::numeric AS eng_rate
    FROM social_reports
    WHERE month = to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')
  )
  SELECT json_build_object(
    'leadsMonth',       (SELECT leads FROM traffic),
    'spendMonth',       round((SELECT spend FROM traffic)),
    'cpl',              round((SELECT spend FROM traffic) / NULLIF((SELECT leads FROM traffic), 0), 2),
    'leadsIsReal',      (SELECT leads FROM traffic) > 0,
    'engagementRate',   round((SELECT eng_rate FROM social), 2),
    'engagementIsReal', (SELECT reports FROM social) > 0
  );
$$;

REVOKE ALL ON FUNCTION public.okr_live_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okr_live_metrics() TO service_role;
