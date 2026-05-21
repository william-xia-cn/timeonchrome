-- Client Logging Foundation v1
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/010_client_logs_v1.sql

CREATE TABLE IF NOT EXISTS client_logs_v1 (
  id                 TEXT PRIMARY KEY,
  profile_id         TEXT NOT NULL,
  device_id          TEXT NOT NULL,
  timestamp          INTEGER NOT NULL,
  level              TEXT NOT NULL,
  category           TEXT NOT NULL,
  event_code         TEXT NOT NULL,
  message            TEXT NOT NULL,
  binding_state      TEXT,
  extension_version  TEXT,
  domain             TEXT,
  module             TEXT,
  details_json       TEXT,
  uploaded_at        INTEGER NOT NULL,
  created_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_logs_profile_time
  ON client_logs_v1 (profile_id, timestamp, id);

CREATE INDEX IF NOT EXISTS idx_client_logs_profile_device_time
  ON client_logs_v1 (profile_id, device_id, timestamp, id);

CREATE INDEX IF NOT EXISTS idx_client_logs_profile_level_time
  ON client_logs_v1 (profile_id, level, timestamp);

CREATE INDEX IF NOT EXISTS idx_client_logs_profile_category_time
  ON client_logs_v1 (profile_id, category, timestamp);
