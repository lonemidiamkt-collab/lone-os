-- ═══════════════════════════════════════════════════════════
-- Lone OS — Platform Updates (changelog visível na home)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'feature',  -- 'feature' | 'fix' | 'announcement' | 'breaking'
  icon TEXT,                                  -- emoji ou nome de icone Lucide
  published BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_updates_created_at ON platform_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_updates_published ON platform_updates(published);

-- Controle de leitura por usuario (pra saber quais sao "novas" pra cada membro)
CREATE TABLE IF NOT EXISTS user_read_updates (
  user_email TEXT NOT NULL,
  update_id UUID NOT NULL REFERENCES platform_updates(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_email, update_id)
);

CREATE INDEX IF NOT EXISTS idx_user_read_updates_user ON user_read_updates(user_email);

ALTER TABLE platform_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_read_updates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'platform_updates_read' AND tablename = 'platform_updates') THEN
    CREATE POLICY "platform_updates_read" ON platform_updates FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_read_updates_all' AND tablename = 'user_read_updates') THEN
    CREATE POLICY "user_read_updates_all" ON user_read_updates FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- Seed inicial: historico das principais features ja lancadas
INSERT INTO platform_updates (title, description, category, icon, created_by, created_at) VALUES
  ('Análise IA para Tráfego Pago', 'IA analisa campanhas Meta diariamente e gera score 0-100, insights e ações recomendadas. Histórico navegável na aba Análise IA de cada cliente.', 'feature', '🤖', 'Sistema', '2026-04-17 00:00:00'),
  ('Comunicados em Massa', 'Envio de e-mails em massa com personalização automática via {{nome_responsavel}} e {{empresa}}. Lotes de 10 pra garantir entrega estável.', 'feature', '📧', 'Sistema', '2026-04-18 00:00:00'),
  ('Geração de Contratos Oficiais em DOCX', 'Contratos oficiais da Lone Midia são preenchidos localmente com os dados do cliente (valor, duração, nicho, endereço) e baixados em DOCX pronto pra upload manual no D4Sign. Renovação automática 30 dias antes do vencimento.', 'feature', '📝', 'Sistema', '2026-04-19 00:00:00'),
  ('Reajuste de Contrato Configurável', 'Ao criar contrato, escolha ter ou não reajuste após o período inicial (1-60 meses). A cláusula 2.7 aparece automaticamente no DOCX com o valor novo por extenso.', 'feature', '💰', 'Sistema', '2026-04-20 00:00:00'),
  ('Carteira de Clientes do Designer', 'Rodrigo agora tem uma aba "Meus Clientes" com drawer detalhado: briefing editável por todos, stats, links pro Drive/Instagram e botão pra criar tarefas próprias auto-iniciadas.', 'feature', '🎨', 'Sistema', '2026-04-20 12:00:00')
ON CONFLICT DO NOTHING;
