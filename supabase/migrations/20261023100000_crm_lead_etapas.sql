-- Comercial v2 · leva M (23/10/2026): histórico de etapa do lead.
--
-- POR QUE: a taxa de fechamento ("das oportunidades, quantas viraram contrato") e o ciclo de venda precisam saber QUANDO
-- cada lead entrou em cada etapa. Até aqui só existia etapa_desde (a etapa atual) e uma nota de texto "Movido para …"
-- em crm_lead_activities para 4 leads — arrastar o cartão não deixava rastro confiável.
--
-- Toda mudança de etapa passa a gravar uma linha aqui, no servidor (lib/crm/etapas-historico.ts): no PATCH de
-- /api/crm/leads, na criação do lead e quando marcar reunião move para Diagnóstico. Só o servidor lê e escreve.
--
-- Carga inicial (só se a tabela estiver vazia), com o que já se sabe de cada lead:
--   entrada em "novo" na data de cadastro; as notas "Movido para …"; proposta_enviada_em; a etapa atual em
--   etapa_desde (ganho/perdido em fechado_em). origem = 'carga' para separar do que foi registrado ao vivo.

create table if not exists public.crm_lead_etapas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  de text,
  para text not null,
  em timestamptz not null default now(),
  autor text,
  origem text not null default 'tela' check (origem in ('tela', 'criacao', 'reuniao', 'lote', 'carga'))
);
create index if not exists crm_lead_etapas_lead_em on public.crm_lead_etapas (lead_id, em);
create index if not exists crm_lead_etapas_para_em on public.crm_lead_etapas (para, em);

alter table public.crm_lead_etapas enable row level security;
revoke all on public.crm_lead_etapas from anon, authenticated;

do $$
begin
  if exists (select 1 from public.crm_lead_etapas) then return; end if;

  with mapa(rotulo, chave) as (values
    ('Novo', 'novo'), ('Contato', 'contato'), ('Diagnóstico', 'diagnostico'), ('Proposta', 'proposta'),
    ('Negociação', 'negociacao'), ('Ganho', 'ganho'), ('Perdido', 'perdido')),
  movidos as (
    select a.lead_id, m.chave as para, a.created_at as em, a.autor
    from public.crm_lead_activities a
    join mapa m on a.texto ilike ('Movido para ' || m.rotulo || '%')
    where a.tipo = 'etapa'
  )
  insert into public.crm_lead_etapas (lead_id, de, para, em, autor, origem)
  select lead_id, null, para, em, autor, 'carga' from movidos
  union all
  select l.id, null, 'novo', l.created_at, null, 'carga' from public.crm_leads l
  union all
  select l.id, null, 'proposta', l.proposta_enviada_em::timestamptz + interval '12 hours', null, 'carga'
  from public.crm_leads l
  where l.proposta_enviada_em is not null
    and not exists (select 1 from movidos m where m.lead_id = l.id and m.para = 'proposta')
  union all
  select l.id, null, l.estagio,
         coalesce(case when l.estagio in ('ganho', 'perdido') then l.fechado_em::timestamptz + interval '12 hours' end, l.etapa_desde, l.updated_at, l.created_at),
         null, 'carga'
  from public.crm_leads l
  where l.estagio <> 'novo'
    and not exists (select 1 from movidos m where m.lead_id = l.id and m.para = l.estagio);
end $$;

notify pgrst, 'reload schema';
