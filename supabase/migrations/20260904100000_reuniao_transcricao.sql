-- TRANSCRIÇÃO E MEMÓRIA DAS REUNIÕES
--
-- Roberto (04/09): "o social media fez a reunião ou o gestor de tráfego fez a reunião com aquele
-- cliente, então ele tem que pegar essa transcrição, mandar alocar dentro do nosso sistema, e ficar
-- guardado — e às vezes aprimorar o briefing, ou deixar ali como pontos de atenção que o cliente
-- precisa, ou até mesmo pra gente repescar. Então o social media ou eu vou na aba do cliente,
-- 'reuniões cadastradas', e consigo ter esse histórico."
--
-- Reusa `meetings`, que já guarda cliente, data, responsável e estado. O que falta é a MEMÓRIA do
-- que foi dito — e ela precisa de três formas diferentes, porque servem a três usos:
--
--   1. A transcrição CRUA, para repescar ("o que exatamente ele falou sobre o prazo?").
--   2. A análise ESTRUTURADA, para o sistema agir (pendências viram cobrança, pontos de atenção
--      viram alerta, sugestões viram regra de briefing).
--   3. O PDF, para ler e mandar para alguém sem precisar do sistema.
--
-- Guardar só o resumo perderia o primeiro uso; guardar só a transcrição perderia o segundo.

ALTER TABLE meetings
  -- A transcrição como veio: colada pelo time, transcrita de áudio, ou notas escritas à mão.
  -- Texto longo mesmo — é o registro do que foi dito, e cortar aqui é perder a informação que
  -- justifica o recurso existir.
  ADD COLUMN IF NOT EXISTS transcricao text,
  -- Como a transcrição chegou: 'texto' (colada), 'audio' (transcrita pelo Whisper), 'notas'.
  ADD COLUMN IF NOT EXISTS transcricao_origem text,
  ADD COLUMN IF NOT EXISTS transcricao_em timestamptz,
  ADD COLUMN IF NOT EXISTS transcricao_por text,
  -- O que a IA extraiu: decisões, próximas ações, pendências do cliente, pontos de atenção e
  -- sugestões de briefing. jsonb porque o formato evolui e migração de coluna a cada ajuste
  -- do prompt seria fricção sem ganho.
  ADD COLUMN IF NOT EXISTS analise jsonb,
  -- Extraídos para coluna própria porque são CONSULTADOS: o painel do cliente e o raio-x
  -- precisam de "quais os pontos de atenção deste cliente" sem abrir o jsonb inteiro.
  ADD COLUMN IF NOT EXISTS pontos_atencao text[],
  -- Caminho no bucket `meeting-records`. Privado: transcrição de reunião com cliente não é
  -- material público.
  ADD COLUMN IF NOT EXISTS pdf_path text,
  -- Quantas palavras a transcrição tem — para a lista mostrar "reunião de 45 min" vs "3 linhas"
  -- sem carregar o texto todo.
  ADD COLUMN IF NOT EXISTS transcricao_palavras integer;

-- Busca por conteúdo da transcrição. Roberto: "até pra gente ir buscar alguma informação".
-- `portuguese` para "reuniões" achar "reunião", e GIN porque a busca é por palavra, não por prefixo.
CREATE INDEX IF NOT EXISTS meetings_transcricao_busca
  ON meetings USING gin (to_tsvector('portuguese', coalesce(transcricao, '')));

-- Histórico por cliente, do mais recente: é como a aba do cliente lê.
CREATE INDEX IF NOT EXISTS meetings_cliente_historico
  ON meetings (client_id, start_at DESC)
  WHERE transcricao IS NOT NULL;

COMMENT ON COLUMN meetings.transcricao IS
  'O que foi dito, como veio. Guardado inteiro de propósito: o resumo serve para agir, a transcrição serve para repescar o que ninguém previu que seria importante.';
COMMENT ON COLUMN meetings.pontos_atencao IS
  'Extraídos da análise para coluna própria porque são consultados pelo painel e pelo raio-x sem abrir o jsonb.';
