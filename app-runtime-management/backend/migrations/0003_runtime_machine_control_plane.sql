PRAGMA foreign_keys = ON;

CREATE TABLE runtime_machine_pairing_codes_v2 (
  code_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  default_child_id TEXT NOT NULL,
  display_name TEXT,
  created_by_jti TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  consumed_by_machine_id TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX runtime_machine_pairing_codes_v2_expiry_idx
  ON runtime_machine_pairing_codes_v2(account_id, expires_at_ms, consumed_at_ms);

CREATE TABLE runtime_machines_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'macos')),
  token_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  default_child_id TEXT,
  desired_policy_version INTEGER NOT NULL DEFAULT 1 CHECK(desired_policy_version >= 1),
  applied_policy_version INTEGER NOT NULL DEFAULT 0 CHECK(applied_policy_version >= 0),
  policy_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(policy_state IN ('pending', 'cached', 'applied', 'failed', 'offline')),
  policy_error TEXT,
  service_version TEXT,
  os_version TEXT,
  architecture TEXT,
  last_seen_at_ms INTEGER NOT NULL,
  last_upload_at_ms INTEGER,
  last_tamper_at_ms INTEGER,
  tamper_count INTEGER NOT NULL DEFAULT 0,
  revoked_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX runtime_machines_v2_account_idx
  ON runtime_machines_v2(account_id, created_at_ms);

CREATE TABLE runtime_machine_users_v2 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  session_active INTEGER NOT NULL DEFAULT 0 CHECK(session_active IN (0, 1)),
  applied_policy_version INTEGER NOT NULL DEFAULT 0,
  policy_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(policy_state IN ('pending', 'cached', 'applied', 'failed', 'offline')),
  policy_error TEXT,
  tamper_count INTEGER NOT NULL DEFAULT 0,
  last_tamper_at_ms INTEGER,
  PRIMARY KEY(machine_id, local_user_id)
);

CREATE TABLE runtime_machine_policy_versions_v2 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id, version)
);

CREATE TABLE runtime_user_assignments_v2 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  child_id TEXT,
  protected INTEGER NOT NULL CHECK(protected IN (0, 1)),
  assignment_source TEXT NOT NULL CHECK(assignment_source IN ('default', 'override', 'unprotected')),
  effective_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id, local_user_id, assignment_version),
  CHECK((protected = 0 AND child_id IS NULL) OR protected = 1)
);

CREATE INDEX runtime_user_assignments_v2_effective_idx
  ON runtime_user_assignments_v2(machine_id, local_user_id, effective_at_ms, assignment_version);

CREATE TABLE runtime_usage_segments_v2 (
  id TEXT NOT NULL,
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  child_id TEXT NOT NULL,
  runtime_session_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'macos')),
  runtime_identity TEXT NOT NULL,
  display_name TEXT,
  start_at_ms INTEGER NOT NULL CHECK(start_at_ms >= 0),
  end_at_ms INTEGER NOT NULL CHECK(end_at_ms > start_at_ms),
  duration_ms INTEGER NOT NULL CHECK(duration_ms = end_at_ms - start_at_ms),
  end_reason TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  uploaded_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id, local_user_id, id)
);

CREATE INDEX runtime_usage_segments_v2_child_time_idx
  ON runtime_usage_segments_v2(child_id, start_at_ms, end_at_ms, machine_id, local_user_id);

CREATE TABLE runtime_app_hourly_stats_v2 (
  child_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  hour_start_ms INTEGER NOT NULL,
  runtime_identity TEXT NOT NULL,
  display_name TEXT,
  duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(child_id, machine_id, local_user_id, hour_start_ms, runtime_identity)
);

CREATE INDEX runtime_app_hourly_stats_v2_child_time_idx
  ON runtime_app_hourly_stats_v2(child_id, hour_start_ms, machine_id, local_user_id);

CREATE TABLE runtime_uninstall_codes_v2 (
  code_hash TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  created_by_jti TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX runtime_uninstall_codes_v2_expiry_idx
  ON runtime_uninstall_codes_v2(machine_id, expires_at_ms, consumed_at_ms);
