-- Task Management V1 device capability metadata.
-- Records whether a bound device has reported support for taskManagementV1.
-- Not applied to production until Product Owner authorizes the task rollout migration.

ALTER TABLE devices ADD COLUMN task_management_v1_capable INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN task_capabilities_json TEXT;
ALTER TABLE devices ADD COLUMN task_capability_reported_at INTEGER;
ALTER TABLE devices ADD COLUMN task_sync_version INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN task_active_summary_json TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_profile_task_capability
  ON devices(profile_id, status, last_seen, task_management_v1_capable);