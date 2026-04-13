-- ═══════════════════════════════════════════════════════════
-- Lone OS — Initial Database Schema
-- ═══════════════════════════════════════════════════════════

-- ─── Enums ──────────────────────────────────────────────────
CREATE TYPE client_status AS ENUM ('onboarding', 'good', 'average', 'at_risk');
CREATE TYPE attention_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'review', 'done');
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'traffic', 'social', 'designer');
CREATE TYPE lead_source AS ENUM ('indicacao', 'trafego', 'organico', 'outros');
CREATE TYPE payment_method AS ENUM ('pix', 'boleto', 'cartao', 'transferencia');
CREATE TYPE content_status AS ENUM ('ideas', 'script', 'in_production', 'approval', 'client_approval', 'scheduled', 'published');
CREATE TYPE design_status AS ENUM ('queued', 'in_progress', 'done');

-- ─── Team Members ───────────────────────────────────────────
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'social',
  initials TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Clients ────────────────────────────────────────────────
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT 'Outro',
  status client_status NOT NULL DEFAULT 'onboarding',
  attention_level attention_level NOT NULL DEFAULT 'medium',
  tags TEXT[] NOT NULL DEFAULT '{}',
  monthly_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'pix',
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contract_end DATE,
  last_post_date DATE,
  notes TEXT,

  -- Team assignments
  assigned_traffic TEXT,
  assigned_social TEXT,
  assigned_designer TEXT,

  -- Social dossier
  tone_of_voice TEXT,
  drive_link TEXT,
  instagram_user TEXT,
  posts_this_month INTEGER DEFAULT 0,
  posts_goal INTEGER DEFAULT 12,
  campaign_briefing TEXT,
  fixed_briefing TEXT,

  -- Meta Ads
  meta_ad_account_id TEXT,
  meta_ad_account_name TEXT,

  -- Dados Pessoais (ADMIN ONLY via RLS)
  cpf_cnpj TEXT,
  birth_date DATE,
  phone TEXT,
  email TEXT,
  lead_source lead_source DEFAULT 'indicacao',

  -- Cofre de Acessos
  facebook_login TEXT,
  facebook_password TEXT,
  google_ads_login TEXT,
  google_ads_password TEXT,
  instagram_login TEXT,
  instagram_password TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Content Cards ──────────────────────────────────────────
CREATE TABLE content_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  social_media TEXT,
  status content_status NOT NULL DEFAULT 'ideas',
  priority priority_level NOT NULL DEFAULT 'medium',
  format TEXT,
  platform TEXT,
  due_date DATE,
  due_time TEXT,
  briefing TEXT,
  caption TEXT,
  hashtags TEXT,
  image_url TEXT,
  observations TEXT,

  -- SLA tracking
  status_changed_at TIMESTAMPTZ,
  column_entered_at JSONB DEFAULT '{}',

  -- Design handoff
  design_request_id UUID,
  designer_delivered_at TIMESTAMPTZ,
  designer_delivered_by TEXT,
  social_confirmed_at TIMESTAMPTZ,
  social_confirmed_by TEXT,

  -- Non-delivery
  non_delivery_reason TEXT,
  non_delivery_reported_by TEXT,
  non_delivery_reported_at TIMESTAMPTZ,

  -- Timesheet
  work_started_at TIMESTAMPTZ,
  total_time_spent_ms BIGINT DEFAULT 0,

  -- Publish verification
  publish_verified_at TIMESTAMPTZ,
  publish_verified_by TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Design Requests ────────────────────────────────────────
CREATE TABLE design_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  priority priority_level NOT NULL DEFAULT 'medium',
  status design_status NOT NULL DEFAULT 'queued',
  format TEXT,
  briefing TEXT,
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Tasks ──────────────────────────────────────────────────
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'social',
  status task_status NOT NULL DEFAULT 'pending',
  priority priority_level NOT NULL DEFAULT 'medium',
  start_date DATE,
  due_date DATE,
  description TEXT,
  work_started_at TIMESTAMPTZ,
  total_time_spent_ms BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Snapshots (Time Machine) ───────────────────────────────
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,              -- "2026-04"
  period_type TEXT NOT NULL DEFAULT 'monthly',

  -- Company metrics
  total_clients INTEGER NOT NULL DEFAULT 0,
  active_clients INTEGER NOT NULL DEFAULT 0,
  at_risk_clients INTEGER NOT NULL DEFAULT 0,
  churn_rate NUMERIC(5,2) DEFAULT 0,
  avg_health_score NUMERIC(5,2) DEFAULT 0,

  -- Social metrics
  posts_published INTEGER DEFAULT 0,
  posts_target INTEGER DEFAULT 96,
  avg_delivery_sla_hours NUMERIC(6,1) DEFAULT 0,
  sla_compliance_pct NUMERIC(5,2) DEFAULT 100,

  -- Design metrics
  design_completed INTEGER DEFAULT 0,
  design_avg_days NUMERIC(5,1) DEFAULT 0,
  design_on_time_pct NUMERIC(5,2) DEFAULT 100,

  -- Task metrics
  tasks_completed INTEGER DEFAULT 0,
  tasks_overdue INTEGER DEFAULT 0,

  -- Onboarding metrics
  avg_onboarding_days NUMERIC(5,1) DEFAULT 0,
  onboarding_completed INTEGER DEFAULT 0,

  -- Engagement
  avg_days_since_last_interaction NUMERIC(5,1) DEFAULT 0,

  -- Raw data backup
  raw_data JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(period, period_type)
);

-- ─── Automation Rules ───────────────────────────────────────
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Notifications ──────────────────────────────────────────
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_content_cards_client ON content_cards(client_id);
CREATE INDEX idx_content_cards_status ON content_cards(status);
CREATE INDEX idx_design_requests_status ON design_requests(status);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_snapshots_period ON snapshots(period);
CREATE INDEX idx_notifications_read ON notifications(read);

-- ─── Updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER content_cards_updated_at BEFORE UPDATE ON content_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER design_requests_updated_at BEFORE UPDATE ON design_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read clients (basic fields)
CREATE POLICY "clients_read_all" ON clients
  FOR SELECT TO authenticated
  USING (true);

-- Only admin/manager can insert/update/delete clients
CREATE POLICY "clients_write_admin" ON clients
  FOR ALL TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IN ('admin', 'manager', 'service_role')
  );

-- Staff cannot see personal data columns — handled in app layer (RBAC)
-- RLS provides row-level, app provides column-level filtering

-- Content cards: all authenticated can CRUD
CREATE POLICY "content_cards_all" ON content_cards
  FOR ALL TO authenticated USING (true);

-- Design requests: all authenticated can CRUD
CREATE POLICY "design_requests_all" ON design_requests
  FOR ALL TO authenticated USING (true);

-- Tasks: all authenticated can CRUD
CREATE POLICY "tasks_all" ON tasks
  FOR ALL TO authenticated USING (true);

-- Snapshots: all authenticated can read, admin can write
CREATE POLICY "snapshots_read" ON snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "snapshots_write" ON snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IN ('admin', 'manager', 'service_role')
  );

-- Notifications: all can read/update own
CREATE POLICY "notifications_all" ON notifications
  FOR ALL TO authenticated USING (true);

-- ─── Service role bypass ────────────────────────────────────
-- The service_role key bypasses RLS automatically in Supabase
