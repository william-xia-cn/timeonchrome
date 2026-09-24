CREATE TABLE native_app_predefined_items_v1 (
  child_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  bundle_id TEXT,
  parent_source_index INTEGER,
  target_policy TEXT NOT NULL DEFAULT 'BLOCK' CHECK(target_policy = 'BLOCK'),
  disabled_at INTEGER,
  required_policy_version INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(child_id, source, source_index),
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE
);

CREATE INDEX idx_native_predefined_bundle
  ON native_app_predefined_items_v1(child_id, bundle_id, disabled_at);

CREATE TABLE native_app_predefined_identities_v1 (
  child_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  identity_key TEXT NOT NULL,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('SIGNINGID', 'CDHASH', 'BINARY')),
  identifier TEXT NOT NULL,
  match_origin TEXT NOT NULL CHECK(match_origin IN ('santa', 'inventory', 'existing_block')),
  status TEXT NOT NULL CHECK(status IN ('AUTO', 'NEEDS_CONFIRM', 'CONFIRMED', 'REJECTED')),
  activation_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(child_id, source, source_index, identity_key),
  FOREIGN KEY(child_id, source, source_index)
    REFERENCES native_app_predefined_items_v1(child_id, source, source_index) ON DELETE CASCADE
);
