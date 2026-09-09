-- A REUNIÃO COMO REGISTRO DE RELACIONAMENTO, NÃO COMO EVENTO DE AGENDA
--
-- Roberto (09/09): "toda reunião realizada é parte da memória operacional do cliente."
--
-- O que a reunião já guardava: pauta (antes), transcrição, resumo e análise da IA (depois),
-- anexos em jsonb. O que faltava era o registro que a PESSOA escreve logo depois da reunião —
-- separado do que a IA extrai, porque são coisas diferentes e uma não substitui a outra.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS briefing text;
COMMENT ON COLUMN meetings.briefing IS
  'O que foi discutido, escrito por quem participou. Diferente de `resumo`, que a IA extrai da
   transcrição, e de `pauta`, que é o preparo de ANTES.';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS decisoes text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS proximos_passos text;
COMMENT ON COLUMN meetings.proximos_passos IS
  'Texto por enquanto. A intenção declarada é virar tarefa: quando isso acontecer, cada linha
   daqui deve poder apontar para um id em `tasks` sem reescrever a coluna.';

-- Quem complementou depois, e quando. Uma reunião marcada às 11h e resumida às 15h são dois
-- fatos, e `updated_at` sozinho não conta essa história.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS briefing_em timestamptz;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS briefing_por text;

-- ── ANEXOS COM METADADO NO BANCO ─────────────────────────────────────────
--
-- Roberto (§16): "guardar metadados no banco. Não depender apenas do Storage."
--
-- Hoje os anexos vivem num `jsonb` dentro da própria reunião. Funciona para listar, mas não
-- responde "quais documentos existem deste cliente" sem abrir reunião por reunião — que é
-- exatamente o §7. Tabela própria resolve, e o arquivo continua UM só no Storage.
CREATE TABLE IF NOT EXISTS meeting_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id     uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  -- Derivável da reunião, mas guardado de propósito: é por ele que a ficha do cliente lista os
  -- documentos sem precisar juntar com meetings, e é o que uma policy de acesso vai olhar.
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nome_arquivo   text NOT NULL,
  nome_original  text,
  tipo_mime      text,
  tamanho_bytes  bigint,
  -- Caminho no bucket. NUNCA é a autorização: quem pode ver é decidido no servidor, pela
  -- reunião e pelo cliente — pasta não é permissão.
  storage_path   text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'meeting-records',
  enviado_por    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_meeting_anexos_reuniao ON meeting_attachments (meeting_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_anexos_cliente ON meeting_attachments (client_id, created_at DESC) WHERE deleted_at IS NULL;
-- O mesmo arquivo não entra duas vezes na mesma reunião (duplo clique no upload).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_meeting_anexo_path
  ON meeting_attachments (meeting_id, storage_path) WHERE deleted_at IS NULL;

-- Traz o que já estava no jsonb. Sem apagar o jsonb: se algo der errado na leitura nova, o dado
-- antigo continua lá para comparar.
INSERT INTO meeting_attachments (meeting_id, client_id, nome_arquivo, nome_original, tamanho_bytes, storage_path, enviado_por)
SELECT m.id, m.client_id,
       COALESCE(a->>'nome', 'arquivo'), a->>'nome',
       NULLIF(a->>'tamanho', '')::bigint, a->>'path',
       COALESCE(m.created_by, 'sistema')
FROM meetings m, jsonb_array_elements(COALESCE(m.anexos, '[]'::jsonb)) a
WHERE a->>'path' IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── BUSCA NO QUE FOI DITO ────────────────────────────────────────────────
-- Roberto (§18): "entrar no cliente e pesquisar `cimento`". A transcrição já era buscável; o que
-- a pessoa escreve à mão passa a ser também.
CREATE INDEX IF NOT EXISTS idx_meetings_busca_texto ON meetings
  USING gin (to_tsvector('portuguese',
    COALESCE(briefing,'') || ' ' || COALESCE(decisoes,'') || ' ' || COALESCE(proximos_passos,'') || ' ' || COALESCE(resumo,'')));
