-- 061_crm_leads.sql — CRM comercial (SDR) da Lone Mídia.
-- Funil de prospecção: Lead → Orçamento → Proposta → Reunião → Ganho/Perdido.
-- Cada lead é um card no Kanban da área Comercial (login escopado, papel "comercial").
create table if not exists crm_leads (
  id                  uuid primary key default gen_random_uuid(),
  contato_nome        text not null,
  empresa             text,
  telefone            text,
  email               text,
  valor_orcamento     numeric,                      -- valor do orçamento em aberto (R$)
  estagio             text not null default 'lead', -- lead|orcamento|proposta|reuniao|ganho|perdido
  origem              text,                          -- indicação, tráfego, prospecção…
  responsavel         text,                          -- o SDR dono do lead
  reuniao_data        date,                          -- dia da reunião marcada
  proposta_enviada_em date,                          -- quando a proposta foi enviada
  motivo_perda        text,                          -- quando estagio = perdido
  observacoes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_crm_leads_estagio on crm_leads (estagio);
create index if not exists idx_crm_leads_responsavel on crm_leads (responsavel);

-- Espelha as outras tabelas: RLS ligado + policy p/ authenticated; o BFF (rotas /api) usa o
-- service role, que bypassa a RLS. A policy garante que acesso direto exija login.
alter table crm_leads enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_leads' and policyname = 'crm_leads_all') then
    create policy "crm_leads_all" on crm_leads for all to authenticated using (true) with check (true);
  end if;
end $$;
