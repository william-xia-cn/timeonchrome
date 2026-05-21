-- Migration 012: cloud/terminal stats settlement consistency
-- Adds terminal diagnostic fields to cloud segment mirrors and makes stats_v1 device-scoped.
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/012_cloud_terminal_stats_consistency.sql

ALTER TABLE usage_segments_v1 ADD COLUMN tab_id TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN window_id INTEGER;
ALTER TABLE usage_segments_v1 ADD COLUMN description_json TEXT;

ALTER TABLE media_segments_v1 ADD COLUMN description_json TEXT;

CREATE TABLE IF NOT EXISTS stats_v1_next (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  date              TEXT NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  day_start_ms      INTEGER,
  day_end_ms        INTEGER,
  domain            TEXT NOT NULL,
  channel           TEXT NOT NULL,
  mode              TEXT NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  first_seen_at     INTEGER,
  last_seen_at      INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,

  UNIQUE (profile_id, device_id, date, domain, channel, mode)
);

INSERT OR REPLACE INTO stats_v1_next
  (id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
   domain, channel, mode, duration_seconds, first_seen_at, last_seen_at,
   created_at, updated_at)
SELECT
  id,
  profile_id,
  COALESCE(NULLIF(device_id, ''), 'unknown-device') AS device_id,
  date,
  timezone,
  day_start_ms,
  day_end_ms,
  domain,
  channel,
  mode,
  duration_seconds,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
FROM stats_v1;

DROP TABLE stats_v1;
ALTER TABLE stats_v1_next RENAME TO stats_v1;

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_date
  ON stats_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_device_date
  ON stats_v1 (profile_id, device_id, date);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_domain_date
  ON stats_v1 (profile_id, domain, date);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_channel_date
  ON stats_v1 (profile_id, channel, date);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_mode_date
  ON stats_v1 (profile_id, mode, date);
