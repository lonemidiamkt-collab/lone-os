-- Migration 040: task_transitions
-- Append-only log of every status change on a task.
-- Mirrors content_card_transitions structure for consistency.

create table if not exists task_transitions (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  from_status   text,                        -- null on first entry
  to_status     text not null,
  actor_id      uuid references team_members(id) on delete set null,
  actor_name    text,
  duration_ms   bigint,                      -- time in from_status before this transition
  transitioned_at timestamptz not null default now(),
  metadata      jsonb default '{}'::jsonb
);

create index if not exists idx_tt_task_id
  on task_transitions(task_id);

create index if not exists idx_tt_transitioned_at
  on task_transitions(transitioned_at desc);

create index if not exists idx_tt_to_status
  on task_transitions(to_status);

alter table task_transitions enable row level security;

create policy "authenticated_read_tt"
  on task_transitions for select
  to authenticated
  using (true);

create policy "authenticated_insert_tt"
  on task_transitions for insert
  to authenticated
  with check (true);
