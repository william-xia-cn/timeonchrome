-- 仅独立应用对象和身份派生投影；不修改任何原账、配对或旧策略。
CREATE TABLE runtime_native_application_objects_v1 (
 child_id TEXT NOT NULL,machine_id TEXT NOT NULL,local_user_id TEXT NOT NULL,assignment_version INTEGER NOT NULL,
 native_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),payload_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),received_at_ms INTEGER NOT NULL,
 PRIMARY KEY(child_id,machine_id,local_user_id,assignment_version,native_id)
);
CREATE TRIGGER runtime_native_object_scope_v1 BEFORE INSERT ON runtime_native_application_objects_v1
WHEN NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 a JOIN runtime_machines_v2 m ON m.id=a.machine_id
 WHERE a.machine_id=NEW.machine_id AND a.local_user_id=NEW.local_user_id AND a.child_id=NEW.child_id
 AND a.assignment_version=NEW.assignment_version AND a.protected=1 AND m.revoked_at_ms IS NULL
 AND a.assignment_version=(SELECT MAX(assignment_version) FROM runtime_user_assignments_v2
 WHERE machine_id=NEW.machine_id AND local_user_id=NEW.local_user_id))
BEGIN SELECT RAISE(ABORT,'NATIVE_APPLICATION_SCOPE_CHANGED'); END;
CREATE TRIGGER runtime_native_object_revision_v1 BEFORE INSERT ON runtime_native_application_objects_v1
WHEN EXISTS(SELECT 1 FROM runtime_native_application_objects_v1 n WHERE n.child_id=NEW.child_id
 AND n.machine_id=NEW.machine_id AND n.local_user_id=NEW.local_user_id AND n.assignment_version=NEW.assignment_version
 AND n.native_id=NEW.native_id AND n.revision=NEW.revision AND n.payload_hash<>NEW.payload_hash)
BEGIN SELECT RAISE(ABORT,'NATIVE_APPLICATION_REVISION_CONFLICT'); END;
CREATE TABLE runtime_native_application_projections_v1 (
 manifest_id TEXT NOT NULL,revision INTEGER NOT NULL,projection_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),received_at_ms INTEGER NOT NULL,
 PRIMARY KEY(manifest_id,revision),
 FOREIGN KEY(manifest_id) REFERENCES runtime_application_account_manifests_v1(id)
);
