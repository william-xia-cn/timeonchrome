CREATE TABLE IF NOT EXISTS runtime_child_lifecycle_outbox_v1 (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type = 'child.deleted'),
  status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  UNIQUE(child_id, event_type)
);

CREATE INDEX IF NOT EXISTS runtime_child_lifecycle_pending_idx
  ON runtime_child_lifecycle_outbox_v1(status, next_attempt_at, created_at);
