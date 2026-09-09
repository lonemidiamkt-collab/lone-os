-- REUNIÃO VIRA ATIVO OPERACIONAL
--
-- Roberto (09/09): "reuniões agora são um ativo operacional obrigatório da Lone Mídia."
--
-- POR QUE EVOLUIR `meetings` E NÃO CRIAR `client_meetings`: a tabela já tem 11 dos 16 campos
-- pedidos, `client_id` como FK real, dados vivos e seis telas em cima (calendário, Meu Trabalho,
-- aba do cliente, OKRs, lembretes, agente CS). Uma segunda tabela seria a duplicação que o
-- próprio pedido proíbe — duas versões da mesma informação, e a pergunta "esse cliente teve
-- reunião?" com duas respostas possíveis.

-- ── 1. DE ONDE VEIO A REUNIÃO ────────────────────────────────────────────
-- Distingue o que o agente marcou do que uma pessoa registrou à mão. Sem isso não dá para medir
-- quanto da operação o Loninho realmente automatiza.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_source text NOT NULL DEFAULT 'sistema';

-- ── 2. DURAÇÃO, SEM RISCO DE DIVERGIR ────────────────────────────────────
-- Coluna GERADA a partir de start_at/end_at: guardar o número à parte criaria duas verdades para
-- a mesma reunião — exatamente o que aconteceu com endereço (`endereco` x `endereco_rua`).
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS duration_minutes integer
  GENERATED ALWAYS AS (GREATEST(0, (EXTRACT(EPOCH FROM (end_at - start_at)) / 60)::int)) STORED;

-- ── 3. QUANDO MUDOU, E SE FOI APAGADA ────────────────────────────────────
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS deleted_by text;

-- Reunião realizada entra em indicador da empresa. Apagar sem deixar rastro é apagar um número
-- que alguém vai cobrar depois.
COMMENT ON COLUMN meetings.deleted_at IS
  'Soft delete. Nenhuma leitura de métrica pode contar linha com deleted_at preenchido.';

CREATE OR REPLACE FUNCTION meetings_touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION meetings_touch_updated_at();

-- ── 4. O DONO COMO RELAÇÃO, NÃO COMO TEXTO ───────────────────────────────
-- `responsavel` guarda o NOME. É o mesmo defeito que o pedido aponta para `client_name`: quando a
-- pessoa mudar de nome, a carteira e as métricas quebram em silêncio. O nome continua (muito
-- código lê dele, e a menção no WhatsApp resolve por nome), mas o id passa a ser a verdade.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS owner_member_id uuid REFERENCES team_members(id);

UPDATE meetings m SET owner_member_id = t.id
FROM team_members t
WHERE m.owner_member_id IS NULL AND m.responsavel IS NOT NULL AND t.name = m.responsavel;

-- ── 5. ESTADO VIRA CONJUNTO FECHADO ──────────────────────────────────────
-- Era texto livre: nada impedia gravar "Agendada" ou "finalizada" e sumir do filtro.
-- `no_show` é novo — o pedido separa "não aconteceu porque cancelamos" de "o cliente não veio".
UPDATE meetings SET estado = 'agendada' WHERE estado IS NULL AND status <> 'cancelled';
UPDATE meetings SET estado = 'cancelada' WHERE estado IS NULL AND status = 'cancelled';

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_estado_valido;
ALTER TABLE meetings ADD CONSTRAINT meetings_estado_valido CHECK (estado IN (
  'pendente', 'ofertada', 'proposta', 'aguardando_social',
  'agendada', 'realizada', 'cancelada', 'no_show'
));

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_source_valido;
ALTER TABLE meetings ADD CONSTRAINT meetings_source_valido CHECK (meeting_source IN (
  'calendario', 'ficha_cliente', 'manual', 'agente', 'sistema'
));

-- Reunião realizada TEM que ter quando. Sem isto, "teve reunião no mês" fica sem data para contar.
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_realizada_tem_data;
ALTER TABLE meetings ADD CONSTRAINT meetings_realizada_tem_data
  CHECK (estado <> 'realizada' OR realizada_em IS NOT NULL);

-- ── 6. META POR CLIENTE ──────────────────────────────────────────────────
-- Hoje a regra é uma só para todos. A coluna existe para o dia em que não for — e NULL significa
-- "usa o padrão da empresa", não "zero".
ALTER TABLE clients ADD COLUMN IF NOT EXISTS minimum_meetings_per_month smallint;
COMMENT ON COLUMN clients.minimum_meetings_per_month IS
  'NULL = usa o padrão da agência. Nunca ler como 0.';

-- ── 7. AUDITORIA ─────────────────────────────────────────────────────────
-- "Não podemos perder informação silenciosamente." Cada operação relevante deixa uma linha.
CREATE TABLE IF NOT EXISTS meeting_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid REFERENCES meetings(id) ON DELETE SET NULL,
  client_id   uuid REFERENCES clients(id)  ON DELETE SET NULL,
  acao        text NOT NULL,
  ator        text,
  origem      text,
  -- O que mudou. Sem credencial, sem transcrição: auditoria não é lugar de PII.
  detalhe     jsonb,
  erro        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE meeting_events IS
  'Trilha de auditoria das reuniões. `meeting_id` sobrevive à exclusão da reunião (SET NULL) — o
   evento continua existindo mesmo quando a linha original some.';

CREATE INDEX IF NOT EXISTS idx_meeting_events_meeting ON meeting_events (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_events_client  ON meeting_events (client_id, created_at DESC);

-- ── 8. ÍNDICES DAS CONSULTAS QUE VÃO EXISTIR ─────────────────────────────
-- "Esse cliente teve reunião no mês?" e "quantas o Thiago fez?" vão rodar em toda abertura da aba
-- Clientes e do dashboard. Só estes dois: índice a mais custa em toda escrita.
CREATE INDEX IF NOT EXISTS idx_meetings_cliente_estado
  ON meetings (client_id, estado, start_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_responsavel
  ON meetings (responsavel, start_at DESC) WHERE deleted_at IS NULL;

-- ── 9. NADA DE REUNIÃO SEM CLIENTE ───────────────────────────────────────
ALTER TABLE meetings ALTER COLUMN client_id SET NOT NULL;

-- ── 10. DUPLO CLIQUE NÃO CRIA DUAS ───────────────────────────────────────
-- Mesmo cliente, mesmo minuto de início: é a mesma reunião. Índice único parcial, ignorando as
-- apagadas — remarcar para o mesmo horário depois de cancelar continua possível.
-- `date_trunc` sobre timestamptz NÃO é imutável (depende do fuso da sessão) e o Postgres recusa
-- em índice. Fixar o fuso em UTC torna a expressão determinística — e o minuto é o mesmo minuto,
-- qualquer que seja o fuso em que foi digitado.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_meeting_cliente_inicio
  ON meetings (client_id, (date_trunc('minute', start_at AT TIME ZONE 'UTC')))
  WHERE deleted_at IS NULL AND estado <> 'cancelada';
