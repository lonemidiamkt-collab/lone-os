-- Fase 0.1 — A VERDADE DA PRODUÇÃO: registrar toda transição de card no banco.
--
-- PROBLEMA: existem 8 caminhos na aplicação que mudam o status de um card, e cada um carimba um
-- subconjunto diferente dos campos. Os furos conhecidos:
--   · app/api/cs/inbound/route.ts (comando "marca como publicado") — não carimba status_changed_at
--     → o card publicado por WhatsApp SUMIA da contagem do mês;
--   · components/ContentCardModal.tsx (dropdown) — não carimba column_entered_at;
--   · app/social/page.tsx (confirmar arte) — não carimba status_changed_at;
--   · lib/cs/card.ts (ajuste volta pra produção) — SOBRESCREVE o jsonb inteiro, perdendo o histórico.
-- Além disso, `content_card_transitions` foi criada na 039 e nunca recebeu um único INSERT.
--
-- SOLUÇÃO: um trigger no banco. É imune a caminho novo/esquecido da aplicação — qualquer rota, cron,
-- comando de WhatsApp ou psql na mão passa a alimentar o histórico e a normalizar os carimbos.

CREATE OR REPLACE FUNCTION log_content_card_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_desde timestamptz;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_desde := COALESCE(OLD.status_changed_at, OLD.created_at);

    INSERT INTO content_card_transitions (card_id, from_status, to_status, duration_ms, transitioned_at)
    VALUES (
      NEW.id,
      OLD.status::text,
      NEW.status::text,
      CASE WHEN v_desde IS NOT NULL THEN (EXTRACT(EPOCH FROM (now() - v_desde)) * 1000)::bigint END,
      now()
    );

    -- Normaliza o que a aplicação esquece de carimbar.
    NEW.status_changed_at := now();
    -- Mescla OLD ‖ NEW ‖ {status: agora} — preserva o histórico mesmo quando a app sobrescreve o jsonb.
    NEW.column_entered_at :=
      COALESCE(OLD.column_entered_at, '{}'::jsonb)
      || COALESCE(NEW.column_entered_at, '{}'::jsonb)
      || jsonb_build_object(NEW.status::text, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_card_transition ON content_cards;
CREATE TRIGGER trg_content_card_transition
  BEFORE UPDATE OF status ON content_cards
  FOR EACH ROW
  EXECUTE FUNCTION log_content_card_transition();

-- Card novo também entra no histórico (from_status NULL = nasceu aqui).
CREATE OR REPLACE FUNCTION log_content_card_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO content_card_transitions (card_id, from_status, to_status, transitioned_at)
  VALUES (NEW.id, NULL, NEW.status::text, COALESCE(NEW.created_at, now()));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_card_creation ON content_cards;
CREATE TRIGGER trg_content_card_creation
  AFTER INSERT ON content_cards
  FOR EACH ROW
  EXECUTE FUNCTION log_content_card_creation();

-- BACKFILL: sem isto o histórico mensal começaria vazio hoje. Reconstrói o evento de publicação do
-- que já está publicado, usando o melhor carimbo disponível. metadata.backfill marca que é derivado
-- (não observado), pra não confundir com evento real medido daqui pra frente.
INSERT INTO content_card_transitions (card_id, from_status, to_status, transitioned_at, metadata)
SELECT c.id, NULL, 'published', COALESCE(c.status_changed_at, c.created_at), '{"backfill": true}'::jsonb
FROM content_cards c
WHERE c.status = 'published'
  AND COALESCE(c.status_changed_at, c.created_at) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_card_transitions t
    WHERE t.card_id = c.id AND t.to_status = 'published'
  );
