-- Migration 021: task_management_v1
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/021_task_management_v1.sql

CREATE TABLE IF NOT EXISTS tasks_v1 (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  planned_start_at INTEGER NOT NULL,
  display_timezone TEXT,
  required_seconds INTEGER NOT NULL CHECK (required_seconds >= 60 AND required_seconds <= 86400),
  resource_spec_json TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'open' CHECK (lifecycle_status IN ('open', 'paused', 'completed', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1,
  completed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (completed_seconds >= 0),
  completion_source TEXT CHECK (completion_source IS NULL OR completion_source IN ('usage', 'parent', 'external')),
  completed_at INTEGER,
  cancelled_at INTEGER,
  created_by_account_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_v1_profile_lifecycle_start
  ON tasks_v1 (profile_id, lifecycle_status, planned_start_at);

CREATE INDEX IF NOT EXISTS idx_tasks_v1_profile_updated
  ON tasks_v1 (profile_id, updated_at);

CREATE TABLE IF NOT EXISTS task_events_v1 (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'edited', 'paused', 'resumed', 'completed', 'cancelled')),
  task_revision INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('parent', 'device', 'external', 'system')),
  source_id TEXT,
  payload_json TEXT,
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks_v1(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_task_events_v1_profile_time
  ON task_events_v1 (profile_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_task_events_v1_task_time
  ON task_events_v1 (task_id, occurred_at);

ALTER TABLE usage_segments_v1 ADD COLUMN matched_task_ids_at_time TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN progress_task_id_at_time TEXT;
ALTER TABLE usage_segments_v1 ADD COLUMN task_revision_at_time INTEGER;

CREATE INDEX IF NOT EXISTS idx_usage_segments_v1_profile_task_date
  ON usage_segments_v1 (profile_id, progress_task_id_at_time, date);