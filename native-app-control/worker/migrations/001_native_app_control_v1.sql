PRAGMA foreign_keys = ON;

CREATE TABLE native_children_v1 (
  child_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  display_name TEXT,
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_native_children_account
  ON native_children_v1(account_id, child_id);

CREATE TABLE native_macs_v1 (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
  desired_policy_version INTEGER NOT NULL DEFAULT 1,
  downloaded_policy_version INTEGER NOT NULL DEFAULT 0,
  applied_policy_version INTEGER NOT NULL DEFAULT 0,
  santa_machine_hash TEXT,
  hostname TEXT,
  serial_number TEXT,
  primary_user TEXT,
  os_version TEXT,
  santa_version TEXT,
  last_preflight_at INTEGER,
  last_event_upload_at INTEGER,
  last_rule_download_at INTEGER,
  last_postflight_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE
);

CREATE INDEX idx_native_macs_child
  ON native_macs_v1(child_id, status, updated_at);

CREATE TABLE santa_enrollments_v1 (
  id TEXT PRIMARY KEY,
  native_mac_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
  expires_at INTEGER,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(native_mac_id) REFERENCES native_macs_v1(id) ON DELETE CASCADE
);

CREATE INDEX idx_santa_enrollments_mac
  ON santa_enrollments_v1(native_mac_id, status);

CREATE TABLE application_identities_v1 (
  id TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('SIGNINGID', 'CDHASH', 'BINARY')),
  identifier TEXT NOT NULL,
  team_id TEXT,
  signing_id TEXT,
  cdhash TEXT,
  sha256 TEXT,
  bundle_id TEXT,
  bundle_path TEXT,
  name TEXT,
  publisher TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE account_applications_v1 (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  auto_group_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  publisher TEXT,
  team_id TEXT,
  top_level_bundle_id TEXT,
  merged_into_application_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(account_id, auto_group_key),
  FOREIGN KEY(merged_into_application_id) REFERENCES account_applications_v1(id) ON DELETE SET NULL
);

CREATE INDEX idx_account_applications_account
  ON account_applications_v1(account_id, merged_into_application_id, updated_at);

CREATE TABLE application_memberships_v1 (
  application_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  membership_source TEXT NOT NULL CHECK(membership_source IN ('automatic', 'manual')),
  merged_from_application_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(application_id, identity_id),
  FOREIGN KEY(application_id) REFERENCES account_applications_v1(id) ON DELETE CASCADE,
  FOREIGN KEY(identity_id) REFERENCES application_identities_v1(id) ON DELETE CASCADE,
  FOREIGN KEY(merged_from_application_id) REFERENCES account_applications_v1(id) ON DELETE CASCADE
);

CREATE TABLE application_observations_v1 (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  native_mac_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  first_observed_at INTEGER NOT NULL,
  last_observed_at INTEGER NOT NULL,
  sample_path TEXT,
  executing_user TEXT,
  decision TEXT,
  bundle_hash TEXT,
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE,
  FOREIGN KEY(native_mac_id) REFERENCES native_macs_v1(id) ON DELETE CASCADE,
  FOREIGN KEY(identity_id) REFERENCES application_identities_v1(id) ON DELETE CASCADE,
  UNIQUE(child_id, native_mac_id, identity_id)
);

CREATE INDEX idx_application_observations_child
  ON application_observations_v1(child_id, last_observed_at DESC);

CREATE INDEX idx_application_observations_bundle
  ON application_observations_v1(native_mac_id, bundle_hash, decision);

CREATE TABLE child_application_states_v1 (
  child_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'REVIEW' CHECK(state IN ('REVIEW', 'IGNORE', 'BLOCK')),
  updated_by_account_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(child_id, application_id),
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE,
  FOREIGN KEY(application_id) REFERENCES account_applications_v1(id) ON DELETE CASCADE
);

CREATE INDEX idx_child_application_states_review
  ON child_application_states_v1(child_id, state, updated_at DESC);

CREATE TABLE child_publisher_blocks_v1 (
  child_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  updated_by_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(child_id, team_id),
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE
);

CREATE TABLE native_app_audit_events_v1 (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  account_id TEXT,
  native_mac_id TEXT,
  application_id TEXT,
  event_type TEXT NOT NULL,
  result TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE
);

CREATE INDEX idx_native_app_audit_child
  ON native_app_audit_events_v1(child_id, created_at DESC);
