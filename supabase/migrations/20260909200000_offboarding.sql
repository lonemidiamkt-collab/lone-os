-- ENCERRAMENTO COMO EVENTO FORMAL DO CICLO DE VIDA
--
-- Roberto (09/09): "hoje não quero simplesmente colocar um cliente como inactive. O cancelamento
-- precisa virar um evento formal do ciclo de vida do cliente, preservando todo o histórico."
--
-- O QUE JÁ EXISTIA e é evoluído, não substituído: `clients.active`, `churned_at`,
-- `churn_category`, `churn_reason` e a lista de motivos em lib/clients/churn.ts. Seis clientes já
-- estão arquivados por esse caminho — jogar fora seria perder o pouco de histórico que há.

-- ── 1. O ESTADO DEIXA DE SER SIM/NÃO ─────────────────────────────────────
--
-- A distinção que o pedido chama de importante (§27): "cliente pediu cancelamento" e "contrato
-- encerrou" são dias diferentes, e entre um e outro a Lone AINDA responde pela operação. Com
-- `active` booleano isso não cabe: ou está dentro, ou está fora.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'ativo';
COMMENT ON COLUMN clients.lifecycle IS
  'ativo | encerrando | inativo | pausado. `active` (boolean) continua existindo porque dezenas de
   consultas dependem dele; este campo diz o que `active` não consegue: encerrando ≠ inativo.';

-- Alinha o que já existe: quem está com active=false é inativo; o resto, ativo.
UPDATE clients SET lifecycle = CASE WHEN active IS FALSE THEN 'inativo' ELSE 'ativo' END
WHERE lifecycle = 'ativo' AND active IS FALSE;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_lifecycle_valido;
ALTER TABLE clients ADD CONSTRAINT clients_lifecycle_valido
  CHECK (lifecycle IN ('ativo', 'encerrando', 'inativo', 'pausado'));

CREATE INDEX IF NOT EXISTS idx_clients_lifecycle ON clients (lifecycle);

-- ── 2. O PROCESSO DE ENCERRAMENTO ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_offboardings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Quem puxou o freio. Muda tudo na leitura de churn: perder cliente e encerrar cliente por
  -- decisão nossa são fatos opostos que hoje ficariam no mesmo balde.
  iniciativa      text NOT NULL DEFAULT 'cliente',   -- cliente | lone | acordo
  motivo          text NOT NULL,                     -- a chave de lib/clients/churn.ts
  motivo_detalhe  text,

  -- As DUAS datas. Entre elas a Lone ainda opera.
  solicitado_em   date NOT NULL,
  encerra_em      date NOT NULL,

  -- Situação declarada no fechamento. `null` = ninguém conferiu ainda, que é diferente de "não
  -- há pendência" — e é por isso que o termo não pode afirmar "todos os débitos quitados" sozinho.
  financeiro_ok   boolean,
  financeiro_nota text,
  entregas_ok     boolean,
  entregas_nota   text,

  -- Serviços e entregas que entram no termo. Vem do cliente, mas editável: cortesias e visitas
  -- não estão em campo nenhum do sistema.
  servicos        text[],
  entregas_extra  text[],

  estado          text NOT NULL DEFAULT 'rascunho',
  -- rascunho | em_revisao | termo_gerado | termo_enviado | confirmado | concluido

  termo_path      text,
  termo_gerado_em timestamptz,
  enviado_em      timestamptz,
  enviado_por     text,
  enviado_canal   text,                              -- whatsapp | email | manual
  enviado_para    text,
  confirmado_em   timestamptz,
  confirmado_por  text,
  confirmado_origem text,                            -- whatsapp | email | manual

  checklist       jsonb NOT NULL DEFAULT '{}'::jsonb,

  criado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  cancelado_em    timestamptz                        -- o encerramento foi desistido
);

ALTER TABLE client_offboardings DROP CONSTRAINT IF EXISTS offboarding_estado_valido;
ALTER TABLE client_offboardings ADD CONSTRAINT offboarding_estado_valido CHECK (estado IN
  ('rascunho', 'em_revisao', 'termo_gerado', 'termo_enviado', 'confirmado', 'concluido'));
ALTER TABLE client_offboardings DROP CONSTRAINT IF EXISTS offboarding_iniciativa_valida;
ALTER TABLE client_offboardings ADD CONSTRAINT offboarding_iniciativa_valida CHECK (iniciativa IN
  ('cliente', 'lone', 'acordo'));
-- A data efetiva não pode ser antes do pedido: inverter as duas faria o termo dizer que a
-- parceria acabou antes de alguém pedir.
ALTER TABLE client_offboardings DROP CONSTRAINT IF EXISTS offboarding_datas_coerentes;
ALTER TABLE client_offboardings ADD CONSTRAINT offboarding_datas_coerentes
  CHECK (encerra_em >= solicitado_em);

-- Um encerramento vivo por cliente. Dois processos abertos ao mesmo tempo produziriam dois termos.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_offboarding_vivo ON client_offboardings (client_id)
  WHERE cancelado_em IS NULL AND estado <> 'concluido';
CREATE INDEX IF NOT EXISTS idx_offboarding_estado ON client_offboardings (estado, encerra_em);

CREATE OR REPLACE FUNCTION offboarding_touch() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_offboarding_updated ON client_offboardings;
CREATE TRIGGER trg_offboarding_updated BEFORE UPDATE ON client_offboardings
  FOR EACH ROW EXECUTE FUNCTION offboarding_touch();

-- ── 3. ANEXOS DO ENCERRAMENTO ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_id uuid NOT NULL REFERENCES client_offboardings(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nome_arquivo   text NOT NULL,
  nome_original  text,
  tipo_mime      text,
  tamanho_bytes  bigint,
  storage_path   text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'contracts',
  enviado_por    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_offb_anexos_cliente ON offboarding_attachments (client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_offb_anexo_path ON offboarding_attachments (offboarding_id, storage_path) WHERE deleted_at IS NULL;

-- ── 4. CICLOS: o mesmo cliente pode sair e voltar ────────────────────────
--
-- Roberto (§21): "não criar automaticamente outro cliente duplicado. Utilizar o mesmo client_id."
-- Sem isto, reativar significaria cadastrar de novo — e a memória de antes ficaria órfã.
CREATE TABLE IF NOT EXISTS client_lifecycles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ciclo          smallint NOT NULL DEFAULT 1,
  iniciou_em     date NOT NULL,
  encerrou_em    date,
  offboarding_id uuid REFERENCES client_offboardings(id) ON DELETE SET NULL,
  motivo         text,
  criado_por     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ciclo_cliente ON client_lifecycles (client_id, ciclo);
-- Só um ciclo ABERTO por cliente: dois em aberto tornariam "há quanto tempo é cliente" insolúvel.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ciclo_aberto ON client_lifecycles (client_id) WHERE encerrou_em IS NULL;

-- Cria o 1º ciclo de quem já existe, com a data de entrada que o cadastro tem.
INSERT INTO client_lifecycles (client_id, ciclo, iniciou_em, encerrou_em, motivo, criado_por)
SELECT c.id, 1,
       COALESCE(c.join_date::date, c.created_at::date, CURRENT_DATE),
       CASE WHEN c.active IS FALSE THEN COALESCE(c.churned_at::date, CURRENT_DATE) END,
       c.churn_category,
       'migracao'
FROM clients c
WHERE NOT EXISTS (SELECT 1 FROM client_lifecycles l WHERE l.client_id = c.id)
ON CONFLICT DO NOTHING;

-- ── 5. AUDITORIA ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_id uuid REFERENCES client_offboardings(id) ON DELETE SET NULL,
  client_id      uuid REFERENCES clients(id) ON DELETE SET NULL,
  acao           text NOT NULL,
  ator           text,
  detalhe        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offb_events_cliente ON offboarding_events (client_id, created_at DESC);
