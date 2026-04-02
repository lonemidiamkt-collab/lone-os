-- Lone OS — Seed Data
-- Matches the existing mockData.ts for seamless transition

-- ============================================
-- TEAM MEMBERS
-- ============================================

INSERT INTO team_members (id, name, email, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin CEO', 'admin@loneos.com', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'Gerente Ops', 'gerente@loneos.com', 'manager'),
  ('00000000-0000-0000-0000-000000000003', 'Ana Lima', 'ana@loneos.com', 'traffic'),
  ('00000000-0000-0000-0000-000000000004', 'Pedro Alves', 'pedro@loneos.com', 'traffic'),
  ('00000000-0000-0000-0000-000000000005', 'Carlos Melo', 'carlos@loneos.com', 'social'),
  ('00000000-0000-0000-0000-000000000006', 'Mariana Costa', 'mariana@loneos.com', 'social'),
  ('00000000-0000-0000-0000-000000000007', 'Rafael Designer', 'rafael@loneos.com', 'designer');

-- ============================================
-- CLIENTS
-- ============================================

INSERT INTO clients (id, name, industry, monthly_budget, status, attention_level, tags, assigned_traffic_id, assigned_social_id, last_post_date, join_date, payment_method, notes, tone_of_voice, drive_link, instagram_user, posts_this_month, posts_goal, last_kanban_activity, fixed_briefing) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'TechVision Soluções', 'Tecnologia', 8500, 'good', 'low',
    ARRAY['Premium'],
    '00000000-0000-0000-0000-000000000003', -- Ana Lima
    '00000000-0000-0000-0000-000000000005', -- Carlos Melo
    '2026-03-14', '2024-06-01', 'cartao', NULL,
    'authoritative', 'https://drive.google.com/drive/folders/techvision', '@techvisao',
    9, 12, '2026-03-16T10:00:00+00:00',
    'Cores: azul escuro (#1a237e) e branco. Fonte: Montserrat. Tom: autoridade tecnica. Sempre incluir logo no canto inferior direito. Nunca usar girias ou emojis excessivos. Fotos devem ter fundo clean.'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Clinica Saude+', 'Saude', 4200, 'average', 'medium',
    ARRAY[]::TEXT[],
    '00000000-0000-0000-0000-000000000004', -- Pedro Alves
    '00000000-0000-0000-0000-000000000006', -- Mariana Costa
    '2026-03-10', '2024-09-15', 'pix', NULL,
    'formal', 'https://drive.google.com/drive/folders/clinicasaude', '@clinicasaudemais',
    5, 12, '2026-03-15T09:00:00+00:00',
    'Cores: verde (#2e7d32) e branco. Fonte: Lato. Tom: profissional e acolhedor. Sempre usar fotos reais da clinica. Evitar termos tecnicos demais. Logo centralizado no topo.'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'LuxHome Imoveis', 'Imobiliario', 12000, 'good', 'low',
    ARRAY['Premium', 'MatCon'],
    '00000000-0000-0000-0000-000000000003', -- Ana Lima
    '00000000-0000-0000-0000-000000000005', -- Carlos Melo
    '2026-03-15', '2024-01-20', 'transferencia', NULL,
    'formal', 'https://drive.google.com/drive/folders/luxhome', '@luxhomeimoveis',
    11, 12, '2026-03-16T12:00:00+00:00',
    'Cores: dourado (#c9a84c) e preto. Fonte: Playfair Display. Tom: luxo e exclusividade. Fotos sempre em alta resolucao. Nunca usar precos nos posts. Logo discreto no canto inferior.'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'Fitness Power Academia', 'Fitness', 2800, 'at_risk', 'critical',
    ARRAY['Risco de Churn'],
    '00000000-0000-0000-0000-000000000004', -- Pedro Alves
    '00000000-0000-0000-0000-000000000006', -- Mariana Costa
    '2026-03-07', '2025-02-01', 'boleto',
    'Cliente insatisfeito com resultados do ultimo mes. Reuniao de alinhamento agendada.',
    'funny', NULL, '@fitnesspowerac',
    2, 12, '2026-03-13T10:00:00+00:00',
    'Cores: laranja (#ff6d00) e preto. Fonte: Bebas Neue. Tom: motivacional e energico. Usar fotos com pessoas reais treinando. Sempre incluir CTA (chamada para acao). Emojis liberados.'
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    'Restaurante Bella Vista', 'Gastronomia', 3500, 'onboarding', 'medium',
    ARRAY[]::TEXT[],
    '00000000-0000-0000-0000-000000000003', -- Ana Lima
    '00000000-0000-0000-0000-000000000005', -- Carlos Melo
    NULL, '2026-03-01', 'pix',
    'Cliente novo — onboarding em andamento. Aguardando acessos.',
    'casual', NULL, '@bellavistarest',
    0, 12, '2026-03-16T14:00:00+00:00',
    'Cores: vermelho (#b71c1c) e creme (#fff8e1). Fonte: Poppins. Tom: acolhedor e casual. Fotos dos pratos devem ter iluminacao quente. Sempre marcar localizacao no post. Evitar filtros frios.'
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    'EduPro Cursos Online', 'Educacao', 5500, 'good', 'low',
    ARRAY['MatCon'],
    '00000000-0000-0000-0000-000000000004', -- Pedro Alves
    '00000000-0000-0000-0000-000000000006', -- Mariana Costa
    '2026-03-13', '2024-11-10', 'cartao', NULL,
    'authoritative', 'https://drive.google.com/drive/folders/edupro', '@eduprocursos',
    8, 12, '2026-03-16T11:00:00+00:00',
    'Cores: roxo (#6a1b9a) e branco. Fonte: Inter. Tom: educativo e acessivel. Sempre incluir dados/estatisticas. Carrosseis devem ter 5-7 slides. CTA para link na bio.'
  );

-- ============================================
-- TASKS
-- ============================================

INSERT INTO tasks (id, title, client_id, assigned_to, role, status, priority, due_date) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Revisar campanhas Google Ads', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'traffic', 'in_progress', 'high', '2026-03-16'),
  ('20000000-0000-0000-0000-000000000002', 'Otimizar criativos Meta Ads', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'traffic', 'pending', 'critical', '2026-03-16'),
  ('20000000-0000-0000-0000-000000000003', 'Configurar pixel de conversao', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'traffic', 'pending', 'medium', '2026-03-17'),
  ('20000000-0000-0000-0000-000000000004', 'Relatorio mensal de performance', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'traffic', 'review', 'medium', '2026-03-18'),
  ('20000000-0000-0000-0000-000000000005', 'Criar reels para feed', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'social', 'in_progress', 'high', '2026-03-16'),
  ('20000000-0000-0000-0000-000000000006', 'Elaborar calendario de conteudo', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'social', 'pending', 'medium', '2026-03-18'),
  ('20000000-0000-0000-0000-000000000007', 'Responder comentarios e DMs', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'social', 'done', 'low', NULL),
  ('20000000-0000-0000-0000-000000000008', 'Banner campanha Black Friday antecipada', '10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000007', 'designer', 'in_progress', 'high', '2026-03-17');

-- ============================================
-- CONTENT CARDS
-- ============================================

INSERT INTO content_cards (id, title, client_id, social_media_id, status, priority, format, due_date, due_time, briefing, image_url, status_changed_at) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Reel: 5 dicas de investimento', '10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', 'in_production', 'high', 'Reel (9:16)', '2026-03-17', '18:00', 'Reel educativo com 5 dicas de investimento para iniciantes. Usar linguagem acessivel, tom descontraido. Inserir chamada para o curso no final. Duracao ~30s.', 'https://picsum.photos/seed/cc1/400/600', '2026-03-14T09:00:00+00:00'),
  ('30000000-0000-0000-0000-000000000002', 'Carrossel: Cases de sucesso Q1', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'script', 'medium', 'Carrossel', '2026-03-19', '10:00', '6 slides apresentando cases de clientes satisfeitos com resultados reais. Tom tecnico mas acessivel. Usar paleta azul/branco da marca.', NULL, '2026-03-19T14:00:00+00:00'),
  ('30000000-0000-0000-0000-000000000003', 'Story: Promocao apartamento garden', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'approval', 'high', 'Story (9:16)', '2026-03-16', '12:00', 'Story apresentando o apartamento garden disponivel. Fotos profissionais do imovel. Incluir valor, metragem e link para formulario de interesse.', 'https://picsum.photos/seed/cc3/400/600', '2026-03-15T11:00:00+00:00'),
  ('30000000-0000-0000-0000-000000000004', 'Post estatico: novo procedimento', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'scheduled', 'low', 'Post Feed (1:1)', '2026-03-18', '14:00', 'Apresentar o novo procedimento de harmonizacao facial. Fundo branco, tipografia clean, icones medicos. Incluir CTA para agendamento.', 'https://picsum.photos/seed/cc4/400/400', '2026-03-17T16:00:00+00:00'),
  ('30000000-0000-0000-0000-000000000005', 'Reel: Tour pela academia', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'ideas', 'medium', 'Reel (9:16)', '2026-03-25', '17:00', 'Tour pelas instalacoes da academia mostrando equipamentos novos. Trilha energetica, edicao dinamica com cortes rapidos. Finalizar com oferta de matricula.', NULL, '2026-03-13T08:00:00+00:00'),
  ('30000000-0000-0000-0000-000000000006', 'Carrossel: Menu especial semana', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'ideas', 'low', 'Carrossel', '2026-03-26', '11:00', NULL, NULL, '2026-03-18T10:00:00+00:00'),
  ('30000000-0000-0000-0000-000000000007', 'Reels lancamento do novo curso', '10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'published', 'high', 'Reel (9:16)', '2026-03-14', '19:00', NULL, 'https://picsum.photos/seed/cc7/400/600', '2026-03-14T18:00:00+00:00');

-- ============================================
-- DESIGN REQUESTS
-- ============================================

INSERT INTO design_requests (id, title, client_id, requested_by, priority, status, format, briefing, deadline) VALUES
  ('40000000-0000-0000-0000-000000000001', 'Banner Landing Page — campanha', '10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', 'high', 'in_progress', '1920x1080px', 'Fundo escuro, gradiente roxo, destaque na oferta de 50% off.', '2026-03-17'),
  ('40000000-0000-0000-0000-000000000002', 'Story Stories Kit — 5 artes', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'high', 'queued', '1080x1920px (x5)', 'Estilo premium, cores bege e dourado. Fotos do imovel anexas.', '2026-03-16'),
  ('40000000-0000-0000-0000-000000000003', 'Carrossel 6 slides — cases', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'medium', 'queued', '1080x1080px (x6)', 'Paleta azul/branco. Tom tecnico mas acessivel.', '2026-03-19'),
  ('40000000-0000-0000-0000-000000000004', 'Post novo procedimento estetico', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'low', 'done', '1080x1080px', 'Fundo branco, tipografia clean, icones medicos.', '2026-03-15'),
  ('40000000-0000-0000-0000-000000000005', 'Arte motivacional para feed', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'critical', 'queued', '1080x1080px', 'URGENTE: cliente pediu para ontem. Tom energetico, frase de impacto.', '2026-03-15');

-- ============================================
-- NOTICES
-- ============================================

INSERT INTO notices (id, title, body, created_by, urgent, category, created_at) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Reuniao de alinhamento — Sexta 16h', 'Todos os gestores de trafego devem apresentar relatorio semanal. Link no Google Meet.', '00000000-0000-0000-0000-000000000001', true, 'meeting', '2026-03-15T00:00:00+00:00'),
  ('50000000-0000-0000-0000-000000000002', 'Novo processo para briefing de arte', 'A partir de agora todos os briefings devem ter referencia visual anexada. Ver doc no Notion.', '00000000-0000-0000-0000-000000000001', false, 'general', '2026-03-12T00:00:00+00:00');

-- ============================================
-- CLIENT CHAT MESSAGES
-- ============================================

INSERT INTO client_chat_messages (client_id, user_id, user_name, text, created_at) VALUES
  -- TechVision
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Ana Lima', 'Campanhas Google Ads com ROAS de 4.2x essa semana. Excelente!', '2026-03-15T14:30:00+00:00'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Carlos Melo', 'Calendario de Abril pronto. Vou enviar para aprovacao amanha.', '2026-03-15T15:12:00+00:00'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Gerente Ops', 'Otimo desempenho. Manter estrategia e ampliar budget no Search.', '2026-03-16T09:00:00+00:00'),
  -- Clinica Saude+
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'Pedro Alves', 'CPC subiu 18% essa semana. Preciso revisar os grupos de anuncio.', '2026-03-14T10:20:00+00:00'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'Mariana Costa', 'Post do novo procedimento teve bom engajamento — 230 curtidas.', '2026-03-14T11:45:00+00:00'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'Pedro Alves', 'Ajustes feitos. Vamos monitorar os proximos 3 dias.', '2026-03-15T08:30:00+00:00'),
  -- LuxHome
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'Ana Lima', '3 imoveis com atribuicao direta as campanhas esse mes. Cliente feliz!', '2026-03-13T16:00:00+00:00'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'Carlos Melo', 'Precisamos agilizar o fluxo de aprovacao de artes — cliente demora muito.', '2026-03-13T17:10:00+00:00'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Gerente Ops', 'Vou entrar em contato com o cliente para alinhar o processo.', '2026-03-14T09:00:00+00:00'),
  -- Fitness Power
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'Pedro Alves', 'CPA esta 3x acima do meta. Situacao critica — precisa de reuniao urgente.', '2026-03-12T10:00:00+00:00'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'Mariana Costa', 'Cliente reclamou de falta de posts. Estava esperando aprovacao das artes.', '2026-03-12T11:30:00+00:00'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Gerente Ops', 'Reuniao agendada para sexta 15h. Vamos reestruturar a estrategia completa.', '2026-03-12T14:00:00+00:00'),
  -- Bella Vista
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'Ana Lima', 'Pixel instalado e rastreando corretamente. Aguardando criativo para lancar.', '2026-03-14T09:45:00+00:00'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'Carlos Melo', 'Calendario inicial de conteudo criado — 3 posts/semana pra comecar.', '2026-03-15T10:00:00+00:00'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Gerente Ops', 'Cliente confirmou acesso as redes. Onboarding no prazo!', '2026-03-15T14:00:00+00:00'),
  -- EduPro
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 'Pedro Alves', 'Lancamento do novo curso gerou 180 leads. Custo por lead otimo.', '2026-03-16T09:00:00+00:00'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'Mariana Costa', 'Reels do lancamento bombando — 15k visualizacoes em 24h.', '2026-03-16T11:30:00+00:00'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'Ana Lima', 'Escalando budget no Meta para aproveitar o momentum do lancamento.', '2026-03-16T13:00:00+00:00');

-- ============================================
-- ONBOARDING ITEMS (for Bella Vista — onboarding client)
-- ============================================

INSERT INTO onboarding_items (client_id, label, completed, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000005', 'Contrato assinado', true, 1),
  ('10000000-0000-0000-0000-000000000005', 'Acessos recebidos (redes sociais)', true, 2),
  ('10000000-0000-0000-0000-000000000005', 'Briefing inicial preenchido', true, 3),
  ('10000000-0000-0000-0000-000000000005', 'Reuniao de kickoff realizada', false, 4),
  ('10000000-0000-0000-0000-000000000005', 'Configuracao de pixels/tags', false, 5),
  ('10000000-0000-0000-0000-000000000005', 'Calendario de conteudo aprovado', false, 6),
  ('10000000-0000-0000-0000-000000000005', 'Campanhas de trafego configuradas', false, 7),
  ('10000000-0000-0000-0000-000000000005', 'Primeiro post publicado', false, 8),
  ('10000000-0000-0000-0000-000000000005', 'Review de 7 dias', false, 9);
