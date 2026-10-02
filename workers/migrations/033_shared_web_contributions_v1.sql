-- D-114 独立派生贡献与水位；不修改网页原账、原统计或原上传确认。
CREATE TABLE shared_web_contribution_receipts_v1 (
  account_id TEXT NOT NULL, profile_id TEXT NOT NULL, device_id TEXT NOT NULL,
  date TEXT NOT NULL, revision_ordinal INTEGER NOT NULL CHECK(revision_ordinal > 0),
  content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
  payload_json TEXT NOT NULL, received_at INTEGER NOT NULL,
  PRIMARY KEY(account_id, profile_id, device_id, date, revision_ordinal)
);
CREATE TABLE shared_web_contribution_heads_v1 (
  account_id TEXT NOT NULL, profile_id TEXT NOT NULL, device_id TEXT NOT NULL,
  date TEXT NOT NULL, revision_ordinal INTEGER NOT NULL CHECK(revision_ordinal > 0),
  content_hash TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(account_id, profile_id, device_id, date)
);
CREATE INDEX shared_web_contribution_child_day ON shared_web_contribution_heads_v1(account_id,profile_id,date,device_id);
CREATE TABLE shared_web_source_challenges_v1 (
  challenge_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, profile_id TEXT NOT NULL,
  machine_id TEXT NOT NULL, local_user_id TEXT NOT NULL, assignment_version INTEGER NOT NULL,
  application_source_key TEXT NOT NULL, connection_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  device_id TEXT, web_source_key TEXT, binding_epoch_hash TEXT
);
CREATE INDEX shared_web_source_challenge_expiry ON shared_web_source_challenges_v1(expires_at);
