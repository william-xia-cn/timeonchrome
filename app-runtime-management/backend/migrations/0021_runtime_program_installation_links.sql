-- 扫描事实引用，不生成产品归属或原始用量；仅additive，不回填旧数据。
CREATE TABLE runtime_program_installation_links_v1 (
  machine_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  assignment_version INTEGER NOT NULL,
  variant_key TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  PRIMARY KEY(machine_id,scan_id,variant_key,instance_id),
  FOREIGN KEY(machine_id,scan_id) REFERENCES runtime_application_inventory_scans_v2(machine_id,scan_id),
  FOREIGN KEY(child_id,machine_id,instance_id,local_user_id,assignment_version)
    REFERENCES runtime_program_instance_scopes_v1(child_id,machine_id,instance_id,local_user_id,assignment_version)
);

CREATE INDEX runtime_program_installation_child_instance_v1
ON runtime_program_installation_links_v1(child_id,machine_id,instance_id,variant_key);

CREATE TRIGGER runtime_program_installation_scope_v1
BEFORE INSERT ON runtime_program_installation_links_v1
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM runtime_application_inventory_scans_v2 s
    WHERE s.machine_id=NEW.machine_id AND s.scan_id=NEW.scan_id AND s.local_user_id<>NEW.local_user_id
  ) OR EXISTS (
    SELECT 1 FROM runtime_program_installation_links_v1 l
    WHERE l.machine_id=NEW.machine_id AND l.scan_id=NEW.scan_id
      AND (l.child_id<>NEW.child_id OR l.local_user_id<>NEW.local_user_id OR l.assignment_version<>NEW.assignment_version)
  ) THEN RAISE(ABORT,'PROGRAM_INSTALLATION_SCOPE_CONFLICT') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM runtime_application_inventory_scans_v2 s
    JOIN runtime_application_inventory_scan_batches_v2 b ON b.machine_id=s.machine_id AND b.scan_id=s.scan_id
    JOIN json_each(b.observation_keys_json) k
    WHERE s.machine_id=NEW.machine_id AND s.scan_id=NEW.scan_id AND s.local_user_id=NEW.local_user_id
      AND k.value='v'||char(10)||NEW.local_user_id||char(10)||NEW.variant_key
  ) OR NOT EXISTS (
    SELECT 1 FROM runtime_program_instance_scopes_v1 p
    WHERE p.child_id=NEW.child_id AND p.machine_id=NEW.machine_id AND p.instance_id=NEW.instance_id
      AND p.local_user_id=NEW.local_user_id AND p.assignment_version=NEW.assignment_version
  ) THEN RAISE(ABORT,'PROGRAM_INSTALLATION_DEPENDENCIES_PENDING') END);
END;

CREATE TRIGGER runtime_program_installation_immutable_v1
BEFORE UPDATE ON runtime_program_installation_links_v1
BEGIN
  SELECT RAISE(ABORT,'PROGRAM_INSTALLATION_IMMUTABLE');
END;
