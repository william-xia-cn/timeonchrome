-- Refresh-token account sessions.
-- Device tokens remain independent and are not affected by password changes.

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  refresh_token_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account
  ON account_sessions(account_id);

CREATE INDEX IF NOT EXISTS idx_account_sessions_hash
  ON account_sessions(refresh_token_hash);
