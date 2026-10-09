-- 只扩大已退出旧账家庭对新版实例基础统计的接收；不修改数据或退出水位。
DROP TRIGGER runtime_retired_application_manifest_insert;
CREATE TRIGGER runtime_retired_application_manifest_insert BEFORE INSERT ON runtime_application_account_manifests_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
  AND NOT (json_extract(NEW.manifest_json,'$.durationUnit') IS 'seconds'
    AND json_extract(NEW.manifest_json,'$.childId') IS NEW.child_id
    AND ((json_extract(NEW.manifest_json,'$.schemaVersion') IS 2
      AND COALESCE(json_extract(NEW.manifest_json,'$.algorithmVersion'),'') IN
        ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1'))
      OR (json_extract(NEW.manifest_json,'$.schemaVersion') IS 3
        AND json_extract(NEW.manifest_json,'$.algorithmVersion') IS 'application-instance-seconds-v1')))
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;

DROP TRIGGER runtime_retired_application_publication_insert;
CREATE TRIGGER runtime_retired_application_publication_insert BEFORE INSERT ON runtime_application_account_publications_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
  AND NOT EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 m WHERE m.id=NEW.manifest_id
    AND m.account_id=NEW.account_id AND m.child_id=NEW.child_id
    AND json_extract(m.manifest_json,'$.childId')=NEW.child_id
    AND json_extract(m.manifest_json,'$.durationUnit')='seconds'
    AND ((json_extract(m.manifest_json,'$.schemaVersion')=2 AND json_extract(m.manifest_json,'$.algorithmVersion') IN
      ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1'))
      OR (json_extract(m.manifest_json,'$.schemaVersion')=3
        AND json_extract(m.manifest_json,'$.algorithmVersion')='application-instance-seconds-v1')))
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;
