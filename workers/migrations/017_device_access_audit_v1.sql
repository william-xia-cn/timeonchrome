-- Device access audit for diagnosing cloud reachability.
-- Stores request metadata only; no tokens, URLs, domains, or payload content.
CREATE TABLE IF NOT EXISTS device_access_audit_v1 (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT,
  device_id         TEXT,
  token_hash_prefix TEXT,
  timestamp         INTEGER NOT NULL,
  method            TEXT NOT NULL,
  endpoint          TEXT NOT NULL,
  request_kind      TEXT NOT NULL,
  status            INTEGER NOT NULL,
  auth_result       TEXT NOT NULL,
  result_code       TEXT,
  error_class       TEXT,
  duration_ms       INTEGER,
  client_version    TEXT,
  request_id        TEXT,
  payload_count     INTEGER,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_access_audit_profile_ts
  ON device_access_audit_v1(profile_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_device_access_audit_device_ts
  ON device_access_audit_v1(device_id, timestamp DESC);

