-- ARM-D-012: additive scan receipts, old observations and usage history are unchanged.
CREATE TABLE runtime_application_inventory_scans_v1 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  batch_count INTEGER NOT NULL,
  observation_count INTEGER NOT NULL,
  failed_sources_json TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  started_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id, scan_id)
);
CREATE TABLE runtime_application_inventory_scan_batches_v1 (
  machine_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  observation_count INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  observation_keys_json TEXT NOT NULL,
  PRIMARY KEY(machine_id, scan_id, batch_index),
  FOREIGN KEY(machine_id,scan_id) REFERENCES runtime_application_inventory_scans_v1(machine_id,scan_id) ON DELETE CASCADE
);
CREATE INDEX runtime_inventory_scan_user_latest ON runtime_application_inventory_scans_v1(machine_id,local_user_id,updated_at_ms DESC);
