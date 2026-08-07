-- Task Management V1 device capability metadata.
-- Records whether a bound device has reported support for taskManagementV1.
-- Not applied to production until Product Owner authorizes the task rollout migration.

-- Superseded: capability is stored in task_device_state_v1.
-- Superseded: active summary is stored in task_device_state_v1.
-- Superseded: reported_at is stored in task_device_state_v1.
-- Superseded: task_version is stored in task_device_state_v1.
-- Superseded: active_summary_json is stored in task_device_state_v1.

-- Superseded index:
-- capability lookup uses task_device_state_v1.