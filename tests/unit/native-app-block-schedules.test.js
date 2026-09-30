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
    '005_native_app_block_schedules_v1.sql', '006_native_time_rules_opt_in_v1.sql',
    '007_native_app_application_windows_v1.sql']) {
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

const schedulesBridge = {};
const appPolicies = load('native-app-control/worker/src/applicationBlockPolicies.ts', {
  './blockSchedules': schedulesBridge,
});
const schedules = load('native-app-control/worker/src/blockSchedules.ts', {
  './applicationBlockPolicies': appPolicies,
});
Object.assign(schedulesBridge, schedules);
const policy = load('native-app-control/worker/src/policy.ts');
const repository = load('native-app-control/worker/src/repository.ts', {
  './policy': policy, './crypto': { hmacHex: async () => '', randomSecret: () => '' },
  './blockSchedules': schedules, './applicationBlockPolicies': appPolicies,
});
const nativeCel = load('native-app-control/worker/src/nativeCelPolicy.ts', {
  './policy': policy, './blockSchedules': schedules, './applicationBlockPolicies': appPolicies,
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
  legacy.exec(`INSERT INTO native_app_block_schedules_v1
    (child_id, source_type, source_key, start_minute, end_minute, effective_active, updated_at)
    VALUES ('old', 'APPLICATION', 'legacy-app', 180, 1080, 1, 10);`);
  for (const name of ['006_native_time_rules_opt_in_v1.sql', '007_native_app_application_windows_v1.sql']) {
    legacy.exec(fs.readFileSync(path.join(ROOT, 'native-app-control/worker/migrations', name), 'utf8'));
  }
  assert.deepEqual([...Object.values(legacy.prepare(`SELECT start_minute, end_minute
    FROM native_app_application_windows_v1 WHERE application_id = 'legacy-app'`).get())], [180, 1080]);
  assert.equal(legacy.prepare(`SELECT COUNT(*) AS count FROM native_app_block_schedules_v1
    WHERE source_type = 'APPLICATION'`).get().count, 0);

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
  }), /application_not_found/);
  assert.equal(sqlite.prepare("SELECT start_minute FROM native_app_application_windows_v1 WHERE application_id = 'app'").get().start_minute, 540);
  await schedules.saveBlockSchedulesBulk(env, auth, {
    sources: [{ sourceType: 'APPLICATION', sourceKey: 'app' }],
    allDay: false, start: '13:00', end: '14:00',
  });
  assert.equal(sqlite.prepare("SELECT policy_version FROM native_children_v1 WHERE child_id = 'child'").get().policy_version, beforeBulk + 1);
  await schedules.saveBlockSchedule(env, auth, {
    sourceType: 'PREDEFINED', sourceKey: '["source-a",1]',
    allDay: false, start: '13:00', end: '14:00',
  });
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

  const firefox = database();
  firefox.sqlite.exec(`INSERT INTO native_children_v1 (child_id, account_id, created_at, updated_at)
    VALUES ('kid', 'parent', 1, 1);
    INSERT INTO account_applications_v1
      (id, account_id, auto_group_key, display_name, team_id, top_level_bundle_id, created_at, updated_at)
    VALUES ('firefox', 'parent', 'MOZ:firefox', 'Firefox', 'MOZ', 'org.mozilla.firefox', 1, 1),
      ('firefox-copy', 'parent', 'MOZ:firefox-copy', 'Firefox copy', 'MOZ', 'org.mozilla.firefox', 1, 1),
      ('lookalike', 'parent', 'EVIL:firefox', 'Lookalike', 'EVIL', 'org.mozilla.firefox', 1, 1);
    INSERT INTO child_application_states_v1
      (child_id, application_id, state, block_origin, created_at, updated_at)
    VALUES ('kid', 'firefox', 'BLOCK', 'DIRECT', 1, 1),
      ('kid', 'firefox-copy', 'BLOCK', 'DIRECT', 1, 1),
      ('kid', 'lookalike', 'BLOCK', 'DIRECT', 1, 999);
    INSERT INTO application_identities_v1
      (id, identity_key, identity_type, identifier, bundle_id, created_at, updated_at)
    VALUES ('ff-main', 'SIGNINGID:MOZ:firefox', 'SIGNINGID', 'MOZ:firefox', 'org.mozilla.firefox', 1, 1),
      ('ff-copy', 'SIGNINGID:MOZ:copy', 'SIGNINGID', 'MOZ:copy', 'org.mozilla.firefox', 1, 1);
    INSERT INTO application_memberships_v1 (application_id, identity_id, membership_source, created_at)
    VALUES ('firefox', 'ff-main', 'automatic', 1),
      ('firefox-copy', 'ff-copy', 'automatic', 1);
    INSERT INTO native_app_predefined_items_v1
      (child_id, source, source_index, display_name, bundle_id, created_at, updated_at)
    VALUES ('kid', 'qustodio', 1, 'Firefox', 'org.mozilla.firefox', 1, 1),
      ('kid', 'qustodio', 2, 'Firefox helper', 'org.mozilla.firefox.helper', 1, 1);
    UPDATE native_app_predefined_items_v1 SET parent_source_index = 1 WHERE source_index = 2;
    INSERT INTO native_app_predefined_identities_v1
      (child_id, source, source_index, identity_key, identity_type, identifier,
       match_origin, status, created_at, updated_at)
    VALUES ('kid', 'qustodio', 1, 'SIGNINGID:MOZ:firefox', 'SIGNINGID', 'MOZ:firefox',
      'inventory', 'AUTO', 1, 1),
      ('kid', 'qustodio', 2, 'SIGNINGID:MOZ:helper', 'SIGNINGID', 'MOZ:helper',
      'inventory', 'AUTO', 1, 1);`);
  const ffAuth = { child_id: 'kid', account_id: 'parent' };
  await appPolicies.saveApplicationPolicies(firefox.env, ffAuth, {
    applicationIds: ['firefox'], allDay: false,
    windows: [{ start: '03:00', end: '08:00' }, { start: '09:00', end: '18:00' }],
  });
  const ffPolicy = await nativeCel.loadNativeTimedPolicy(firefox.env, 'kid');
  assert.equal(ffPolicy.identities.filter((row) => row.identifier === 'MOZ:helper').length, 2,
    'verified component inherits both application windows, not the newer lookalike bundle');
  assert.equal(ffPolicy.identities.filter((row) => row.identifier === 'MOZ:copy').length, 2,
    'duplicate historical Application row inherits the top-level policy');
  assert.equal(ffPolicy.identities.some((row) => row.start_minute === null), false,
    'old all-day preconfiguration must not survive manual takeover');
  await assert.rejects(() => schedules.saveBlockSchedule(firefox.env, ffAuth, {
    sourceType: 'PREDEFINED', sourceKey: '["qustodio",1]', allDay: false,
    start: '00:00', end: '07:00',
  }), /block_source_not_found/, 'a taken-over preset must not accept another hidden editable schedule');
  const ffRules = nativeCel.compileNativeTimedRules(ffPolicy.identities, [], ffPolicy.timeZone, baseline);
  assert.equal(ffRules.find((rule) => rule.identifier === 'MOZ:firefox').policy, 'CEL');
  assert.equal(ffRules.find((rule) => rule.identifier === 'MOZ:helper').policy, 'CEL');
  assert.equal(ffRules.filter((rule) => rule.identifier === 'MOZ:firefox').length, 1);
  const ffBlocked = await repository.loadBlockedPolicy(firefox.env, 'kid');
  const expected = schedules.scheduleActive(180, 480, 'Asia/Shanghai', Date.now())
    || schedules.scheduleActive(540, 1080, 'Asia/Shanghai', Date.now());
  assert.equal(ffBlocked.applications.some((row) => row.identities.some((identity) => identity.identifier === 'MOZ:firefox')), expected);
  assert.equal(ffBlocked.applications.some((row) => row.identities.some((identity) => identity.identifier === 'MOZ:helper')), expected);
  await appPolicies.reconcileApplicationPolicies(firefox.env, 'kid', Date.UTC(2026, 9, 1, 12, 0));
  const outsideVersion = firefox.sqlite.prepare(`SELECT policy_version FROM native_children_v1
    WHERE child_id = 'kid'`).get().policy_version;
  await appPolicies.reconcileApplicationPolicies(firefox.env, 'kid', Date.UTC(2026, 9, 1, 12, 0));
  assert.equal(firefox.sqlite.prepare(`SELECT policy_version FROM native_children_v1
    WHERE child_id = 'kid'`).get().policy_version, outsideVersion, 'same time boundary is idempotent');
  await appPolicies.reconcileApplicationPolicies(firefox.env, 'kid', Date.UTC(2026, 9, 1, 19, 0));
  assert.equal(firefox.sqlite.prepare(`SELECT policy_version FROM native_children_v1
    WHERE child_id = 'kid'`).get().policy_version, outsideVersion + 1,
  '03:00 Asia/Shanghai activates the first window');
  await appPolicies.reconcileApplicationPolicies(firefox.env, 'kid', Date.UTC(2026, 9, 2, 0, 0));
  assert.equal(firefox.sqlite.prepare(`SELECT policy_version FROM native_children_v1
    WHERE child_id = 'kid'`).get().policy_version, outsideVersion + 2,
  '08:00 Asia/Shanghai ends the first window');
  await assert.rejects(() => appPolicies.saveApplicationPolicies(firefox.env, ffAuth, {
    applicationIds: ['firefox'], allDay: false, windows: [],
  }), /invalid_application_windows/);
  console.log('Native App block schedules tests: passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
