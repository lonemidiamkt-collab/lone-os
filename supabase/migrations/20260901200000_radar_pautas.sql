-- As pautas que o Radar produz para cada cliente.
--
-- Sem esta tabela a inteligência morre na resposta da API: o pipeline roda, gera a pauta e ninguém
-- vê — o mesmo destino dos alertas de queda, que ficaram meses sendo detectados e nunca comunicados.
-- Aqui a pauta fica ligada ao cliente, com as referências que a originaram, esperando o social
-- media usar ou descartar. E o descarte também é dado: pauta rejeitada ensina o que não serve.
CREATE TABLE IF NOT EXISTS radar_pautas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  cliente_nome text NOT NULL,
  nicho text NOT NULL,
  -- Qual padrão de mercado originou isto, e quantos perfis o sustentavam.
  tendencia text NOT NULL,
  perfis_na_tendencia int,
  ideia text NOT NULL,
  hook text,
  formato text,
  roteiro text[],
  cta text,
  porque_funciona text,
  -- Os posts reais que deram origem. É o que permite conferir se a leitura fez sentido.
  referencias text[],
  status text NOT NULL DEFAULT 'nova',   -- nova | usada | descartada
  decidido_por text,
  decidido_em timestamptz,
  motivo_descarte text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_pautas_cliente ON radar_pautas (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS radar_pautas_novas ON radar_pautas (created_at DESC) WHERE status = 'nova';

ALTER TABLE radar_pautas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS radar_pautas_service ON radar_pautas;
CREATE POLICY radar_pautas_service ON radar_pautas FOR ALL TO service_role USING (true) WITH CHECK (true);
