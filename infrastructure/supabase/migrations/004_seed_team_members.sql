-- ═══════════════════════════════════════════════════════════
-- Lone OS — Seed Team Members
-- ═══════════════════════════════════════════════════════════

INSERT INTO team_members (name, email, role, initials, is_active) VALUES
  ('Roberto Lino',  'roberto@lonemidia.com',  'admin',    'RL', true),
  ('Lucas',         'lucas@lonemidia.com',    'admin',    'LC', true),
  ('Julio',         'julio@lonemidia.com',    'manager',  'JL', true),
  ('Carlos',        'carlos@lonemidia.com',   'social',   'CM', true),
  ('Pedro',         'pedro@lonemidia.com',    'social',   'PA', true),
  ('Rodrigo',       'rodrigo@lonemidia.com',  'designer', 'RD', true)
ON CONFLICT (email) DO NOTHING;
