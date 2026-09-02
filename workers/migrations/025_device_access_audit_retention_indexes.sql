-- Keep device access audit retention maintenance off the request hot path.
-- The timestamp index serves the global 14-day expiry pass. The composite
-- index serves deterministic newest-first ranking for each device.
CREATE INDEX IF NOT EXISTS idx_device_access_audit_timestamp
  ON device_access_audit_v1(timestamp);

CREATE INDEX IF NOT EXISTS idx_device_access_audit_profile_device_ts
  ON device_access_audit_v1(profile_id, device_id, timestamp DESC, id DESC);
