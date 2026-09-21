-- Migration 031: immutable profile config history and fallback audit trigger.

CREATE TABLE IF NOT EXISTS profile_config_history_v1 (
  id                     TEXT PRIMARY KEY,
  profile_id             TEXT NOT NULL,
  previous_version       INTEGER NOT NULL,
  version                INTEGER NOT NULL,
  config_json            TEXT NOT NULL,
  config_hash            TEXT NOT NULL,
  changed_keys_json      TEXT NOT NULL DEFAULT '[]',
  updated_by_account_id  TEXT,
  source_action          TEXT NOT NULL DEFAULT 'unattributed_update',
  request_id             TEXT,
  created_at             INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  UNIQUE (profile_id, version)
);

CREATE INDEX IF NOT EXISTS idx_profile_config_history_profile_version
  ON profile_config_history_v1 (profile_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_profile_config_history_created_at
  ON profile_config_history_v1 (created_at DESC);

INSERT OR IGNORE INTO profile_config_history_v1
  (id, profile_id, previous_version, version, config_json, config_hash,
   changed_keys_json, updated_by_account_id, source_action, request_id, created_at)
SELECT lower(hex(randomblob(16))), id,
       CASE WHEN version > 1 THEN version - 1 ELSE 0 END,
       version,
       json_remove(COALESCE(config, '{}'),
         '$.adminPasswordHash', '$.managedDeviceToken', '$.deviceToken',
         '$.cloudDeviceToken', '$.updatedAt', '$.lockedDomains'),
       'migration-seed-unavailable', '["migration_seed"]', NULL,
       'migration_seed', NULL, updated_at
  FROM profiles;

CREATE TRIGGER IF NOT EXISTS trg_profiles_config_version_guard_v1
BEFORE UPDATE OF config ON profiles
WHEN OLD.config IS NOT NEW.config AND NEW.version <> OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'PROFILE_CONFIG_VERSION_INCREMENT_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS trg_profiles_config_history_v1
AFTER UPDATE OF config ON profiles
WHEN OLD.config IS NOT NEW.config
BEGIN
  INSERT OR IGNORE INTO profile_config_history_v1
    (id, profile_id, previous_version, version, config_json, config_hash,
     changed_keys_json, updated_by_account_id, source_action, request_id, created_at)
  VALUES (
    lower(hex(randomblob(16))), NEW.id, OLD.version, NEW.version,
    json_remove(COALESCE(NEW.config, '{}'),
      '$.adminPasswordHash', '$.managedDeviceToken', '$.deviceToken',
      '$.cloudDeviceToken', '$.updatedAt', '$.lockedDomains'),
    'trigger-unavailable', '[]', NULL, 'unattributed_update', NULL, NEW.updated_at
  );
END;
