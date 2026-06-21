-- 053_agency_settings_rls.sql
-- agency_settings guarda SEGREDOS (token Meta, chave Evolution, JIDs, flags).
-- A policy antiga liberava ALL/SELECT pra QUALQUER usuário autenticado (qual=true),
-- então qualquer conta logada (até staff de baixo nível) conseguia ler os segredos.
-- Restringe a admin/manager. O servidor usa service_role (supabaseAdmin), que IGNORA
-- RLS — rotas de API e crons NÃO são afetados. (anon nunca teve acesso.)

drop policy if exists "agency_settings_auth" on public.agency_settings;
drop policy if exists "agency_settings_anon_write" on public.agency_settings;

create policy "agency_settings_admin" on public.agency_settings
  for all to authenticated
  using (auth.user_role() = any (array['admin', 'manager', 'service_role']))
  with check (auth.user_role() = any (array['admin', 'manager', 'service_role']));
