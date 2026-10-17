-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Comercial — Leva 1 (out/2026). Aplicar À MÃO em produção, com aprovação do Roberto:
--   docker exec -i supabase-db-1 psql -U postgres -d loneos -v ON_ERROR_STOP=1 < este_arquivo.sql
-- Idempotente (pode rodar de novo) e aditiva. NENHUM valor de cliente aqui — o repo é público.
--
-- 1. Etapas novas do funil: lead→novo, orcamento/reuniao→diagnostico (lib/crm/etapas.ts).
-- 2. Colunas novas do lead: mensalidade/chance/retomar/previsão/motivo fixo/origem da rota e do site.
-- 3. Metas de esforço no mês (contatos/semana, propostas/mês).
-- 4. crm_recebidos (idempotência do formulário do site) e crm_leads_descartados (lixo do formulário).
-- 5. crm_metas TRANCADA: tinha policy ALL para `authenticated` — qualquer logado lia e mudava a meta
--    de MRR direto pelo PostgREST. Agora só service_role (as rotas do servidor), como crm_leads (080).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- 1+2. crm_leads ----------------------------------------------------------------------------------
alter table public.crm_leads add column if not exists valor_implantacao numeric;
alter table public.crm_leads add column if not exists probabilidade numeric;
alter table public.crm_leads add column if not exists retomar_em date;
alter table public.crm_leads add column if not exists previsao_fechamento date;
alter table public.crm_leads add column if not exists motivo_perda_codigo text;
alter table public.crm_leads add column if not exists segmento text;
alter table public.crm_leads add column if not exists cidade text;
alter table public.crm_leads add column if not exists endereco text;
alter table public.crm_leads add column if not exists instagram text;
alter table public.crm_leads add column if not exists rota_loja_id int;
alter table public.crm_leads add column if not exists temperatura text;
alter table public.crm_leads add column if not exists etapa_desde timestamptz;
alter table public.crm_leads add column if not exists primeiro_contato_em timestamptz;
alter table public.crm_leads add column if not exists externo_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_leads_probabilidade_check') then
    alter table public.crm_leads add constraint crm_leads_probabilidade_check check (probabilidade is null or (probabilidade >= 0 and probabilidade <= 1));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_leads_temperatura_check') then
    alter table public.crm_leads add constraint crm_leads_temperatura_check check (temperatura is null or temperatura in ('quente', 'morno', 'frio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_leads_motivo_perda_codigo_check') then
    alter table public.crm_leads add constraint crm_leads_motivo_perda_codigo_check check (motivo_perda_codigo is null or motivo_perda_codigo in
      ('sem_resposta', 'preco', 'sem_verba', 'ja_tem_agencia', 'nao_decisor', 'sem_perfil', 'concorrente', 'experiencia_ruim', 'outro'));
  end if;
end $$;

create unique index if not exists crm_leads_rota_loja_id_unico on public.crm_leads (rota_loja_id) where rota_loja_id is not null;
create unique index if not exists crm_leads_externo_id_unico on public.crm_leads (externo_id) where externo_id is not null;
create index if not exists crm_leads_retomar_em on public.crm_leads (retomar_em) where retomar_em is not null;

comment on column public.crm_leads.valor_orcamento is 'MENSALIDADE negociada (R$/mês) — base da meta de MRR novo do comercial.';
comment on column public.crm_leads.probabilidade is 'Chance de fechar (0–1); nula = padrão da etapa (lib/crm/etapas.ts).';
comment on column public.crm_leads.retomar_em is 'Lead estacionado de propósito até esta data (some do Hoje e da cadência).';
comment on column public.crm_leads.rota_loja_id is 'Loja do app da rota (rota_visitas.loja), quando o lead nasceu de visita.';
comment on column public.crm_leads.externo_id is 'Id do cadastro do formulário do site (ou da planilha) — idempotência da entrada.';

-- Etapas antigas → novas (contagem antes/depois vai no NOTICE).
do $$
declare antes text; depois text;
begin
  select string_agg(estagio || ':' || n, ' ') into antes from (select estagio, count(*) n from public.crm_leads group by 1 order by 1) x;
  update public.crm_leads set estagio = 'novo' where estagio = 'lead';
  update public.crm_leads set estagio = 'diagnostico' where estagio in ('orcamento', 'reuniao');
  update public.crm_leads set etapa_desde = coalesce(etapa_desde, updated_at, created_at) where etapa_desde is null;
  select string_agg(estagio || ':' || n, ' ') into depois from (select estagio, count(*) n from public.crm_leads group by 1 order by 1) x;
  raise notice 'crm_leads etapas — antes: %  depois: %', coalesce(antes, '(vazio)'), coalesce(depois, '(vazio)');
end $$;
alter table public.crm_leads alter column estagio set default 'novo';

-- 3. crm_metas -------------------------------------------------------------------------------------
alter table public.crm_metas add column if not exists meta_contatos_semana integer;
alter table public.crm_metas add column if not exists meta_propostas_mes integer;
comment on column public.crm_metas.meta_valor is 'Meta de MRR novo vendido no mês (R$/mês) — dinheiro da agência; só o servidor lê.';

-- 5. crm_metas trancada (só service_role)
drop policy if exists crm_metas_leitura on public.crm_metas;
drop policy if exists crm_metas_escrita on public.crm_metas;
drop policy if exists crm_metas_all on public.crm_metas;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_metas' and policyname = 'crm_metas_service') then
    create policy crm_metas_service on public.crm_metas for all to service_role using (true) with check (true);
  end if;
end $$;
revoke all on public.crm_metas from anon, authenticated;

-- 4. Formulário do site ------------------------------------------------------------------------------
create table if not exists public.crm_recebidos (
  externo_id text primary key,
  origem     text not null,                 -- 'site'
  resultado  text,                          -- criado | duplicado | cliente | descartado (null = processando)
  lead_id    uuid references public.crm_leads(id) on delete set null,
  criado_em  timestamptz not null default now()
);
comment on table public.crm_recebidos is 'Cadastros do formulário do site já recebidos (idempotência de /api/integracoes/site/lead).';

create table if not exists public.crm_leads_descartados (
  id          uuid primary key default gen_random_uuid(),
  externo_id  text unique,
  origem      text not null,
  motivo      text not null,                -- lib/crm/filtro-lead.ts → MotivoDescarte
  detalhe     text,
  nome        text,
  empresa     text,
  telefone    text,
  email       text,
  pacote      jsonb,
  criado_em   timestamptz not null default now()
);
create index if not exists crm_leads_descartados_criado on public.crm_leads_descartados (criado_em desc);
comment on table public.crm_leads_descartados is 'Lixo do formulário do site (robô, propaganda, teste da equipe) — fora do funil, com o motivo.';

alter table public.crm_recebidos enable row level security;
alter table public.crm_leads_descartados enable row level security;
revoke all on public.crm_recebidos, public.crm_leads_descartados from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_recebidos' and policyname = 'crm_recebidos_service') then
    create policy crm_recebidos_service on public.crm_recebidos for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_leads_descartados' and policyname = 'crm_leads_descartados_service') then
    create policy crm_leads_descartados_service on public.crm_leads_descartados for all to service_role using (true) with check (true);
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
