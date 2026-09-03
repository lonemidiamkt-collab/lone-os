-- Busca nas transcrições de um cliente, devolvendo o TRECHO que casou.
--
-- Roberto (04/09): "até pra gente ir buscar alguma informação". Devolver só a reunião obrigaria a
-- abrir e reler tudo; o trecho responde na própria lista.
--
-- `websearch_to_tsquery` porque entende aspas e "-" como o usuário espera e não quebra com
-- pontuação — `to_tsquery` lança erro em algo tão comum quanto "reunião,".
CREATE OR REPLACE FUNCTION buscar_transcricoes(p_client_id uuid, p_termo text, p_limite int DEFAULT 20)
RETURNS TABLE (
  id uuid, start_at timestamptz, responsavel text, resumo text,
  transcricao_palavras integer, trecho text, relevancia real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.start_at, m.responsavel, m.resumo, m.transcricao_palavras,
         ts_headline('portuguese', m.transcricao, websearch_to_tsquery('portuguese', p_termo),
                     'MaxWords=45, MinWords=20, MaxFragments=2, FragmentDelimiter=" … "') AS trecho,
         ts_rank(to_tsvector('portuguese', coalesce(m.transcricao, '')),
                 websearch_to_tsquery('portuguese', p_termo)) AS relevancia
  FROM meetings m
  WHERE m.client_id = p_client_id
    AND m.transcricao IS NOT NULL
    AND to_tsvector('portuguese', m.transcricao) @@ websearch_to_tsquery('portuguese', p_termo)
  ORDER BY relevancia DESC, m.start_at DESC
  LIMIT p_limite;
$$;

REVOKE ALL ON FUNCTION buscar_transcricoes(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION buscar_transcricoes(uuid, text, int) TO service_role;
