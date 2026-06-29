BEGIN;

-- ------------------------------------------------------------
-- 055_clients_perfil_conteudo.sql
-- Perfil de conteúdo do cliente (Playbook Social §4): define se o cliente
-- faz vídeo — base pra "quarta = dia de Reels" (só pra quem grava vídeo) e
-- pra cobrança antecipada de roteiro pelo Agente CS.
--   so_arte  = só artes (não tem vídeo de quarta)
--   video    = grava vídeos (quarta é dia firme de Reels)
--   completo = vídeo + arte + stories (quarta é dia firme)
-- NULL = ainda não classificado (tratado como sem vídeo).
-- ------------------------------------------------------------

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS perfil_conteudo TEXT
  CHECK (perfil_conteudo IN ('so_arte', 'video', 'completo'));

COMMENT ON COLUMN clients.perfil_conteudo IS
  'Perfil de conteúdo (Playbook §4): so_arte | video | completo. '
  'video/completo = faz vídeo → quarta é dia firme de Reels.';

COMMIT;
