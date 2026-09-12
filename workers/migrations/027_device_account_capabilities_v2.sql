-- Migration 027: device capability metadata for V2 accounting consumers.
-- Contains no browsing, domain, target, or quota usage data.

CREATE TABLE IF NOT EXISTS device_account_capabilities_v2 (
  profile_id          TEXT NOT NULL,
  device_id           TEXT NOT NULL,
  capability_version  INTEGER NOT NULL,
  extension_version   TEXT,
  first_seen_at       INTEGER NOT NULL,
  last_seen_at        INTEGER NOT NULL,

  PRIMARY KEY (profile_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_account_capabilities_v2_profile_seen
  ON device_account_capabilities_v2 (profile_id, last_seen_at DESC);
