-- PAUTA E ANEXOS DA REUNIÃO
--
-- Roberto (04/09), depois de olhar a tela com o time: "o social media não está tendo um lugar pra
-- eles fazerem o cadastro das reuniões, agendar reunião, colocar o briefing da reunião, anexar o
-- briefing da reunião."
--
-- A aba tinha DOIS blocos separados — "Agendar" (o agendador antigo) e "Reuniões cadastradas" (o
-- registro de transcrição) — fazendo partes do mesmo trabalho. Quem chega não sabe em qual clicar.
-- Estas colunas fecham o que faltava para os dois virarem um fluxo só: o que se prepara ANTES e o
-- que se anexa.

ALTER TABLE meetings
  -- A PAUTA: o que vai ser tratado. Escrita à mão pelo social ou gerada a partir do estado do
  -- cliente (lib/cs/reuniao.ts já sabe montar). Separada de `description`, que é o convite,
  -- e de `resumo`, que é o depois.
  ADD COLUMN IF NOT EXISTS pauta text,
  ADD COLUMN IF NOT EXISTS pauta_em timestamptz,
  ADD COLUMN IF NOT EXISTS pauta_por text,
  -- Como a pauta nasceu: 'manual' (escrita) ou 'ia' (gerada do estado do cliente e depois
  -- editada). Guardado porque muda a confiança de quem lê — pauta gerada merece uma passada de
  -- olho antes da reunião.
  ADD COLUMN IF NOT EXISTS pauta_origem text,
  -- Arquivos: [{ path, nome, tipo, tamanho, enviado_em, enviado_por }]. jsonb em vez de tabela
  -- própria porque são poucos por reunião, sempre lidos junto com ela, e nunca consultados
  -- isoladamente — uma tabela aqui só acrescentaria um join.
  ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN meetings.pauta IS
  'O que vai ser tratado, preparado ANTES. Diferente de description (o convite) e de resumo (o que ficou decidido depois).';
COMMENT ON COLUMN meetings.anexos IS
  'Arquivos da reunião no bucket meeting-records: briefing, apresentação, relatório. Lidos sempre junto com a reunião, por isso jsonb e não tabela.';
