-- Migration 004: usage_segments_v1
-- Stats Storage Foundation — durable settled segment ledger
-- Cloud retention: 2 years (730 days), no automatic cleanup yet
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/004_usage_segments_v1.sql

CREATE TABLE IF NOT EXISTS usage_segments_v1 (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL,
  device_id           TEXT,
  date                TEXT NOT NULL,          -- YYYY-MM-DD, 设备本地日期
  timezone            TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  day_start_ms        INTEGER NOT NULL,       -- 本地 00:00:00 epoch ms
  day_end_ms          INTEGER NOT NULL,       -- 本地 23:59:59.999 epoch ms
  start_ms            INTEGER NOT NULL,       -- segment 开始 epoch ms
  end_ms              INTEGER NOT NULL,       -- segment 结束 epoch ms
  duration_seconds    INTEGER NOT NULL,       -- 时长（秒）
  domain              TEXT NOT NULL,          -- 归一化域名
  channel             TEXT NOT NULL,          -- active / backgroundMedia / pip
  mode                TEXT NOT NULL,          -- study / rest / paused / unknown / composite
  source_state        TEXT,                   -- ACTIVE / BACKGROUND_ACTIVE / PIP_ACTIVE
  settlement_reason   TEXT,                   -- transition_complete / session_expired / recovery_gap_close / tab_close / monitoring_off / cross_day_boundary / mode_switch
  parent_segment_id   TEXT,                   -- 跨日拆分的父 segment ID
  part_index          INTEGER NOT NULL DEFAULT 1,
  part_count          INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,       -- 本地创建时间 epoch ms
  updated_at          INTEGER NOT NULL,       -- 最后更新时间 epoch ms
  uploaded_at         INTEGER                 -- 上传到云端的时间 epoch ms（NULL = 未上传）
);

CREATE INDEX IF NOT EXISTS idx_usage_segments_profile_date
  ON usage_segments_v1 (profile_id, date);

CREATE INDEX IF NOT EXISTS idx_usage_segments_profile_domain_date
  ON usage_segments_v1 (profile_id, domain, date);

CREATE INDEX IF NOT EXISTS idx_usage_segments_profile_channel_date
  ON usage_segments_v1 (profile_id, channel, date);

CREATE INDEX IF NOT EXISTS idx_usage_segments_profile_mode_date
  ON usage_segments_v1 (profile_id, mode, date);

CREATE INDEX IF NOT EXISTS idx_usage_segments_profile_device_date
  ON usage_segments_v1 (profile_id, device_id, date);
