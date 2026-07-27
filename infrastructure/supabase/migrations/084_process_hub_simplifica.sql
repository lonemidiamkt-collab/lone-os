-- 084_process_hub_simplifica.sql — tira a cerimônia que não serve pra uma equipe de 6.
--
-- A 083 nasceu com o modelo de governança que a skill descreve: process owner separado de quem
-- executa, fluxo draft → in_review → approved → active, versão semântica. O Roberto perguntou
-- "mas por que dono?" e a pergunta está certa: em time pequeno quem faz É o responsável, e um
-- campo "dono do processo" separado do executor é campo que ninguém preenche direito.
--
-- Fica o que resolve problema real:
--   • o passo continua tendo PAPEL (quem faz aquilo) — isso é operação, não burocracia
--   • continua havendo versão, porque a aba precisa mostrar "isto mudou" pro time
--   • some o dono do processo, o estado "em revisão" e o "aprovado" antes de ativar
--
-- Seguro rodar: as tabelas estão vazias (nada em uso ainda).

-- Dono do processo: fora. Quem executa está em process_steps.role.
ALTER TABLE processes DROP COLUMN IF EXISTS owner_role;

-- Estados: rascunho → ativo → arquivado. Sem "em revisão" e sem "aprovado" intermediários —
-- publicar já é a revisão, feita por gente.
ALTER TABLE processes        ALTER COLUMN status DROP DEFAULT;
ALTER TABLE process_versions ALTER COLUMN status DROP DEFAULT;

DO $$ BEGIN
  CREATE TYPE process_status_v2 AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O índice parcial "só uma versão ativa" referencia o tipo antigo e trava o ALTER TYPE.
-- Sai antes, volta depois. (Foi o que derrubou a primeira execução desta migration.)
DROP INDEX IF EXISTS uq_process_one_active;

ALTER TABLE processes ALTER COLUMN status TYPE process_status_v2
  USING (CASE WHEN status::text IN ('active','approved') THEN 'active'
              WHEN status::text IN ('archived','deprecated') THEN 'archived'
              ELSE 'draft' END)::process_status_v2;
ALTER TABLE process_versions ALTER COLUMN status TYPE process_status_v2
  USING (CASE WHEN status::text IN ('active','approved') THEN 'active'
              WHEN status::text IN ('archived','deprecated') THEN 'archived'
              ELSE 'draft' END)::process_status_v2;

ALTER TABLE processes        ALTER COLUMN status SET DEFAULT 'draft'::process_status_v2;
ALTER TABLE process_versions ALTER COLUMN status SET DEFAULT 'draft'::process_status_v2;

DROP TYPE IF EXISTS process_status;
ALTER TYPE process_status_v2 RENAME TO process_status;

CREATE UNIQUE INDEX IF NOT EXISTS uq_process_one_active
  ON process_versions (process_id) WHERE status = 'active';

-- O trigger de imutabilidade continua, só que agora sobre um estado só: ativo.
CREATE OR REPLACE FUNCTION trg_process_version_imutavel() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'active' THEN
    IF ROW(NEW.objective, NEW.problem, NEW.scope, NEW.out_of_scope, NEW.trigger_event, NEW.frequency,
           NEW.prerequisites, NEW.inputs, NEW.outputs, NEW.completion_criteria, NEW.quality_criteria,
           NEW.sla, NEW.kpis, NEW.risks, NEW.exceptions, NEW.version)
       IS DISTINCT FROM
       ROW(OLD.objective, OLD.problem, OLD.scope, OLD.out_of_scope, OLD.trigger_event, OLD.frequency,
           OLD.prerequisites, OLD.inputs, OLD.outputs, OLD.completion_criteria, OLD.quality_criteria,
           OLD.sla, OLD.kpis, OLD.risks, OLD.exceptions, OLD.version)
    THEN
      RAISE EXCEPTION 'A versao % esta no ar: o time ja leu isso. Crie uma nova versao pra mudar.', OLD.version;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_process_step_imutavel() RETURNS trigger AS $$
DECLARE st process_status;
BEGIN
  SELECT status INTO st FROM process_versions WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  IF st = 'active' THEN
    RAISE EXCEPTION 'Os passos desta versao estao no ar. Crie uma nova versao pra mudar.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;

COMMENT ON TABLE processes IS
  'Hub de Processos: como a Lone trabalha, por area. Conteudo em process_versions; quem executa cada passo em process_steps.role.';
