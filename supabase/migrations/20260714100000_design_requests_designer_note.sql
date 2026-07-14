-- designer_note: comentário/pedido do designer numa demanda (ex.: "briefing incompleto,
-- preciso de mais info"). O social que criou a demanda vê. Pedido do designer (jul/2026).
ALTER TABLE design_requests ADD COLUMN IF NOT EXISTS designer_note text;
