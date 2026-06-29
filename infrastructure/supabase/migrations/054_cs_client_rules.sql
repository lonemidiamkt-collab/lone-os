BEGIN;

-- ------------------------------------------------------------
-- 054_cs_client_rules.sql
-- Do's & don'ts ESTRUTURADOS por cliente para o Agente CS.
--
-- Hoje as regras do cliente vivem em texto livre (campaign_briefing /
-- fixed_briefing) e os fatos que o agente aprende são anexados como texto —
-- que some quando o cliente tem campaign_briefing (o briefing prefere ele).
-- Esta tabela torna cada regra uma linha discreta: editável, com escopo, e
-- sempre injetada no briefing (A3), independente do texto livre.
-- ------------------------------------------------------------

CREATE TABLE cs_client_rules (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  client_id  UUID        NOT NULL,
  texto      TEXT        NOT NULL,
  -- escopo = quando a regra se aplica (a IA injeta só as relevantes ao pedido)
  escopo     TEXT        NOT NULL DEFAULT 'sempre',
  -- origem = quem criou: o humano (manual) ou o próprio agente (aprendido)
  origem     TEXT        NOT NULL DEFAULT 'manual',
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cs_client_rules_pkey PRIMARY KEY (id),
  CONSTRAINT cs_client_rules_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT chk_escopo CHECK (escopo IN ('sempre','promocao','arte','social','trafego')),
  CONSTRAINT chk_origem CHECK (origem IN ('manual','aprendido'))
);

COMMENT ON TABLE cs_client_rules IS
  'Do''s & don''ts estruturados por cliente (Agente CS). Cada linha é uma regra '
  'que o A3 (redator de briefing) injeta quando se aplica ao pedido.';
COMMENT ON COLUMN cs_client_rules.escopo IS
  'Quando a regra vale: sempre | promocao | arte | social | trafego.';
COMMENT ON COLUMN cs_client_rules.origem IS
  'manual = cadastrada por humano; aprendido = o agente captou no grupo (campo aprendizado).';

CREATE INDEX idx_cs_client_rules_client ON cs_client_rules(client_id) WHERE ativo;

-- RLS — padrão dos outros: leitura autenticada, escrita só service_role (API media).
ALTER TABLE cs_client_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_rules_read_authenticated" ON cs_client_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_rules_write_service_role" ON cs_client_rules
  FOR ALL TO service_role USING (true);

COMMIT;
