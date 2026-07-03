-- Managed internal policy based device recovery.
-- Maps administrator-provided tenant/device policy anchors to existing cloud devices.
-- Stores no device token, account token, Chrome identity, or business configuration.

CREATE TABLE IF NOT EXISTS managed_device_mappings_v1 (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  device_policy_id  TEXT NOT NULL,
  profile_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_recovered_at INTEGER,
  UNIQUE(tenant_id, device_policy_id)
);

CREATE INDEX IF NOT EXISTS idx_managed_device_mappings_profile
  ON managed_device_mappings_v1(profile_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_managed_device_mappings_device
  ON managed_device_mappings_v1(device_id, status);
