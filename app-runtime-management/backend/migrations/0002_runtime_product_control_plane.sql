ALTER TABLE runtime_enrollment_codes ADD COLUMN account_id TEXT;
ALTER TABLE runtime_enrollment_codes ADD COLUMN child_id TEXT;
ALTER TABLE runtime_enrollment_codes ADD COLUMN platform TEXT NOT NULL DEFAULT 'windows';
ALTER TABLE runtime_enrollment_codes ADD COLUMN display_name TEXT;
ALTER TABLE runtime_enrollment_codes ADD COLUMN created_by_jti TEXT;
ALTER TABLE runtime_enrollment_codes ADD COLUMN revoked_at_ms INTEGER;
ALTER TABLE runtime_enrollment_codes ADD COLUMN replace_device_id TEXT;

ALTER TABLE runtime_devices ADD COLUMN account_id TEXT;
ALTER TABLE runtime_devices ADD COLUMN child_id TEXT;
ALTER TABLE runtime_devices ADD COLUMN agent_version TEXT;
ALTER TABLE runtime_devices ADD COLUMN os_version TEXT;
ALTER TABLE runtime_devices ADD COLUMN architecture TEXT;
ALTER TABLE runtime_devices ADD COLUMN last_upload_at_ms INTEGER;

CREATE TABLE runtime_children_v1 (
  child_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  child_name TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(account_id, child_id)
);

CREATE TABLE runtime_app_hourly_stats_v1 (
  child_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  hour_start_ms INTEGER NOT NULL,
  runtime_identity TEXT NOT NULL,
  display_name TEXT,
  duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(child_id, device_id, hour_start_ms, runtime_identity)
);

CREATE INDEX runtime_devices_child_idx ON runtime_devices(account_id, child_id, created_at_ms);
CREATE INDEX runtime_enrollment_child_idx ON runtime_enrollment_codes(account_id, child_id, expires_at_ms);
CREATE INDEX runtime_hourly_child_time_idx ON runtime_app_hourly_stats_v1(child_id, hour_start_ms, device_id);
