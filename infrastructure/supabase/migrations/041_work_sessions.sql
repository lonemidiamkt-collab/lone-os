-- Migration 041: work_sessions
-- Tracks when each team member is actively using the system.
-- Used for: presence indicators, activity heatmaps, idle detection.

create table if not exists work_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references team_members(id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,                  -- null = session still active
  last_ping_at timestamptz not null default now(),  -- heartbeat from client
  idle_since   timestamptz,                  -- set when client reports idle
  duration_ms  bigint                        -- computed on session end
    generated always as (
      extract(epoch from (ended_at - started_at)) * 1000
    ) stored,
  metadata     jsonb default '{}'::jsonb     -- e.g. { "page": "/traffic", "ua": "..." }
);

-- Active sessions query: ended_at is null and last_ping_at is recent
create index if not exists idx_ws_user_id
  on work_sessions(user_id);

create index if not exists idx_ws_active
  on work_sessions(user_id, last_ping_at desc)
  where ended_at is null;

create index if not exists idx_ws_started_at
  on work_sessions(started_at desc);

alter table work_sessions enable row level security;

-- Users can only see/manage their own sessions (matched via email from JWT)
create policy "own_sessions_select"
  on work_sessions for select
  to authenticated
  using (
    user_id in (
      select id from team_members
      where email = auth.email()
    )
  );

create policy "own_sessions_insert"
  on work_sessions for insert
  to authenticated
  with check (
    user_id in (
      select id from team_members
      where email = auth.email()
    )
  );

create policy "own_sessions_update"
  on work_sessions for update
  to authenticated
  using (
    user_id in (
      select id from team_members
      where email = auth.email()
    )
  );

-- Admins/managers can read all sessions (for presence + analytics)
create policy "manager_read_all_sessions"
  on work_sessions for select
  to authenticated
  using (
    auth.user_role() in ('admin', 'manager', 'service_role')
  );
