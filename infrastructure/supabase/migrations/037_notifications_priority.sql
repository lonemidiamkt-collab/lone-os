-- 037_notifications_priority.sql
-- Adiciona priority e expires_at à tabela notifications.
-- priority: 'normal' | 'high' | 'urgent'
-- expires_at: quando a notificação deve sumir automaticamente (null = permanente)

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_priority
  ON notifications (priority) WHERE read = false;
