-- 067_crm_metas.sql — meta mensal do comercial (SDR): dá norte + barra de progresso no dashboard.
-- Uma linha por mês (YYYY-MM). Aplicar MANUAL no banco.
create table if not exists crm_metas (
  mes         text primary key,   -- YYYY-MM
  meta_valor  numeric,            -- meta de vendas do mês (R$)
  meta_leads  integer,            -- meta de leads novos no mês (opcional)
  updated_at  timestamptz not null default now()
);

alter table crm_metas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_metas' and policyname = 'crm_metas_all') then
    create policy "crm_metas_all" on crm_metas for all to authenticated using (true) with check (true);
  end if;
end $$;
