-- 075_okr_live_metrics_v2.sql — estende okr_live_metrics() com métricas reais adicionais:
--   • Tráfego qualidade: CTR médio (ponderado) + alcance (impressões, deduplicado)
--   • Churn REAL: cancelados no mês ÷ base (via clients.churned_at) — no lugar do proxy "em risco"
--   • Relacionamento: clientes ativos sem interação registrada há +15 dias (interaction_logs)
-- Mantém o DEDUP de metric_snapshots (~95 capturas/dia). CREATE OR REPLACE — não quebra a rota.

CREATE OR REPLACE FUNCTION public.okr_live_metrics()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH daily AS (
    SELECT DISTINCT ON (client_id, meta_ad_account_id, metric_date)
      spend, conversions, clicks, impressions
    FROM metric_snapshots
    WHERE metric_date >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date
    ORDER BY client_id, meta_ad_account_id, metric_date, captured_at DESC
  ),
  traffic AS (
    SELECT COALESCE(SUM(conversions), 0)::int  AS leads,
           COALESCE(SUM(spend), 0)::numeric    AS spend,
           COALESCE(SUM(clicks), 0)::bigint    AS clicks,
           COALESCE(SUM(impressions), 0)::bigint AS impressions
    FROM daily
  ),
  social AS (
    SELECT COUNT(*)::int AS reports,
           COALESCE(AVG(engagement_rate), 0)::numeric AS eng_rate
    FROM social_reports
    WHERE month = to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')
  ),
  churn AS (
    SELECT COUNT(*) FILTER (WHERE active = true)::int AS active_clients,
           COUNT(*) FILTER (
             WHERE churned_at IS NOT NULL
               AND churned_at >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
           )::int AS churned_month
    FROM clients
  ),
  relationship AS (
    SELECT COUNT(*)::int AS stale
    FROM clients c
    WHERE c.active = true
      AND COALESCE(
            (SELECT MAX(il.logged_at) FROM interaction_logs il WHERE il.client_id = c.id),
            '2000-01-01'::timestamptz
          ) < (now() AT TIME ZONE 'America/Sao_Paulo') - interval '15 days'
  )
  SELECT json_build_object(
    'leadsMonth',       (SELECT leads FROM traffic),
    'spendMonth',       round((SELECT spend FROM traffic)),
    'cpl',              round((SELECT spend FROM traffic) / NULLIF((SELECT leads FROM traffic), 0), 2),
    'leadsIsReal',      (SELECT leads FROM traffic) > 0,
    'ctrPct',           round((SELECT clicks FROM traffic)::numeric / NULLIF((SELECT impressions FROM traffic), 0) * 100, 2),
    'impressionsMonth', (SELECT impressions FROM traffic),
    'trafficQualIsReal',(SELECT impressions FROM traffic) > 0,
    'engagementRate',   round((SELECT eng_rate FROM social), 2),
    'engagementIsReal', (SELECT reports FROM social) > 0,
    'activeClients',    (SELECT active_clients FROM churn),
    'churnedMonth',     (SELECT churned_month FROM churn),
    'churnRate',        round(
                          (SELECT churned_month FROM churn)::numeric
                          / NULLIF((SELECT active_clients FROM churn) + (SELECT churned_month FROM churn), 0) * 100, 1),
    'staleContacts',    (SELECT stale FROM relationship)
  );
$$;

REVOKE ALL ON FUNCTION public.okr_live_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okr_live_metrics() TO service_role;
