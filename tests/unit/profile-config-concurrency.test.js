'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..', '..');
const profiles = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'profiles.ts'), 'utf8');
const restore = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'restore.ts'), 'utf8');
const mutation = fs.readFileSync(path.join(root, 'workers', 'src', 'services', 'profileConfigMutation.ts'), 'utf8');
const classification = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'siteClassificationRequests.ts'), 'utf8');
const composite = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'compositeSessions.ts'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'pages', 'index.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'workers', 'migrations', '031_profile_config_history_v1.sql'), 'utf8');

assert(migration.includes('CREATE TABLE IF NOT EXISTS profile_config_history_v1'));
assert(migration.includes('UNIQUE (profile_id, version)'));
assert(migration.includes('CREATE TRIGGER IF NOT EXISTS trg_profiles_config_version_guard_v1'));
assert(migration.includes('PROFILE_CONFIG_VERSION_INCREMENT_REQUIRED'));
assert(migration.includes('CREATE TRIGGER IF NOT EXISTS trg_profiles_config_history_v1'));
assert(migration.includes('AFTER UPDATE OF config ON profiles'));
assert(migration.includes("'$.adminPasswordHash'"));
assert(!migration.includes('managedDeviceToken\"'));

const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE accounts (id TEXT PRIMARY KEY);
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    config TEXT,
    version INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  INSERT INTO accounts (id) VALUES ('account-1');
  INSERT INTO profiles (id, account_id, config, version, updated_at)
  VALUES ('profile-1', 'account-1', '{"weeklyRestLimit":840,"adminPasswordHash":"redact-me","managedDeviceToken":"redact-me"}', 1, 1000);
`);
db.exec(migration);
const seededAudit = db.prepare(
  `SELECT config_json, source_action FROM profile_config_history_v1 WHERE profile_id = ? AND version = ?`
).get('profile-1', 1);
assert.strictEqual(seededAudit.source_action, 'migration_seed');
assert(!seededAudit.config_json.includes('redact-me'));
assert.throws(
  () => db.exec(`UPDATE profiles SET config = '{"weeklyRestLimit":1440}', updated_at = 1500 WHERE id = 'profile-1'`),
  /PROFILE_CONFIG_VERSION_INCREMENT_REQUIRED/,
);
db.exec(`UPDATE profiles SET config = '{"weeklyRestLimit":1440}', version = 2, updated_at = 2000 WHERE id = 'profile-1'`);
const triggeredAudit = db.prepare(
  `SELECT previous_version, config_json, source_action FROM profile_config_history_v1 WHERE profile_id = ? AND version = ?`
).get('profile-1', 2);
assert.strictEqual(triggeredAudit.previous_version, 1);
assert.strictEqual(triggeredAudit.config_json, '{"weeklyRestLimit":1440}');
assert.strictEqual(triggeredAudit.source_action, 'unattributed_update');
db.close();

assert(profiles.includes('SELECT config, version, updated_at FROM profiles WHERE id = ?'));
assert(profiles.includes('/config-history\\/v1'));
assert(profiles.includes('FROM profile_config_history_v1'));
assert(profiles.includes('ORDER BY version DESC'));
assert(profiles.includes("code: 'PROFILE_CONFIG_EXPECTED_VERSION_REQUIRED'"));
assert(profiles.includes("typeof expectedVersion !== 'number'"));
assert(profiles.includes("code: 'PROFILE_CONFIG_VERSION_CONFLICT'"));
assert(profiles.includes('WHERE id = ? AND version = ?'));
assert(profiles.includes('INSERT INTO profile_config_history_v1'));
assert(profiles.includes('updated_by_account_id = excluded.updated_by_account_id'));
assert(profiles.includes('if (configStr === existing.config)'));
assert(profiles.includes('noChange: true'));

assert(pages.includes('let remoteConfigVersion = null'));
assert(pages.includes('function applyProfileConfigResponse(result)'));
assert(pages.includes('async function saveProfileConfig(data, sourceAction)'));
assert(pages.includes('expectedVersion,'));
assert(pages.includes("error?.code === 'PROFILE_CONFIG_VERSION_CONFLICT'"));
assert(pages.includes('配置已被其他页面更新，已刷新最新内容。请检查后重新保存。'));

const directProfileConfigPuts = [...pages.matchAll(/api\(\s*`\/profiles\/\$\{[^}]+\}\/config`\s*,\s*'PUT'/g)];
assert.strictEqual(directProfileConfigPuts.length, 1, 'Pages profile config PUT must be centralized in saveProfileConfig');

for (const sourceAction of [
  'promote_system_site_remove_custom',
  'access_config_import',
  'profile_config_import',
  'site_access_save',
  'autonomy_config_save',
  'time_quota_save',
  'time_windows_save',
  'client_logging_policy_save',
  'quota_audit_request',
]) {
  assert(pages.includes(`'${sourceAction}'`), `missing source action ${sourceAction}`);
}

assert(restore.includes('profileVersion: Number(profile.version || 0)'));
assert(restore.includes("code: 'PROFILE_CONFIG_VERSION_CONFLICT'"));
assert(restore.includes('cloud_restore_${restoreMode}'));

assert(mutation.includes('WHERE id = ? AND version = ?'));
assert(mutation.includes('ProfileConfigVersionConflictError'));
assert(mutation.includes('for (let attempt = 0; attempt < maxAttempts; attempt += 1)'));
assert(classification.includes('mutateProfileConfig'));
assert(classification.includes("sourceAction: 'site_classification_decision'"));
assert(classification.includes("sourceAction: 'used_unclassified_site_classify'"));
assert(composite.includes('mutateProfileConfig'));
assert(composite.includes("sourceAction: 'composite_keyword_classify'"));
assert(composite.includes("sourceAction: 'composite_domain_classify'"));
assert(composite.includes("sourceAction: 'composite_classification_rule_add'"));

for (const workerSource of [profiles, restore, mutation]) {
  for (const match of workerSource.matchAll(/UPDATE profiles SET config\s*=\s*\?/g)) {
    const statement = workerSource.slice(match.index, match.index + 180);
    assert(statement.includes('version = ?'), `unguarded profile config update: ${statement}`);
  }
}

console.log('[Profile Config Concurrency] passed');
