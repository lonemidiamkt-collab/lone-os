-- 083_process_hub.sql — HUB DE PROCESSOS (fatia 1).
--
-- Por que existe: o "como se faz" da Lone mora na cabeça dos sócios, num PDF e num arquivo do
-- repositório que só engenheiro lê. Um social media novo não tem onde entrar e aprender. Esta é a
-- base pra biblioteca versionada de processos, SOPs, playbooks, checklists e políticas.
--
-- Decisões que fogem do modelo sugerido pela skill, de propósito:
--   • SEM workspace_id — o Lone OS é de uma agência só. Isolamento por workspace seria estrutura
--     sem uso, e a skill manda adaptar ao padrão real do repositório.
--   • Nomes em inglês snake_case, como o núcleo (clients, content_cards, tasks, client_ig_posts).
--   • Imutabilidade da versão aprovada por TRIGGER, não por código. As duas vezes que confiei numa
--     regra só na aplicação ela falhou calada: o status `blocked` que o enum rejeitava e a
--     expiração de pendências que nunca moveu uma linha. Regra que importa mora no banco.

-- ── Taxonomia ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE process_area AS ENUM ('social', 'traffic', 'cs', 'comercial', 'geral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- A hierarquia documental do playbook: não chamar tudo de "processo".
  CREATE TYPE process_doc_type AS ENUM ('processo', 'playbook', 'sop', 'checklist', 'politica', 'template');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE process_status AS ENUM ('draft', 'in_review', 'approved', 'active', 'deprecated', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Identidade estável do processo ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Código curto e falável ("SOC-01"), pra citar em conversa e em card.
  code              text NOT NULL,
  slug              text NOT NULL,
  title             text NOT NULL,
  area              process_area NOT NULL,
  doc_type          process_doc_type NOT NULL DEFAULT 'processo',
  -- PAPEL, nunca nome de pessoa: dono é cargo, gente entra e sai (antipadrão da skill §12).
  owner_role        text,
  status            process_status NOT NULL DEFAULT 'draft',
  active_version_id uuid,
  summary           text,
  tags              text[] NOT NULL DEFAULT '{}',
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- Único entre os vivos: processo arquivado não bloqueia recriar o código.
CREATE UNIQUE INDEX IF NOT EXISTS uq_processes_code ON processes (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_processes_slug ON processes (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_processes_area_status ON processes (area, status) WHERE deleted_at IS NULL;

-- ── Conteúdo versionado ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS process_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id          uuid NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  version             text NOT NULL,             -- "1.0", "1.1", "2.0"
  status              process_status NOT NULL DEFAULT 'draft',

  -- O contrato mínimo (SKILL.md §6). Campo vazio é pendência assumida, não processo pronto.
  objective           text,
  problem             text,
  scope               text,
  out_of_scope        text,
  trigger_event       text,                      -- "trigger" é palavra reservada no Postgres
  frequency           text,
  prerequisites       text,
  inputs              text,
  outputs             text,
  completion_criteria text,
  quality_criteria    text,
  sla                 text,
  kpis                jsonb NOT NULL DEFAULT '[]',   -- [{nome, definicao, fonte, meta, acao_abaixo}]
  risks               jsonb NOT NULL DEFAULT '[]',   -- [{risco, controle, escalonamento}]
  exceptions          jsonb NOT NULL DEFAULT '[]',   -- [{situacao, tratamento, escalonar_para}]

  effective_at        date,
  review_due_at       date,
  change_summary      text,
  approved_at         timestamptz,
  approved_by         text,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_process_versions ON process_versions (process_id, version);
CREATE INDEX IF NOT EXISTS idx_process_versions_proc ON process_versions (process_id, created_at DESC);

ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_active_version_fk;
ALTER TABLE processes ADD CONSTRAINT processes_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES process_versions(id) ON DELETE SET NULL;

-- SÓ UMA VERSÃO ATIVA por processo — a pergunta "qual vale hoje?" precisa de uma resposta só.
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_one_active
  ON process_versions (process_id) WHERE status = 'active';

-- ── Passos ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS process_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id        uuid NOT NULL REFERENCES process_versions(id) ON DELETE CASCADE,
  seq               integer NOT NULL,
  title             text NOT NULL,
  instruction       text,
  -- Papel que executa. Sem dono, o passo não acontece (SKILL.md §2.6).
  role              text,
  system_ref        text,                        -- onde se faz: "Lone OS > Social", "Gerenciador da Meta"
  sla_minutes       integer,
  decision_type     text,                        -- passo de decisão: qual critério
  evidence_type     text,                        -- o que comprova: "card movido", "print", "link do post"
  evidence_required boolean NOT NULL DEFAULT true,
  optional          boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_process_steps_seq ON process_steps (version_id, seq);

-- ── Imutabilidade da versão publicada ────────────────────────────────────────
-- Versão aprovada/ativa é contrato: quem quiser mudar cria versão nova. Deixar isso só na
-- aplicação é convite pra alguém "corrigir rapidinho" e apagar o que o time leu e assinou.
-- Liberado: mudar o STATUS (aprovar, ativar, descontinuar) e carimbar aprovação.
CREATE OR REPLACE FUNCTION trg_process_version_imutavel() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('approved', 'active') THEN
    IF ROW(NEW.objective, NEW.problem, NEW.scope, NEW.out_of_scope, NEW.trigger_event, NEW.frequency,
           NEW.prerequisites, NEW.inputs, NEW.outputs, NEW.completion_criteria, NEW.quality_criteria,
           NEW.sla, NEW.kpis, NEW.risks, NEW.exceptions, NEW.version)
       IS DISTINCT FROM
       ROW(OLD.objective, OLD.problem, OLD.scope, OLD.out_of_scope, OLD.trigger_event, OLD.frequency,
           OLD.prerequisites, OLD.inputs, OLD.outputs, OLD.completion_criteria, OLD.quality_criteria,
           OLD.sla, OLD.kpis, OLD.risks, OLD.exceptions, OLD.version)
    THEN
      RAISE EXCEPTION 'Versao % ja esta %: o conteudo e imutavel. Crie uma nova versao.', OLD.version, OLD.status;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS process_version_imutavel ON process_versions;
CREATE TRIGGER process_version_imutavel BEFORE UPDATE ON process_versions
  FOR EACH ROW EXECUTE FUNCTION trg_process_version_imutavel();

-- Passo de versão publicada também não muda — senão a imutabilidade acima seria contornável.
CREATE OR REPLACE FUNCTION trg_process_step_imutavel() RETURNS trigger AS $$
DECLARE st process_status;
BEGIN
  SELECT status INTO st FROM process_versions
   WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  IF st IN ('approved', 'active') THEN
    RAISE EXCEPTION 'Os passos desta versao estao congelados (%). Crie uma nova versao.', st;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS process_step_imutavel ON process_steps;
CREATE TRIGGER process_step_imutavel BEFORE INSERT OR UPDATE OR DELETE ON process_steps
  FOR EACH ROW EXECUTE FUNCTION trg_process_step_imutavel();

-- ── RLS fail-closed ──────────────────────────────────────────────────────────
-- Sem policy = ninguém autenticado lê pelo PostgREST. O acesso passa pelas rotas de servidor,
-- que aplicam requireRole. Esconder item no menu não é proteção (lib/api/require-role.ts).
ALTER TABLE processes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_steps    ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE processes IS
  'Hub de Processos: identidade estavel de cada processo/playbook/SOP. Conteudo fica em process_versions.';
COMMENT ON TABLE process_versions IS
  'Conteudo versionado. Aprovada/ativa e IMUTAVEL por trigger -- mudanca cria versao nova.';
