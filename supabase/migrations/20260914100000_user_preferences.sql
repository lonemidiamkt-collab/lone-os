-- Primeiro achado do LONE-023 (14/09/2026, 10 min depois de ligar): /api/preferences consultava
-- user_preferences e a tabela nunca existiu — /design e /social gravavam preferência de área de
-- trabalho num 500 engolido pelo front, desde que a rota nasceu.
create table if not exists public.user_preferences (
  user_id uuid not null,
  key text not null check (char_length(key) <= 128),
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_proprio on public.user_preferences;
create policy user_preferences_proprio on public.user_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
notify pgrst, 'reload schema';
