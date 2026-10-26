-- 20261026120000_mesa_do_gestor.sql — Mesa do Gestor de tráfego (etapa 2 do plano de tráfego, 26/10/2026).
--
-- recommendations ganha:
--   adiada_ate   — "Adiar até": a recomendação some da fila até esta data e volta sozinha depois.
--   conferencia  — o que o sistema viu depois do "Já fiz": {etapa, em, reportada} da conferência de 1 e de 3 dias.
--                  O desfecho vai em `resultado` (coluna que já existia e ninguém gravava):
--                  aguardando → confirmado_1d → resolvido, ou voltou.

alter table public.recommendations add column if not exists adiada_ate timestamptz;
alter table public.recommendations add column if not exists conferencia jsonb;

-- A conferência roda de hora em hora sobre as "Já fiz" dos últimos dias.
create index if not exists idx_recommendations_conferir
  on public.recommendations (decidido_em) where estado = 'executada' and (resultado is null or resultado in ('aguardando', 'confirmado_1d'));
