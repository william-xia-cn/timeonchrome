-- 仅显式登记的家庭退出旧应用账；不修改任何配对/策略或网页/媒体表。
CREATE TABLE runtime_application_ledger_retirements_v1 (
  account_id TEXT PRIMARY KEY NOT NULL,
  retired_at_ms INTEGER NOT NULL CHECK(retired_at_ms > 0),
  backup_sha256 TEXT NOT NULL CHECK(length(backup_sha256) = 64),
  revision_watermarks_json TEXT NOT NULL CHECK(json_valid(revision_watermarks_json))
);

CREATE TRIGGER runtime_retired_application_v1_insert BEFORE INSERT ON runtime_usage_segments
WHEN EXISTS (SELECT 1 FROM runtime_devices d JOIN runtime_application_ledger_retirements_v1 r
  ON r.account_id=d.account_id WHERE d.id=NEW.device_id)
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;

CREATE TRIGGER runtime_retired_application_v2_insert BEFORE INSERT ON runtime_usage_segments_v2
WHEN EXISTS (SELECT 1 FROM runtime_machines_v2 m JOIN runtime_application_ledger_retirements_v1 r
  ON r.account_id=m.account_id WHERE m.id=NEW.machine_id)
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;

CREATE TRIGGER runtime_retired_application_manifest_insert BEFORE INSERT ON runtime_application_account_manifests_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
  AND (json_extract(NEW.manifest_json,'$.schemaVersion') IS NOT 2
    OR json_extract(NEW.manifest_json,'$.durationUnit') IS NOT 'seconds'
    OR json_extract(NEW.manifest_json,'$.childId') IS NOT NEW.child_id
    OR COALESCE(json_extract(NEW.manifest_json,'$.algorithmVersion'),'') NOT IN
      ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1'))
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;

-- 路由校验与清理之间可能存在并发请求；数据库水位是最终防线。
CREATE TRIGGER runtime_retired_application_manifest_watermark BEFORE INSERT ON runtime_application_account_manifests_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r, json_each(r.revision_watermarks_json) w
  WHERE r.account_id=NEW.account_id AND json_extract(w.value,'$.machineId')=NEW.machine_id
    AND json_extract(w.value,'$.localUserId')=NEW.local_user_id
    AND json_extract(w.value,'$.assignmentVersion')=NEW.assignment_version
    AND json_extract(w.value,'$.date')=NEW.date
    AND NEW.revision<=json_extract(w.value,'$.revision'))
BEGIN SELECT RAISE(ABORT, 'APPLICATION_ACCOUNT_STALE_REVISION'); END;

CREATE TRIGGER runtime_retired_application_publication_insert BEFORE INSERT ON runtime_application_account_publications_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
  AND NOT EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 m WHERE m.id=NEW.manifest_id
    AND m.account_id=NEW.account_id AND m.child_id=NEW.child_id
    AND json_extract(m.manifest_json,'$.childId')=NEW.child_id
    AND json_extract(m.manifest_json,'$.schemaVersion')=2
    AND json_extract(m.manifest_json,'$.algorithmVersion') IN
      ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1'))
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;

CREATE TRIGGER runtime_retired_application_day_insert BEFORE INSERT ON runtime_application_statistics_days_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;

CREATE TRIGGER runtime_retired_application_day_update BEFORE UPDATE ON runtime_application_statistics_days_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;
