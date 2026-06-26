-- Agente CS: guarda o id da mensagem do WhatsApp que o agente postou com a sugestão.
-- Assim a equipe pode RESPONDER (dar reply) na própria mensagem com "ok"/"não"/"ajustar ...",
-- e o agente casa a resposta com a demanda certa — sem precisar de código na conversa.

ALTER TABLE cs_demandas ADD COLUMN IF NOT EXISTS msg_id_sugestao text;
CREATE INDEX IF NOT EXISTS idx_cs_demandas_msg_sugestao ON cs_demandas (msg_id_sugestao);
