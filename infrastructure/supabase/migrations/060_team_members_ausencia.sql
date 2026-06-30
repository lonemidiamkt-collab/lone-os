-- 060_team_members_ausencia.sql — férias/ausência temporária por membro da equipe.
-- is_active = permanente (empregado/não); unavailable_until = ausência temporária.
-- NULL = disponível; data futura = de férias/ausente até lá. Aplicar manual.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS unavailable_until timestamptz;
