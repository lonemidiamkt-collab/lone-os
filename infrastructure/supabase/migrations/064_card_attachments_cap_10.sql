-- 064_card_attachments_cap_10.sql — sobe o teto de artes por card de 5 para 10 (carrosséis).
-- A referência do social pode ocupar 1 slot, então 5 era pouco pra carrossel. Aplicar MANUAL
-- no banco da VPS (deploy.sh não roda migrations).
ALTER TABLE card_attachments DROP CONSTRAINT IF EXISTS chk_position_range;
ALTER TABLE card_attachments ADD CONSTRAINT chk_position_range
  CHECK (position >= 0 AND position <= 9);

COMMENT ON COLUMN card_attachments.position IS
  'Valores 0–9 (máximo 10 artes por card, reforçado por chk_position_range).';
