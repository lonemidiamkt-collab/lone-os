-- Migration 039: content_card_transitions
-- Append-only log of every status/column change on a content card.
-- Used for: SLA enforcement, cycle-time analytics, audit trail.

create table if not exists content_card_transitions (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references content_cards(id) on delete cascade,
  from_status   text,                        -- null on first entry (card creation)
  to_status     text not null,
  actor_id      uuid references team_members(id) on delete set null,
  actor_name    text,                        -- denormalised for historical reads
  duration_ms   bigint,                      -- time spent in from_status (null on first entry)
  transitioned_at timestamptz not null default now(),
  metadata      jsonb default '{}'::jsonb    -- optional extras (e.g. reason, batch_id)
);

-- Indexes for the most common query patterns
create index if not exists idx_cct_card_id
  on content_card_transitions(card_id);

create index if not exists idx_cct_transitioned_at
  on content_card_transitions(transitioned_at desc);

create index if not exists idx_cct_to_status
  on content_card_transitions(to_status);

-- RLS
alter table content_card_transitions enable row level security;

-- All authenticated users can read transitions
create policy "authenticated_read_cct"
  on content_card_transitions for select
  to authenticated
  using (true);

-- Any authenticated user can insert (the API layer enforces actor identity)
create policy "authenticated_insert_cct"
  on content_card_transitions for insert
  to authenticated
  with check (true);

-- No updates or deletes — this is an append-only audit log
