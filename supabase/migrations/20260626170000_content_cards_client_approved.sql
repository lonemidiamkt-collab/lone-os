-- Sinal de "feito" do Agente CS: quando o cliente APROVA a arte no WhatsApp dele ("ficou top",
-- "pode postar", "aprovado"), o agente marca aqui — pra a vigilância saber que está aprovado e o
-- time poder agendar. Não publica sozinho.

ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS client_approved_at timestamptz;
