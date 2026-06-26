-- cs_cobrancas — log das cobranças da "Vigilância de Fluxo" do Agente CS.
-- Serve pra (1) NÃO-REDUNDÂNCIA: 1 cobrança por situação por dia, via `chave` UNIQUE; e
-- (2) auditoria/calibração: o que o agente cobrou (ou cobraria), pra quem, quando.
-- FASE 0 grava com dry_run=true (avalia o fluxo mas NÃO posta no WhatsApp).

CREATE TABLE IF NOT EXISTS cs_cobrancas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vigilancia     smallint NOT NULL,                  -- 1..6 (qual das 6 vigilâncias disparou)
  client_id      uuid REFERENCES clients(id) ON DELETE SET NULL,
  card_id        uuid REFERENCES content_cards(id) ON DELETE SET NULL,
  pessoa_cobrada text,                                -- nome do responsável cobrado (assigned_*)
  chave          text NOT NULL UNIQUE,                -- dedup do dia: "<vig>-<id>-<YYYY-MM-DD>"
  mensagem       text,                                -- texto que (seria) enviado ao grupo interno
  dry_run        boolean NOT NULL DEFAULT true,       -- Fase 0: true = só registrou, não postou
  disparado_em   timestamptz NOT NULL DEFAULT now(),
  respondido_em  timestamptz                          -- quando o responsável reagiu (resultado)
);

CREATE INDEX IF NOT EXISTS idx_cs_cobrancas_disparado ON cs_cobrancas (disparado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cs_cobrancas_client    ON cs_cobrancas (client_id);
