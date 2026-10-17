-- Comercial — Leva 2 (out/2026). Aplicar À MÃO em produção (idempotente, aditiva):
--   docker exec -i supabase-db-1 psql -U postgres -d loneos -v ON_ERROR_STOP=1 < este_arquivo.sql
-- Lembrete de "lead do site sem resposta em 1 h" (cron crm-lead-novo): uma vez por lead.
begin;
alter table public.crm_recebidos add column if not exists lembrete_em timestamptz;
comment on column public.crm_recebidos.lembrete_em is 'Quando o lembrete de 1 h sem resposta saiu (ou o lead foi respondido antes) — uma vez por lead.';
commit;
notify pgrst, 'reload schema';
