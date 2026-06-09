-- Weak Chrome identity based device recovery.
-- Stores only server-side hashes and recovery request metadata.

ALTER TABLE devices ADD COLUMN platform TEXT;
ALTER TABLE devices ADD COLUMN browser TEXT;
ALTER TABLE devices ADD COLUMN chrome_identity_hash TEXT;
ALTER TABLE devices ADD COLUMN identity_linked_at INTEGER;
ALTER TABLE devices ADD COLUMN last_recovered_at INTEGER;
ALTER TABLE devices ADD COLUMN recovery_status TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_identity_platform
  ON devices(chrome_identity_hash, platform, status);

CREATE TABLE IF NOT EXISTS device_recovery_requests_v1 (
  id                    TEXT PRIMARY KEY,
  profile_id            TEXT,
  chrome_identity_hash  TEXT,
  platform              TEXT NOT NULL,
  browser               TEXT,
  extension_version     TEXT,
  device_name_hint      TEXT,
  candidate_device_id   TEXT,
  candidate_count       INTEGER NOT NULL DEFAULT 0,
  poll_token_hash       TEXT UNIQUE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  result_device_id      TEXT,
  result_profile_id     TEXT,
  message               TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  decided_at            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_device_recovery_requests_profile_status
  ON device_recovery_requests_v1(profile_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_recovery_requests_identity_status
  ON device_recovery_requests_v1(chrome_identity_hash, platform, status, created_at DESC);
