-- Migration 015: allow returned site classification requests to be submitted again.
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/015_site_classification_returned_requests.sql

CREATE TABLE IF NOT EXISTS site_classification_requests_v1_next (
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
  updated_at                  INTEGER NOT NULL
);

INSERT OR IGNORE INTO site_classification_requests_v1_next (
  id, profile_id, device_id, client_request_id, requested_target_type, requested_raw_input,
  requested_normalized_value, requested_host, display_value, status, decision, decision_target_type,
  decision_normalized_value, requested_at, decided_at, created_at, updated_at
)
SELECT
  id, profile_id, device_id, client_request_id, requested_target_type, requested_raw_input,
  requested_normalized_value, requested_host, display_value, status, decision, decision_target_type,
  decision_normalized_value, requested_at, decided_at, created_at, updated_at
FROM site_classification_requests_v1;

DROP TABLE site_classification_requests_v1;

ALTER TABLE site_classification_requests_v1_next RENAME TO site_classification_requests_v1;

CREATE INDEX IF NOT EXISTS idx_site_classification_requests_profile_status
  ON site_classification_requests_v1 (profile_id, status, requested_at);

CREATE INDEX IF NOT EXISTS idx_site_classification_requests_profile_device
  ON site_classification_requests_v1 (profile_id, device_id, requested_at);

CREATE INDEX IF NOT EXISTS idx_site_classification_requests_profile_decision
  ON site_classification_requests_v1 (profile_id, decision, decision_target_type, decision_normalized_value);

CREATE INDEX IF NOT EXISTS idx_site_classification_requests_profile_target
  ON site_classification_requests_v1 (profile_id, requested_target_type, requested_normalized_value, requested_at);
