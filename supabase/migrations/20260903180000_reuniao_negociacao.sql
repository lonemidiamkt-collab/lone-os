-- NEGOCIAÇÃO EM TRÊS VIAS
--
-- Roberto (03/09), fechando o desenho: "ele vai ter permissão pra marcar, somente entre o dia
-- quinze e vinte e dois… pode mandar todo dia oito horas da manhã perguntando. Ele pode tentar
-- marcar duas vezes. Se ele não conseguir, ele vai lá no grupo equipe e solicita pro social media
-- negociar com o cliente."
--
-- O que muda: o agente deixa de agendar direto quando o cliente responde. Passa a levar o horário
-- ao social, aceitar contraproposta, e devolvê-la ao cliente. Nada entra na agenda de alguém sem
-- essa pessoa ter dito sim.

ALTER TABLE meetings
  -- Quantas vezes o agente já ofereceu horário neste ciclo. Teto de 2 (MAX_TENTATIVAS).
  ADD COLUMN IF NOT EXISTS tentativas smallint NOT NULL DEFAULT 0,
  -- Quando a última oferta saiu — conta os 2 dias de espera pela resposta do cliente.
  ADD COLUMN IF NOT EXISTS ofertado_em timestamptz,
  -- Quando o horário do cliente foi levado ao social — conta 1 dia ÚTIL de espera.
  ADD COLUMN IF NOT EXISTS perguntado_social_em timestamptz,
  -- O horário que o cliente pediu, antes do social aceitar. Separado de start_at de propósito:
  -- start_at só é preenchido quando os DOIS concordaram, então uma reunião com start_at é uma
  -- reunião que vai acontecer — e é isso que a agenda e os lembretes leem.
  ADD COLUMN IF NOT EXISTS horario_proposto timestamptz,
  -- Quem propôs o horário atual: 'cliente' ou 'social'. É o que diz para quem levar a resposta.
  ADD COLUMN IF NOT EXISTS proposto_lado text,
  -- Quantas vezes o horário foi renegociado. Teto de 2 rodadas: depois o agente sai do meio, para
  -- não virar ping-pong no grupo.
  ADD COLUMN IF NOT EXISTS rodadas_negociacao smallint NOT NULL DEFAULT 0,
  -- Dedup dos lembretes DO CLIENTE, separados dos da equipe: são mensagens em grupos diferentes e
  -- uma pode falhar sem a outra.
  ADD COLUMN IF NOT EXISTS lembrete_cliente_vespera_em timestamptz,
  ADD COLUMN IF NOT EXISTS lembrete_cliente_hora_em timestamptz,
  -- Quando o agente desistiu e entregou a conversa para o social.
  ADD COLUMN IF NOT EXISTS entregue_ao_social_em timestamptz;

COMMENT ON COLUMN meetings.horario_proposto IS
  'Horário em negociação. start_at só recebe valor quando cliente E social concordaram — uma reunião com start_at é uma reunião que vai acontecer.';
COMMENT ON COLUMN meetings.tentativas IS
  'Ofertas do agente ao cliente neste ciclo. No máximo 2; depois a conversa vai para o social.';
