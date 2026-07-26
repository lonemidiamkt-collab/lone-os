-- 081_cs_outbound.sql — registro do que o AGENTE enviou.
--
-- Hoje nada guarda a saída do agente. Consequências reais:
--   • 17 crons postam no mesmo grupo interno sem saber um do outro (~12 mensagens numa
--     segunda de manhã, várias repetindo o mesmo cliente)
--   • o agente não tem como saber que já falou aquilo ontem
--   • auditar o que foi dito depende de ler log de servidor, que rotaciona e some
--
-- A entrega ao CLIENTE já tem registro (client_group_message_log). Esta tabela é o lado
-- de dentro: o que o agente disse, pra quem, e se chegou.

CREATE TABLE IF NOT EXISTS cs_outbound (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Que rotina falou: 'bom-dia', 'pendencias', 'digest-manha', 'ig-snapshots'…
  origem       text NOT NULL,
  group_jid    text NOT NULL,
  -- 'interno' | 'cliente' | 'setor' — pra separar o que é backstage do que o cliente vê.
  destino      text NOT NULL DEFAULT 'interno',
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  texto        text NOT NULL,
  -- Impressão digital do conteúdo: permite "isso eu já falei" sem comparar texto inteiro.
  assinatura   text,
  enviado      boolean NOT NULL DEFAULT false,
  erro         text,
  -- Dia BRT (YYYY-MM-DD) — janela natural de dedup, sem depender do fuso do servidor.
  dia          text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_outbound_dia     ON cs_outbound (dia DESC, origem);
CREATE INDEX IF NOT EXISTS idx_cs_outbound_assin   ON cs_outbound (assinatura, dia);
CREATE INDEX IF NOT EXISTS idx_cs_outbound_client  ON cs_outbound (client_id, created_at DESC);

-- Fail-closed: o conteúdo cita cliente, valor e pendência. Só service_role (os crons e as
-- rotas de servidor) enxerga. Sem policy = ninguém autenticado lê pelo PostgREST.
ALTER TABLE cs_outbound ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cs_outbound IS
  'Tudo que o agente CS enviou. Serve pra dedup entre rotinas, pro agente saber o que ja falou e pra auditar entrega sem depender de log de servidor.';
