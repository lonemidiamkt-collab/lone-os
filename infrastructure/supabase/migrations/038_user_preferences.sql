-- User preferences: key-value store per user (persists UI state across sessions)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key      TEXT        NOT NULL,
  value    JSONB       NOT NULL DEFAULT 'null',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Each user can only read/write their own preferences
CREATE POLICY "user_preferences_self" ON user_preferences
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast single-key lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences (user_id);
