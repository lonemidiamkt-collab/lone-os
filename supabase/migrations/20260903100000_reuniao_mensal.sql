-- CICLO MENSAL DE REUNIÕES COM O CLIENTE
--
-- Roberto (02/09): "meu time vai fazer reuniões mensais com os clientes. Todo dia quinze até o dia
-- vinte e dois, eles têm que marcar… a IA tem que lembrar ele de marcar, ou já pode oferecer pra
-- marcar. E aí o cliente marcando, ela já coloca na agenda desse social media, e lembra ele um dia
-- antes, o horário antes."
--
-- Reusa a tabela `meetings`, que já existia vazia com start_at/end_at/status. O que falta é o que
-- transforma um compromisso solto num CICLO: a qual mês ele pertence, quem é o responsável, o
-- estado da negociação e o controle de lembretes.
--
-- Sem Google Calendar por decisão dele — e a decisão se sustenta: o compromisso já vive aqui, o
-- lembrete sai pelo WhatsApp que o time lê o dia todo, e uma integração OAuth a mais seria mais
-- uma credencial para expirar sem avisar.

ALTER TABLE meetings
  -- "2026-09". É o que amarra a reunião ao ciclo e permite responder "quem não marcou este mês".
  ADD COLUMN IF NOT EXISTS mes_referencia text,
  -- O social responsável. Copiado de clients.assigned_social no momento da criação: se o cliente
  -- trocar de responsável depois, o histórico continua dizendo quem cuidou daquele mês.
  ADD COLUMN IF NOT EXISTS responsavel text,
  -- pendente → proposta → agendada → realizada (ou cancelada)
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendente',
  -- Quando alguém sugeriu um horário que o cliente ainda não confirmou.
  ADD COLUMN IF NOT EXISTS proposto_em timestamptz,
  ADD COLUMN IF NOT EXISTS proposto_por text,
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz,
  -- Quem confirmou: o cliente no grupo, ou alguém do time à mão.
  ADD COLUMN IF NOT EXISTS confirmado_por text,
  -- Grupo onde a combinação aconteceu — para o agente responder no lugar certo.
  ADD COLUMN IF NOT EXISTS group_jid text,
  -- A frase original do cliente. Guardada porque, quando o parser errar, é por ela que se descobre.
  ADD COLUMN IF NOT EXISTS trecho_origem text,
  -- Dedup dos lembretes: sem isto o cron de hora em hora avisaria a mesma reunião o dia inteiro.
  ADD COLUMN IF NOT EXISTS lembrete_vespera_em timestamptz,
  ADD COLUMN IF NOT EXISTS lembrete_hora_em timestamptz,
  -- Preenchido depois da reunião; alimenta a ficha do cliente (lib/cs/reuniao.ts).
  ADD COLUMN IF NOT EXISTS resumo text,
  ADD COLUMN IF NOT EXISTS realizada_em timestamptz;

-- UMA reunião de ciclo por cliente por mês. Impede que duas conversas paralelas no grupo criem
-- dois compromissos para o mesmo mês — e é o que permite `upsert` sem checar antes.
CREATE UNIQUE INDEX IF NOT EXISTS meetings_ciclo_unico
  ON meetings (client_id, mes_referencia)
  WHERE mes_referencia IS NOT NULL AND meeting_type = 'mensal';

-- Busca do cron de lembretes: as agendadas do futuro próximo.
CREATE INDEX IF NOT EXISTS meetings_agendadas ON meetings (start_at)
  WHERE estado = 'agendada';

-- Quem é responsável por quê no ciclo.
CREATE INDEX IF NOT EXISTS meetings_ciclo_responsavel ON meetings (mes_referencia, responsavel);

COMMENT ON COLUMN meetings.estado IS
  'pendente (mês virou e ninguém marcou) → proposta (horário sugerido, falta o cliente confirmar) → agendada (data e hora combinadas; gera lembrete) → realizada | cancelada';
COMMENT ON COLUMN meetings.trecho_origem IS
  'A frase do cliente que gerou a data. Quando o parser erra, é por aqui que se descobre o padrão que faltou.';
