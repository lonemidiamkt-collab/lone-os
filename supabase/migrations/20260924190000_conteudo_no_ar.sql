-- 20260924190000_conteudo_no_ar.sql — Leva 5a (Conteúdo).
--
-- 1) "No ar" automático pelo Instagram. O job sync-posts casa o post real (client_ig_posts) com o
--    card planejado e fecha o card. Estas colunas guardam QUAL post fechou o card — o link aparece
--    na agenda e no card, e o índice único garante no banco que um post fecha no máximo um card.
--    Sem elas o job funciona do mesmo jeito (status + publish_verified_at = hora do post), só não
--    guarda o link.
--
-- 2) Pauta do Radar → card. "Usar esta pauta" cria o card e grava aqui qual card saiu da pauta.
--
-- Idempotente. Só acrescenta; nada é apagado. As duas tabelas já têm RLS ligado (reafirmado abaixo).

ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS ig_media_id  text;
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS ig_permalink text;

CREATE UNIQUE INDEX IF NOT EXISTS content_cards_ig_media_id_unico
  ON content_cards (ig_media_id) WHERE ig_media_id IS NOT NULL;

COMMENT ON COLUMN content_cards.ig_media_id IS
  'Post do Instagram (client_ig_posts.media_id) que colocou este card no ar. Preenchido pelo sync-posts.';
COMMENT ON COLUMN content_cards.ig_permalink IS
  'Link do post do Instagram que colocou este card no ar.';

ALTER TABLE radar_pautas ADD COLUMN IF NOT EXISTS content_card_id uuid
  REFERENCES content_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS radar_pautas_card
  ON radar_pautas (content_card_id) WHERE content_card_id IS NOT NULL;

COMMENT ON COLUMN radar_pautas.content_card_id IS
  'Card de conteúdo criado a partir desta pauta ("Usar esta pauta").';

ALTER TABLE content_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_pautas  ENABLE ROW LEVEL SECURITY;

-- A API do Supabase (PostgREST) só enxerga colunas novas depois de recarregar o cache.
notify pgrst, 'reload schema';
