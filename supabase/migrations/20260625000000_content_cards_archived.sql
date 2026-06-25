-- Soft-delete ("arquivar") para demandas (content_cards).
-- Uma demanda arquivada some das visões ativas do social (kanban/calendário/entregas)
-- mas continua no banco — recuperável via "Desarquivar". Diferente do DELETE, que apaga
-- de vez (cascade nas tabelas filhas).
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Índice parcial: a query padrão filtra archived_at IS NULL (board ativo).
CREATE INDEX IF NOT EXISTS idx_content_cards_active
  ON content_cards (created_at DESC)
  WHERE archived_at IS NULL;
