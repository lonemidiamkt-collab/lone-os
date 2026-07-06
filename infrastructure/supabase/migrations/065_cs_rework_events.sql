-- 065_cs_rework_events.sql — log APPEND-ONLY de retrabalho (social reprova a arte do designer).
-- Por que existe: content_approvals faz delete-then-insert (1 linha vigente por card), então o
-- histórico de reprovações é apagado e não dá pra medir taxa de retrabalho. Este log preserva
-- CADA reprovação (denormalizado, pra ficar estável mesmo se o card mudar). Aplicar MANUAL no banco.
CREATE TABLE IF NOT EXISTS cs_rework_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id      uuid REFERENCES content_cards(id) ON DELETE SET NULL,
  client_id    uuid,
  client_name  text,
  social_media text,          -- quem é responsável pelo card (pra taxa por social)
  reviewed_by  text,          -- quem reprovou
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_rework_events_created ON cs_rework_events(created_at DESC);
