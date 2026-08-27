-- Narrow identity bridge outbox. This table contains no Native App policy or Santa data.
CREATE TABLE IF NOT EXISTS native_app_lifecycle_outbox_v1 (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('child.deleted')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  UNIQUE(child_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_native_app_lifecycle_outbox_pending
  ON native_app_lifecycle_outbox_v1(status, next_attempt_at);
