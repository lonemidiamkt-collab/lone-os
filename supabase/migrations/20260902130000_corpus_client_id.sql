-- `cs_message_corpus.client_id` estava NULL em 100% das 12.111 linhas.
--
-- A coluna existe desde o começo e nunca foi preenchida: o insert do webhook grava só o group_jid.
-- Na auditoria de 02/09 isso me fez concluir que 29 clientes não tinham conversa nenhuma capturada
-- — quando na verdade tinham, e o vínculo estava lá pelo grupo. Coluna que existe e nunca é
-- preenchida é pior que coluna ausente: quem consulta acredita na resposta.
--
-- A ligação é determinística (um grupo pertence a um cliente), então quem preenche é o banco. Assim
-- vale para qualquer caminho de escrita, hoje e depois — em vez de depender de cada insert lembrar.
CREATE OR REPLACE FUNCTION corpus_resolve_client() RETURNS trigger AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.group_jid IS NOT NULL THEN
    -- LIMIT 1 porque duas fichas podem dividir um grupo (Bazar Ribeiro Maricá e Saquarema). Para
    -- o corpus, qualquer uma das duas serve: o que importa é ter a conversa alcançável por cliente.
    SELECT id INTO NEW.client_id FROM clients
    WHERE whatsapp_group_jid = NEW.group_jid
    ORDER BY created_at LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS corpus_resolve_client_trg ON cs_message_corpus;
CREATE TRIGGER corpus_resolve_client_trg
  BEFORE INSERT ON cs_message_corpus
  FOR EACH ROW EXECUTE FUNCTION corpus_resolve_client();

-- Backfill do que já está lá.
UPDATE cs_message_corpus m
SET client_id = c.id
FROM clients c
WHERE m.client_id IS NULL AND m.group_jid = c.whatsapp_group_jid;

CREATE INDEX IF NOT EXISTS cs_message_corpus_cliente ON cs_message_corpus (client_id, created_at DESC);
