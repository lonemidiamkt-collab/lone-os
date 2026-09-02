-- A política de tráfego de cada cliente: o que o sistema precisa saber para julgar um número.
--
-- Sem isto, o diagnóstico só compara o cliente com ele mesmo — e nunca sabe se o resultado é BOM.
-- Medi a carteira: o custo por conversa vai de R$1,91 a R$26,18, com média de R$7,60. R$18 é
-- péssimo para o EDUMAR (que entrega a R$10) e ótimo para a Quero Tintas (que entrega a R$26). Um
-- número universal seria errado para quase todo mundo.
--
-- É também o que o Executor exigirá antes de existir: sem teto de alteração, sem saber o que pode
-- ser pausado sozinho, "executar" é fazer mudança financeira sem limite declarado.
CREATE TABLE IF NOT EXISTS client_traffic_policy (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,

  -- ── O que se espera do resultado ──
  kpi text NOT NULL DEFAULT 'conversa',        -- conversa | lead | venda
  cpl_meta numeric,                            -- o que costuma entregar quando está bem
  cpl_alerta numeric,                          -- acima disso, olhar
  cpl_critico numeric,                         -- acima disso, agir

  -- ── Verba ──
  orcamento_diario numeric,
  orcamento_mensal numeric,

  -- ── Limites de alteração automática ──
  -- Percentuais pequenos de propósito: alteração grande em conta de anúncio reinicia aprendizado
  -- e costuma piorar antes de melhorar.
  aumento_max_pct numeric NOT NULL DEFAULT 10,
  reducao_max_pct numeric NOT NULL DEFAULT 10,
  alteracoes_max_dia int NOT NULL DEFAULT 1,

  -- ── Evidência mínima antes de decidir ──
  -- Sem isso, o sistema agiria sobre ruído: 2 conversas num dia não dizem nada sobre um conjunto.
  gasto_minimo_decisao numeric NOT NULL DEFAULT 50,
  conversas_minimas int NOT NULL DEFAULT 5,
  horas_minimas_campanha int NOT NULL DEFAULT 48,

  -- ── O que o sistema pode fazer sozinho ──
  -- 'nao' | 'aprovacao' | 'sim'. Padrão conservador: nada sozinho até alguém decidir o contrário.
  pode_pausar_anuncio text NOT NULL DEFAULT 'aprovacao',
  pode_pausar_conjunto text NOT NULL DEFAULT 'nao',
  pode_pausar_campanha text NOT NULL DEFAULT 'nao',
  pode_mexer_orcamento text NOT NULL DEFAULT 'nao',

  -- ── Procedência ──
  -- Política derivada do histórico é ponto de partida, não decisão. Quem lê precisa saber a
  -- diferença: foi o que evitou que os briefings gerados por IA passassem por revisados.
  origem text NOT NULL DEFAULT 'derivada',     -- derivada | revisada
  revisada_por text,
  revisada_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_traffic_policy
  DROP CONSTRAINT IF EXISTS chk_permissoes;
ALTER TABLE client_traffic_policy ADD CONSTRAINT chk_permissoes CHECK (
  pode_pausar_anuncio IN ('nao','aprovacao','sim') AND
  pode_pausar_conjunto IN ('nao','aprovacao','sim') AND
  pode_pausar_campanha IN ('nao','aprovacao','sim') AND
  pode_mexer_orcamento IN ('nao','aprovacao','sim')
);

ALTER TABLE client_traffic_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS traffic_policy_service ON client_traffic_policy;
CREATE POLICY traffic_policy_service ON client_traffic_policy FOR ALL TO service_role USING (true) WITH CHECK (true);
