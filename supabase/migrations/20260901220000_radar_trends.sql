-- Tendências com vida própria: nascem, crescem, enfraquecem e morrem.
--
-- Antes o agrupamento era reconstruído a cada execução a partir das análises, e a "tendência" era
-- só nicho + formato. Dois problemas:
--   1. FORMATO NÃO É TENDÊNCIA. "institucional", "carrossel" e "Reel" são recipientes. Quatro
--      conteúdos que só têm em comum serem institucionais não são um movimento de mercado —
--      "storytelling de legado" é. O que se replica é o mecanismo, não o formato.
--   2. Sem entidade estável não dá pra acompanhar evolução, nem evitar gerar a mesma pauta para
--      sempre por causa de dois conteúdos de 40 dias atrás.
CREATE TABLE IF NOT EXISTS radar_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho text NOT NULL,
  -- Chave estável derivada do mecanismo, para reencontrar a mesma tendência entre execuções.
  assinatura text NOT NULL,
  nome text NOT NULL,
  descricao text,
  mecanismo text NOT NULL,
  formatos text[],
  aberturas text[],
  perfis_count int NOT NULL DEFAULT 0,
  midias_count int NOT NULL DEFAULT 0,
  outlier_mediano numeric,
  forca numeric NOT NULL DEFAULT 0,
  -- signal: um conteúdo só. emerging: 2 perfis. growing/strong: mais. declining/dead: parou.
  status text NOT NULL DEFAULT 'signal',
  primeira_vez timestamptz NOT NULL DEFAULT now(),
  ultima_vez timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nicho, assinatura)
);
CREATE INDEX IF NOT EXISTS radar_trends_vivas ON radar_trends (nicho, forca DESC) WHERE status IN ('emerging','growing','strong');

CREATE TABLE IF NOT EXISTS radar_trend_media (
  trend_id uuid NOT NULL REFERENCES radar_trends(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES radar_media(id) ON DELETE CASCADE,
  PRIMARY KEY (trend_id, media_id)
);

-- Baseline por TIPO de conteúdo.
--
-- Um perfil pode ter carrossel voando e Reel arrastado, ou o contrário. Comparar um Reel com a
-- mediana geral do perfil mistura coisas que o público consome de formas diferentes — e produz
-- outlier que é só diferença de formato.
CREATE TABLE IF NOT EXISTS radar_baselines (
  profile_id uuid NOT NULL REFERENCES radar_profiles(id) ON DELETE CASCADE,
  media_type text NOT NULL,
  amostra int NOT NULL,
  mediana numeric NOT NULL,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, media_type)
);

ALTER TABLE radar_media ADD COLUMN IF NOT EXISTS analysis_level text;
ALTER TABLE radar_analysis ADD COLUMN IF NOT EXISTS mecanismo text;
ALTER TABLE radar_analysis ADD COLUMN IF NOT EXISTS angulo text;
ALTER TABLE radar_analysis ADD COLUMN IF NOT EXISTS confianca text;
ALTER TABLE radar_pautas ADD COLUMN IF NOT EXISTS trend_id uuid REFERENCES radar_trends(id) ON DELETE SET NULL;
ALTER TABLE radar_pautas ADD COLUMN IF NOT EXISTS fit_score numeric;
-- Evita a mesma tendência virando a mesma pauta pro mesmo cliente toda semana.
CREATE UNIQUE INDEX IF NOT EXISTS radar_pautas_sem_repetir
  ON radar_pautas (client_id, trend_id) WHERE status = 'nova';

ALTER TABLE radar_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_trend_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_baselines ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['radar_trends','radar_trend_media','radar_baselines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
