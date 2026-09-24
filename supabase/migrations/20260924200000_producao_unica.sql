-- 20260924200000_producao_unica.sql — Leva 5b (Conteúdo): UM quadro de produção, e o pedido de arte
-- vira ETAPA do card.
--
-- O QUE MUDA NO BANCO (nada é apagado; nenhuma tabela, coluna ou enum sai):
--   1. Roteiro vira Pauta: cards em `script` passam para `ideas` (o enum continua com `script`).
--   2. Vínculo card ↔ pedido nos dois sentidos (havia pedido que só o card conhecia, e vice-versa).
--   3. Os pedidos de arte SEM card (61 em 24/09) ganham um card:
--        · na fila / em andamento → card em "Com o designer" (in_production), sem data de postagem
--          (não é post planejado — o prazo da arte continua no pedido);
--        · concluído → card ARQUIVADO de histórico, em "Revisão interna" (approval) com a entrega
--          registrada. NÃO vira `published`: isso diria que um post foi ao ar, e ninguém sabe se foi.
--   4. Campos do card que só o pedido sabia: entrega (designer_delivered_at/_by) de pedido concluído,
--      alteração pendente (alteracao_pendente_em/_motivo) de reprovação que não foi refeita.
--   5. Card em Pauta com pedido aberto vai para "Com o designer" (antes o "A fazer" abria o pedido e
--      deixava o card na coluna de ideias).
--   6. Rede de segurança (triggers): todo pedido de arte nasce com card; o card aponta pro pedido;
--      título e data de postagem do card são espelhados no pedido — antes cada tela copiava à mão.
--
-- O caminho normal de escrita é lib/conteudo/producao-server.ts (a transição de design). Os triggers
-- existem para o que passar por fora dele (código antigo durante o deploy, scripts).
--
-- Idempotente: rodar de novo não cria card a mais nem muda o que já está certo. RLS inalterada.
--
-- ENSAIO (antes de aplicar em produção) — roda tudo e desfaz, mostrando as contagens antes/depois:
--   ( echo "begin;"; cat supabase/migrations/20260924195900_producao_unica_ensaio.sql \
--       supabase/migrations/20260924200000_producao_unica.sql \
--       supabase/migrations/20260924195900_producao_unica_ensaio.sql; echo "rollback;" ) \
--     | docker exec -i supabase-db-1 psql -U postgres -d loneos
-- APLICAR (numa transação só):
--   docker exec -i supabase-db-1 psql -1 -U postgres -d loneos < supabase/migrations/20260924200000_producao_unica.sql

-- ─── 0) Colunas que esta migration usa (já existem em produção; aqui só por segurança) ──────────
alter table public.content_cards   add column if not exists alteracao_pendente_em timestamptz;
alter table public.content_cards   add column if not exists alteracao_motivo      text;
alter table public.content_cards   add column if not exists archived_at           timestamptz;
alter table public.design_requests add column if not exists content_card_id       uuid;

create index if not exists idx_design_requests_card on public.design_requests (content_card_id);
create index if not exists idx_content_cards_design_request on public.content_cards (design_request_id)
  where design_request_id is not null;

-- ─── 1) A regra "pedido sem card → card" (usada pelo passo 5b e pelo trigger do passo 2) ────────
-- Mesma regra de pedirArteSemCard (lib/conteudo/producao-server.ts). Não grava design_request_id:
-- quem chama liga (no trigger BEFORE INSERT o pedido ainda não existe para a FK).
create or replace function public.criar_card_do_pedido(dr public.design_requests)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_card    uuid;
  v_social  text;
  v_trafego boolean;
  v_status  content_status;
  v_quando  timestamptz;
  v_titulo  text;
begin
  select assigned_social into v_social from clients where id = dr.client_id;
  v_trafego := coalesce(dr.origem, '') = 'ia_replicacao'
    or exists (select 1 from team_members t
               where lower(trim(t.name)) = lower(trim(dr.requested_by::text)) and t.role::text = 'traffic');
  v_status := case when dr.status::text = 'done' then 'approval'::content_status else 'in_production'::content_status end;
  v_quando := case when dr.status::text = 'done' then coalesce(dr.updated_at, dr.created_at, now()) else coalesce(dr.created_at, now()) end;
  v_titulo := coalesce(nullif(trim(regexp_replace(coalesce(dr.title, ''), '^\s*arte:\s*', '', 'i')), ''), nullif(dr.title, ''), 'Pedido de arte');

  insert into content_cards (
    title, client_id, client_name, social_media, status, priority, format, briefing,
    requested_by_traffic, status_changed_at, column_entered_at,
    designer_delivered_at, designer_delivered_by, archived_at, observations, created_at
  ) values (
    left(v_titulo, 200), dr.client_id, coalesce(dr.client_name, ''), v_social, v_status, dr.priority,
    coalesce(dr.format, ''), dr.briefing,
    case when v_trafego then dr.requested_by::text end,
    v_quando, jsonb_build_object(v_status::text, v_quando),
    case when dr.status::text = 'done'
      then coalesce((select max(cd.delivered_at) from creative_deliveries cd where cd.design_request_id = dr.id), dr.updated_at, now()) end,
    case when dr.status::text = 'done' then dr.assigned_designer end,
    -- Concluído = histórico: arquivado (some do quadro, não aparece no portal, não fecha post).
    case when dr.status::text = 'done' then now() end,
    'Card criado para um pedido de arte que estava sem card (Leva 5b, produção única).',
    coalesce(dr.created_at, now())
  ) returning id into v_card;
  return v_card;
end $$;

revoke all on function public.criar_card_do_pedido(public.design_requests) from public;

-- ─── 2) Rede de segurança: pedido nasce com card, e o card aponta pro pedido ────────────────────
create or replace function public.design_requests_garante_card() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.content_card_id is null or not exists (select 1 from content_cards where id = NEW.content_card_id) then
    NEW.content_card_id := criar_card_do_pedido(NEW);
  end if;
  return NEW;
end $$;

create or replace function public.design_requests_liga_card() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update content_cards set design_request_id = NEW.id
   where id = NEW.content_card_id and design_request_id is null;
  return NEW;
end $$;

drop trigger if exists design_requests_garante_card on public.design_requests;
create trigger design_requests_garante_card before insert on public.design_requests
  for each row execute function public.design_requests_garante_card();

drop trigger if exists design_requests_liga_card on public.design_requests;
create trigger design_requests_liga_card after insert on public.design_requests
  for each row execute function public.design_requests_liga_card();

-- Título e data de postagem do card → pedido. O pedido guardava uma CÓPIA ("Arte: <título>", prazo =
-- data de postagem) que só /api/content-cards/update atualizava; o CS e o portal mexiam no card por
-- fora e a cópia envelhecia. Data apagada no card não apaga o prazo da arte.
create or replace function public.content_cards_espelha_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.design_request_id is null then return NEW; end if;
  update design_requests set
    title    = case when NEW.title is distinct from OLD.title then 'Arte: ' || NEW.title else title end,
    deadline = case when NEW.due_date is distinct from OLD.due_date and NEW.due_date is not null then NEW.due_date else deadline end
  where id = NEW.design_request_id;
  return NEW;
end $$;

drop trigger if exists content_cards_espelha_pedido on public.content_cards;
create trigger content_cards_espelha_pedido after update of title, due_date on public.content_cards
  for each row when (OLD.title is distinct from NEW.title or OLD.due_date is distinct from NEW.due_date)
  execute function public.content_cards_espelha_pedido();

-- ─── 3) Roteiro vira Pauta ───────────────────────────────────────────────────────────────────────
update public.content_cards
   set status = 'ideas',
       column_entered_at = coalesce(column_entered_at::jsonb, '{}'::jsonb)
         || jsonb_build_object('ideas', coalesce(column_entered_at::jsonb ->> 'script', status_changed_at::text, now()::text))
 where status = 'script';

-- ─── 4) Campos que só o pedido sabia ─────────────────────────────────────────────────────────────
-- Vem ANTES de mexer nos vínculos: ligar um pedido atualiza o updated_at dele (trigger), e o
-- updated_at é a hora da entrega quando não há versão registrada.
-- O pedido de cada card: o do vínculo do card; sem ele, o mais novo que aponta pro card.
drop table if exists pg_temp.producao_unica_ligado;
create temporary table producao_unica_ligado as
select c.id as card_id, dr.id as pedido_id, dr.status::text as pedido_status, dr.updated_at, dr.assigned_designer
  from public.content_cards c
  join lateral (
    select d.id, d.status, d.updated_at, d.assigned_designer
      from public.design_requests d
     where d.id = c.design_request_id or (c.design_request_id is null and d.content_card_id = c.id)
     order by (d.id = c.design_request_id) desc nulls last, d.created_at desc
     limit 1
  ) dr on true;

-- 4a) Alteração pendente: reprovação mais nova que a última entrega, com o card de volta ao designer.
--     A tela do designer calculava isso em cada render; agora é dado do card.
with ultima as (
  select distinct on (card_id) card_id, reviewed_at::timestamptz as em, reason
    from public.content_approvals
   where status::text = 'rejected' and reviewed_at is not null
   order by card_id, reviewed_at::timestamptz desc
)
update public.content_cards c
   set alteracao_pendente_em = u.em,
       alteracao_motivo      = coalesce(nullif(trim(u.reason), ''), 'Alteração pedida')
  from ultima u
 where u.card_id = c.id
   and c.alteracao_pendente_em is null
   and c.archived_at is null
   and c.status::text in ('in_production', 'blocked')
   and (c.designer_delivered_at is null or u.em > c.designer_delivered_at);

-- 4b) Pedido concluído sem a entrega no card: registra a entrega (a versão mais nova, senão a hora
--     em que o pedido foi concluído). Card com alteração pendente fica de fora — ali falta refazer.
update public.content_cards c
   set designer_delivered_at = coalesce((select max(cd.delivered_at) from public.creative_deliveries cd where cd.card_id = c.id), l.updated_at),
       designer_delivered_by = coalesce(c.designer_delivered_by,
         (select cd.delivered_by from public.creative_deliveries cd where cd.card_id = c.id order by cd.version desc limit 1),
         l.assigned_designer)
  from producao_unica_ligado l
 where l.card_id = c.id
   and l.pedido_status = 'done'
   and c.designer_delivered_at is null
   and c.alteracao_pendente_em is null;

-- 4c) Entregue sem saber por quem: a versão mais nova, senão o designer do pedido (se houver pedido).
update public.content_cards c
   set designer_delivered_by = x.por
  from (
    select c2.id,
           coalesce((select cd.delivered_by from public.creative_deliveries cd where cd.card_id = c2.id order by cd.version desc limit 1),
                    (select l.assigned_designer from producao_unica_ligado l where l.card_id = c2.id)) as por
      from public.content_cards c2
     where c2.designer_delivered_at is not null and c2.designer_delivered_by is null
  ) x
 where x.id = c.id
   and x.por is not null;

drop table if exists pg_temp.producao_unica_ligado;

-- ─── 5) Vínculos ─────────────────────────────────────────────────────────────────────────────────
-- Ligar um pedido NÃO é mexer nele: o updated_at do pedido é a hora da entrega para quem mede
-- (tempo médio de arte do tráfego, "entregues em 30 dias"). Por isso o trigger de updated_at fica
-- desligado só durante 5a/5b — dentro de um bloco só, então se algo falhar ele volta ligado.
do $$
declare
  v_tem boolean := exists (select 1 from pg_trigger
                           where tgname = 'trg_design_requests_updated_at' and tgrelid = 'public.design_requests'::regclass);
begin
  if v_tem then execute 'alter table public.design_requests disable trigger trg_design_requests_updated_at'; end if;

  -- 5a) O card aponta pro pedido, mas o pedido não aponta pra card nenhum (ou pra um que não existe).
  update public.design_requests dr
     set content_card_id = c.id
    from (select distinct on (design_request_id) id, design_request_id
            from public.content_cards
           where design_request_id is not null
           order by design_request_id, (archived_at is null) desc, created_at desc) c
   where c.design_request_id = dr.id
     and not exists (select 1 from public.content_cards x where x.id = dr.content_card_id);

  -- 5b) Pedido sem card nenhum → nasce o card (a regra do passo 1).
  update public.design_requests d
     set content_card_id = public.criar_card_do_pedido(d)
   where not exists (select 1 from public.content_cards x where x.id = d.content_card_id);

  if v_tem then execute 'alter table public.design_requests enable trigger trg_design_requests_updated_at'; end if;
end $$;

-- 5c) O pedido aponta pro card, mas o card não aponta pra pedido nenhum (inclui os cards do 5b).
--     Mais de um pedido no mesmo card: vale o aberto; entre iguais, o mais novo.
update public.content_cards c
   set design_request_id = p.id
  from (select distinct on (content_card_id) id, content_card_id
          from public.design_requests
         where content_card_id is not null
         order by content_card_id, (status::text <> 'done') desc, created_at desc) p
 where p.content_card_id = c.id
   and c.design_request_id is null;

-- ─── 6) Card em Pauta com pedido aberto → "Com o designer" ───────────────────────────────────────
update public.content_cards c
   set status = 'in_production',
       status_changed_at = now(),
       column_entered_at = coalesce(c.column_entered_at::jsonb, '{}'::jsonb) || jsonb_build_object('in_production', now()::text)
  from public.design_requests dr
 where dr.id = c.design_request_id
   and dr.status::text in ('queued', 'in_progress')
   and c.status::text in ('ideas', 'script')
   and c.archived_at is null
   and c.designer_delivered_at is null;

comment on function public.criar_card_do_pedido(public.design_requests) is
  'Leva 5b: o card de um pedido de arte que chegou sem card. Mesma regra de pedirArteSemCard (lib/conteudo/producao-server.ts).';
comment on column public.design_requests.content_card_id is
  'Card do pedido de arte. Leva 5b: todo pedido tem card (trigger design_requests_garante_card) — o pedido é a etapa "Com o designer" do card.';

alter table public.content_cards   enable row level security;
alter table public.design_requests enable row level security;

-- A API do Supabase (PostgREST) só enxerga mudança de schema depois de recarregar o cache.
notify pgrst, 'reload schema';
