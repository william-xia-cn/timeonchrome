-- Migration 016: distinguish automatic unclassified access records from manual study requests.
-- Run only after source review:
-- wrangler d1 execute guardian-db --remote --file=migrations/016_site_classification_record_semantics.sql

ALTER TABLE site_classification_requests_v1 ADD COLUMN record_source TEXT;
ALTER TABLE site_classification_requests_v1 ADD COLUMN requested_classification TEXT;
ALTER TABLE site_classification_requests_v1 ADD COLUMN manual_requested_at INTEGER;
ALTER TABLE site_classification_requests_v1 ADD COLUMN first_observed_at INTEGER;
ALTER TABLE site_classification_requests_v1 ADD COLUMN last_observed_at INTEGER;
ALTER TABLE site_classification_requests_v1 ADD COLUMN observation_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS site_classification_observation_counters_v1 (
  request_id              TEXT NOT NULL,
  profile_id              TEXT NOT NULL,
  device_id               TEXT,
  observation_source_id   TEXT NOT NULL,
  observation_count       INTEGER NOT NULL DEFAULT 0,
  first_observed_at       INTEGER,
  last_observed_at        INTEGER,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  PRIMARY KEY (request_id, observation_source_id)
);

CREATE INDEX IF NOT EXISTS idx_site_classification_observation_profile
  ON site_classification_observation_counters_v1 (profile_id, request_id);