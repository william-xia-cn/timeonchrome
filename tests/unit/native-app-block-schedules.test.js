'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (name) => dependencies[name],
    crypto: { randomUUID }, Date, Intl, JSON, Map, Set, console,
  });
  return module.exports;
}

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['001_native_app_control_v1.sql', '002_native_app_inventory_v1.sql',
    '003_native_app_predefined_controls_v1.sql', '004_native_app_preconfiguration_source_v1.sql',
    '005_native_app_block_schedules_v1.sql', '006_native_time_rules_opt_in_v1.sql']) {
    sqlite.exec(fs.readFileSync(path.join(ROOT, 'native-app-control/worker/migrations', name), 'utf8'));
  }
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => sqlite.prepare(sql).run(...args),
  });
  return { sqlite, env: { DB: {
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try { for (const item of statements) await item.run(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } } };
}

const schedules = load('native-app-control/worker/src/blockSchedules.ts');
const policy = load('native-app-control/worker/src/policy.ts');
const repository = load('native-app-control/worker/src/repository.ts', {
  './policy': policy, './crypto': { hmacHex: async () => '', randomSecret: () => '' },
});
const nativeCel = load('native-app-control/worker/src/nativeCelPolicy.ts', {
  './policy': policy, './blockSchedules': schedules,
});

(async () => {
  assert.equal(schedules.minuteOfDay('09:30'), 570);
  assert.equal(schedules.minuteOfDay('24:00'), null);
  assert.equal(schedules.scheduleActive(540, 660, 'Asia/Shanghai', Date.UTC(2026, 8, 29, 1, 0)), true);
  assert.equal(schedules.scheduleActive(540, 660, 'Asia/Shanghai', Date.UTC(2026, 8, 29, 3, 0)), false);
  assert.equal(schedules.scheduleActive(1320, 120, 'Asia/Shanghai', Date.UTC(2026, 8, 29, 17, 0)), true);
  assert.equal(schedules.scheduleActive(1320, 120, 'Asia/Shanghai', Date.UTC(2026, 8, 29, 4, 0)), false);
  assert.equal(schedules.scheduleActive(90, 150, 'America/New_York', Date.UTC(2026, 10, 1, 5, 30)), true);
  assert.equal(schedules.scheduleActive(90, 150, 'America/New_York', Date.UTC(2026, 10, 1, 6, 30)), true);

  const legacy = new DatabaseSync(':memory:');
  for (const name of ['001_native_app_control_v1.sql', '002_native_app_inventory_v1.sql',
    '003_native_app_predefined_controls_v1.sql', '004_native_app_preconfiguration_source_v1.sql']) {
    legacy.exec(fs.readFileSync(path.join(ROOT, 'native-app-control/worker/migrations', name), 'utf8'));
  }
  legacy.exec(`INSERT INTO native_children_v1 (child_id, account_id, created_at, updated_at)
    VALUES ('old', 'parent', 1, 1);
    INSERT INTO account_applications_v1
      (id, account_id, auto_group_key, display_name, team_id, created_at, updated_at)
    VALUES ('legacy-app', 'parent', 'TEAM:legacy', 'Legacy', 'TEAM', 1, 1);
    INSERT INTO child_application_states_v1 (child_id, application_id, state, created_at, updated_at)
    VALUES ('old', 'legacy-app', 'BLOCK', 1, 10);
    INSERT INTO child_publisher_blocks_v1 (child_id, team_id, updated_by_account_id, created_at)
    VALUES ('old', 'TEAM', 'parent', 10);`);
  legacy.exec(fs.readFileSync(path.join(ROOT, 'native-app-control/worker/migrations',
    '005_native_app_block_schedules_v1.sql'), 'utf8'));
  assert.equal(legacy.prepare("SELECT block_origin FROM child_application_states_v1 WHERE child_id = 'old'").get().block_origin,
    'PUBLISHER', 'legacy publisher-derived app blocks must not remain independent all-day rules');

  const { sqlite, env } = database();
  sqlite.exec(`INSERT INTO native_children_v1 (child_id, account_id, created_at, updated_at)
    VALUES ('child', 'parent', 1, 1);
    INSERT INTO native_macs_v1 (id, child_id, display_name, created_at, updated_at)
    VALUES ('mac', 'child', 'Mac', 1, 1);
    INSERT INTO account_applications_v1 (id, account_id, auto_group_key, display_name, team_id, created_at, updated_at)
    VALUES ('app', 'parent', 'TEAM:app', 'App', 'TEAM', 1, 1);
    INSERT INTO application_identities_v1 (id, identity_key, identity_type, identifier, created_at, updated_at)
    VALUES ('identity', 'SIGNINGID:TEAM:app', 'SIGNINGID', 'TEAM:app', 1, 1);
    INSERT INTO application_memberships_v1 (application_id, identity_id, membership_source, created_at)
    VALUES ('app', 'identity', 'automatic', 1);
    INSERT INTO child_application_states_v1 (child_id, application_id, state, updated_at, created_at)
    VALUES ('child', 'app', 'BLOCK', 1, 1);
    INSERT INTO child_publisher_blocks_v1 (child_id, team_id, updated_by_account_id, created_at)
    VALUES ('child', 'TEAM', 'parent', 1);`);
  const auth = { child_id: 'child', account_id: 'parent' };
  sqlite.exec(`INSERT INTO native_app_predefined_items_v1
    (child_id, source, source_index, display_name, bundle_id, created_at, updated_at)
    VALUES ('child', 'source-a', 1, 'App', 'com.example.app', 1, 1);
    INSERT INTO native_app_predefined_identities_v1
    (child_id, source, source_index, identity_key, identity_type, identifier,
      match_origin, status, created_at, updated_at)
    VALUES ('child', 'source-a', 1, 'SIGNINGID:TEAM:app', 'SIGNINGID', 'TEAM:app',
      'inventory', 'AUTO', 1, 1);`);
  await schedules.saveBlockSchedule(env, auth, {
    sourceType: 'APPLICATION', sourceKey: 'app', allDay: false, start: '09:00', end: '11:00',
  });
  await schedules.saveBlockSchedule(env, auth, {
    sourceType: 'PUBLISHER', sourceKey: 'TEAM', allDay: false, start: '09:00', end: '11:00',
  });
  await schedules.saveBlockSchedule(env, auth, {
    sourceType: 'PREDEFINED', sourceKey: '["source-a",1]', allDay: false, start: '09:00', end: '11:00',
  });
  assert.equal(nativeCel.supportsNativeTimeRules('2026.8'), true);
  assert.equal(nativeCel.supportsNativeTimeRules('2026.8 (build 1)'), true);
  assert.equal(nativeCel.supportsNativeTimeRules('2026.7'), false);
  const baseline = { identifier: '0'.repeat(64), policy: 'ALLOWLIST', rule_type: 'BINARY' };
  const hashRules = nativeCel.compileNativeTimedRules([
    { identity_type: 'CDHASH', identifier: 'a'.repeat(40), team_id: null,
      start_minute: 540, end_minute: 660 },
  ], [{ team_id: 'TEAM', start_minute: null, end_minute: null }], 'Asia/Shanghai', baseline);
  assert.match(hashRules.find((rule) => rule.rule_type === 'CDHASH').cel_expr,
    /target\.team_id == "TEAM" \? BLOCKLIST/,
    'a more specific hash rule must not mask an all-day publisher block when TeamID is unknown');
  let nativePolicy = await nativeCel.loadNativeTimedPolicy(env, 'child');
  let nativeRules = nativeCel.compileNativeTimedRules(nativePolicy.identities,
    nativePolicy.publishers, nativePolicy.timeZone, baseline);
  const appRule = nativeRules.find((rule) => rule.identifier === 'TEAM:app');
  assert.equal(appRule.policy, 'CEL');
  assert.equal(nativeRules.filter((rule) => rule.identifier === 'TEAM:app').length, 1,
    'overlapping direct, predefined and publisher sources compile to one identity rule');
  assert.match(appRule.cel_expr, /policy_for_range/);
  assert.equal(nativeRules.find((rule) => rule.rule_type === 'TEAMID').policy, 'CEL');
  await assert.rejects(() => nativeCel.setNativeTimeRulesEnabled(env, auth, 'mac', true),
    /santa_2026_8_required/);
  sqlite.exec("UPDATE native_macs_v1 SET santa_version = '2026.8' WHERE id = 'mac'");
  await nativeCel.setNativeTimeRulesEnabled(env, auth, 'mac', true);
  assert.equal(sqlite.prepare("SELECT native_time_rules_enabled FROM native_macs_v1 WHERE id = 'mac'").get().native_time_rules_enabled, 1);
  const beforeBulk = sqlite.prepare("SELECT policy_version FROM native_children_v1 WHERE child_id = 'child'").get().policy_version;
  await assert.rejects(() => schedules.saveBlockSchedulesBulk(env, auth, {
    sources: [{ sourceType: 'APPLICATION', sourceKey: 'app' },
      { sourceType: 'APPLICATION', sourceKey: 'missing' }],
    allDay: false, start: '13:00', end: '14:00',
  }), /block_source_not_found/);
  assert.equal(sqlite.prepare("SELECT start_minute FROM native_app_block_schedules_v1 WHERE source_key = 'app'").get().start_minute, 540);
  await schedules.saveBlockSchedulesBulk(env, auth, {
    sources: [{ sourceType: 'APPLICATION', sourceKey: 'app' },
      { sourceType: 'PREDEFINED', sourceKey: '["source-a",1]' }],
    allDay: false, start: '13:00', end: '14:00',
  });
  assert.equal(sqlite.prepare("SELECT policy_version FROM native_children_v1 WHERE child_id = 'child'").get().policy_version, beforeBulk + 1);
  nativePolicy = await nativeCel.loadNativeTimedPolicy(env, 'child');
  nativeRules = nativeCel.compileNativeTimedRules(nativePolicy.identities,
    nativePolicy.publishers, nativePolicy.timeZone, baseline);
  assert.match(nativeRules.find((rule) => rule.identifier === 'TEAM:app').cel_expr, /now\(\)/,
    'different overlapping windows form one native CEL rule');
  await schedules.reconcileChildSchedules(env, 'child', Date.UTC(2026, 8, 29, 1, 0));
  const version = sqlite.prepare("SELECT policy_version FROM native_children_v1 WHERE child_id = 'child'").get().policy_version;
  await schedules.reconcileChildSchedules(env, 'child', Date.UTC(2026, 8, 29, 1, 0));
  assert.equal(sqlite.prepare("SELECT policy_version FROM native_children_v1 WHERE child_id = 'child'").get().policy_version, version);
  await schedules.reconcileChildSchedules(env, 'child', Date.UTC(2026, 8, 29, 3, 0));
  assert.equal(sqlite.prepare("SELECT policy_version FROM native_children_v1 WHERE child_id = 'child'").get().policy_version, version + 1);
  let blocked = await repository.loadBlockedPolicy(env, 'child');
  assert.equal(blocked.applications.length, 0);
  assert.equal(blocked.publishers.length, 0);
  await assert.rejects(() => schedules.saveBlockSchedule(env, auth, {
    sourceType: 'APPLICATION', sourceKey: 'app', allDay: false, start: '09:00', end: '09:00',
  }), /invalid_schedule_time/);
  await schedules.saveBlockSchedule(env, auth, {
    sourceType: 'PUBLISHER', sourceKey: 'TEAM', allDay: true,
  });
  nativePolicy = await nativeCel.loadNativeTimedPolicy(env, 'child');
  nativeRules = nativeCel.compileNativeTimedRules(nativePolicy.identities,
    nativePolicy.publishers, nativePolicy.timeZone, baseline);
  assert.equal(nativeRules.find((rule) => rule.identifier === 'TEAM:app').policy, 'BLOCKLIST',
    'all-day publisher block wins over timed application sources');
  blocked = await repository.loadBlockedPolicy(env, 'child');
  assert.equal(blocked.applications.length, 0);
  assert.equal(blocked.publishers.length, 1, 'publisher still blocks when application source is inactive');
  assert.equal(policy.compileSantaRules(blocked.applications, blocked.publishers,
    { identifier: '0'.repeat(64), policy: 'ALLOWLIST', rule_type: 'BINARY' })
    .filter((rule) => rule.policy === 'BLOCKLIST').length, 1);
  sqlite.exec("UPDATE child_application_states_v1 SET state = 'REVIEW' WHERE child_id = 'child' AND application_id = 'app'");
  await repository.decideApplication(env, auth, 'app', 'BLOCK_PUBLISHER');
  assert.equal(sqlite.prepare("SELECT block_origin FROM child_application_states_v1 WHERE child_id = 'child' AND application_id = 'app'").get().block_origin, 'PUBLISHER');
  blocked = await repository.loadBlockedPolicy(env, 'child');
  assert.equal(blocked.applications.length, 0, 'publisher-derived BLOCK is not an independent all-day application rule');
  await repository.decideApplication(env, auth, 'app', 'BLOCK');
  assert.equal(sqlite.prepare("SELECT block_origin FROM child_application_states_v1 WHERE child_id = 'child' AND application_id = 'app'").get().block_origin, 'DIRECT');
  console.log('Native App block schedules tests: passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
