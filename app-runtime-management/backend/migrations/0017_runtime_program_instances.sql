-- 程序实例身份改造：仅新增结构，不迁移或改写原账与旧目录。
CREATE TABLE runtime_program_instances_v1 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id),
  instance_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL CHECK(json_valid(descriptor_json)),
  evidence_revision INTEGER NOT NULL CHECK(evidence_revision >= 1),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  evidence_hash TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id, instance_id)
);

-- 一份实例可有多个已核验的孩子使用/管理范围；不得从机器盘点推导全部孩子。
CREATE TRIGGER runtime_program_instance_revision_conflict_v1
BEFORE INSERT ON runtime_program_instances_v1
WHEN EXISTS (SELECT 1 FROM runtime_program_instances_v1 p
  WHERE p.machine_id=NEW.machine_id AND p.instance_id=NEW.instance_id
    AND (p.descriptor_json<>NEW.descriptor_json OR
      (p.evidence_revision=NEW.evidence_revision AND p.evidence_hash<>NEW.evidence_hash)))
BEGIN
  SELECT RAISE(ABORT,'PROGRAM_INSTANCE_REVISION_CONFLICT');
END;

CREATE TABLE runtime_program_instance_scopes_v1 (
  child_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  PRIMARY KEY(child_id, machine_id, instance_id, local_user_id, assignment_version),
  FOREIGN KEY(machine_id, instance_id) REFERENCES runtime_program_instances_v1(machine_id, instance_id),
  FOREIGN KEY(machine_id, local_user_id, assignment_version)
    REFERENCES runtime_user_assignments_v2(machine_id, local_user_id, assignment_version)
);

-- 第三层唯一结果；来源为规则执行，非家长直接写入接口。
CREATE TABLE runtime_program_instance_mappings_v1 (
  child_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  rule_set_version INTEGER NOT NULL CHECK(rule_set_version >= 0),
  evidence_revision INTEGER NOT NULL CHECK(evidence_revision >= 1),
  status TEXT NOT NULL CHECK(status IN ('confirmed','unresolved','conflict')),
  product_id TEXT,
  rule_ids_json TEXT NOT NULL CHECK(json_valid(rule_ids_json) AND json_type(rule_ids_json) = 'array'),
  PRIMARY KEY(child_id, machine_id, instance_id),
  FOREIGN KEY(machine_id, instance_id) REFERENCES runtime_program_instances_v1(machine_id, instance_id),
  CHECK((status = 'confirmed' AND product_id IS NOT NULL AND length(product_id) > 0)
     OR (status IN ('unresolved','conflict') AND product_id IS NULL))
);

CREATE TRIGGER runtime_program_instance_scope_insert_v1
BEFORE INSERT ON runtime_program_instance_scopes_v1
WHEN NOT EXISTS (SELECT 1 FROM runtime_user_assignments_v2 a
  WHERE a.machine_id=NEW.machine_id AND a.local_user_id=NEW.local_user_id
    AND a.assignment_version=NEW.assignment_version AND a.child_id=NEW.child_id AND a.protected=1)
BEGIN
  SELECT RAISE(ABORT,'PROGRAM_INSTANCE_CHILD_SCOPE_MISMATCH');
END;

CREATE TRIGGER runtime_program_instance_scope_immutable_v1
BEFORE UPDATE ON runtime_program_instance_scopes_v1
BEGIN
  SELECT RAISE(ABORT,'PROGRAM_INSTANCE_SCOPE_IMMUTABLE');
END;

CREATE TRIGGER runtime_program_instance_mapping_scope_v1
BEFORE INSERT ON runtime_program_instance_mappings_v1
WHEN NOT EXISTS (SELECT 1 FROM runtime_program_instance_scopes_v1 s
  WHERE s.child_id=NEW.child_id AND s.machine_id=NEW.machine_id AND s.instance_id=NEW.instance_id)
BEGIN
  SELECT RAISE(ABORT,'PROGRAM_INSTANCE_SCOPE_MISSING');
END;

CREATE TRIGGER runtime_program_instance_mapping_key_v1
BEFORE UPDATE OF child_id,machine_id,instance_id ON runtime_program_instance_mappings_v1
WHEN OLD.child_id<>NEW.child_id OR OLD.machine_id<>NEW.machine_id OR OLD.instance_id<>NEW.instance_id
BEGIN
  SELECT RAISE(ABORT,'PROGRAM_INSTANCE_MAPPING_KEY_IMMUTABLE');
END;
