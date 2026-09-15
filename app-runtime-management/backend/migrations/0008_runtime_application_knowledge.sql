-- ARM-D-011: additive only; never updates historic usage rows.
CREATE TABLE runtime_application_knowledge_versions_v1 (
 account_id TEXT NOT NULL, version INTEGER NOT NULL, payload_json TEXT NOT NULL,
 payload_hash TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(account_id, version)
);
CREATE TABLE runtime_application_inventory_v1 (
 machine_id TEXT NOT NULL, local_user_id TEXT NOT NULL, platform TEXT NOT NULL,
 runtime_identity TEXT NOT NULL, display_name TEXT NOT NULL, evidence_json TEXT NOT NULL,
 status TEXT NOT NULL, first_seen_at_ms INTEGER NOT NULL, last_seen_at_ms INTEGER NOT NULL,
 PRIMARY KEY(machine_id, local_user_id, platform, runtime_identity)
);
CREATE INDEX runtime_application_inventory_machine ON runtime_application_inventory_v1(machine_id);
CREATE TABLE runtime_application_inventory_batches_v1 (
 machine_id TEXT NOT NULL, batch_id TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(machine_id, batch_id)
);
CREATE TABLE runtime_application_knowledge_audit_v1 (
 account_id TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL,
 previous_hash TEXT, next_hash TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(account_id, version)
);
