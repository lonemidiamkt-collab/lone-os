-- ============================================================
-- Migration 043: Banco de Briefings por Cliente
-- Criado em: 2026-05-18
-- Descrição: Tabela versionada de briefings estratégicos
--            por cliente. Cada save gera nova versão;
--            is_current marca a versão ativa.
-- ============================================================

-- ── 1. TABELA PRINCIPAL ──────────────────────────────────────

CREATE TABLE client_briefings (

  -- Identificação
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version      INT         NOT NULL,
  is_current   BOOLEAN     NOT NULL DEFAULT false,

  -- Auditoria
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID        REFERENCES team_members(id) ON DELETE SET NULL,

  -- ── Estratégia ──────────────────────────────────────────────
  resumo_estrategico        TEXT,
  produtos                  TEXT[]  NOT NULL DEFAULT '{}',
  publico_alvo              TEXT[]  NOT NULL DEFAULT '{}',
  posicionamento            TEXT,
  dores                     TEXT[]  NOT NULL DEFAULT '{}',
  ganchos                   TEXT[]  NOT NULL DEFAULT '{}',
  ctas                      TEXT[]  NOT NULL DEFAULT '{}',
  observacoes_estrategicas  TEXT,

  -- ── Identidade Visual ────────────────────────────────────────
  -- paleta_cores: [{hex: "#2B3CFF", nome: "Azul Lone"}, ...]
  paleta_cores              JSONB   NOT NULL DEFAULT '[]',
  tipografia                TEXT,
  logo_url                  TEXT,
  referencias_visuais       TEXT[]  NOT NULL DEFAULT '{}',
  elementos_evitar          TEXT[]  NOT NULL DEFAULT '{}',

  -- ── Voz e Tom ────────────────────────────────────────────────
  -- tom_voz: formal | informal | divertido | tecnico | misto
  tom_voz                       TEXT,
  -- pessoa_verbal: voce | voces | tu | a_gente
  pessoa_verbal                 TEXT,
  usa_emoji                     BOOLEAN,
  usa_giria                     BOOLEAN,
  palavras_proibidas            TEXT[]  NOT NULL DEFAULT '{}',
  hashtags_padrao               TEXT[]  NOT NULL DEFAULT '{}',

  -- ── Operação ─────────────────────────────────────────────────
  horarios_preferidos           TEXT,
  produtos_destaque_atual       TEXT[]  NOT NULL DEFAULT '{}',
  concorrentes_evitar_mencionar TEXT[]  NOT NULL DEFAULT '{}',

  -- ── Interno (nunca exposto ao cliente) ───────────────────────
  observacoes_internas          TEXT,

  -- ── Constraints ──────────────────────────────────────────────
  CONSTRAINT uq_client_version UNIQUE (client_id, version),

  -- Validação de enum tom_voz
  CONSTRAINT chk_tom_voz CHECK (
    tom_voz IS NULL OR tom_voz IN ('formal','informal','divertido','tecnico','misto')
  ),

  -- Validação de enum pessoa_verbal
  CONSTRAINT chk_pessoa_verbal CHECK (
    pessoa_verbal IS NULL OR pessoa_verbal IN ('voce','voces','tu','a_gente')
  ),

  -- Garante version >= 1
  CONSTRAINT chk_version_positive CHECK (version >= 1)

);

-- ── 2. ÍNDICES ───────────────────────────────────────────────

-- Busca de briefing atual por cliente (hot path — usado em todo GET)
CREATE UNIQUE INDEX idx_client_briefings_one_current
  ON client_briefings (client_id)
  WHERE is_current = true;

-- Busca geral por cliente (histórico, listagem)
CREATE INDEX idx_client_briefings_client_id
  ON client_briefings (client_id);

-- Ordenação cronológica decrescente
CREATE INDEX idx_client_briefings_created_at
  ON client_briefings (created_at DESC);

-- Busca por versão específica de um cliente
CREATE INDEX idx_client_briefings_client_version
  ON client_briefings (client_id, version);

-- ── 3. RLS ───────────────────────────────────────────────────

ALTER TABLE client_briefings ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado pode ler briefings
-- (controle de role é feito na API, não aqui)
CREATE POLICY "briefings_read_authenticated"
  ON client_briefings
  FOR SELECT
  TO authenticated
  USING (true);

-- Escrita: somente service_role (usado pelas API routes após
-- validar role do usuário na camada de aplicação)
CREATE POLICY "briefings_write_service_role"
  ON client_briefings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. FUNÇÃO DE COMPLETUDE ──────────────────────────────────
--
-- Calcula % de campos preenchidos (0-100).
-- IMMUTABLE: não acessa tabelas externas, só dados do argumento.
-- Pode ser usada em índices e views sem overhead de snapshot.
-- Total: 21 campos avaliados.

CREATE OR REPLACE FUNCTION calculate_briefing_completeness(briefing client_briefings)
RETURNS INT AS $$
DECLARE
  total_fields  INT := 21;
  filled_fields INT := 0;
BEGIN
  -- Estratégia (8 campos)
  IF briefing.resumo_estrategico IS NOT NULL
     AND briefing.resumo_estrategico <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.produtos, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.publico_alvo, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF briefing.posicionamento IS NOT NULL
     AND briefing.posicionamento <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.dores, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.ganchos, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.ctas, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF briefing.observacoes_estrategicas IS NOT NULL
     AND briefing.observacoes_estrategicas <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  -- Identidade Visual (5 campos)
  IF jsonb_array_length(briefing.paleta_cores) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF briefing.tipografia IS NOT NULL
     AND briefing.tipografia <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  IF briefing.logo_url IS NOT NULL
     AND briefing.logo_url <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.referencias_visuais, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.elementos_evitar, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  -- Voz e Tom (5 campos)
  IF briefing.tom_voz IS NOT NULL
     AND briefing.tom_voz <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  IF briefing.pessoa_verbal IS NOT NULL
     AND briefing.pessoa_verbal <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  IF briefing.usa_emoji IS NOT NULL
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.palavras_proibidas, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.hashtags_padrao, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  -- Operação (3 campos)
  IF briefing.horarios_preferidos IS NOT NULL
     AND briefing.horarios_preferidos <> ''
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.produtos_destaque_atual, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  IF array_length(briefing.concorrentes_evitar_mencionar, 1) > 0
  THEN filled_fields := filled_fields + 1; END IF;

  RETURN ROUND((filled_fields::FLOAT / total_fields::FLOAT) * 100);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 5. VIEW current_client_briefings ────────────────────────
--
-- Retorna somente o briefing is_current=true de cada cliente,
-- enriquecido com nome do cliente e nome de quem criou.
-- created_by_name = NULL quando o team_member foi deletado
-- (FK ON DELETE SET NULL garante isso).

CREATE VIEW current_client_briefings AS
SELECT
  cb.id,
  cb.client_id,
  cb.version,
  cb.is_current,
  cb.created_at,
  cb.created_by,

  -- Estratégia
  cb.resumo_estrategico,
  cb.produtos,
  cb.publico_alvo,
  cb.posicionamento,
  cb.dores,
  cb.ganchos,
  cb.ctas,
  cb.observacoes_estrategicas,

  -- Identidade Visual
  cb.paleta_cores,
  cb.tipografia,
  cb.logo_url,
  cb.referencias_visuais,
  cb.elementos_evitar,

  -- Voz e Tom
  cb.tom_voz,
  cb.pessoa_verbal,
  cb.usa_emoji,
  cb.usa_giria,
  cb.palavras_proibidas,
  cb.hashtags_padrao,

  -- Operação
  cb.horarios_preferidos,
  cb.produtos_destaque_atual,
  cb.concorrentes_evitar_mencionar,

  -- Interno
  cb.observacoes_internas,

  -- Campos computados
  calculate_briefing_completeness(cb)  AS completeness_percent,
  c.name                               AS client_name,
  -- NULL quando team_member foi deletado (FK SET NULL)
  tm.name                              AS created_by_name

FROM  client_briefings  cb
JOIN  clients           c  ON c.id  = cb.client_id
-- LEFT JOIN: created_by pode ser NULL (sem autoria ou membro deletado)
LEFT JOIN team_members  tm ON tm.id = cb.created_by

WHERE cb.is_current = true;

-- ── FIM DA MIGRATION 043 ─────────────────────────────────────
