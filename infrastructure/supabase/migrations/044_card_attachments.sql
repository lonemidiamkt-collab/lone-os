BEGIN;

-- ------------------------------------------------------------
-- 044_card_attachments.sql
-- Suporte a múltiplas artes por content_card.
--
-- Cards existentes NÃO são alterados. image_url permanece como
-- fallback para cards legados. A migração silenciosa de image_url
-- → card_attachments ocorre via API ao primeiro toque no card.
-- ------------------------------------------------------------

CREATE TABLE card_attachments (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  card_id    UUID        NOT NULL,
  url        TEXT        NOT NULL,
  path       TEXT        NOT NULL,
  position   SMALLINT    NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT card_attachments_pkey
    PRIMARY KEY (id),

  CONSTRAINT card_attachments_card_id_fkey
    FOREIGN KEY (card_id)
    REFERENCES content_cards(id)
    ON DELETE CASCADE,

  -- Limite de 5 artes por card reforçado no banco (posições 0–4).
  -- Defesa em profundidade: rejeita inserções com position fora
  -- do range mesmo que o backend falhe na validação.
  CONSTRAINT chk_position_range
    CHECK (position >= 0 AND position <= 4)
);

COMMENT ON TABLE card_attachments IS
  'Artes anexadas a um content_card. '
  'Cards criados antes desta migration continuam usando content_cards.image_url '
  'como fallback até sofrerem qualquer mutação de attachments, '
  'momento em que são migrados silenciosamente para este modelo.';

COMMENT ON COLUMN card_attachments.id IS
  'Identificador único do attachment.';

COMMENT ON COLUMN card_attachments.card_id IS
  'Card ao qual este attachment pertence. '
  'DELETE CASCADE: remover o card remove todas as linhas, mas NÃO '
  'remove os arquivos do bucket Storage — isso é responsabilidade '
  'do endpoint de deleção (ver BACKLOG.md — Storage cleanup).';

COMMENT ON COLUMN card_attachments.url IS
  'URL pública da arte no Supabase Storage (bucket "arts"). '
  'Usada para exibição no frontend.';

COMMENT ON COLUMN card_attachments.path IS
  'Path relativo dentro do bucket "arts" '
  '(ex: {card_id}/{timestamp}.png). '
  'Necessário para deletar o arquivo do Storage ao remover o attachment.';

COMMENT ON COLUMN card_attachments.position IS
  'Ordem de exibição (0 = capa do card no Kanban). '
  'Valores 0–4 (máximo 5 artes por card, reforçado por chk_position_range).';

COMMENT ON COLUMN card_attachments.created_at IS
  'Timestamp do upload.';

-- Índice primário: buscar todos os attachments de um card
CREATE INDEX idx_card_attachments_card_id
  ON card_attachments(card_id);

-- Índice composto: buscar attachments de um card já ordenados
CREATE INDEX idx_card_attachments_card_position
  ON card_attachments(card_id, position);

-- ------------------------------------------------------------
-- RLS — padrão client_briefings (BFF: API routes mediam acesso)
-- ------------------------------------------------------------
ALTER TABLE card_attachments ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (filtro real vem da API route)
CREATE POLICY "attachments_read_authenticated"
  ON card_attachments
  FOR SELECT
  TO authenticated
  USING (true);

-- Escrita exclusivamente via service_role (API routes usam supabaseAdmin)
CREATE POLICY "attachments_write_service_role"
  ON card_attachments
  FOR ALL
  TO service_role
  USING (true);

COMMIT;
