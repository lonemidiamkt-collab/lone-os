-- Motivo de saída obrigatório (Roberto: "gostei do motivo de saída obrigatório").
--
-- Hoje: 6 clientes arquivados, 1 com motivo preenchido. Cinco saíram e ninguém sabe por quê — e
-- sem isso não há como responder a pergunta que importa: a gente está perdendo cliente por preço,
-- por resultado, ou por atendimento? Cada uma dessas respostas muda uma decisão diferente.
--
-- A categoria é o que vira relatório; churn_reason (texto livre, que já existia) continua sendo o
-- contexto. Texto livre sozinho não agrega: "Encerrou contrato (não atendemos mais) — Meta revogou
-- acesso", o único motivo registrado até hoje, não entra em nenhuma conta.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS churn_category text;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_churn_category_valida;
ALTER TABLE clients ADD CONSTRAINT clients_churn_category_valida CHECK (
  churn_category IS NULL OR churn_category IN
  ('preco','resultado','fechou','concorrente','equipe_propria','atendimento','pausa','outro')
);

COMMENT ON COLUMN clients.churn_category IS
  'Motivo estruturado da saída. Obrigatório ao arquivar (validado na API). O texto em churn_reason complementa.';
