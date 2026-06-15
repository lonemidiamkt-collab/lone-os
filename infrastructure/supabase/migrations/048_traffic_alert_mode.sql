-- ═══════════════════════════════════════════════════════════
-- Lone OS — Modo de entrega do alerta de saldo
-- ═══════════════════════════════════════════════════════════
-- 'digest'      = um resumo consolidado por envio (atual)
-- 'per_account' = uma mensagem por conta (conta-a-conta), com cores por severidade
-- Default seguro = 'digest'; troca-se para 'per_account' via update após validar o layout.

insert into public.agency_settings (key, value) values
  ('traffic_alert_mode', 'digest')
on conflict (key) do nothing;
