-- Migration 029: immutable attribution corrections for usage segments.
-- Raw usage_segments_v1 rows remain unchanged.

CREATE TABLE IF NOT EXISTS usage_accounting_correction_batches_v1 (
  id                      TEXT PRIMARY KEY,
  profile_id              TEXT NOT NULL,
  device_id               TEXT NOT NULL,
  date                    TEXT NOT NULL,
  domain                  TEXT NOT NULL,
  segment_count           INTEGER NOT NULL,
  duration_seconds        INTEGER NOT NULL,
  reason_code             TEXT NOT NULL,
  note                    TEXT,
  approved_by_account_id  TEXT NOT NULL,
  created_at              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_segment_corrections_v1 (
  id                              TEXT PRIMARY KEY,
  batch_id                        TEXT NOT NULL,
  segment_id                      TEXT NOT NULL UNIQUE,
  profile_id                      TEXT NOT NULL,
  device_id                       TEXT NOT NULL,
  date                            TEXT NOT NULL,
  domain                          TEXT NOT NULL,
  start_ms                        INTEGER NOT NULL,
  end_ms                          INTEGER NOT NULL,
  duration_seconds                INTEGER NOT NULL,
  channel                         TEXT NOT NULL,
  original_mode                   TEXT NOT NULL,
  original_target_classification  TEXT,
  original_quota_bucket           TEXT,
  effective_mode                  TEXT NOT NULL,
  effective_target_classification TEXT NOT NULL,
  effective_quota_bucket          TEXT NOT NULL,
  reason_code                     TEXT NOT NULL,
  approved_by_account_id          TEXT NOT NULL,
  created_at                      INTEGER NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES usage_accounting_correction_batches_v1(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_corrections_profile_date
  ON usage_segment_corrections_v1 (profile_id, date, device_id);

CREATE INDEX IF NOT EXISTS idx_usage_corrections_segment
  ON usage_segment_corrections_v1 (segment_id);

ALTER TABLE profile_account_read_snapshots_v2
  ADD COLUMN correction_version INTEGER NOT NULL DEFAULT 0;
