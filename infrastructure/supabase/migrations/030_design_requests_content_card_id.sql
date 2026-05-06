-- Adiciona content_card_id em design_requests para linkar diretamente ao ContentCard.
-- Sem esta coluna, o único elo era design_request_id no content_cards — que nunca era
-- persistido porque o código usava um temp ID inválido como UUID, causando erro silencioso.

ALTER TABLE design_requests
  ADD COLUMN IF NOT EXISTS content_card_id UUID REFERENCES content_cards(id) ON DELETE SET NULL;
