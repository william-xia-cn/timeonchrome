-- Migration 003: composite_sessions and session_appeals tables
-- Phase 1 of time management redesign: three-category model

CREATE TABLE IF NOT EXISTS composite_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  device_id TEXT,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time INTEGER NOT NULL, -- Unix ms
  duration INTEGER NOT NULL,   -- 秒
  classification TEXT,         -- null / 'study' / 'rest'
  classified_by TEXT,          -- null / 'parent' / 'rule'
  classified_at INTEGER,       -- 审核时间
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_cs_profile_date ON composite_sessions(profile_id, date);

CREATE TABLE IF NOT EXISTS session_appeals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',  -- pending / upheld / overturned
  original_classification TEXT,
  new_classification TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES composite_sessions(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_appeals_profile ON session_appeals(profile_id, status);
