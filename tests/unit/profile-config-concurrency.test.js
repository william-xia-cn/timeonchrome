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

// 执行真实 Profile 路由和目标规范化；内存 SQLite 保留条件写入/审计，只有外部鉴权与系统默认库用夹具。
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
function loadCore(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, URL, Set, require: relative => loadCore(path.resolve(path.dirname(file), relative)) });
  return exports;
}
const siteCore = loadCore(path.join(root, 'extension/core/site-classification.js'));
const workerExports = {};
vm.runInNewContext(ts.transpileModule(profiles, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports: workerExports, URL, Set, Request, Response, TextEncoder, crypto: webcrypto,
  require: name => {
    if (name.endsWith('/middleware')) return {
      json: (body, status = 200) => Response.json(body, { status }),
      verifyAccountToken: async request => request.headers.get('x-test-account'),
    };
    if (name.endsWith('/site-classification.js')) return siteCore;
    if (name.endsWith('/system-access-config')) return {
      getSystemAccessConfig: async () => ({ defaultStudySites: [], defaultCompositeSites: [], defaultUserCompositeSites: [], defaultRestrictedEntertainmentSites: [], defaultBlockedSites: [] }),
      mergeWithDefaults: (custom, defaults) => [...new Set([...custom, ...defaults])],
      stripDerivedSiteAccessFields: value => value,
    };
    return {};
  },
});
async function verifyOtherUsageRoute() {
  const store = new DatabaseSync(':memory:');
  store.exec('CREATE TABLE accounts(id TEXT PRIMARY KEY); CREATE TABLE profiles(id TEXT PRIMARY KEY, account_id TEXT, config TEXT, version INTEGER, updated_at INTEGER);');
  store.exec("INSERT INTO accounts VALUES('family-a'),('family-b');");
  const old = { id: 'server-rule', requestId: 'owned-request', classification: 'other', targetType: 'host', normalizedValue: 'tool.test', targetValue: 'tool.test', createdAt: 100, updatedAt: 100 };
  const original = { siteUsageClassificationRulesV1: [old], studyList: [], compositeList: [], unsafeList: [], restrictedEntertainmentList: [], timeQuota: { daily: {}, weekly: { restMinutes: null } }, timeWindows: { daily: {} } };
  store.prepare('INSERT INTO profiles VALUES(?,?,?,?,?)').run('child-a', 'family-a', JSON.stringify(original), 1, 1000);
  store.exec(migration);
  const env = { JWT_SECRET: 'fixture-only', DB: {
    prepare(sql) { return { bind(...args) { return {
      sql, args,
      async first() { return store.prepare(sql).get(...args) || null; },
      async all() { return { results: store.prepare(sql).all(...args) }; },
    }; } }; },
    async batch(statements) {
      store.exec('BEGIN');
      try { const results = statements.map(({ sql, args }) => ({ meta: { changes: store.prepare(sql).run(...args).changes } })); store.exec('COMMIT'); return results; }
      catch (error) { store.exec('ROLLBACK'); throw error; }
    },
  } };
  const current = () => store.prepare('SELECT config,version FROM profiles WHERE id=?').get('child-a');
  const put = async (data, options = {}) => workerExports.profilesRouter.handle(new Request('https://fixture.test/profiles/child-a/config', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-account': options.account || 'family-a' },
    body: JSON.stringify({ data, expectedVersion: options.version ?? current().version, sourceAction: 'access_config_import' }),
  }), env);
  let response = await workerExports.profilesRouter.handle(new Request('https://fixture.test/profiles/child-a/config', { method: 'PUT' }), env);
  assert.equal(response.status, 401); assert.equal(current().version, 1);
  response = await put({ siteUsageClassificationRulesV1: [] }, { account: 'family-b' });
  assert.equal(response.status, 404); assert.equal(current().version, 1);
  response = await put({ siteUsageClassificationRulesV1: [] }, { version: 0 });
  assert.equal(response.status, 409); assert.equal(current().version, 1);
  for (const bad of [null, {}, [{ classification: 'study', targetType: 'host', normalizedValue: 'tool.test' }],
    [{ classification: 'other', targetType: 'host', normalizedValue: 'https://tool.test/' }],
    [{ classification: 'other', targetType: 'host', normalizedValue: 'tool.test', requestId: 'foreign-request' }],
    [{ classification: 'other', targetType: 'host', normalizedValue: 'TOOL.TEST' }, { classification: 'other', targetType: 'host', normalizedValue: 'tool.test' }]]) {
    response = await put({ siteUsageClassificationRulesV1: bad });
    assert.equal(response.status, 400, JSON.stringify(bad));
    assert.equal((await response.json()).code, 'INVALID_OTHER_USAGE_RULES'); assert.equal(current().version, 1);
  }
  response = await put({ domainQuotas: { 'example.test': 20 } });
  assert.equal(response.status, 200);
  assert.deepStrictEqual(JSON.parse(current().config).siteUsageClassificationRulesV1, [old], 'omitted field preserves server rules');
  response = await put({ siteUsageClassificationRulesV1: [
    { classification: 'other', targetType: 'host', normalizedValue: 'TOOL.TEST' },
    { classification: 'other', targetType: 'url', normalizedValue: 'https://other.test/settings#section' },
  ] });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const saved = JSON.parse(current().config);
  assert.deepStrictEqual(saved.siteUsageClassificationRulesV1[0], old);
  assert.equal(saved.siteUsageClassificationRulesV1[1].normalizedValue, 'https://other.test/settings');
  assert.equal(saved.siteUsageClassificationRulesV1[1].requestId, undefined);
  assert.match(saved.siteUsageClassificationRulesV1[1].id, /^usage_rule_/);
  assert.deepStrictEqual(saved.timeQuota, original.timeQuota); assert.deepStrictEqual(saved.studyList, original.studyList);
  const stableVersion = current().version;
  response = await put({ siteUsageClassificationRulesV1: saved.siteUsageClassificationRulesV1.map(({ classification, targetType, normalizedValue }) => ({ classification, targetType, normalizedValue })) });
  assert.equal(response.status, 200); assert.equal((await response.json()).noChange, true); assert.equal(current().version, stableVersion);
  response = await put({ siteUsageClassificationRulesV1: [] });
  assert.equal(response.status, 200); assert.deepStrictEqual(JSON.parse(current().config).siteUsageClassificationRulesV1, []);
  const audit = store.prepare('SELECT source_action,changed_keys_json FROM profile_config_history_v1 WHERE profile_id=? AND version=?').get('child-a', current().version);
  assert.equal(audit.source_action, 'access_config_import'); assert(JSON.parse(audit.changed_keys_json).includes('siteUsageClassificationRulesV1'));
  store.close(); console.log('[Other Usage Profile Route] owner/version/validation/preserve/replace/delete/audit passed');
}
verifyOtherUsageRoute().catch(error => { console.error(error); process.exitCode = 1; });
