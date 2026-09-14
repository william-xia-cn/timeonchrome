PRAGMA foreign_keys = ON;

ALTER TABLE runtime_usage_segments_v2 ADD COLUMN accounting_schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN channel TEXT;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN activity_basis TEXT;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN clock_epoch_id TEXT;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN start_wall_time_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN end_wall_time_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN start_monotonic_time_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN end_monotonic_time_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN monotonic_duration_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN estimated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN estimate_reason TEXT;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN estimate_cap_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN last_evidence_wall_time_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN last_evidence_monotonic_time_ms INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN diagnostic INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN diagnostic_code TEXT;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN policy_snapshot_json TEXT;

CREATE INDEX runtime_usage_segments_v2_accounting_time_idx
  ON runtime_usage_segments_v2(
    child_id, accounting_schema_version, start_wall_time_ms, end_wall_time_ms,
    machine_id, local_user_id, diagnostic
  );

CREATE TABLE runtime_usage_diagnostic_segments_v2 (
  id TEXT NOT NULL,
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  child_id TEXT NOT NULL,
  runtime_session_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'macos')),
  runtime_identity TEXT,
  clock_epoch_id TEXT NOT NULL,
  wall_time_ms INTEGER NOT NULL CHECK(wall_time_ms >= 0),
  monotonic_time_ms INTEGER NOT NULL CHECK(monotonic_time_ms >= 0),
  diagnostic_code TEXT,
  content_hash TEXT NOT NULL,
  uploaded_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id, local_user_id, id)
);

CREATE INDEX runtime_usage_diagnostic_segments_v2_child_time_idx
  ON runtime_usage_diagnostic_segments_v2(child_id, wall_time_ms, machine_id, local_user_id);

CREATE TABLE runtime_media_segments_v2 (
  id TEXT NOT NULL,
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  child_id TEXT NOT NULL,
  runtime_session_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'macos')),
  runtime_identity TEXT NOT NULL,
  display_name TEXT,
  media_kind TEXT NOT NULL CHECK(media_kind IN ('audio', 'video')),
  presentation TEXT NOT NULL CHECK(presentation IN ('foreground', 'background', 'pip')),
  clock_epoch_id TEXT NOT NULL,
  start_wall_time_ms INTEGER NOT NULL CHECK(start_wall_time_ms >= 0),
  end_wall_time_ms INTEGER NOT NULL CHECK(end_wall_time_ms >= start_wall_time_ms),
  start_monotonic_time_ms INTEGER NOT NULL CHECK(start_monotonic_time_ms >= 0),
  end_monotonic_time_ms INTEGER NOT NULL CHECK(end_monotonic_time_ms >= start_monotonic_time_ms),
  monotonic_duration_ms INTEGER NOT NULL
    CHECK(monotonic_duration_ms = end_monotonic_time_ms - start_monotonic_time_ms),
  end_reason TEXT NOT NULL,
  estimated INTEGER NOT NULL CHECK(estimated IN (0, 1)),
  estimate_reason TEXT,
  estimate_cap_ms INTEGER,
  last_evidence_wall_time_ms INTEGER NOT NULL,
  last_evidence_monotonic_time_ms INTEGER NOT NULL,
  authoritative_for_usage INTEGER NOT NULL DEFAULT 0 CHECK(authoritative_for_usage = 0),
  content_hash TEXT NOT NULL,
  uploaded_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id, local_user_id, id)
);

CREATE INDEX runtime_media_segments_v2_child_time_idx
  ON runtime_media_segments_v2(
    child_id, start_wall_time_ms, end_wall_time_ms, machine_id, local_user_id
  );
