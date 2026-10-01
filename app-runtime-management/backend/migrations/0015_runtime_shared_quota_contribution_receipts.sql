-- D-114: durable machine contribution receipts; received is never equivalent to published.
CREATE TABLE runtime_application_shared_quota_receipts_v1 (
  machine_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  revision_ordinal INTEGER NOT NULL CHECK (revision_ordinal > 0),
  source_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id,local_user_id,assignment_version,date),
  FOREIGN KEY(machine_id,local_user_id,assignment_version)
    REFERENCES runtime_user_assignments_v2(machine_id,local_user_id,assignment_version) ON DELETE CASCADE
);
CREATE INDEX runtime_application_shared_quota_receipts_child_idx
  ON runtime_application_shared_quota_receipts_v1(account_id,child_id,date);
