-- 20260924195900_producao_unica_ensaio.sql — ENSAIO da 20260924200000_producao_unica.sql. SÓ LEITURA.
--
-- Roda antes e depois da migration e compara. Antes: mostra o que ela VAI fazer. Depois: o que era
-- pendência tem que ter zerado (linhas marcadas "→ 0 depois").
--
-- Ensaio completo, sem gravar nada (roda a migration dentro de uma transação e desfaz):
--   ( echo "begin;"; cat supabase/migrations/20260924195900_producao_unica_ensaio.sql \
--       supabase/migrations/20260924200000_producao_unica.sql \
--       supabase/migrations/20260924195900_producao_unica_ensaio.sql; echo "rollback;" ) \
--     | docker exec -i supabase-db-1 psql -U postgres -d loneos
-- Só as contagens:
--   docker exec -i supabase-db-1 psql -U postgres -d loneos < supabase/migrations/20260924195900_producao_unica_ensaio.sql
--
-- Não tem INSERT, UPDATE, DELETE nem DDL. Rodar como migration é inofensivo.

with
cards as (select * from public.content_cards),
pedidos as (select * from public.design_requests),
pedido_sem_card as (
  select p.* from pedidos p where not exists (select 1 from cards c where c.id = p.content_card_id)
),
-- Sem card de verdade: nenhum card aponta pra ele também (esses ganham card novo).
pedido_orfao as (
  select p.* from pedido_sem_card p where not exists (select 1 from cards c where c.design_request_id = p.id)
),
ultima_rejeicao as (
  select distinct on (card_id) card_id, reviewed_at::timestamptz as em
    from public.content_approvals
   where status::text = 'rejected' and reviewed_at is not null
   order by card_id, reviewed_at::timestamptz desc
),
pedido_do_card as (
  select c.id as card_id, dr.status::text as pedido_status
    from cards c
    join lateral (
      select d.status from pedidos d
       where d.id = c.design_request_id or (c.design_request_id is null and d.content_card_id = c.id)
       order by (d.id = c.design_request_id) desc nulls last, d.created_at desc
       limit 1
    ) dr on true
)
select ordem, item, n from (
  -- ── O quadro hoje (todas as etapas, cards ativos) ──
  select 10 as ordem, 'cards ativos · ' || status::text as item, count(*)::int as n
    from cards where archived_at is null group by status
  union all select 11, 'cards arquivados (total)', count(*)::int from cards where archived_at is not null
  union all select 12, 'pedidos de arte · ' || status::text, count(*)::int from pedidos group by status
  -- ── O que a migration muda (→ 0 depois) ──
  union all select 20, 'cards em Roteiro (script) → vão pra Pauta   [→ 0 depois]', count(*)::int from cards where status::text = 'script'
  union all select 21, 'pedidos SEM card (total)                    [→ 0 depois]', count(*)::int from pedido_sem_card
  union all select 22, '  · órfão na fila/andamento → card novo em Com o designer', count(*)::int from pedido_orfao where status::text <> 'done'
  union all select 23, '  · órfão concluído → card novo ARQUIVADO (histórico)', count(*)::int from pedido_orfao where status::text = 'done'
  union all select 24, '  · algum card já aponta pra ele (só liga, sem card novo)', count(*)::int
    from pedido_sem_card p where exists (select 1 from cards c where c.design_request_id = p.id)
  union all select 25, 'cards com pedido apontando mas sem design_request_id [→ 0 depois]', count(*)::int
    from cards c where c.design_request_id is null and exists (select 1 from pedidos p where p.content_card_id = c.id)
  union all select 26, 'alteração pendente a registrar no card      [→ 0 depois]', count(*)::int
    from cards c join ultima_rejeicao u on u.card_id = c.id
   where c.alteracao_pendente_em is null and c.archived_at is null and c.status::text in ('in_production', 'blocked')
     and (c.designer_delivered_at is null or u.em > c.designer_delivered_at)
  union all select 27, 'pedido concluído sem entrega no card        [→ 0 depois]', count(*)::int
    from cards c join pedido_do_card pc on pc.card_id = c.id
   where pc.pedido_status = 'done' and c.designer_delivered_at is null and c.alteracao_pendente_em is null
  union all select 28, 'card entregue sem "entregue por"', count(*)::int
    from cards c where c.designer_delivered_at is not null and c.designer_delivered_by is null
  union all select 29, 'card em Pauta com pedido aberto → Com o designer [→ 0 depois]', count(*)::int
    from cards c join pedido_do_card pc on pc.card_id = c.id
   where pc.pedido_status in ('queued', 'in_progress') and c.status::text in ('ideas', 'script')
     and c.archived_at is null and c.designer_delivered_at is null
  -- ── Só para ver (a migration NÃO mexe) ──
  union all select 40, 'ver: vínculo em conflito (card→pedido de outro card)', count(*)::int
    from cards c join pedidos p on p.id = c.design_request_id
   where p.content_card_id is not null and p.content_card_id <> c.id
  union all select 41, 'ver: Com o designer SEM pedido (legado; ganha "Pedir arte" no quadro)', count(*)::int
    from cards c where c.archived_at is null and c.status::text in ('in_production', 'blocked')
     and not exists (select 1 from pedidos p where p.id = c.design_request_id or p.content_card_id = c.id)
  union all select 42, 'ver: Pauta/Com o designer com arte JÁ entregue (fica; o social move)', count(*)::int
    from cards c where c.archived_at is null and c.status::text in ('ideas', 'script', 'in_production', 'blocked')
     and c.designer_delivered_at is not null and c.alteracao_pendente_em is null
  union all select 43, 'ver: pedido aberto cujo card já tem entrega', count(*)::int
    from cards c join pedidos p on p.id = c.design_request_id
   where p.status::text <> 'done' and c.designer_delivered_at is not null
  union all select 44, 'ver: cards com mais de um pedido', count(*)::int
    from (select content_card_id from pedidos where content_card_id is not null group by content_card_id having count(*) > 1) x
  -- ── Depois da migration ──
  union all select 60, 'depois: cards criados pela Leva 5b (pedido sem card)', count(*)::int
    from cards where observations like 'Card criado para um pedido de arte que estava sem card (Leva 5b%'
  union all select 61, 'depois: triggers da produção única (esperado 3)', count(*)::int
    from pg_trigger where tgname in ('design_requests_garante_card', 'design_requests_liga_card', 'content_cards_espelha_pedido')
) t
order by ordem, item;
