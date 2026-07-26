-- System access management configuration.
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/020_system_access_config_v1.sql

CREATE TABLE IF NOT EXISTS system_access_config_v1 (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  note TEXT
);
