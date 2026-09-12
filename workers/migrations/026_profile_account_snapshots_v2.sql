-- Migration 026: immutable paged V2 read snapshots (Package G)

CREATE TABLE IF NOT EXISTS profile_account_read_snapshots_v2 (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL,
  week_start          TEXT NOT NULL,
  week_end            TEXT NOT NULL,
  source_generation_id TEXT NOT NULL,
  source_generation   INTEGER NOT NULL,
  as_of               INTEGER NOT NULL,
  page_count          INTEGER NOT NULL,
  total_hash          TEXT NOT NULL,
  snapshot_hash       TEXT NOT NULL,
  metadata_json       TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL,

  FOREIGN KEY (source_generation_id) REFERENCES profile_account_week_generations_v2(id)
);

CREATE INDEX IF NOT EXISTS idx_profile_account_read_snapshots_v2_profile_week
  ON profile_account_read_snapshots_v2 (profile_id, week_start, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_account_read_snapshots_v2_expiry
  ON profile_account_read_snapshots_v2 (expires_at);

CREATE TABLE IF NOT EXISTS profile_account_read_snapshot_pages_v2 (
  snapshot_id       TEXT NOT NULL,
  page_index        INTEGER NOT NULL,
  item_count        INTEGER NOT NULL,
  page_hash         TEXT NOT NULL,
  payload_json      TEXT NOT NULL,
  created_at        INTEGER NOT NULL,

  PRIMARY KEY (snapshot_id, page_index),
  FOREIGN KEY (snapshot_id) REFERENCES profile_account_read_snapshots_v2(id)
);
