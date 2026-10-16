-- 开发兼容：既有表接收固定身份单一秒统计；不改数据、不重置水位。
DROP TRIGGER runtime_retired_application_manifest_insert;
CREATE TRIGGER runtime_retired_application_manifest_insert BEFORE INSERT ON runtime_application_account_manifests_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
  AND NOT (json_extract(NEW.manifest_json,'$.durationUnit') IS 'seconds'
    AND json_extract(NEW.manifest_json,'$.childId') IS NEW.child_id
    AND ((json_extract(NEW.manifest_json,'$.schemaVersion') IS 2
      AND COALESCE(json_extract(NEW.manifest_json,'$.algorithmVersion'),'') IN
        ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1','application-fixed-identity-seconds-v1'))
      OR (json_extract(NEW.manifest_json,'$.schemaVersion') IS 3
        AND json_extract(NEW.manifest_json,'$.algorithmVersion') IS 'application-instance-seconds-v1')))
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;

-- 来源一旦成功接收新统计，不因重启、旧高revision或旧pending补交退回旧算法。
-- 不新增权威表；已接收不可变清单本身就是切换依据，按孩子和实际来源隔离。
CREATE TRIGGER runtime_fixed_statistics_manifest_insert BEFORE INSERT ON runtime_application_account_manifests_v1
WHEN COALESCE(json_extract(NEW.manifest_json,'$.algorithmVersion'),'')<>'application-fixed-identity-seconds-v1'
  AND EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 f
    WHERE f.machine_id=NEW.machine_id AND f.local_user_id=NEW.local_user_id
      AND f.assignment_version=NEW.assignment_version AND f.account_id=NEW.account_id AND f.child_id=NEW.child_id
      AND f.state='received' AND json_extract(f.manifest_json,'$.algorithmVersion')='application-fixed-identity-seconds-v1')
BEGIN SELECT RAISE(ABORT, 'APPLICATION_STATISTICS_PRODUCER_SUPERSEDED'); END;

CREATE TRIGGER runtime_fixed_statistics_manifest_receive BEFORE UPDATE OF state ON runtime_application_account_manifests_v1
WHEN NEW.state='received' AND COALESCE(json_extract(NEW.manifest_json,'$.algorithmVersion'),'')<>'application-fixed-identity-seconds-v1'
  AND EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 f
    WHERE f.machine_id=NEW.machine_id AND f.local_user_id=NEW.local_user_id
      AND f.assignment_version=NEW.assignment_version AND f.account_id=NEW.account_id AND f.child_id=NEW.child_id
      AND f.state='received' AND json_extract(f.manifest_json,'$.algorithmVersion')='application-fixed-identity-seconds-v1')
BEGIN SELECT RAISE(ABORT, 'APPLICATION_STATISTICS_PRODUCER_SUPERSEDED'); END;

CREATE TRIGGER runtime_fixed_statistics_publication_insert BEFORE INSERT ON runtime_application_account_publications_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 m WHERE m.id=NEW.manifest_id
    AND COALESCE(json_extract(m.manifest_json,'$.algorithmVersion'),'')<>'application-fixed-identity-seconds-v1')
  AND EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 f
    WHERE f.machine_id=NEW.machine_id AND f.local_user_id=NEW.local_user_id
      AND f.assignment_version=NEW.assignment_version AND f.account_id=NEW.account_id AND f.child_id=NEW.child_id
      AND f.state='received' AND json_extract(f.manifest_json,'$.algorithmVersion')='application-fixed-identity-seconds-v1')
BEGIN SELECT RAISE(ABORT, 'APPLICATION_STATISTICS_PRODUCER_SUPERSEDED'); END;

DROP TRIGGER runtime_retired_application_publication_insert;
CREATE TRIGGER runtime_retired_application_publication_insert BEFORE INSERT ON runtime_application_account_publications_v1
WHEN EXISTS (SELECT 1 FROM runtime_application_ledger_retirements_v1 r WHERE r.account_id=NEW.account_id)
  AND NOT EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 m WHERE m.id=NEW.manifest_id
    AND m.account_id=NEW.account_id AND m.child_id=NEW.child_id
    AND json_extract(m.manifest_json,'$.childId')=NEW.child_id
    AND json_extract(m.manifest_json,'$.durationUnit')='seconds'
    AND ((json_extract(m.manifest_json,'$.schemaVersion')=2 AND json_extract(m.manifest_json,'$.algorithmVersion') IN
      ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1','application-fixed-identity-seconds-v1'))
      OR (json_extract(m.manifest_json,'$.schemaVersion')=3
        AND json_extract(m.manifest_json,'$.algorithmVersion')='application-instance-seconds-v1')))
BEGIN SELECT RAISE(ABORT, 'APPLICATION_LEGACY_LEDGER_RETIRED'); END;
