-- ═══════════════════════════════════════════════════════════
-- Lone OS — Alinhar nomes de team_members com USER_PROFILES
-- ═══════════════════════════════════════════════════════════
-- Problema: team_members usava nomes curtos ("Carlos", "Pedro", "Lucas")
-- enquanto USER_PROFILES (RoleContext) usava nomes completos ("Carlos Augusto",
-- "Pedro Henrique", "Lucas Bueno"). O filtro assignedSocial === currentUser
-- fazia comparação exata e nunca batia → clientes sumiam do board social.

-- 1. Atualizar nomes na tabela team_members
UPDATE team_members SET name = 'Carlos Augusto' WHERE email = 'carlos@lonemidia.com';
UPDATE team_members SET name = 'Pedro Henrique' WHERE email = 'pedro@lonemidia.com';
UPDATE team_members SET name = 'Lucas Bueno'    WHERE email = 'lucas@lonemidia.com';
UPDATE team_members SET name = 'Julio'          WHERE email = 'julio@lonemidia.com'; -- já correto, garante

-- 2. Corrigir clientes já cadastrados com os nomes antigos
UPDATE clients SET assigned_social   = 'Carlos Augusto' WHERE assigned_social   = 'Carlos';
UPDATE clients SET assigned_social   = 'Pedro Henrique' WHERE assigned_social   = 'Pedro';
UPDATE clients SET assigned_traffic  = 'Lucas Bueno'    WHERE assigned_traffic  = 'Lucas';
UPDATE clients SET assigned_designer = 'Rodrigo'        WHERE assigned_designer = 'Rodrigo'; -- já correto
