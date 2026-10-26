-- 20261026170000_d4sign_varios_cofres.sql — a D4Sign com VÁRIOS cofres de contrato.
--
-- Na conta da Lone os contratos ficam em ~10 cofres (um por pacote, renovação, experiência…). A coluna
-- d4sign_config.cofre passa a guardar a LISTA dos cofres escolhidos no painel (UUIDs separados por vírgula —
-- sem mudança de tipo). O webhook 2.0 é cadastrado cofre a cofre, e a D4Sign responde a 10 chamadas por hora:
-- webhook_cofres lembra em quais o aviso já foi ligado, para o "Ligar o aviso da D4Sign" retomar de onde parou
-- sem gastar chamada de novo (lib/contracts/d4sign-config.ts#ligarWebhookD4Sign).
--
-- Idempotente. Sem a coluna, o "Ligar o aviso" não consegue lembrar o que já fez (e repete os cofres).
begin;

alter table public.d4sign_config add column if not exists webhook_cofres text;

comment on column public.d4sign_config.webhook_cofres is
  'Cofres em que o webhook 2.0 da D4Sign já foi cadastrado (UUIDs separados por vírgula).';

commit;
notify pgrst, 'reload schema';
