-- 082_client_ig_posts.sql — HISTÓRICO REAL DE POSTAGEM, direto do Instagram.
--
-- O problema (26/07/2026, dado de produção):
--   • "Alertas Inteligentes" dizia "Araruama Tintas sem post há 21 dias".
--     O Instagram dele tem post de 24/07. A tela estava 18 dias errada.
--   • `clients.posts_this_month` soma ZERO na base inteira → todo cliente aparece "0/12".
--   • `clients.last_post_date` só existe em 22 de 46 clientes, e desatualizado.
--   • O board tem 3 cards em "published" — TRÊS — enquanto o Instagram registra 307 posts
--     em 30 dias. Ninguém move o card depois que a arte sai; a publicação nunca vira dado.
--
-- A verdade está no Instagram, que a gente já sincroniza todo dia. Só que o snapshot guarda
-- uma JANELA (7/14/30 dias) e sobrescreve: não dá pra perguntar "e em maio?".
--
-- Esta tabela ACUMULA cada post real com a data. Daqui pra frente dá pra responder mês a mês,
-- semana a semana, sem depender de ninguém lembrar de arrastar card.

CREATE TABLE IF NOT EXISTS client_ig_posts (
  -- id da mídia no Instagram: é o que garante que o mesmo post não entre duas vezes.
  media_id      text PRIMARY KEY,
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  posted_at     timestamptz NOT NULL,
  tipo          text,
  permalink     text,
  thumb         text,
  curtidas      integer,
  comentarios   integer,
  -- Curtidas/comentários mudam com o tempo; a data do post não. Guarda quando foi relido.
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ig_posts_cliente_data ON client_ig_posts (client_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_ig_posts_data         ON client_ig_posts (posted_at DESC);

-- Fail-closed, igual client_ig_snapshots: só service_role (crons e rotas de servidor).
ALTER TABLE client_ig_posts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE client_ig_posts IS
  'Post a post do Instagram de cada cliente, acumulado. Fonte de verdade de "postou ou nao" e de metrica mensal/semanal -- o board nao registra publicacao (3 cards published contra 307 posts reais).';

-- ── BACKFILL: aproveita os posts que já estão nos snapshots de 30 dias ────────────────
INSERT INTO client_ig_posts (media_id, client_id, posted_at, tipo, permalink, thumb, curtidas, comentarios)
SELECT
  p->>'id',
  s.client_id,
  (p->>'data')::timestamptz,
  p->>'tipo',
  p->>'permalink',
  p->>'thumb',
  NULLIF(p->>'curtidas','null')::int,
  NULLIF(p->>'comentarios','null')::int
FROM client_ig_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.data->'posts','[]'::jsonb)) p
WHERE s.period_kind = '30d'
  AND p->>'id' IS NOT NULL
  AND p->>'data' IS NOT NULL
ON CONFLICT (media_id) DO NOTHING;
