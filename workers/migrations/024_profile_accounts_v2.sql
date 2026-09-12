-- Migration 024: atomic shadow profile-account publication (Package E)
-- Isolated from all V1 stats and quota read paths.

CREATE TABLE IF NOT EXISTS device_account_heads_v2 (
  profile_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  date              TEXT NOT NULL,
  manifest_id       TEXT NOT NULL,
  revision          INTEGER NOT NULL,
  stats_hash        TEXT NOT NULL,
  raw_fact_hash     TEXT NOT NULL,
  complete          INTEGER NOT NULL,
  loss_count        INTEGER NOT NULL DEFAULT 0,
  generated_at      INTEGER NOT NULL,
  committed_at      INTEGER NOT NULL,
  published_at      INTEGER NOT NULL,

  PRIMARY KEY (profile_id, device_id, date),
  FOREIGN KEY (manifest_id) REFERENCES device_account_manifests_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_device_account_heads_v2_profile_date
  ON device_account_heads_v2 (profile_id, date, device_id);

CREATE TABLE IF NOT EXISTS profile_account_day_generations_v2 (
  id                         TEXT PRIMARY KEY,
  profile_id                 TEXT NOT NULL,
  date                       TEXT NOT NULL,
  week_start                 TEXT NOT NULL,
  generation                 INTEGER NOT NULL,
  as_of                      INTEGER NOT NULL,
  device_count               INTEGER NOT NULL,
  device_version_vector_json TEXT NOT NULL,
  row_count                  INTEGER NOT NULL,
  chunk_count                INTEGER NOT NULL,
  rows_hash                  TEXT NOT NULL,
  total_seconds              INTEGER NOT NULL,
  total_hash                 TEXT NOT NULL,
  complete                   INTEGER NOT NULL,
  incomplete_devices_json    TEXT NOT NULL,
  created_at                 INTEGER NOT NULL,

  UNIQUE (profile_id, date, generation)
);

CREATE INDEX IF NOT EXISTS idx_profile_account_day_generations_v2_profile_date
  ON profile_account_day_generations_v2 (profile_id, date, generation DESC);

CREATE TABLE IF NOT EXISTS profile_account_day_chunks_v2 (
  generation_id TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  row_count     INTEGER NOT NULL,
  chunk_hash    TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,

  PRIMARY KEY (generation_id, chunk_index),
  FOREIGN KEY (generation_id) REFERENCES profile_account_day_generations_v2(id)
);

CREATE TABLE IF NOT EXISTS profile_account_day_heads_v2 (
  profile_id      TEXT NOT NULL,
  date            TEXT NOT NULL,
  generation_id   TEXT NOT NULL,
  generation      INTEGER NOT NULL,
  total_hash      TEXT NOT NULL,
  complete        INTEGER NOT NULL,
  as_of           INTEGER NOT NULL,
  published_at    INTEGER NOT NULL,

  PRIMARY KEY (profile_id, date),
  FOREIGN KEY (generation_id) REFERENCES profile_account_day_generations_v2(id)
);

CREATE TABLE IF NOT EXISTS profile_account_week_generations_v2 (
  id                         TEXT PRIMARY KEY,
  profile_id                 TEXT NOT NULL,
  week_start                 TEXT NOT NULL,
  week_end                   TEXT NOT NULL,
  generation                 INTEGER NOT NULL,
  as_of                      INTEGER NOT NULL,
  day_version_vector_json    TEXT NOT NULL,
  device_version_vector_json TEXT NOT NULL,
  profile_total_json         TEXT NOT NULL,
  total_hash                 TEXT NOT NULL,
  complete                   INTEGER NOT NULL,
  incomplete_devices_json    TEXT NOT NULL,
  created_at                 INTEGER NOT NULL,

  UNIQUE (profile_id, week_start, generation)
);

CREATE INDEX IF NOT EXISTS idx_profile_account_week_generations_v2_profile_week
  ON profile_account_week_generations_v2 (profile_id, week_start, generation DESC);

CREATE TABLE IF NOT EXISTS profile_account_week_heads_v2 (
  profile_id      TEXT NOT NULL,
  week_start      TEXT NOT NULL,
  generation_id   TEXT NOT NULL,
  generation      INTEGER NOT NULL,
  total_hash      TEXT NOT NULL,
  complete        INTEGER NOT NULL,
  as_of           INTEGER NOT NULL,
  published_at    INTEGER NOT NULL,

  PRIMARY KEY (profile_id, week_start),
  FOREIGN KEY (generation_id) REFERENCES profile_account_week_generations_v2(id)
);

CREATE TABLE IF NOT EXISTS profile_account_publication_events_v2 (
  id              TEXT PRIMARY KEY,
  profile_id      TEXT NOT NULL,
  device_id       TEXT NOT NULL,
  date            TEXT NOT NULL,
  revision        INTEGER NOT NULL,
  manifest_id     TEXT NOT NULL,
  day_generation  INTEGER,
  week_generation INTEGER,
  event_code      TEXT NOT NULL,
  error_code      TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_account_publication_events_v2_profile_time
  ON profile_account_publication_events_v2 (profile_id, created_at DESC);
