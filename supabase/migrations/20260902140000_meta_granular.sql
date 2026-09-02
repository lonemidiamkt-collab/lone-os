-- Desempenho por CAMPANHA, CONJUNTO e ANÚNCIO — a granularidade que faltava.
--
-- O sistema só guardava métrica por CONTA e por dia. Isso responde "quanto o cliente gastou", mas
-- não responde nenhuma das perguntas que um gestor faz de verdade: qual conjunto está queimando
-- verba, qual anúncio parou de entregar, qual criativo cansou. O exemplo que o Roberto deu — um
-- conjunto com CPL de R$39 ao lado de outro com R$9 na mesma campanha — é literalmente invisível
-- para os dados de hoje.
--
-- Testei antes de criar: a Graph API devolve os três níveis, com FREQUÊNCIA inclusive, que é o sinal
-- de fadiga de criativo. Estava a uma chamada de distância.

CREATE TABLE IF NOT EXISTS meta_entity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  meta_ad_account_id text NOT NULL,
  -- campaign | adset | ad
  nivel text NOT NULL,
  entity_id text NOT NULL,
  entity_name text,
  -- Para subir na hierarquia sem outra chamada: um anúncio ruim precisa dizer de que conjunto veio.
  campaign_name text,
  adset_name text,
  metric_date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  ctr numeric,
  cpm numeric,
  /** Quantas vezes a MESMA pessoa viu. É o principal sinal de fadiga de criativo. */
  frequency numeric,
  /** Conversas iniciadas — mesma métrica do resto do sistema (messaging_conversation_started_7d). */
  conversions bigint NOT NULL DEFAULT 0,
  /** Custo por conversa. NULL quando não houve conversa — não é zero, é indefinido. */
  cost_per_conversion numeric,
  /** ACTIVE | PAUSED | ARCHIVED | DELETED — pra achar campanha que devia estar no ar e não está. */
  status text,
  effective_status text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, metric_date)
);

CREATE INDEX IF NOT EXISTS meta_entity_cliente ON meta_entity_snapshots (client_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS meta_entity_nivel ON meta_entity_snapshots (nivel, metric_date DESC);
-- Índice do caso mais consultado: quem gastou e não converteu.
CREATE INDEX IF NOT EXISTS meta_entity_desperdicio
  ON meta_entity_snapshots (metric_date DESC, spend DESC) WHERE conversions = 0 AND spend > 0;

ALTER TABLE meta_entity_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_entity_service ON meta_entity_snapshots;
CREATE POLICY meta_entity_service ON meta_entity_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
