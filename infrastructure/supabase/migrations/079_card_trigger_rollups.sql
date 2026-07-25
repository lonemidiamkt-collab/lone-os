-- Fase 0.5 (reformulada) — RESSUSCITAR os campos mortos em vez de aposentá-los.
--
-- `clients.last_kanban_activity` e `clients.last_post_date` nunca foram escritos (o zod da rota
-- /api/clients/update descartava a chave em silêncio; o incremento automático ficou em código morto
-- no AppStateContext quando /social migrou pra Zustand). Em produção: 34/46 nulos, valor mais recente
-- de 08/05/2026, e last_post_date sem NENHUM valor.
--
-- Só que ~8 consumidores JÁ LEEM esses campos: lib/dashboard/getDashboardData.ts (inatividade),
-- lib/health/compute.ts (3 sinais do churn), app/ceo/page.tsx (+25 fixo em todo cliente),
-- app/social/page.tsx (isInactive), lib/utils.ts (calcHealthScore), SmartAlerts, ficha do cliente.
-- Mantê-los VIVOS pelo trigger conserta todos de uma vez, sem tocar em nenhum arquivo TS.

CREATE OR REPLACE FUNCTION log_content_card_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_desde timestamptz;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_desde := COALESCE(OLD.status_changed_at, OLD.created_at);

    INSERT INTO content_card_transitions (card_id, from_status, to_status, duration_ms, transitioned_at, actor_name, metadata)
    VALUES (
      NEW.id,
      OLD.status::text,
      NEW.status::text,
      CASE WHEN v_desde IS NOT NULL THEN (EXTRACT(EPOCH FROM (now() - v_desde)) * 1000)::bigint END,
      now(),
      NEW.social_media,
      '{"src":"trigger"}'::jsonb
    );

    NEW.status_changed_at := now();
    NEW.column_entered_at :=
      COALESCE(OLD.column_entered_at, '{}'::jsonb)
      || COALESCE(NEW.column_entered_at, '{}'::jsonb)
      || jsonb_build_object(NEW.status::text, now());
  END IF;
  RETURN NEW;
END;
$$;

-- Rollup para clients: roda DEPOIS do update do card (AFTER), pra não atrasar a transação principal.
CREATE OR REPLACE FUNCTION rollup_client_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_id IS NULL THEN RETURN NULL; END IF;

  -- Atividade no kanban: guarda de 5 min evita amplificação de escrita e ruído no realtime.
  UPDATE clients
     SET last_kanban_activity = now()
   WHERE id = NEW.client_id
     AND (last_kanban_activity IS NULL OR last_kanban_activity < now() - interval '5 minutes');

  -- Data do último post: só avança, nunca retrocede (data no fuso de SP).
  IF NEW.status::text = 'published' AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'published') THEN
    UPDATE clients
       SET last_post_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     WHERE id = NEW.client_id
       AND (last_post_date IS NULL OR last_post_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_rollup_client_activity ON content_cards;
CREATE TRIGGER trg_rollup_client_activity
  AFTER INSERT OR UPDATE OF status ON content_cards
  FOR EACH ROW
  EXECUTE FUNCTION rollup_client_activity();

-- BACKFILL dos dois campos, a partir do que já existe (o histórico real dos cards).
UPDATE clients c
   SET last_post_date = sub.ultimo
  FROM (
    SELECT t.card_id, cc.client_id, max((t.transitioned_at AT TIME ZONE 'America/Sao_Paulo')::date) AS ultimo
    FROM content_card_transitions t
    JOIN content_cards cc ON cc.id = t.card_id
    WHERE t.to_status = 'published' AND cc.client_id IS NOT NULL
    GROUP BY t.card_id, cc.client_id
  ) sub
 WHERE c.id = sub.client_id
   AND (c.last_post_date IS NULL OR c.last_post_date < sub.ultimo);

UPDATE clients c
   SET last_kanban_activity = sub.ultimo
  FROM (
    SELECT client_id, max(COALESCE(status_changed_at, updated_at, created_at)) AS ultimo
    FROM content_cards WHERE client_id IS NOT NULL GROUP BY client_id
  ) sub
 WHERE c.id = sub.client_id
   AND (c.last_kanban_activity IS NULL OR c.last_kanban_activity < sub.ultimo);
