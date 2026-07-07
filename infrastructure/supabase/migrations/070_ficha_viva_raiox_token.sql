-- 070_ficha_viva_raiox_token.sql
-- Ficha Viva 360 — separação de acesso por escopo.
--
-- Problema: quem preenche o Raio-X comercial é a EQUIPE DE VENDAS do cliente, e ela NÃO
-- pode ver o faturamento da loja. O link único misturava crescimento (dado do dono) com
-- o Raio-X (form do vendedor). Solução: DOIS tokens.
--   ficha_viva_token       → link do DONO: crescimento + Raio-X (escopo full)
--   ficha_viva_raiox_token → link do VENDEDOR: SÓ o Raio-X (o servidor nunca carrega
--                            dado financeiro nesse escopo)
-- Os dois compartilham ficha_viva_enabled / revoked_at (ativar/revogar vale pros dois).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS ficha_viva_raiox_token text UNIQUE;

COMMENT ON COLUMN clients.ficha_viva_raiox_token IS
  'Token do link do Raio-X (equipe de vendas). Escopo raiox: só o formulário, sem financeiro.';
