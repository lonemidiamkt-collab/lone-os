-- CONTA META NÃO MUDA DE DONO EM SILÊNCIO (21/10/2026). Auditoria de erro recuperável, item 3.3.
--
-- O gatilho de 23/09 (20260923140000_ad_accounts_espelho.sql) fazia
--   insert ... on conflict (meta_account_id) do update set client_id = excluded.client_id
-- ou seja: gravar em `clients` uma conta que já era de OUTRO cliente passava a linha de `ad_accounts`
-- (alerta de verba, digest de saldo, portal) para este, sem ninguém saber, e o antigo seguia com a
-- conta na ficha. E rodava em TODO update que trouxesse a coluna — o "Editar cliente" manda a conta
-- em cada salvamento, então salvar o cadastro de um puxava a conta de volta do outro.
--
-- A rota /api/clients/update já recusa (409 "esta conta é do Cliente X") e só transfere com
-- confirmação, tirando a conta do antigo ANTES de gravar no novo. Este gatilho é a mesma regra no
-- banco, para importação, cadastro novo, script ou correção à mão não reabrirem o buraco:
--   · update que NÃO muda a conta: não toma a linha de ninguém (só cria se não houver nenhuma);
--   · conta de outro cliente ATIVO cuja ficha ainda aponta para ela: erro 23505 com o nome dele;
--   · conta livre, de ex-cliente, ou linha velha de quem não aponta mais para ela: vem para este.

create or replace function public.sincronizar_ad_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  outro_nome text;
begin
  if new.meta_ad_account_id is null or new.meta_ad_account_id = '' then
    return new;
  end if;

  -- Mesma conta de antes: não é vincular de novo. Conserta espelho faltando, sem tomar de ninguém.
  if tg_op = 'UPDATE' and new.meta_ad_account_id is not distinct from old.meta_ad_account_id then
    insert into ad_accounts (client_id, meta_account_id)
      values (new.id, new.meta_ad_account_id)
      on conflict (meta_account_id) do nothing;
    return new;
  end if;

  -- Outro cliente ativo com a mesma conta na ficha: não passa. Transferir é tirar de lá primeiro.
  select coalesce(nullif(c.nome_fantasia, ''), c.name) into outro_nome
    from clients c
   where c.id <> new.id
     -- com e sem o prefixo act_ (fichas antigas guardam só o número)
     and regexp_replace(c.meta_ad_account_id, '^act_', '') = regexp_replace(new.meta_ad_account_id, '^act_', '')
     and coalesce(c.active, true)
     and c.churned_at is null
   limit 1;
  if outro_nome is not null then
    raise exception 'A conta de anúncio % já é do cliente %. Para trazer para cá, confirme a transferência na ficha (Admin › Conta Meta Ads).',
      new.meta_ad_account_id, outro_nome
      using errcode = '23505';
  end if;

  -- conta trocou: a linha antiga deste cliente sai (senão o sync roda numa conta que não é mais dele)
  delete from ad_accounts where client_id = new.id and meta_account_id <> new.meta_ad_account_id;
  insert into ad_accounts (client_id, meta_account_id)
    values (new.id, new.meta_ad_account_id)
    on conflict (meta_account_id) do update set client_id = excluded.client_id;
  return new;
end $$;

-- O gatilho continua o mesmo (after insert or update of meta_ad_account_id); só a função mudou.

notify pgrst, 'reload schema';
