-- SINCRONIA clients.meta_ad_account_id → ad_accounts (23/09/2026).
-- O alerta de verba, o digest de saldo e o portal leem de `ad_accounts`. Quem cadastrava a conta por
-- outro caminho que não a tela "Editar cliente" (importação, cadastro novo, correção no banco) ficava
-- com a conta em `clients` e AUSENTE em `ad_accounts` — e então, em silêncio: sem sync de saldo, sem
-- alerta de verba, sem linha no PDF. Era o caso do ACM Distribuidora, Blocfast e Casas Rio Bahia.
-- Duas peças: (1) backfill do que está faltando; (2) trigger para nunca mais depender de quem grava.

insert into public.ad_accounts (client_id, meta_account_id)
select c.id, c.meta_ad_account_id from public.clients c
where c.meta_ad_account_id is not null and c.meta_ad_account_id <> ''
  and not exists (select 1 from public.ad_accounts a where a.client_id = c.id)
on conflict (meta_account_id) do update set client_id = excluded.client_id;

create or replace function public.sincronizar_ad_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.meta_ad_account_id is null or new.meta_ad_account_id = '' then
    return new;
  end if;
  -- conta trocou: a linha antiga deste cliente sai (senão o sync roda numa conta que não é mais dele)
  delete from ad_accounts where client_id = new.id and meta_account_id <> new.meta_ad_account_id;
  insert into ad_accounts (client_id, meta_account_id)
    values (new.id, new.meta_ad_account_id)
    on conflict (meta_account_id) do update set client_id = excluded.client_id;
  return new;
end $$;

drop trigger if exists trg_sincronizar_ad_account on public.clients;
create trigger trg_sincronizar_ad_account
  after insert or update of meta_ad_account_id on public.clients
  for each row execute function public.sincronizar_ad_account();

notify pgrst, 'reload schema';
