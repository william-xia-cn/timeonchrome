CREATE TABLE IF NOT EXISTS runtime_consumed_sso_tickets_v1 (
  jti_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  consumed_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_consumed_sso_tickets_expiry
  ON runtime_consumed_sso_tickets_v1(expires_at_ms);

CREATE TABLE IF NOT EXISTS runtime_browser_sessions_v1 (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  children_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER,
  last_used_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_browser_sessions_account_expiry
  ON runtime_browser_sessions_v1(account_id, expires_at_ms);
