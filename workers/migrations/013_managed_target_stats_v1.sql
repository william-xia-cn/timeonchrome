-- Migration 013: managed target ledger attribution and target stats
-- Adds managedTarget snapshot columns to cloud usage segments and creates
-- device-scoped daily/hourly target materialized stats.
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/013_managed_target_stats_v1.sql

ALTER TABLE usage_segments_v1 ADD COLUMN managed_target_id TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN managed_target_type TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN managed_target_namespace TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN managed_target_value TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN managed_target_label_at_time TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN target_source_at_time TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN target_rule_id TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN target_match_level TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN target_classification_at_time TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN quota_bucket_at_time TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_segments_v1_profile_target_date
  ON usage_segments_v1 (profile_id, managed_target_id, date);

CREATE INDEX IF NOT EXISTS idx_usage_segments_v1_profile_quota_date
  ON usage_segments_v1 (profile_id, quota_bucket_at_time, date);

CREATE TABLE IF NOT EXISTS target_stats_v1 (
  id                                TEXT PRIMARY KEY,
  profile_id                        TEXT NOT NULL,
  device_id                         TEXT NOT NULL,
  date                              TEXT NOT NULL,
  timezone                          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  day_start_ms                      INTEGER,
  day_end_ms                        INTEGER,
  target_key                        TEXT NOT NULL,
  managed_target_id                 TEXT,
  managed_target_type               TEXT,
  managed_target_namespace          TEXT,
  managed_target_value              TEXT,
  managed_target_label_at_time      TEXT,
  target_source_at_time             TEXT,
  target_rule_id                    TEXT,
  target_match_level                TEXT,
  target_classification_at_time     TEXT,
  fallback_domain                   TEXT,
  is_fallback                       INTEGER NOT NULL DEFAULT 0,
  channel                           TEXT NOT NULL,
  mode                              TEXT NOT NULL,
  quota_bucket                      TEXT NOT NULL,
  duration_seconds                  INTEGER NOT NULL,
  segments_count                    INTEGER,
  last_segment_id                   TEXT,
  first_seen_at                     INTEGER,
  last_seen_at                      INTEGER,
  created_at                        INTEGER NOT NULL,
  updated_at                        INTEGER NOT NULL,

  UNIQUE (profile_id, device_id, date, target_key, channel, mode, quota_bucket)
);

CREATE INDEX IF NOT EXISTS idx_target_stats_v1_profile_date
  ON target_stats_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_target_stats_v1_profile_device_date
  ON target_stats_v1 (profile_id, device_id, date);

CREATE INDEX IF NOT EXISTS idx_target_stats_v1_profile_target_date
  ON target_stats_v1 (profile_id, target_key, date);

CREATE INDEX IF NOT EXISTS idx_target_stats_v1_profile_quota_date
  ON target_stats_v1 (profile_id, quota_bucket, date);

CREATE TABLE IF NOT EXISTS hourly_target_stats_v1 (
  id                                TEXT PRIMARY KEY,
  profile_id                        TEXT NOT NULL,
  device_id                         TEXT NOT NULL,
  hour_key                          TEXT NOT NULL,
  date                              TEXT NOT NULL,
  hour                              INTEGER NOT NULL,
  timezone                          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  hour_start_ms                     INTEGER,
  hour_end_ms                       INTEGER,
  target_key                        TEXT NOT NULL,
  managed_target_id                 TEXT,
  managed_target_type               TEXT,
  managed_target_namespace          TEXT,
  managed_target_value              TEXT,
  managed_target_label_at_time      TEXT,
  target_source_at_time             TEXT,
  target_rule_id                    TEXT,
  target_match_level                TEXT,
  target_classification_at_time     TEXT,
  fallback_domain                   TEXT,
  is_fallback                       INTEGER NOT NULL DEFAULT 0,
  channel                           TEXT NOT NULL,
  mode                              TEXT NOT NULL,
  quota_bucket                      TEXT NOT NULL,
  duration_seconds                  INTEGER NOT NULL,
  segments_count                    INTEGER,
  last_segment_id                   TEXT,
  first_seen_at                     INTEGER,
  last_seen_at                      INTEGER,
  created_at                        INTEGER NOT NULL,
  updated_at                        INTEGER NOT NULL,

  UNIQUE (profile_id, device_id, hour_key, target_key, channel, mode, quota_bucket)
);

CREATE INDEX IF NOT EXISTS idx_hourly_target_stats_v1_profile_hour
  ON hourly_target_stats_v1 (profile_id, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_target_stats_v1_profile_device_hour
  ON hourly_target_stats_v1 (profile_id, device_id, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_target_stats_v1_profile_target_hour
  ON hourly_target_stats_v1 (profile_id, target_key, hour_key);

CREATE INDEX IF NOT EXISTS idx_hourly_target_stats_v1_profile_quota_hour
  ON hourly_target_stats_v1 (profile_id, quota_bucket, hour_key);
