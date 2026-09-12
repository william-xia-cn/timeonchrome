-- Migration 023: immutable shadow device account snapshots
-- Package D only. These tables are not read by V1 stats, Pages, or quota routes.

CREATE TABLE IF NOT EXISTS device_account_manifests_v2 (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  date              TEXT NOT NULL,
  revision          INTEGER NOT NULL,
  generated_at      INTEGER NOT NULL,
  row_count         INTEGER NOT NULL,
  chunk_count       INTEGER NOT NULL,
  raw_fact_count    INTEGER NOT NULL,
  raw_fact_hash     TEXT NOT NULL,
  stats_hash        TEXT NOT NULL,
  complete          INTEGER NOT NULL DEFAULT 1,
  loss_count        INTEGER NOT NULL DEFAULT 0,
  manifest_hash     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'staging',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  committed_at      INTEGER,

  UNIQUE (profile_id, device_id, date, revision)
);

CREATE INDEX IF NOT EXISTS idx_device_account_manifests_v2_device_date
  ON device_account_manifests_v2 (profile_id, device_id, date, revision DESC);

CREATE INDEX IF NOT EXISTS idx_device_account_manifests_v2_status
  ON device_account_manifests_v2 (status, updated_at);

CREATE TABLE IF NOT EXISTS device_account_chunks_v2 (
  manifest_id       TEXT NOT NULL,
  chunk_index       INTEGER NOT NULL,
  row_count         INTEGER NOT NULL,
  chunk_hash        TEXT NOT NULL,
  payload_json      TEXT NOT NULL,
  created_at        INTEGER NOT NULL,

  PRIMARY KEY (manifest_id, chunk_index),
  FOREIGN KEY (manifest_id) REFERENCES device_account_manifests_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_device_account_chunks_v2_manifest
  ON device_account_chunks_v2 (manifest_id, chunk_index);

CREATE TABLE IF NOT EXISTS device_account_sync_events_v2 (
  id                TEXT PRIMARY KEY,
  manifest_id       TEXT,
  profile_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  date              TEXT NOT NULL,
  revision          INTEGER NOT NULL,
  event_code        TEXT NOT NULL,
  error_code        TEXT,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_account_sync_events_v2_device_time
  ON device_account_sync_events_v2 (profile_id, device_id, created_at DESC);
