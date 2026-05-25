-- ═══════════════════════════════════════════════════════════
-- Lone OS — Additional Tables for Full Supabase Migration
-- ═══════════════════════════════════════════════════════════

-- ─── Timeline Entries ──────────────────────────────────────
CREATE TABLE timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'manual',
  actor TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_client ON timeline_entries(client_id);

-- ─── Client Chat Messages ──────────────────────────────────
CREATE TABLE client_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  "user" TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_chats_client ON client_chats(client_id);

-- ─── Global Chat Messages ──────────────────────────────────
CREATE TABLE global_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user" TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Onboarding Items ──────────────────────────────────────
CREATE TABLE onboarding_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_by TEXT,
  completed_at TEXT,
  department TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_client ON onboarding_items(client_id);

-- ─── Mood Entries ──────────────────────────────────────────
CREATE TABLE mood_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,
  note TEXT,
  recorded_by TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mood_client ON mood_entries(client_id);

-- ─── Creative Assets ───────────────────────────────────────
CREATE TABLE creative_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_client ON creative_assets(client_id);

-- ─── Social Proofs ─────────────────────────────────────────
CREATE TABLE social_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric1_label TEXT NOT NULL,
  metric1_value TEXT NOT NULL,
  metric2_label TEXT NOT NULL,
  metric2_value TEXT NOT NULL,
  metric3_label TEXT NOT NULL,
  metric3_value TEXT NOT NULL,
  period TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_proofs_client ON social_proofs(client_id);

-- ─── Crisis Notes ──────────────────────────────────────────
CREATE TABLE crisis_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crisis_client ON crisis_notes(client_id);

-- ─── Notices (Avisos) ──────────────────────────────────────
CREATE TABLE notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  urgent BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Quinzennial Reports ───────────────────────────────────
CREATE TABLE quinz_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  period TEXT NOT NULL,
  created_by TEXT NOT NULL,
  communication_health INTEGER NOT NULL DEFAULT 3,
  client_engagement INTEGER NOT NULL DEFAULT 3,
  highlights TEXT,
  challenges TEXT,
  next_steps TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quinz_client ON quinz_reports(client_id);

-- ─── Client Access (Credentials Vault) ─────────────────────
CREATE TABLE client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  instagram_login TEXT,
  instagram_password TEXT,
  facebook_login TEXT,
  facebook_password TEXT,
  tiktok_login TEXT,
  tiktok_password TEXT,
  linkedin_login TEXT,
  linkedin_password TEXT,
  youtube_login TEXT,
  youtube_password TEXT,
  mlabs_login TEXT,
  mlabs_password TEXT,
  canva_link TEXT,
  drive_link TEXT,
  other_notes TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_access_client ON client_access(client_id);

-- ─── Card Comments ─────────────────────────────────────────
CREATE TABLE card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES content_cards(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  role TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_comments_card ON card_comments(card_id);

-- ─── Traffic Monthly Reports ───────────────────────────────
CREATE TABLE traffic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  month TEXT NOT NULL,
  created_by TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  message_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_traffic_reports_client ON traffic_reports(client_id);

-- ─── Traffic Routine Checks ───────────────────────────────
CREATE TABLE traffic_routine_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  completed_by TEXT NOT NULL,
  note TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_traffic_checks_client ON traffic_routine_checks(client_id);

-- ─── Social Monthly Reports ───────────────────────────────
CREATE TABLE social_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  month TEXT NOT NULL,
  created_by TEXT NOT NULL,
  posts_published INTEGER NOT NULL DEFAULT 0,
  posts_goal INTEGER NOT NULL DEFAULT 12,
  reels_count INTEGER NOT NULL DEFAULT 0,
  stories_count INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  engagement INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  followers_gained INTEGER NOT NULL DEFAULT 0,
  followers_lost INTEGER NOT NULL DEFAULT 0,
  top_post TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_reports_client ON social_reports(client_id);

-- ─── Content Approvals ────────────────────────────────────
CREATE TABLE content_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES content_cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_approvals_card ON content_approvals(card_id);

-- ─── Add blocked columns to content_cards ──────────────────
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS blocked_by TEXT;
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS requested_by_traffic TEXT;
ALTER TABLE content_cards ADD COLUMN IF NOT EXISTS traffic_suggestion TEXT;

-- ─── Add lastKanbanActivity to clients ─────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_kanban_activity TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo TEXT;

-- ─── RLS for new tables ────────────────────────────────────
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quinz_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_routine_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_approvals ENABLE ROW LEVEL SECURITY;

-- All authenticated can CRUD all new tables (same as existing tables)
CREATE POLICY "timeline_all" ON timeline_entries FOR ALL TO authenticated USING (true);
CREATE POLICY "client_chats_all" ON client_chats FOR ALL TO authenticated USING (true);
CREATE POLICY "global_chat_all" ON global_chat FOR ALL TO authenticated USING (true);
CREATE POLICY "onboarding_all" ON onboarding_items FOR ALL TO authenticated USING (true);
CREATE POLICY "mood_all" ON mood_entries FOR ALL TO authenticated USING (true);
CREATE POLICY "creative_all" ON creative_assets FOR ALL TO authenticated USING (true);
CREATE POLICY "social_proofs_all" ON social_proofs FOR ALL TO authenticated USING (true);
CREATE POLICY "crisis_notes_all" ON crisis_notes FOR ALL TO authenticated USING (true);
CREATE POLICY "notices_all" ON notices FOR ALL TO authenticated USING (true);
CREATE POLICY "quinz_reports_all" ON quinz_reports FOR ALL TO authenticated USING (true);
CREATE POLICY "client_access_all" ON client_access FOR ALL TO authenticated USING (true);
CREATE POLICY "card_comments_all" ON card_comments FOR ALL TO authenticated USING (true);
CREATE POLICY "traffic_reports_all" ON traffic_reports FOR ALL TO authenticated USING (true);
CREATE POLICY "traffic_checks_all" ON traffic_routine_checks FOR ALL TO authenticated USING (true);
CREATE POLICY "social_reports_all" ON social_reports FOR ALL TO authenticated USING (true);
CREATE POLICY "content_approvals_all" ON content_approvals FOR ALL TO authenticated USING (true);

-- Allow anon/service_role access (since we use anon key with no Supabase Auth yet)
CREATE POLICY "timeline_anon" ON timeline_entries FOR ALL TO anon USING (true);
CREATE POLICY "client_chats_anon" ON client_chats FOR ALL TO anon USING (true);
CREATE POLICY "global_chat_anon" ON global_chat FOR ALL TO anon USING (true);
CREATE POLICY "onboarding_anon" ON onboarding_items FOR ALL TO anon USING (true);
CREATE POLICY "mood_anon" ON mood_entries FOR ALL TO anon USING (true);
CREATE POLICY "creative_anon" ON creative_assets FOR ALL TO anon USING (true);
CREATE POLICY "social_proofs_anon" ON social_proofs FOR ALL TO anon USING (true);
CREATE POLICY "crisis_notes_anon" ON crisis_notes FOR ALL TO anon USING (true);
CREATE POLICY "notices_anon" ON notices FOR ALL TO anon USING (true);
CREATE POLICY "quinz_reports_anon" ON quinz_reports FOR ALL TO anon USING (true);
CREATE POLICY "client_access_anon" ON client_access FOR ALL TO anon USING (true);
CREATE POLICY "card_comments_anon" ON card_comments FOR ALL TO anon USING (true);
CREATE POLICY "traffic_reports_anon" ON traffic_reports FOR ALL TO anon USING (true);
CREATE POLICY "traffic_checks_anon" ON traffic_routine_checks FOR ALL TO anon USING (true);
CREATE POLICY "social_reports_anon" ON social_reports FOR ALL TO anon USING (true);
CREATE POLICY "content_approvals_anon" ON content_approvals FOR ALL TO anon USING (true);

-- Also add anon policies to existing tables (missing from 001)
CREATE POLICY "clients_anon" ON clients FOR ALL TO anon USING (true);
CREATE POLICY "content_cards_anon" ON content_cards FOR ALL TO anon USING (true);
CREATE POLICY "design_requests_anon" ON design_requests FOR ALL TO anon USING (true);
CREATE POLICY "tasks_anon" ON tasks FOR ALL TO anon USING (true);
CREATE POLICY "snapshots_anon" ON snapshots FOR ALL TO anon USING (true);
CREATE POLICY "notifications_anon" ON notifications FOR ALL TO anon USING (true);
