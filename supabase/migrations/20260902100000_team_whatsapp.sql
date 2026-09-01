-- Telefone da equipe, para MENÇÃO DE VERDADE no WhatsApp.
--
-- Roberto: "quando você marca arroba Thiago, não está funcionando direito".
--
-- O código escrevia `@Thiago` como texto puro. No WhatsApp isso não notifica ninguém: uma menção
-- real exige o NÚMERO no corpo da mensagem (@5522999999999) e o campo `mentioned` no envio. O que
-- saía era um texto com cara de menção que o destinatário só via se estivesse lendo o grupo — que é
-- justamente o que a menção existiria para evitar.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS whatsapp_phone text;
COMMENT ON COLUMN team_members.whatsapp_phone IS
  'Número com DDI e DDD, só dígitos (ex: 5522999999999). Sem ele a menção vira texto simples com o primeiro nome — honesto, mas sem notificação.';
