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
  completion_source TEXT CHECK (completion_source IS NULL OR completion_source IN ('task_progress', 'parent', 'external')),
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
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'paused', 'resumed', 'completed', 'cancelled', 'auto_completed')),
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

CREATE TABLE IF NOT EXISTS task_progress_segments_v1 (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  seconds INTEGER NOT NULL CHECK (seconds > 0 AND seconds <= 90),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks_v1(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);
CREATE INDEX IF NOT EXISTS idx_task_progress_segments_v1_task_time
  ON task_progress_segments_v1 (task_id, started_at, ended_at);
CREATE INDEX IF NOT EXISTS idx_task_progress_segments_v1_profile_time
  ON task_progress_segments_v1 (profile_id, started_at, ended_at);

CREATE TABLE IF NOT EXISTS task_device_state_v1 (
  device_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  capable INTEGER NOT NULL DEFAULT 1,
  task_version INTEGER NOT NULL DEFAULT 0,
  active_summary_json TEXT,
  reported_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_task_device_state_v1_profile_reported
  ON task_device_state_v1 (profile_id, reported_at);