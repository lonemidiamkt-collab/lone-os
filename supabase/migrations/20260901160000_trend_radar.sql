-- LONE TREND RADAR — v1.
--
-- Monitora perfis públicos do Instagram POR NICHO (não por cliente), acha o conteúdo que performou
-- muito acima da média do próprio perfil, e transforma isso em pauta para os clientes daquele nicho.
--
-- POR QUE POR NICHO: 50 clientes cabem em ~12 nichos. Pesquisar "pisos e revestimentos" uma vez
-- alimenta todos os clientes de piso. Coleta compartilhada, interpretação personalizada.
--
-- DECISÃO DE COLETA: tudo pela Instagram Business Discovery API, oficial e já autenticada com o
-- token da agência (escopos instagram_basic + pages_read_engagement, verificados). Testada em
-- perfis reais do mercado: portobello (663k), leroymerlinbrasil (1.9M), telhanorte (193k),
-- votorantimcimentos (148k) responderam com seguidores, likes, comentários, tipo e legenda.
-- Sem scraper, sem custo por resultado, sem risco de termos de uso.
--
-- O QUE A API NÃO DÁ: views/plays de Reel de terceiro. Por isso o outlier aqui é medido por
-- ENGAJAMENTO (curtidas + comentários) contra a mediana do próprio perfil — que é o que a proposta
-- original queria dizer com "outlier ratio", só que na métrica que existe. Um Reel com 8x o
-- engajamento mediano do perfil é o mesmo sinal, sem depender de dado que não vem.

-- ── Perfis monitorados ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS radar_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  -- Nicho normalizado (lib/cs/nicho.ts). O mesmo vocabulário que a pauta já usa.
  nicho text NOT NULL,
  -- 'seed' = cadastrado à mão como referência. 'descoberto' = achado pelo sistema depois.
  origem text NOT NULL DEFAULT 'seed',
  ig_user_id text,
  followers int,
  media_count int,
  -- Desliga sem apagar histórico: perfil que virou privado, sumiu ou parou de postar.
  ativo boolean NOT NULL DEFAULT true,
  motivo_inativo text,
  ultima_coleta timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_profiles_nicho ON radar_profiles (nicho) WHERE ativo;

-- ── Conteúdo coletado ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS radar_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES radar_profiles(id) ON DELETE CASCADE,
  media_id text NOT NULL,
  nicho text NOT NULL,
  media_type text,
  permalink text,
  caption text,
  posted_at timestamptz,
  likes int NOT NULL DEFAULT 0,
  comments int NOT NULL DEFAULT 0,
  -- Seguidores NO MOMENTO DA COLETA. Sem isso a taxa de engajamento fica errada meses depois,
  -- quando o perfil tiver dobrado de tamanho.
  followers_na_coleta int,
  -- Preenchidos pelo motor de performance.
  engagement_rate numeric,
  outlier_ratio numeric,
  trend_score numeric,
  analisado_em timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  -- Nunca coletar (nem pagar IA por) o mesmo post duas vezes.
  UNIQUE (profile_id, media_id)
);
CREATE INDEX IF NOT EXISTS radar_media_nicho_score ON radar_media (nicho, trend_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS radar_media_recentes ON radar_media (posted_at DESC);

-- ── Como o número mudou ao longo do tempo ───────────────────────────────────
-- Um post com 8 mil curtidas pode estar acelerando ou já ter parado. Sem histórico não dá pra
-- distinguir "está bombando agora" de "bombou mês passado" — e só o primeiro vira pauta urgente.
CREATE TABLE IF NOT EXISTS radar_media_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES radar_media(id) ON DELETE CASCADE,
  likes int, comments int,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_snapshots_media ON radar_media_snapshots (media_id, collected_at DESC);

-- ── O que a IA entendeu do conteúdo ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS radar_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL UNIQUE REFERENCES radar_media(id) ON DELETE CASCADE,
  tema text, hook text, hook_tipo text, formato text,
  estrutura text, cta text,
  motivo_performance text,
  replicavel text,
  tags text[],
  modelo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Custo de cada rodada ────────────────────────────────────────────────────
-- Sem isto ninguém sabe quanto o Radar custa até a fatura chegar.
CREATE TABLE IF NOT EXISTS radar_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  nicho text,
  perfis_lidos int DEFAULT 0,
  midias_novas int DEFAULT 0,
  analisadas_ia int DEFAULT 0,
  tokens_entrada int DEFAULT 0,
  tokens_saida int DEFAULT 0,
  custo_estimado numeric DEFAULT 0,
  erros text[],
  duracao_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE radar_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_media_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_runs ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['radar_profiles','radar_media','radar_media_snapshots','radar_analysis','radar_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
