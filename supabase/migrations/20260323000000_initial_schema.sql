-- Lone OS — Initial Database Schema
-- All tables for the operations management platform

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE role_type AS ENUM ('admin', 'manager', 'traffic', 'social', 'designer');
CREATE TYPE client_status AS ENUM ('onboarding', 'good', 'average', 'at_risk');
CREATE TYPE attention_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE priority_type AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'review', 'done');
CREATE TYPE tone_of_voice AS ENUM ('formal', 'funny', 'authoritative', 'casual');
CREATE TYPE mood_type AS ENUM ('happy', 'neutral', 'angry');
CREATE TYPE timeline_entry_type AS ENUM ('chat', 'task', 'status', 'content', 'design', 'report', 'manual', 'onboarding', 'meeting');
CREATE TYPE social_platform AS ENUM ('instagram', 'tiktok', 'linkedin', 'youtube', 'facebook');
CREATE TYPE content_status AS ENUM ('ideas', 'script', 'in_production', 'approval', 'client_approval', 'scheduled', 'published');
CREATE TYPE design_status AS ENUM ('queued', 'in_progress', 'done');
CREATE TYPE payment_method AS ENUM ('pix', 'boleto', 'cartao', 'transferencia');
CREATE TYPE notification_type AS ENUM ('sla', 'status', 'content', 'checkin', 'system');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE routine_check_type AS ENUM ('support', 'report', 'feedback', 'analysis');
CREATE TYPE creative_asset_type AS ENUM ('reference', 'palette', 'typography', 'logo');
CREATE TYPE notice_category AS ENUM ('general', 'meeting', 'deadline', 'reminder');

-- ============================================
-- TEAM MEMBERS (users of the platform)
-- ============================================

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role role_type NOT NULL,
  password_hash TEXT, -- for simple auth (social team login etc.)
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CLIENTS
-- ============================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo TEXT,
  industry TEXT NOT NULL,
  monthly_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  status client_status NOT NULL DEFAULT 'onboarding',
  attention_level attention_level NOT NULL DEFAULT 'low',
  tags TEXT[] NOT NULL DEFAULT '{}',
  assigned_traffic_id UUID REFERENCES team_members(id),
  assigned_social_id UUID REFERENCES team_members(id),
  last_post_date DATE,
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method NOT NULL DEFAULT 'pix',
  notes TEXT,
  contract_end DATE,
  -- Social media dossier
  tone_of_voice tone_of_voice,
  drive_link TEXT,
  instagram_user TEXT,
  posts_this_month INT NOT NULL DEFAULT 0,
  posts_goal INT NOT NULL DEFAULT 12,
  last_kanban_activity TIMESTAMPTZ,
  campaign_briefing TEXT,
  crisis_note TEXT,
  fixed_briefing TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CLIENT ACCESS / CREDENTIALS
-- ============================================

CREATE TABLE client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
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
  updated_by UUID REFERENCES team_members(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- ============================================
-- TASKS
-- ============================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES team_members(id),
  role role_type NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  priority priority_type NOT NULL DEFAULT 'medium',
  due_date DATE,
  description TEXT,
  attachments TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CONTENT CARDS (Social Media Kanban)
-- ============================================

CREATE TABLE content_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  social_media_id UUID REFERENCES team_members(id), -- assigned social media person
  status content_status NOT NULL DEFAULT 'ideas',
  priority priority_type NOT NULL DEFAULT 'medium',
  due_date DATE,
  due_time TIME,
  format TEXT NOT NULL DEFAULT '',
  platform social_platform,
  briefing TEXT,
  caption TEXT,
  hashtags TEXT,
  image_url TEXT,
  observations TEXT,
  traffic_suggestion TEXT,
  status_changed_at TIMESTAMPTZ,
  design_request_id UUID, -- filled later via FK
  -- Handoff tracking
  designer_delivered_at TIMESTAMPTZ,
  designer_delivered_by UUID REFERENCES team_members(id),
  social_confirmed_at TIMESTAMPTZ,
  social_confirmed_by UUID REFERENCES team_members(id),
  -- Non-delivery tracking
  non_delivery_reason TEXT,
  non_delivery_reported_by UUID REFERENCES team_members(id),
  non_delivery_reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CARD COMMENTS
-- ============================================

CREATE TABLE card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES content_cards(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES team_members(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- DESIGN REQUESTS
-- ============================================

CREATE TABLE design_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES team_members(id),
  priority priority_type NOT NULL DEFAULT 'medium',
  status design_status NOT NULL DEFAULT 'queued',
  format TEXT NOT NULL DEFAULT '',
  briefing TEXT NOT NULL DEFAULT '',
  attachments TEXT[] NOT NULL DEFAULT '{}',
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from content_cards to design_requests
ALTER TABLE content_cards
  ADD CONSTRAINT fk_content_cards_design_request
  FOREIGN KEY (design_request_id) REFERENCES design_requests(id) ON DELETE SET NULL;

-- ============================================
-- NOTICES
-- ============================================

CREATE TABLE notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES team_members(id),
  urgent BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  category notice_category NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- QUINZENNIAL REPORTS
-- ============================================

CREATE TABLE quinz_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES team_members(id),
  communication_health INT NOT NULL CHECK (communication_health BETWEEN 1 AND 5),
  client_engagement INT NOT NULL CHECK (client_engagement BETWEEN 1 AND 5),
  highlights TEXT NOT NULL DEFAULT '',
  challenges TEXT NOT NULL DEFAULT '',
  next_steps TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TIMELINE ENTRIES
-- ============================================

CREATE TABLE timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type timeline_entry_type NOT NULL,
  actor_id UUID REFERENCES team_members(id),
  actor_name TEXT NOT NULL DEFAULT '', -- denormalized for display
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_client ON timeline_entries(client_id, created_at DESC);

-- ============================================
-- CLIENT CHAT MESSAGES (per-client internal chat)
-- ============================================

CREATE TABLE client_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES team_members(id),
  user_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_chat ON client_chat_messages(client_id, created_at);

-- ============================================
-- GLOBAL CHAT MESSAGES
-- ============================================

CREATE TABLE global_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES team_members(id),
  user_name TEXT NOT NULL DEFAULT '',
  user_role role_type NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ONBOARDING ITEMS (per-client checklist)
-- ============================================

CREATE TABLE onboarding_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES team_members(id),
  completed_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- MOOD ENTRIES (client sentiment tracking)
-- ============================================

CREATE TABLE mood_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  mood mood_type NOT NULL,
  note TEXT,
  recorded_by UUID REFERENCES team_members(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CREATIVE ASSETS
-- ============================================

CREATE TABLE creative_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type creative_asset_type NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  uploaded_by UUID REFERENCES team_members(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- SOCIAL PROOF ENTRIES
-- ============================================

CREATE TABLE social_proof_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric1_label TEXT NOT NULL DEFAULT '',
  metric1_value TEXT NOT NULL DEFAULT '',
  metric2_label TEXT NOT NULL DEFAULT '',
  metric2_value TEXT NOT NULL DEFAULT '',
  metric3_label TEXT NOT NULL DEFAULT '',
  metric3_value TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CRISIS NOTES
-- ============================================

CREATE TABLE crisis_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TRAFFIC MONTHLY REPORTS
-- ============================================

CREATE TABLE traffic_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- "2026-01"
  created_by UUID REFERENCES team_members(id),
  messages INT NOT NULL DEFAULT 0,
  message_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  impressions INT NOT NULL DEFAULT 0,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, month)
);

-- ============================================
-- TRAFFIC ROUTINE CHECKS
-- ============================================

CREATE TABLE traffic_routine_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type routine_check_type NOT NULL,
  completed_by UUID REFERENCES team_members(id),
  note TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- SOCIAL MONTHLY REPORTS
-- ============================================

CREATE TABLE social_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  created_by UUID REFERENCES team_members(id),
  posts_published INT NOT NULL DEFAULT 0,
  posts_goal INT NOT NULL DEFAULT 0,
  reels_count INT NOT NULL DEFAULT 0,
  stories_count INT NOT NULL DEFAULT 0,
  reach INT NOT NULL DEFAULT 0,
  impressions INT NOT NULL DEFAULT 0,
  engagement INT NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  followers_gained INT NOT NULL DEFAULT 0,
  followers_lost INT NOT NULL DEFAULT 0,
  top_post TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, month)
);

-- ============================================
-- CONTENT APPROVALS
-- ============================================

CREATE TABLE content_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES content_cards(id) ON DELETE CASCADE,
  status approval_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES team_members(id),
  reviewed_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES team_members(id), -- target user
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_team_members_updated_at BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_client_access_updated_at BEFORE UPDATE ON client_access FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_content_cards_updated_at BEFORE UPDATE ON content_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_design_requests_updated_at BEFORE UPDATE ON design_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
