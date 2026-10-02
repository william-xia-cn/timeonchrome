-- D-114: additive history for explicit other-time classification.
-- The v1 table and all existing classification/usage rows remain untouched.
CREATE TABLE runtime_app_classification_history_other_v1 (
  account_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'macos')),
  runtime_identity TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK(policy_version > 0),
  classification TEXT NOT NULL CHECK(classification = 'other'),
  display_name TEXT,
  effective_at_ms INTEGER NOT NULL CHECK(effective_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  PRIMARY KEY(account_id, child_id, platform, runtime_identity, policy_version)
);
CREATE INDEX runtime_app_classification_history_other_v1_lookup_idx
  ON runtime_app_classification_history_other_v1(
    account_id, child_id, platform, runtime_identity, policy_version DESC
  );
