-- Lone OS — Auth integration + Row Level Security
-- Links Supabase Auth (auth.users) to team_members table

-- ============================================
-- 1. Link team_members to auth.users
-- ============================================

-- Add auth_id column to team_members (nullable for migration)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- Function: auto-create team_member profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create if a team_member with this email doesn't already exist
  UPDATE public.team_members
  SET auth_id = NEW.id
  WHERE email = NEW.email AND auth_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: runs after every auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. Helper: get current user's team_member id
-- ============================================

CREATE OR REPLACE FUNCTION public.current_team_member_id()
RETURNS UUID AS $$
  SELECT id FROM public.team_members WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_team_member_role()
RETURNS role_type AS $$
  SELECT role FROM public.team_members WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================
-- 3. Enable RLS on all tables
-- ============================================

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quinz_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_proof_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_routine_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS Policies
-- ============================================
-- Strategy: all authenticated users can READ most data (it's an internal team tool).
-- WRITE access is role-based where it matters.

-- --- team_members ---
CREATE POLICY "Team members are viewable by authenticated users"
  ON team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own profile"
  ON team_members FOR UPDATE TO authenticated
  USING (auth_id = auth.uid());

-- --- clients ---
CREATE POLICY "Clients are viewable by all team members"
  ON clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and manager can insert clients"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (current_team_member_role() IN ('admin', 'manager'));

CREATE POLICY "Team members can update clients"
  ON clients FOR UPDATE TO authenticated USING (true);

-- --- client_access ---
CREATE POLICY "Client access viewable by team"
  ON client_access FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can manage client access"
  ON client_access FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- tasks ---
CREATE POLICY "Tasks viewable by team"
  ON tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can manage tasks"
  ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- content_cards ---
CREATE POLICY "Content cards viewable by team"
  ON content_cards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can manage content cards"
  ON content_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- card_comments ---
CREATE POLICY "Comments viewable by team"
  ON card_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can add comments"
  ON card_comments FOR INSERT TO authenticated WITH CHECK (true);

-- --- design_requests ---
CREATE POLICY "Design requests viewable by team"
  ON design_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can manage design requests"
  ON design_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- notices ---
CREATE POLICY "Notices viewable by team"
  ON notices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/manager can manage notices"
  ON notices FOR INSERT TO authenticated
  WITH CHECK (current_team_member_role() IN ('admin', 'manager'));

CREATE POLICY "Admin/manager can delete notices"
  ON notices FOR DELETE TO authenticated
  USING (current_team_member_role() IN ('admin', 'manager'));

-- --- quinz_reports ---
CREATE POLICY "Quinz reports viewable by team"
  ON quinz_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can create quinz reports"
  ON quinz_reports FOR INSERT TO authenticated WITH CHECK (true);

-- --- timeline_entries ---
CREATE POLICY "Timeline viewable by team"
  ON timeline_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can add timeline entries"
  ON timeline_entries FOR INSERT TO authenticated WITH CHECK (true);

-- --- client_chat_messages ---
CREATE POLICY "Client chats viewable by team"
  ON client_chat_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can send client messages"
  ON client_chat_messages FOR INSERT TO authenticated WITH CHECK (true);

-- --- global_chat_messages ---
CREATE POLICY "Global chat viewable by team"
  ON global_chat_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can send global messages"
  ON global_chat_messages FOR INSERT TO authenticated WITH CHECK (true);

-- --- onboarding_items ---
CREATE POLICY "Onboarding items viewable by team"
  ON onboarding_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can manage onboarding items"
  ON onboarding_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- mood_entries ---
CREATE POLICY "Mood entries viewable by team"
  ON mood_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can add mood entries"
  ON mood_entries FOR INSERT TO authenticated WITH CHECK (true);

-- --- creative_assets ---
CREATE POLICY "Creative assets viewable by team"
  ON creative_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can manage creative assets"
  ON creative_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- social_proof_entries ---
CREATE POLICY "Social proof viewable by team"
  ON social_proof_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can add social proof"
  ON social_proof_entries FOR INSERT TO authenticated WITH CHECK (true);

-- --- crisis_notes ---
CREATE POLICY "Crisis notes viewable by team"
  ON crisis_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can add crisis notes"
  ON crisis_notes FOR INSERT TO authenticated WITH CHECK (true);

-- --- traffic_monthly_reports ---
CREATE POLICY "Traffic reports viewable by team"
  ON traffic_monthly_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Traffic team can manage reports"
  ON traffic_monthly_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- traffic_routine_checks ---
CREATE POLICY "Routine checks viewable by team"
  ON traffic_routine_checks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can add routine checks"
  ON traffic_routine_checks FOR INSERT TO authenticated WITH CHECK (true);

-- --- social_monthly_reports ---
CREATE POLICY "Social reports viewable by team"
  ON social_monthly_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Social team can manage reports"
  ON social_monthly_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- content_approvals ---
CREATE POLICY "Approvals viewable by team"
  ON content_approvals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team can manage approvals"
  ON content_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- notifications ---
CREATE POLICY "Users see their own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (user_id = current_team_member_id() OR user_id IS NULL);

CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (user_id = current_team_member_id() OR user_id IS NULL);

-- ============================================
-- 5. Add indexes for common queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_team_members_auth ON team_members(auth_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_content_cards_client ON content_cards(client_id);
CREATE INDEX IF NOT EXISTS idx_content_cards_social ON content_cards(social_media_id);
CREATE INDEX IF NOT EXISTS idx_content_cards_status ON content_cards(status);
CREATE INDEX IF NOT EXISTS idx_design_requests_client ON design_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_design_requests_status ON design_requests(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_client ON onboarding_items(client_id);
CREATE INDEX IF NOT EXISTS idx_mood_client ON mood_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_creative_assets_client ON creative_assets(client_id);
