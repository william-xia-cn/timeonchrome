-- Migration 008: media_segments_v1
-- Independent cloud mirror for local media_segments_v1 and daily_media_stats_v1.
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/008_media_segments_v1.sql

CREATE TABLE IF NOT EXISTS media_segments_v1 (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL,
  device_id           TEXT,
  date                TEXT NOT NULL,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  day_start_ms        INTEGER NOT NULL,
  day_end_ms          INTEGER NOT NULL,
  start_ms            INTEGER NOT NULL,
  end_ms              INTEGER NOT NULL,
  duration_seconds    INTEGER NOT NULL,
  domain              TEXT NOT NULL,
  tab_id              TEXT,
  window_id           INTEGER,
  media_class         TEXT NOT NULL,
  media_kind          TEXT,
  visibility          TEXT,
  mode                TEXT NOT NULL,
  settlement_reason   TEXT,
  parent_segment_id   TEXT,
  part_index          INTEGER NOT NULL DEFAULT 1,
  part_count          INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  uploaded_at         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_media_segments_profile_date
  ON media_segments_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_media_segments_profile_domain_date
  ON media_segments_v1 (profile_id, domain, date);

CREATE INDEX IF NOT EXISTS idx_media_segments_profile_class_date
  ON media_segments_v1 (profile_id, media_class, date);

CREATE INDEX IF NOT EXISTS idx_media_segments_profile_mode_date
  ON media_segments_v1 (profile_id, mode, date);

CREATE INDEX IF NOT EXISTS idx_media_segments_profile_start_id
  ON media_segments_v1 (profile_id, start_ms, id);

CREATE TABLE IF NOT EXISTS daily_media_stats_v1 (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  device_id         TEXT,
  date              TEXT NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  day_start_ms      INTEGER,
  day_end_ms        INTEGER,
  domain            TEXT NOT NULL,
  media_class       TEXT NOT NULL,
  mode              TEXT NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  first_seen_at     INTEGER,
  last_seen_at      INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,

  UNIQUE (profile_id, device_id, date, domain, media_class, mode)
);

CREATE INDEX IF NOT EXISTS idx_daily_media_stats_profile_date
  ON daily_media_stats_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_media_stats_profile_device_date
  ON daily_media_stats_v1 (profile_id, device_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_media_stats_profile_domain_date
  ON daily_media_stats_v1 (profile_id, domain, date);

CREATE INDEX IF NOT EXISTS idx_daily_media_stats_profile_class_date
  ON daily_media_stats_v1 (profile_id, media_class, date);

CREATE INDEX IF NOT EXISTS idx_daily_media_stats_profile_mode_date
  ON daily_media_stats_v1 (profile_id, mode, date);
