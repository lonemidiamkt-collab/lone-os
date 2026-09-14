-- Desligamento de verdade (14/09/2026): "Remover" na Gestão da Equipe só tirava da lista local — o
-- login do ex-funcionário continuava valendo. Agora a remoção apaga o usuário no Auth e marca aqui.
-- Baixa lógica, não física: work_sessions cascataria (timesheet some) e meetings.owner_member_id
-- travaria; o histórico de quem fez o quê fica.
alter table public.team_members add column if not exists deleted_at timestamptz;
notify pgrst, 'reload schema';
