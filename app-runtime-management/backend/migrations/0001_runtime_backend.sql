PRAGMA foreign_keys = ON;

CREATE TABLE runtime_enrollment_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  consumed_by_device_id TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX runtime_enrollment_codes_expiry_idx
  ON runtime_enrollment_codes(expires_at_ms, consumed_at_ms);

CREATE TABLE runtime_devices (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('macos', 'windows')),
  token_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER
);

CREATE INDEX runtime_devices_subject_idx
  ON runtime_devices(subject_id, created_at_ms);

CREATE TABLE runtime_usage_segments (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES runtime_devices(id),
  runtime_session_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('macos', 'windows')),
  runtime_identity TEXT NOT NULL,
  display_name TEXT,
  start_at_ms INTEGER NOT NULL CHECK(start_at_ms >= 0),
  end_at_ms INTEGER NOT NULL CHECK(end_at_ms > start_at_ms),
  duration_ms INTEGER NOT NULL CHECK(duration_ms = end_at_ms - start_at_ms),
  end_reason TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  uploaded_at_ms INTEGER NOT NULL,
  PRIMARY KEY(device_id, id)
);

CREATE INDEX runtime_usage_segments_subject_time_idx
  ON runtime_usage_segments(device_id, start_at_ms, end_at_ms);
