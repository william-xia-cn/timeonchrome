-- Migration 006: segments_upload_log + stats_upload_log
-- Stats Storage Foundation — cloud ingest audit trails
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/006_audit_logs.sql

-- Usage segments upload audit log
CREATE TABLE IF NOT EXISTS segment_upload_log (
  id                TEXT PRIMARY KEY,
  profile_id        TEXT NOT NULL,
  device_id         TEXT,
  batch_id          TEXT,                   -- 客户端生成的批次标识符
  received_count    INTEGER NOT NULL,       -- 接收到的 segment 数量
  accepted_count    INTEGER NOT NULL,       -- 验证通过的数量
  inserted_count    INTEGER NOT NULL DEFAULT 0,
  updated_count     INTEGER NOT NULL DEFAULT 0,
  duplicate_count   INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  payload_hash      TEXT,                   -- 用于去重的序列化有效载荷的 SHA-256
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seg_upload_log_profile_created
  ON segment_upload_log (profile_id, created_at);

CREATE INDEX IF NOT EXISTS idx_seg_upload_log_device_created
  ON segment_upload_log (device_id, created_at);

-- Daily stats upload audit log
CREATE TABLE IF NOT EXISTS stats_upload_log (
  id                    TEXT PRIMARY KEY,
  profile_id            TEXT NOT NULL,
  device_id             TEXT,
  date                  TEXT,               -- 上传的日期
  received_domain_count INTEGER NOT NULL DEFAULT 0,
  received_row_count    INTEGER NOT NULL DEFAULT 0,
  upserted_count        INTEGER NOT NULL DEFAULT 0,
  failed_count          INTEGER NOT NULL DEFAULT 0,
  payload_hash          TEXT,               -- 用于去重的序列化有效载荷的 SHA-256
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stats_upload_log_profile_created
  ON stats_upload_log (profile_id, created_at);

CREATE INDEX IF NOT EXISTS idx_stats_upload_log_profile_date
  ON stats_upload_log (profile_id, date);
