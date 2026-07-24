-- team_traffic_spend_week() — CORREÇÃO da janela de comparação.
-- BUG: comparava a semana PARCIAL (segunda → hoje; na sexta são ~4,7 dias) contra a semana ANTERIOR
-- INTEIRA (7 dias). Resultado: TODO cliente com verba estável "caía" ~40% no relatório de sexta, por
-- artefato de janela — não por movimento real. (Relatório interno de sexta ficou "totalmente estranho".)
-- FIX: espelhar a janela — comparar seg→hoje contra a MESMA fração da semana passada (seg-7 → hoje-7,
-- ou seja, do início da semana passada até o mesmo dia da semana). Assim só sobra movimento REAL.
-- Mantém o DEDUP (metric_snapshots captura ~95x/dia → MAX por cliente/conta/data antes de somar).
CREATE OR REPLACE FUNCTION team_traffic_spend_week()
RETURNS TABLE(client_id uuid, spend_atual numeric, spend_anterior numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $FN$
  WITH b AS (
    SELECT date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::date AS seg,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  daily AS (
    SELECT client_id, meta_ad_account_id, metric_date, MAX(spend) AS spend
    FROM metric_snapshots
    WHERE metric_date >= (SELECT seg - 7 FROM b)
    GROUP BY 1,2,3
  )
  SELECT d.client_id,
    -- Semana corrente parcial: segunda → hoje.
    COALESCE(SUM(d.spend) FILTER (WHERE d.metric_date >= (SELECT seg FROM b)), 0) AS spend_atual,
    -- Janela ESPELHADA da semana anterior: seg-7 até hoje-7 (mesmo nº de dias decorridos).
    COALESCE(SUM(d.spend) FILTER (
      WHERE d.metric_date >= (SELECT seg - 7 FROM b)
        AND d.metric_date <= (SELECT hoje - 7 FROM b)
    ), 0) AS spend_anterior
  FROM daily d
  GROUP BY d.client_id;
$FN$;
REVOKE ALL ON FUNCTION team_traffic_spend_week() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION team_traffic_spend_week() TO service_role;
