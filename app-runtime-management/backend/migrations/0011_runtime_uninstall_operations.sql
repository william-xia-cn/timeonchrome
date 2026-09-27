-- 结果插入、消费码、撤销机器属于同一 SQLite 语句；任意失败全部回滚。
CREATE TABLE runtime_uninstall_operations_v1 (
  operation_id TEXT PRIMARY KEY NOT NULL,
  machine_id TEXT NOT NULL UNIQUE REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose = 'uninstall'),
  code_hash TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  confirmation_secret_hash TEXT NOT NULL,
  committed_at_ms INTEGER NOT NULL,
  proof_expires_at_ms INTEGER NOT NULL
);

CREATE TRIGGER runtime_uninstall_commit_v1 AFTER INSERT ON runtime_uninstall_operations_v1
BEGIN
  UPDATE runtime_uninstall_codes_v2 SET consumed_at_ms=NEW.committed_at_ms
    WHERE code_hash=NEW.code_hash AND machine_id=NEW.machine_id AND account_id=NEW.account_id
      AND consumed_at_ms IS NULL AND expires_at_ms>=NEW.committed_at_ms;
  SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT, 'UNINSTALL_ATOMIC_CODE') END;
  UPDATE runtime_machines_v2 SET revoked_at_ms=NEW.committed_at_ms, updated_at_ms=NEW.committed_at_ms
    WHERE id=NEW.machine_id AND account_id=NEW.account_id AND revoked_at_ms IS NULL;
  SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT, 'UNINSTALL_ATOMIC_MACHINE') END;
END;
