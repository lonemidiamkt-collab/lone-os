-- Audit log de acessos ao cofre (documentos privados de clientes).
--
-- Contexto LGPD: precisamos rastrear quem leu documento sensível de qual cliente,
-- quando, de onde. O endpoint `/api/storage/signed-url` é o gateway: toda requisição
-- de URL assinada pra arquivo em `legal-docs` bucket registra aqui.
--
-- Uso:
--   - Investigação de incidente: "quem acessou contrato social do cliente X em abril?"
--   - Compliance report anual
--   - Detecção de anomalia (admin acessando muitos clientes em curto tempo)
--
-- Retenção: manter pra sempre (custo de storage é irrisório vs valor probatório).

CREATE TABLE IF NOT EXISTS vault_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                -- auth.users.id do admin que acessou
  user_email TEXT,             -- denormalizado pra resiliência (admin pode sair)
  client_id UUID,              -- cliente alvo (pode ser null se acesso foi a recurso global)
  resource_type TEXT NOT NULL, -- ex: 'contrato_social', 'identidade', 'logo', 'contract_docx'
  resource_path TEXT,          -- path no bucket (útil pra debug)
  action TEXT NOT NULL,        -- 'signed_url_issued', 'download', 'view'
  ip TEXT,                     -- IP do admin (primeiro da x-forwarded-for chain)
  user_agent TEXT,             -- pra detectar automações/scripts
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index comum: listar acessos de um cliente ordenado por data
CREATE INDEX IF NOT EXISTS vault_access_log_client_created_idx
  ON vault_access_log (client_id, created_at DESC);

-- Index pra "quem sou eu e o que acessei"
CREATE INDEX IF NOT EXISTS vault_access_log_user_created_idx
  ON vault_access_log (user_id, created_at DESC);

-- RLS: só admin pode ler. service_role (backend) escreve livremente.
ALTER TABLE vault_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vault_log_admin_read" ON vault_access_log;
CREATE POLICY "vault_log_admin_read" ON vault_access_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- anon bloqueado completamente (default quando RLS ativo sem policy pra role)
