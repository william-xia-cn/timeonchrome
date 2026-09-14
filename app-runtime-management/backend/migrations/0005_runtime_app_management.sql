PRAGMA foreign_keys = ON;

ALTER TABLE runtime_usage_segments_v2 ADD COLUMN app_policy_version INTEGER;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN application_classification TEXT;
ALTER TABLE runtime_usage_segments_v2 ADD COLUMN quota_bucket TEXT;

CREATE TABLE runtime_child_app_policy_versions_v1 (
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  effective_at_ms INTEGER NOT NULL CHECK(effective_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  PRIMARY KEY(account_id, child_id, version)
);

CREATE INDEX runtime_child_app_policy_versions_v1_current_idx
  ON runtime_child_app_policy_versions_v1(account_id, child_id, version DESC);

CREATE TABLE runtime_app_classification_history_v1 (
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'macos')),
  runtime_identity TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK(policy_version > 0),
  classification TEXT NOT NULL CHECK(classification IN (
    'study', 'composite', 'restrictedEntertainment', 'unclassified', 'blocked'
  )),
  display_name TEXT,
  effective_at_ms INTEGER NOT NULL CHECK(effective_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  PRIMARY KEY(account_id, child_id, platform, runtime_identity, policy_version)
);

CREATE INDEX runtime_app_classification_history_v1_lookup_idx
  ON runtime_app_classification_history_v1(
    account_id, child_id, platform, runtime_identity, policy_version DESC
  );

CREATE INDEX runtime_usage_segments_v2_app_policy_idx
  ON runtime_usage_segments_v2(
    child_id, platform, runtime_identity, app_policy_version, application_classification,
    start_wall_time_ms, end_wall_time_ms
  );
