-- Migration 005: stats_v1
-- Stats Storage Foundation — durable per-channel per-mode daily aggregate mirror
-- Cloud retention: at least 2 years (730 days), no automatic cleanup yet
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/005_stats_v1.sql

CREATE TABLE IF NOT EXISTS stats_v1 (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  device_id         TEXT,
  date              TEXT NOT NULL,          -- YYYY-MM-DD, 设备本地日期
  timezone          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  day_start_ms      INTEGER,
  day_end_ms        INTEGER,
  domain            TEXT NOT NULL,          -- 归一化域名
  channel           TEXT NOT NULL,          -- active / backgroundMedia / pip
  mode              TEXT NOT NULL,          -- study / rest / paused / unknown / composite
  duration_seconds  INTEGER NOT NULL,       -- 该 channel+mode 组合的总时长（秒）
  first_seen_at     INTEGER,
  last_seen_at      INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,

  UNIQUE (profile_id, date, domain, channel, mode)
);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_date
  ON stats_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_domain_date
  ON stats_v1 (profile_id, domain, date);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_channel_date
  ON stats_v1 (profile_id, channel, date);

CREATE INDEX IF NOT EXISTS idx_stats_v1_profile_mode_date
  ON stats_v1 (profile_id, mode, date);
