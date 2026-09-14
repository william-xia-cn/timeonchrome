-- Migration 028: immutable system access configuration history.

CREATE TABLE IF NOT EXISTS system_access_config_history_v1 (
  version                 INTEGER PRIMARY KEY,
  previous_version        INTEGER,
  config_json             TEXT NOT NULL,
  config_hash             TEXT NOT NULL,
  updated_at              INTEGER NOT NULL,
  updated_by_account_id   TEXT,
  note                    TEXT,
  source_action           TEXT NOT NULL DEFAULT 'api_put'
);

CREATE INDEX IF NOT EXISTS idx_system_access_config_history_time
  ON system_access_config_history_v1 (updated_at DESC);

INSERT OR IGNORE INTO system_access_config_history_v1
  (version, previous_version, config_json, config_hash, updated_at, updated_by_account_id, note, source_action)
SELECT version, CASE WHEN version > 1 THEN version - 1 ELSE NULL END, config_json,
       'legacy-unavailable', updated_at, updated_by_account_id, note, 'migration_seed'
  FROM system_access_config_v1
 WHERE id = 'global';
