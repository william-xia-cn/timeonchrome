CREATE TABLE native_app_application_policies_v1 (
  child_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  all_day INTEGER NOT NULL CHECK(all_day IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(child_id, application_id),
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE
);

CREATE TABLE native_app_application_windows_v1 (
  id TEXT NOT NULL PRIMARY KEY,
  child_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 0 AND 1439),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(child_id, application_id)
    REFERENCES native_app_application_policies_v1(child_id, application_id) ON DELETE CASCADE,
  CHECK(start_minute != end_minute)
);

CREATE INDEX idx_native_app_windows_owner
  ON native_app_application_windows_v1(child_id, application_id);

CREATE TABLE native_app_application_effective_v1 (
  child_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  effective_active INTEGER NOT NULL CHECK(effective_active IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(child_id, application_id),
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE
);

INSERT INTO native_app_application_policies_v1 (child_id, application_id, all_day, updated_at)
SELECT child_id, source_key, 0, updated_at FROM native_app_block_schedules_v1
WHERE source_type = 'APPLICATION';

INSERT INTO native_app_application_windows_v1
  (id, child_id, application_id, start_minute, end_minute, updated_at)
SELECT lower(hex(randomblob(16))), child_id, source_key, start_minute, end_minute, updated_at
FROM native_app_block_schedules_v1 WHERE source_type = 'APPLICATION';

DELETE FROM native_app_block_schedules_v1 WHERE source_type = 'APPLICATION';
