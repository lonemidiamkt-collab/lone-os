-- PORTAL: LINK AUTOMÁTICO NO CADASTRO (27/09/2026, pedido do CEO).
--
-- Todo cliente novo nasce com o link do portal e o grupo INTERNO de cadastro recebe uma mensagem com
-- ele (lib/portal/link-automatico.ts). Esta coluna é a trava de "uma vez só":
--
--   clients.portal_link_avisado_em — quando o grupo de cadastro recebeu o link deste cliente.
--   A automação só manda quando está nula e marca ANTES de mandar
--   (`update … where portal_link_avisado_em is null`): duas ativações ao mesmo tempo, uma mensagem.
--   Envio que falha volta a coluna para nula (tenta de novo na próxima ativação ou no backfill).
--
-- Links que JÁ EXISTIAM antes desta automação contam como conhecidos (recebem a data em que o link foi
-- criado): a automação não anuncia link velho. Isso roda uma vez só — na criação da coluna —, para
-- que rodar a migration de novo não marque como "avisado" um link novo cujo aviso falhou.
-- Cliente ativo SEM link aparece em /api/system/portal-links-backfill, que só gera ou manda quando
-- pedido (?gerar=1, ?enviar=1).
--
-- Idempotente. Coluna nova numa tabela que já existe (a RLS de clients não muda). Aplicar à mão.
-- Sem esta migration o app funciona: a trava passa a ser o registro de envios (cs_outbound.idem_key)
-- e só se avisa link criado na hora.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'portal_link_avisado_em'
  ) then
    alter table public.clients add column portal_link_avisado_em timestamptz;

    update public.clients
       set portal_link_avisado_em = coalesce(public_report_token_created_at, now())
     where public_report_token is not null;
  end if;
end $$;

comment on column public.clients.portal_link_avisado_em is
  'Quando o grupo interno de cadastro recebeu o link do portal (lib/portal/link-automatico.ts). NULL = ainda não avisado. Links anteriores à automação recebem a data de criação do link.';

notify pgrst, 'reload schema';
