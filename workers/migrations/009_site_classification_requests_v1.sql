-- Migration 009: persistent site classification requests
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/009_site_classification_requests_v1.sql

CREATE TABLE IF NOT EXISTS site_classification_requests_v1 (
  id                          TEXT PRIMARY KEY,
  profile_id                  TEXT NOT NULL,
  device_id                   TEXT,
  client_request_id           TEXT,
  requested_target_type        TEXT NOT NULL,
  requested_raw_input          TEXT,
  requested_normalized_value   TEXT NOT NULL,
  requested_host               TEXT,
  display_value                TEXT,
  status                      TEXT NOT NULL DEFAULT 'pending',
  decision                    TEXT,
  decision_target_type         TEXT,
  decision_normalized_value    TEXT,
  requested_at                INTEGER NOT NULL,
  decided_at                  INTEGER,
  created_at                  INTEGER NOT NULL,
  updated_at                  INTEGER NOT NULL,

  UNIQUE (profile_id, requested_target_type, requested_normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_site_classification_requests_profile_status
  ON site_classification_requests_v1 (profile_id, status, requested_at);

CREATE INDEX IF NOT EXISTS idx_site_classification_requests_profile_device
  ON site_classification_requests_v1 (profile_id, device_id, requested_at);

CREATE INDEX IF NOT EXISTS idx_site_classification_requests_profile_decision
  ON site_classification_requests_v1 (profile_id, decision, decision_target_type, decision_normalized_value);
