-- team_traffic_spend_week() — 2ª correção: ancorar a janela no ÚLTIMO DIA COM DADO, não no calendário.
-- Depois de espelhar seg→hoje vs seg-7→hoje-7, sobrou um resíduo: os snapshots do dia corrente
-- costumam entrar com atraso (hoje pode não estar em metric_snapshots ainda, ou entra PARCIAL). Aí a
-- janela atual pegava 3 dias (seg..ontem) e o espelho pegava 4 (seg-7..hoje-7) → ~-25% falso em todo
-- cliente. FIX: fim = maior metric_date da semana corrente que já seja um DIA COMPLETO (< hoje). Ambas
-- as janelas terminam no mesmo nº de dias: atual [seg, fim] vs anterior [seg-7, fim-7]. Comparação justa.
CREATE OR REPLACE FUNCTION team_traffic_spend_week()
RETURNS TABLE(client_id uuid, spend_atual numeric, spend_anterior numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $FN$
  WITH b0 AS (
    SELECT date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::date AS seg,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  b AS (
    SELECT seg, hoje,
      -- último dia COMPLETO com dado nesta semana (exclui hoje, que é parcial). Fallback: seg.
      COALESCE(
        (SELECT MAX(metric_date) FROM metric_snapshots
          WHERE metric_date >= seg AND metric_date < hoje), seg
      ) AS fim
    FROM b0
  ),
  daily AS (
    -- dedup: metric_snapshots captura ~95x/dia → valor final do dia (MAX) por cliente/conta/data.
    SELECT client_id, meta_ad_account_id, metric_date, MAX(spend) AS spend
    FROM metric_snapshots
    WHERE metric_date >= (SELECT seg - 7 FROM b)
    GROUP BY 1,2,3
  )
  SELECT d.client_id,
    -- Semana corrente: seg → fim (último dia completo).
    COALESCE(SUM(d.spend) FILTER (
      WHERE d.metric_date >= (SELECT seg FROM b) AND d.metric_date <= (SELECT fim FROM b)
    ), 0) AS spend_atual,
    -- Espelho da anterior: seg-7 → fim-7 (MESMO nº de dias).
    COALESCE(SUM(d.spend) FILTER (
      WHERE d.metric_date >= (SELECT seg - 7 FROM b) AND d.metric_date <= (SELECT fim - 7 FROM b)
    ), 0) AS spend_anterior
  FROM daily d
  GROUP BY d.client_id;
$FN$;
REVOKE ALL ON FUNCTION team_traffic_spend_week() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION team_traffic_spend_week() TO service_role;
