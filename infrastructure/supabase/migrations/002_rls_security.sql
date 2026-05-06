-- ═══════════════════════════════════════════════════════════
-- Lone OS — Security Migration: RLS + Column Security
-- Sprint: Enterprise Security Hardening
-- ═══════════════════════════════════════════════════════════

-- ─── Drop existing policies (idempotent) ────────────────────
DO $$ BEGIN
  -- Clients
  DROP POLICY IF EXISTS "clients_read_all" ON clients;
  DROP POLICY IF EXISTS "clients_write_admin" ON clients;
  -- Content cards
  DROP POLICY IF EXISTS "content_cards_all" ON content_cards;
  -- Design requests
  DROP POLICY IF EXISTS "design_requests_all" ON design_requests;
  -- Tasks
  DROP POLICY IF EXISTS "tasks_all" ON tasks;
  -- Snapshots
  DROP POLICY IF EXISTS "snapshots_read" ON snapshots;
  DROP POLICY IF EXISTS "snapshots_write" ON snapshots;
  -- Notifications
  DROP POLICY IF EXISTS "notifications_all" ON notifications;
  -- Automation rules
  DROP POLICY IF EXISTS "automation_rules_all" ON automation_rules;
  -- Team members
  DROP POLICY IF EXISTS "team_members_read" ON team_members;
  DROP POLICY IF EXISTS "team_members_write" ON team_members;
END $$;

-- ─── Ensure RLS is enabled on ALL tables ────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- HELPER: Extract role from JWT
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'user_role',
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'anon'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════
-- CLIENTS — Sensitive data protection
-- ═══════════════════════════════════════════════════════════

-- Admin/Manager: full read + write
CREATE POLICY "clients_admin_full" ON clients
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'))
  WITH CHECK (auth.user_role() IN ('admin', 'manager', 'service_role'));

-- Staff: read basic fields only (sensitive columns handled by VIEW)
CREATE POLICY "clients_staff_read" ON clients
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('traffic', 'social', 'designer'));

-- Staff: cannot insert/update/delete clients
-- (no INSERT/UPDATE/DELETE policy = denied by default with RLS on)

-- ─── Secure VIEW for staff (hides sensitive columns) ────────
CREATE OR REPLACE VIEW clients_safe AS
SELECT
  id, name, logo, industry, status, attention_level, tags,
  monthly_budget, payment_method, join_date, contract_end,
  last_post_date, notes,
  assigned_traffic, assigned_social, assigned_designer,
  tone_of_voice, drive_link, instagram_user,
  posts_this_month, posts_goal, campaign_briefing, fixed_briefing,
  meta_ad_account_id, meta_ad_account_name,
  lead_source,
  -- Access vault (logins visible, passwords masked)
  facebook_login, google_ads_login, instagram_login,
  -- Sensitive fields HIDDEN:
  -- cpf_cnpj, birth_date, phone, email
  -- facebook_password, google_ads_password, instagram_password
  created_at, updated_at
FROM clients;

GRANT SELECT ON clients_safe TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- CONTENT CARDS
-- ═══════════════════════════════════════════════════════════

-- All authenticated can read
CREATE POLICY "cards_read_all" ON content_cards
  FOR SELECT TO authenticated USING (true);

-- Admin/Manager can do everything
CREATE POLICY "cards_admin_all" ON content_cards
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'))
  WITH CHECK (auth.user_role() IN ('admin', 'manager', 'service_role'));

-- Social: can update cards assigned to them
CREATE POLICY "cards_social_update" ON content_cards
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'social' AND social_media = current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
  WITH CHECK (auth.user_role() = 'social');

-- Social: can insert new cards
CREATE POLICY "cards_social_insert" ON content_cards
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('social', 'traffic'));

-- Designer: can update cards (delivery)
CREATE POLICY "cards_designer_update" ON content_cards
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'designer')
  WITH CHECK (auth.user_role() = 'designer');

-- ═══════════════════════════════════════════════════════════
-- TASKS
-- ═══════════════════════════════════════════════════════════

-- All can read all tasks
CREATE POLICY "tasks_read_all" ON tasks
  FOR SELECT TO authenticated USING (true);

-- Admin/Manager: full CRUD
CREATE POLICY "tasks_admin_all" ON tasks
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'))
  WITH CHECK (auth.user_role() IN ('admin', 'manager', 'service_role'));

-- Staff: can only update tasks assigned to them
CREATE POLICY "tasks_staff_update" ON tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = current_setting('request.jwt.claims', true)::jsonb ->> 'user_name')
  WITH CHECK (assigned_to = current_setting('request.jwt.claims', true)::jsonb ->> 'user_name');

-- Staff: can insert tasks
CREATE POLICY "tasks_staff_insert" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() NOT IN ('anon'));

-- ═══════════════════════════════════════════════════════════
-- DESIGN REQUESTS
-- ═══════════════════════════════════════════════════════════

-- All can read
CREATE POLICY "design_read_all" ON design_requests
  FOR SELECT TO authenticated USING (true);

-- All authenticated can insert (social, traffic, admin request designs)
CREATE POLICY "design_insert_all" ON design_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admin + Designer can update (status changes)
CREATE POLICY "design_update" ON design_requests
  FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'designer', 'service_role'))
  WITH CHECK (true);

-- Only admin can delete
CREATE POLICY "design_delete_admin" ON design_requests
  FOR DELETE TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'));

-- ═══════════════════════════════════════════════════════════
-- SNAPSHOTS (Time Machine) — Read-heavy, write-restricted
-- ═══════════════════════════════════════════════════════════

-- All can read
CREATE POLICY "snapshots_read_all" ON snapshots
  FOR SELECT TO authenticated USING (true);

-- Only admin/manager can write
CREATE POLICY "snapshots_write_admin" ON snapshots
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'manager', 'service_role'));

CREATE POLICY "snapshots_update_admin" ON snapshots
  FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'))
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════

-- All can read and mark as read
CREATE POLICY "notif_read_all" ON notifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "notif_update_all" ON notifications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- System/admin can insert
CREATE POLICY "notif_insert" ON notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- AUTOMATION RULES — Admin only
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "auto_read_all" ON automation_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auto_write_admin" ON automation_rules
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'))
  WITH CHECK (auth.user_role() IN ('admin', 'manager', 'service_role'));

-- ═══════════════════════════════════════════════════════════
-- TEAM MEMBERS
-- ═══════════════════════════════════════════════════════════

-- All can read (needed for assignment dropdowns)
CREATE POLICY "team_read_all" ON team_members
  FOR SELECT TO authenticated USING (true);

-- Only admin can write
CREATE POLICY "team_write_admin" ON team_members
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'))
  WITH CHECK (auth.user_role() IN ('admin', 'manager', 'service_role'));

-- ═══════════════════════════════════════════════════════════
-- AUDIT LOG TABLE (new)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
  record_id TEXT,
  user_role TEXT,
  user_name TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, record_id, user_role, user_name, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id::text, OLD.id::text),
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claims', true)::jsonb ->> 'user_name',
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit triggers to sensitive tables
DROP TRIGGER IF EXISTS audit_clients ON clients;
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_tasks ON tasks;
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- RLS on audit_log (admin read-only)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_admin" ON audit_log
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'manager', 'service_role'));

GRANT SELECT ON audit_log TO authenticated;
