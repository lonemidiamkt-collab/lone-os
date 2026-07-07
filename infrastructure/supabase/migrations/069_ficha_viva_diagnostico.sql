-- 069_ficha_viva_diagnostico.sql
-- Ficha Viva 360 — link do cliente (crescimento + diagnóstico comercial).
--
-- Espelha o padrão do Portal do Cliente (public_report_token): um token por cliente
-- que abre uma página PÚBLICA (sem login) onde o cliente (1) VÊ o crescimento dele
-- (faturamento/ticket/saúde — Fase 1) e (2) RESPONDE um diagnóstico comercial de 10
-- perguntas. A IA gera SWOT + prioridades + scripts pro time comercial (SDR).

-- 1) Token do link no próprio cliente (mesma lógica do portal de tráfego)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS ficha_viva_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS ficha_viva_token_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS ficha_viva_token_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS ficha_viva_enabled boolean NOT NULL DEFAULT false;

-- 2) Respostas do diagnóstico + análise da IA (histórico; a mais recente é a atual)
CREATE TABLE IF NOT EXISTS client_diagnostics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  respostas    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { question_id: resposta }
  analise      jsonb,                                -- { diagnostico, swot, prioridades, scripts }
  status       text NOT NULL DEFAULT 'respondido',   -- respondido | analisado
  answered_at  timestamptz NOT NULL DEFAULT now(),
  analyzed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_diagnostics_client
  ON client_diagnostics(client_id, answered_at DESC);

-- RLS: leitura só admin/time (dado comercial sensível); escrita só service_role.
-- O envio público (cliente respondendo) passa por rota server com supabaseAdmin
-- (valida o token e grava via service_role) — nunca expõe a tabela a anon.
ALTER TABLE client_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_diagnostics_auth_read ON client_diagnostics;
CREATE POLICY client_diagnostics_auth_read ON client_diagnostics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS client_diagnostics_service_write ON client_diagnostics;
CREATE POLICY client_diagnostics_service_write ON client_diagnostics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE client_diagnostics IS
  'Ficha Viva 360 — respostas do diagnóstico comercial do cliente + análise da IA (SWOT/scripts).';
