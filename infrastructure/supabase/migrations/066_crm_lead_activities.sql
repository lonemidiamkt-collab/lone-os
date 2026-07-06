-- 066_crm_lead_activities.sql — timeline/histórico por lead do CRM comercial (SDR).
-- Cada ligação/mensagem/nota/e-mail vira uma linha; mudança de etapa é auto-registrada.
-- É onde o SDR "mora" pra saber o que já foi feito com cada lead. Aplicar MANUAL no banco.
create table if not exists crm_lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references crm_leads(id) on delete cascade,
  tipo       text not null default 'nota',  -- nota | ligacao | whatsapp | email | reuniao | etapa
  texto      text not null,
  autor      text,                          -- SDR que registrou
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_lead_activities_lead on crm_lead_activities (lead_id, created_at desc);

alter table crm_lead_activities enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_lead_activities' and policyname = 'crm_lead_activities_all') then
    create policy "crm_lead_activities_all" on crm_lead_activities for all to authenticated using (true) with check (true);
  end if;
end $$;
