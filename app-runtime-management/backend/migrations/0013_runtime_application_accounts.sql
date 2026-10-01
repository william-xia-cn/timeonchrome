 -- D-113：派生统计接收区与持久化兼容读模型；receipt 不等于发布。
PRAGMA foreign_keys = ON;
-- 只新增索引，不改变原始事实。水位查询使用与谓词一致的表达式索引。
CREATE INDEX runtime_application_statistics_source_time_idx ON runtime_usage_segments_v2(
  child_id,diagnostic,COALESCE(start_wall_time_ms,start_at_ms),COALESCE(end_wall_time_ms,end_at_ms),
  machine_id,local_user_id,uploaded_at_ms
);
CREATE TABLE runtime_application_account_manifests_v1 (
  id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  manifest_hash TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','received')),
  created_at_ms INTEGER NOT NULL,
  received_at_ms INTEGER,
  UNIQUE(machine_id,local_user_id,assignment_version,date,revision),
  FOREIGN KEY(machine_id,local_user_id,assignment_version)
    REFERENCES runtime_user_assignments_v2(machine_id,local_user_id,assignment_version) ON DELETE CASCADE
);
CREATE INDEX runtime_application_account_manifests_scope_idx
  ON runtime_application_account_manifests_v1(machine_id,local_user_id,assignment_version,date,revision DESC);
CREATE TABLE runtime_application_account_chunks_v1 (
  manifest_id TEXT NOT NULL REFERENCES runtime_application_account_manifests_v1(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0 AND chunk_index < 100),
  chunk_hash TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  PRIMARY KEY(manifest_id,chunk_index)
);
CREATE TABLE runtime_application_account_receipts_v1 (
  machine_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  date TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  manifest_id TEXT NOT NULL REFERENCES runtime_application_account_manifests_v1(id) ON DELETE CASCADE,
  received_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id,local_user_id,assignment_version,date),
  FOREIGN KEY(machine_id,local_user_id,assignment_version)
    REFERENCES runtime_user_assignments_v2(machine_id,local_user_id,assignment_version) ON DELETE CASCADE
);

CREATE TABLE runtime_application_statistics_days_v1 (
  scope_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  from_ms INTEGER NOT NULL,
  to_ms INTEGER NOT NULL,
  source_revision TEXT NOT NULL,
  producer TEXT NOT NULL CHECK(producer IN ('legacy-server','native')),
  value_json TEXT NOT NULL,
  computed_at_ms INTEGER NOT NULL,
  PRIMARY KEY(scope_key,date)
);
CREATE INDEX runtime_application_statistics_child_date_idx
  ON runtime_application_statistics_days_v1(account_id,child_id,date,scope_key);
CREATE TABLE runtime_application_statistics_queue_v1 (
  scope_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  from_ms INTEGER NOT NULL,
  to_ms INTEGER NOT NULL,
  source_revision TEXT NOT NULL,
  requested_at_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  PRIMARY KEY(scope_key,date)
);
CREATE INDEX runtime_application_statistics_queue_ready_idx
  ON runtime_application_statistics_queue_v1(retry_at_ms,requested_at_ms);

CREATE TABLE runtime_application_account_publications_v1 (
  machine_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  revision INTEGER NOT NULL,
  manifest_id TEXT NOT NULL REFERENCES runtime_application_account_manifests_v1(id) ON DELETE CASCADE,
  source_revision TEXT NOT NULL,
  published_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id,local_user_id,assignment_version,date),
  FOREIGN KEY(machine_id,local_user_id,assignment_version)
    REFERENCES runtime_user_assignments_v2(machine_id,local_user_id,assignment_version) ON DELETE CASCADE
);
CREATE INDEX runtime_application_account_publications_child_idx
  ON runtime_application_account_publications_v1(account_id,child_id,date);
CREATE TABLE runtime_application_account_publication_checks_v1 (
  manifest_id TEXT PRIMARY KEY NOT NULL REFERENCES runtime_application_account_manifests_v1(id) ON DELETE CASCADE,
  checked_at_ms INTEGER NOT NULL,
  error_code TEXT,
  source_revision TEXT NOT NULL
);
