CREATE TABLE native_app_inventory_snapshots_v1 (
  id TEXT PRIMARY KEY,
  native_mac_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  application_count INTEGER NOT NULL,
  FOREIGN KEY(native_mac_id) REFERENCES native_macs_v1(id) ON DELETE CASCADE,
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE
);

CREATE TABLE native_app_inventory_entries_v1 (
  snapshot_id TEXT NOT NULL,
  inventory_key TEXT NOT NULL,
  application_id TEXT,
  identity_key TEXT,
  display_name TEXT NOT NULL,
  bundle_id TEXT,
  team_id TEXT,
  signature_status TEXT,
  source_category TEXT,
  PRIMARY KEY(snapshot_id, inventory_key),
  FOREIGN KEY(snapshot_id) REFERENCES native_app_inventory_snapshots_v1(id) ON DELETE CASCADE,
  FOREIGN KEY(application_id) REFERENCES account_applications_v1(id) ON DELETE SET NULL
);

CREATE INDEX idx_native_app_inventory_entries_application
  ON native_app_inventory_entries_v1(application_id);

ALTER TABLE native_macs_v1 ADD COLUMN inventory_snapshot_id TEXT;
