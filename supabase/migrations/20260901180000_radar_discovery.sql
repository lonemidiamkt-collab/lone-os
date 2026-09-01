-- RADAR: descoberta em primeiro lugar, watchlist em segundo.
--
-- A v1 monitorava perfis cadastrados à mão — um monitor de benchmarks, não um radar de mercado. A
-- diferença importa: "o que a Portobello publicou" e "o que está funcionando no mercado de pisos"
-- são perguntas diferentes, e só a segunda encontra a loja de 8 mil seguidores que acertou.
--
-- O QUE O CAPABILITY PROBE MOSTROU (registrado em radar_capabilities, nada aqui é suposição):
--   • busca por hashtag: BLOQUEADA. Erro #10 — exige a permissão "Instagram Public Content Access",
--     que passa por App Review da Meta. Era a porta de entrada natural para descoberta.
--   • business_discovery por username: funciona, e devolve até 100 posts de histórico.
--   • media_url de terceiro: vem para IMAGE e CAROUSEL (baixei um JPEG de 83 KB, HTTP 200) e NÃO
--     vem para VIDEO — só thumbnail. Análise profunda de Reel alheio não é possível hoje.
--
-- Sem hashtag, a descoberta entra por BUSCA WEB (seção 9 da proposta): a IA procura perfis do nicho,
-- e cada candidato é validado e medido pela API oficial. Testado: 20 candidatos → 12 validados →
-- obramaxatacado com 31x e ilumibrasil com 23,8x, nenhum deles cadastrado por ninguém.

-- ── O que o provedor consegue fazer, medido e não suposto ───────────────────
CREATE TABLE IF NOT EXISTS radar_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  disponivel boolean NOT NULL,
  detalhe text,
  testado_em timestamptz NOT NULL DEFAULT now()
);

-- ── As perguntas que o radar faz ao mercado ─────────────────────────────────
CREATE TABLE IF NOT EXISTS radar_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho text NOT NULL,
  query text NOT NULL,
  tipo text NOT NULL DEFAULT 'keyword',   -- keyword | produto | problema | regional | formato
  ativa boolean NOT NULL DEFAULT true,
  -- Quantos perfis ÚTEIS esta pergunta já trouxe. Pergunta que não acha nada perde a vez.
  achados_uteis int NOT NULL DEFAULT 0,
  usos int NOT NULL DEFAULT 0,
  ultima_vez timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nicho, query)
);
CREATE INDEX IF NOT EXISTS radar_queries_rodizio ON radar_queries (nicho, ultima_vez NULLS FIRST) WHERE ativa;

-- ── Perfis descobertos ──────────────────────────────────────────────────────
ALTER TABLE radar_profiles ADD COLUMN IF NOT EXISTS faixa text;
ALTER TABLE radar_profiles ADD COLUMN IF NOT EXISTS descoberto_por uuid REFERENCES radar_queries(id);
ALTER TABLE radar_profiles ADD COLUMN IF NOT EXISTS qualidade numeric NOT NULL DEFAULT 0;
ALTER TABLE radar_profiles ADD COLUMN IF NOT EXISTS outliers_encontrados int NOT NULL DEFAULT 0;
ALTER TABLE radar_profiles ADD COLUMN IF NOT EXISTS mediana_engajamento numeric;
ALTER TABLE radar_profiles ADD COLUMN IF NOT EXISTS baseline_posts int;

-- ── Cada rodada de descoberta ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS radar_discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho text NOT NULL,
  queries_usadas text[],
  candidatos int DEFAULT 0,
  validados int DEFAULT 0,
  novos int DEFAULT 0,
  sem_base int DEFAULT 0,
  ruido_descartado int DEFAULT 0,
  custo_estimado numeric DEFAULT 0,
  erros text[],
  duracao_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE radar_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_discovery_runs ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['radar_capabilities','radar_queries','radar_discovery_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- O probe de 01/09/2026, para ninguém reimplementar em cima de suposição.
INSERT INTO radar_capabilities (chave, disponivel, detalhe) VALUES
  ('instagram.hashtag_search', false, 'Erro #10: exige "Instagram Public Content Access" via App Review da Meta'),
  ('instagram.business_discovery', true, 'Funciona com o token atual; até 100 posts de histórico por perfil'),
  ('instagram.third_party_image_binary', true, 'media_url vem para IMAGE e CAROUSEL e baixa (JPEG, HTTP 200)'),
  ('instagram.third_party_video_binary', false, 'VIDEO não traz media_url — só thumbnail. Sem frames nem transcrição de Reel alheio'),
  ('openai.web_search', true, 'Ferramenta nativa disponível na conta; é a porta de descoberta enquanto a hashtag estiver bloqueada')
ON CONFLICT (chave) DO UPDATE SET disponivel=EXCLUDED.disponivel, detalhe=EXCLUDED.detalhe, testado_em=now();
