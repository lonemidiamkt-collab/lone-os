-- O cliente manda material pelo painel (Roberto, 31/08: "pode criar arquitetura de o cliente mandar
-- o material pelo painel, mas o cliente aprovar pelo painel ainda não").
--
-- Hoje o material chega por WhatsApp e se perde na rolagem do grupo: foto de produto, logo, tabela
-- de preço. Quem vai fazer a arte precisa caçar a mensagem. Aqui o arquivo fica preso ao cliente,
-- com quem mandou e quando.

CREATE TABLE IF NOT EXISTS client_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  -- O que o cliente escreveu junto. É o que transforma "IMG_4471.jpg" em material utilizável.
  observacao text,
  -- Nome que o cliente digitou. O portal é por link, não tem login: não dá pra saber QUEM é sem
  -- perguntar, e atribuir a mensagem à pessoa errada é pior que não atribuir.
  enviado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Quando o time deu baixa. Material que ninguém olhou é o mesmo que material que não chegou.
  visto_em timestamptz,
  visto_por text
);

CREATE INDEX IF NOT EXISTS client_uploads_cliente ON client_uploads (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_uploads_pendentes ON client_uploads (created_at DESC) WHERE visto_em IS NULL;

ALTER TABLE client_uploads ENABLE ROW LEVEL SECURITY;
-- Só a service role entra. O portal é público por token e passa pela API, que valida o token e
-- confere que o arquivo é daquele cliente — nunca pelo banco direto.
DROP POLICY IF EXISTS client_uploads_service ON client_uploads;
CREATE POLICY client_uploads_service ON client_uploads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bucket PRIVADO. Material de cliente (tabela de preço, foto interna, documento) não pode ficar
-- em URL pública adivinhável — foi exatamente o vazamento de junho, com buckets abertos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-uploads', 'client-uploads', false)
ON CONFLICT (id) DO UPDATE SET public = false;
