-- team_traffic_spend_week() — verba (spend) da semana corrente vs a anterior, por cliente.
-- Usada pelo relatório interno de sexta (/api/system/team-weekly) pra sinalizar em quais
-- clientes o Julio provavelmente mexeu na verba (o sistema NÃO registra edição campanha-a-campanha
-- feita no Gerenciador da Meta; isto é um sinal derivado do gasto sincronizado).
-- DEDUP obrigatório: metric_snapshots captura ~95x/dia → SUM cru infla ~95×. Pegamos o valor
-- final do dia (MAX por cliente/conta/data) antes de somar a janela.
CREATE OR REPLACE FUNCTION team_traffic_spend_week()
RETURNS TABLE(client_id uuid, spend_atual numeric, spend_anterior numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $FN$
  WITH b AS (
    SELECT date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::date AS seg
  ),
  daily AS (
    SELECT client_id, meta_ad_account_id, metric_date, MAX(spend) AS spend
    FROM metric_snapshots
    WHERE metric_date >= (SELECT seg - 7 FROM b)
    GROUP BY 1,2,3
  )
  SELECT d.client_id,
    COALESCE(SUM(d.spend) FILTER (WHERE d.metric_date >= (SELECT seg FROM b)), 0) AS spend_atual,
    COALESCE(SUM(d.spend) FILTER (WHERE d.metric_date <  (SELECT seg FROM b)), 0) AS spend_anterior
  FROM daily d
  GROUP BY d.client_id;
$FN$;
REVOKE ALL ON FUNCTION team_traffic_spend_week() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION team_traffic_spend_week() TO service_role;
