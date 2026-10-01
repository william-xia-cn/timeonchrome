-- D-113：派生统计接收区。只有接收水位，不作为产品统计或配额读取头。
PRAGMA foreign_keys = ON;
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
