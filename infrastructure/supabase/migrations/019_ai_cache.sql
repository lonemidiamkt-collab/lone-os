-- Cache de respostas da OpenAI pra reduzir custo de tokens.
--
-- Contexto: endpoints /api/ai/* chamam GPT-4 sem cache nenhum.
-- 15 clientes × 3 analyses/dia × 30 dias ≈ 1.350 calls/mês (~R$ 200-400).
-- Escala linear: 50 clientes = ~R$ 1.200/mês só em tokens, mesmo sem ninguém clicar.
--
-- Estratégia:
--   - Key = hash(payload estruturado + model + day-bucket)
--   - TTL configurável por tipo (analyses: 24h, briefings: 1h)
--   - Invalida automaticamente quando métrica-fonte muda (bucket por dia)
--   - Não é cache "strong" — é best-effort. Se miss, regenera.

CREATE TABLE IF NOT EXISTS ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,           -- hash(payload + model + bucket)
  category TEXT NOT NULL,             -- 'analyze-ads', 'morning-briefing', etc
  model TEXT NOT NULL,                -- 'gpt-4o', 'gpt-4-turbo', etc
  prompt_hash TEXT NOT NULL,          -- hash só do prompt (debug/analysis)
  response JSONB NOT NULL,            -- resposta completa
  tokens_prompt INT,                  -- pra analytics de custo
  tokens_completion INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Índice parcial com `now()` não funciona (Postgres exige IMMUTABLE em index predicates).
-- Index simples + filtro `.gt("expires_at", now)` no query já é eficiente.
CREATE INDEX IF NOT EXISTS ai_cache_lookup_idx ON ai_cache (key);
CREATE INDEX IF NOT EXISTS ai_cache_category_idx ON ai_cache (category, created_at DESC);

-- Limpa entradas expiradas periodicamente (opcional, DB pode acumular).
-- Pode ser chamado via cron ou manualmente.
CREATE OR REPLACE FUNCTION purge_expired_ai_cache() RETURNS bigint AS $$
  WITH deleted AS (
    DELETE FROM ai_cache WHERE expires_at < now() RETURNING id
  )
  SELECT COUNT(*) FROM deleted;
$$ LANGUAGE sql;

-- RLS: service_role escreve/lê. Anon nega. Authenticated pode ler (pra debug/analytics futuras).
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_cache_anon_deny" ON ai_cache;
CREATE POLICY "ai_cache_anon_deny" ON ai_cache
  FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "ai_cache_auth_read" ON ai_cache;
CREATE POLICY "ai_cache_auth_read" ON ai_cache
  FOR SELECT TO authenticated
  USING (public.is_admin());
