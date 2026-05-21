-- Migration 011: hourly_stats_v1
-- Hourly materialized mirrors for local hourly_usage_stats_v1 and hourly_media_stats_v1.
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/011_hourly_stats_v1.sql

CREATE TABLE IF NOT EXISTS hourly_stats_v1 (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  hour_key          TEXT NOT NULL,          -- YYYY-MM-DDTHH, device local hour
  date              TEXT NOT NULL,          -- YYYY-MM-DD, device local date
  hour              INTEGER NOT NULL,       -- 0-23, device local hour
  timezone          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  hour_start_ms     INTEGER,
  hour_end_ms       INTEGER,
  domain            TEXT NOT NULL,
  channel           TEXT NOT NULL,
  mode              TEXT NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  segments_count    INTEGER NOT NULL DEFAULT 0,
  last_segment_id   TEXT,
  first_seen_at     INTEGER,
  last_seen_at      INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,

  UNIQUE (profile_id, device_id, hour_key, domain, channel, mode)
);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_profile_hour
  ON hourly_stats_v1 (profile_id, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_profile_device_hour
  ON hourly_stats_v1 (profile_id, device_id, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_profile_date
  ON hourly_stats_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_profile_domain_hour
  ON hourly_stats_v1 (profile_id, domain, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_profile_channel_hour
  ON hourly_stats_v1 (profile_id, channel, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_stats_profile_mode_hour
  ON hourly_stats_v1 (profile_id, mode, hour_key);

CREATE TABLE IF NOT EXISTS hourly_media_stats_v1 (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  hour_key          TEXT NOT NULL,
  date              TEXT NOT NULL,
  hour              INTEGER NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  hour_start_ms     INTEGER,
  hour_end_ms       INTEGER,
  domain            TEXT NOT NULL,
  media_class       TEXT NOT NULL,
  mode              TEXT NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  segments_count    INTEGER NOT NULL DEFAULT 0,
  last_segment_id   TEXT,
  first_seen_at     INTEGER,
  last_seen_at      INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,

  UNIQUE (profile_id, device_id, hour_key, domain, media_class, mode)
);

CREATE INDEX IF NOT EXISTS idx_hourly_media_stats_profile_hour
  ON hourly_media_stats_v1 (profile_id, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_media_stats_profile_device_hour
  ON hourly_media_stats_v1 (profile_id, device_id, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_media_stats_profile_date
  ON hourly_media_stats_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_hourly_media_stats_profile_domain_hour
  ON hourly_media_stats_v1 (profile_id, domain, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_media_stats_profile_class_hour
  ON hourly_media_stats_v1 (profile_id, media_class, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_media_stats_profile_mode_hour
  ON hourly_media_stats_v1 (profile_id, mode, hour_key);
