-- Migration 025: independent shadow reconciliation results (Package F)

CREATE TABLE IF NOT EXISTS device_account_reconciliations_v2 (
  id                    TEXT PRIMARY KEY,
  profile_id            TEXT NOT NULL,
  device_id             TEXT NOT NULL,
  date                  TEXT NOT NULL,
  revision              INTEGER NOT NULL,
  manifest_id           TEXT NOT NULL,
  raw_cutoff            INTEGER NOT NULL,
  status                TEXT NOT NULL,
  expected_raw_count    INTEGER NOT NULL,
  actual_raw_count      INTEGER NOT NULL,
  expected_raw_hash     TEXT NOT NULL,
  actual_raw_hash       TEXT,
  expected_stats_hash   TEXT NOT NULL,
  actual_stats_hash     TEXT,
  total_seconds_delta   INTEGER,
  difference_json       TEXT NOT NULL,
  checked_at            INTEGER NOT NULL,

  UNIQUE (profile_id, device_id, date, revision, raw_cutoff),
  FOREIGN KEY (manifest_id) REFERENCES device_account_manifests_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_device_account_reconciliations_v2_profile_date
  ON device_account_reconciliations_v2 (profile_id, device_id, date, revision DESC);

CREATE TABLE IF NOT EXISTS device_account_reconciliation_incidents_v2 (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL,
  device_id           TEXT NOT NULL,
  date                TEXT NOT NULL,
  revision            INTEGER NOT NULL,
  fingerprint         TEXT NOT NULL,
  status              TEXT NOT NULL,
  first_seen_at       INTEGER NOT NULL,
  last_seen_at        INTEGER NOT NULL,
  occurrences         INTEGER NOT NULL DEFAULT 1,
  difference_json     TEXT NOT NULL,

  UNIQUE (profile_id, device_id, date, revision, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_device_account_reconciliation_incidents_v2_profile_time
  ON device_account_reconciliation_incidents_v2 (profile_id, last_seen_at DESC);
