-- ARM-D-014: additive product/variant inventory and per-source scan receipts.
-- Historic inventory and usage ledgers are intentionally unchanged.
CREATE TABLE runtime_installation_products_v1 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  product_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  scope TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id,local_user_id,platform,product_key)
);
CREATE INDEX runtime_installation_products_machine ON runtime_installation_products_v1(machine_id,product_key);

CREATE TABLE runtime_application_variants_v1 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  parent_product_key TEXT,
  display_name TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  variant_role TEXT NOT NULL,
  scope TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id,local_user_id,platform,variant_key)
);
CREATE INDEX runtime_application_variants_product ON runtime_application_variants_v1(machine_id,parent_product_key);

CREATE TABLE runtime_application_inventory_scans_v2 (
  machine_id TEXT NOT NULL REFERENCES runtime_machines_v2(id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  batch_count INTEGER NOT NULL,
  product_count INTEGER NOT NULL,
  variant_count INTEGER NOT NULL,
  source_results_json TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  started_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(machine_id,scan_id)
);
CREATE TABLE runtime_application_inventory_scan_batches_v2 (
  machine_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  product_count INTEGER NOT NULL,
  variant_count INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  observation_keys_json TEXT NOT NULL,
  PRIMARY KEY(machine_id,scan_id,batch_index),
  FOREIGN KEY(machine_id,scan_id) REFERENCES runtime_application_inventory_scans_v2(machine_id,scan_id) ON DELETE CASCADE
);
CREATE INDEX runtime_inventory_scan_v2_user_latest ON runtime_application_inventory_scans_v2(machine_id,local_user_id,updated_at_ms DESC);
