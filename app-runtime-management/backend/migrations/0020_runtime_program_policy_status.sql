-- 最新诊断快照，不是执行账本；不修改用量或策略。
CREATE TABLE runtime_program_policy_status_v1 (
  machine_id TEXT PRIMARY KEY NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  received_at_ms INTEGER NOT NULL
);
