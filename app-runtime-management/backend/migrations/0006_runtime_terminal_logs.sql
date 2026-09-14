CREATE TABLE runtime_machine_logging_policy_versions_v1 (
  machine_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  min_level TEXT NOT NULL CHECK (min_level IN ('info', 'warning', 'error')),
  categories_json TEXT NOT NULL,
  expires_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (machine_id, version),
  FOREIGN KEY (machine_id) REFERENCES runtime_machines_v2(id) ON DELETE CASCADE
);

CREATE TABLE runtime_terminal_logs_v1 (
  machine_id TEXT NOT NULL,
  id TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  category TEXT NOT NULL CHECK (category IN ('service', 'session', 'policy', 'upload', 'storage', 'security', 'accounting')),
  event_code TEXT NOT NULL,
  module TEXT NOT NULL,
  message_code TEXT NOT NULL,
  details_json TEXT NOT NULL,
  service_version TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  uploaded_at_ms INTEGER NOT NULL,
  PRIMARY KEY (machine_id, id),
  FOREIGN KEY (machine_id) REFERENCES runtime_machines_v2(id) ON DELETE CASCADE
);

CREATE INDEX idx_runtime_logging_policy_machine_latest_v1
  ON runtime_machine_logging_policy_versions_v1(machine_id, version DESC);
CREATE INDEX idx_runtime_terminal_logs_machine_time_v1
  ON runtime_terminal_logs_v1(machine_id, observed_at_ms DESC, id DESC);
CREATE INDEX idx_runtime_terminal_logs_level_category_time_v1
  ON runtime_terminal_logs_v1(level, category, observed_at_ms DESC);
