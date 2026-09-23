'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
function loadModule(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (name) => dependencies[name],
    crypto: { randomUUID }, Date, Map, Set, JSON, console, Request, Response, URL,
  });
  return module.exports;
}

const policy = loadModule('native-app-control/worker/src/policy.ts');
const presets = loadModule('native-app-control/worker/src/presets.ts');
const repository = loadModule('native-app-control/worker/src/repository.ts', {
  './policy': policy, './crypto': { hmacHex: async () => '', randomSecret: () => '' },
});

function database() {
  const sqlite = new DatabaseSync(':memory:');
  let batchTail = Promise.resolve();
  for (const migration of ['001_native_app_control_v1.sql', '002_native_app_inventory_v1.sql',
    '003_native_app_predefined_controls_v1.sql']) {
    sqlite.exec(fs.readFileSync(path.join(ROOT, 'native-app-control', 'worker', 'migrations', migration), 'utf8'));
  }
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => sqlite.prepare(sql).run(...args),
  });
  return { sqlite, env: { DB: {
    prepare: (sql) => statement(sql),
    batch: (statements) => {
      const operation = batchTail.then(async () => {
        sqlite.exec('BEGIN');
        try {
          for (const item of statements) await item.run();
          sqlite.exec('COMMIT');
        } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      batchTail = operation.catch(() => {});
      return operation;
    },
  } } };
}

function seed(sqlite, child, mac) {
  sqlite.prepare('INSERT INTO native_children_v1 (child_id, account_id, created_at, updated_at) VALUES (?, ?, 1, 1)')
    .run(child, 'account-1');
  sqlite.prepare('INSERT INTO native_macs_v1 (id, child_id, display_name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    .run(mac, child, mac);
  return { child_id: child, account_id: 'account-1' };
}

function sourceItems() {
  return Array.from({ length: 21 }, (_, index) => ({
    sourceIndex: index + 1,
    displayName: `Source ${index + 1}`,
    bundleId: null,
  }));
}

function signed(name, bundleId, teamId, signingId = bundleId) {
  return { displayName: name, bundleId, teamId, signingId, signatureStatus: 'signed_valid' };
}

(async () => {
  const { sqlite, env } = database();
  const auth = seed(sqlite, 'thomas', 'mac-1');
  seed(sqlite, 'other', 'mac-2');
  assert.equal(policy.chooseIdentity({ signing_id: 'platform:com.apple.games' }).identifier,
    'platform:com.apple.games', 'Apple platform SigningID 无 TeamID 仍可执行');

  await repository.importNativeMacInventory(env, auth, 'mac-1', [
    signed('Steam', 'com.valvesoftware.steam', 'MXGJJ98X76'),
    signed('Games', 'com.apple.games', null, 'platform:com.apple.games'),
    { displayName: 'Hash only', bundleId: 'org.example.hash', signatureStatus: 'unsigned',
      mainExecutableSHA256: 'a'.repeat(64) },
  ]);
  const items = sourceItems();
  items[0] = { sourceIndex: 1, displayName: 'Steam', bundleId: 'com.valvesoftware.steam' };
  items[1] = { sourceIndex: 2, displayName: 'Steam Helper', bundleId: 'com.valvesoftware.steam.helper',
    parentSourceIndex: 1, relationshipVerified: true };
  items[2] = { sourceIndex: 3, displayName: 'Games', bundleId: 'com.apple.games' };
  items[3] = { sourceIndex: 4, displayName: 'Hash only', bundleId: 'org.example.hash' };
  items[4] = { sourceIndex: 5, displayName: 'Ambiguous', bundleId: 'org.example.ambiguous' };
  items[5] = { sourceIndex: 6, displayName: 'Later observed', bundleId: 'org.example.later' };
  items[6] = { sourceIndex: 7, displayName: 'Parallel upload', bundleId: 'org.example.parallel' };
  await presets.importPredefinedItems(env, auth, items);
  let listed = await presets.listPredefinedItems(env, auth);
  assert.equal(listed.sourceCount, 21);
  assert.equal(listed.topLevelCount, 20);
  assert.equal(listed.items[0].status, '待同步');
  assert.equal(listed.items[1].status, '待识别');
  assert.equal(listed.items[2].identities[0].identifier, 'platform:com.apple.games');
  assert.equal(listed.items[3].status, '需确认');
  assert.equal((await presets.listPredefinedItems(env, { ...auth, child_id: 'other' })).sourceCount, 0);
  let blocked = await repository.loadBlockedPolicy(env, auth.child_id);
  let rules = policy.compileSantaRules(blocked.applications, blocked.publishers,
    { identifier: '0'.repeat(64), policy: 'ALLOWLIST', rule_type: 'BINARY' });
  assert(rules.some((rule) => rule.identifier === 'MXGJJ98X76:com.valvesoftware.steam'));
  assert(rules.some((rule) => rule.identifier === 'platform:com.apple.games'));
  assert(!rules.some((rule) => rule.identifier === 'a'.repeat(64)));
  assert(!rules.some((rule) => rule.rule_type === 'TEAMID'));
  assert.equal((await repository.loadBlockedPolicy(env, 'other')).applications.length, 0);

  await repository.observeSantaEvents(env, { accountId: auth.account_id, childId: auth.child_id, nativeMacId: 'mac-1' }, [
    { file_name: 'Ambiguous', file_path: '/Applications/Ambiguous.app/Contents/MacOS/Ambiguous',
      bundle_id: 'org.example.ambiguous', team_id: 'AAAAAAAAAA', signing_id: 'org.example.ambiguous' },
    { file_name: 'Ambiguous', file_path: '/Applications/Ambiguous.app/Contents/MacOS/Ambiguous',
      bundle_id: 'org.example.ambiguous', team_id: 'BBBBBBBBBB', signing_id: 'org.example.ambiguous' },
    { file_name: 'Later observed', file_path: '/Applications/Later.app/Contents/MacOS/Later',
      bundle_id: 'org.example.later', team_id: 'CCCCCCCCCC', signing_id: 'org.example.later' },
    { file_name: 'Steam Helper', file_path: '/Applications/Steam.app/Contents/Helpers/Steam Helper',
      bundle_id: 'com.valvesoftware.steam.helper', team_id: 'MXGJJ98X76',
      signing_id: 'com.valvesoftware.steam.helper' },
  ]);
  await presets.reconcilePredefinedItems(env, auth.account_id, auth.child_id);
  listed = await presets.listPredefinedItems(env, auth);
  assert.equal(listed.items[4].status, '需确认', '多个可信 SigningID 也不得自动阻止');
  assert.equal(listed.items[5].status, '待同步', 'Santa 后续首次发现唯一可信身份会生成规则');
  assert.equal(listed.items[1].status, '待同步', '组件独立身份生成独立规则');
  assert(!listed.items[4].identities.some((identity) => identity.status === 'AUTO'));
  blocked = await repository.loadBlockedPolicy(env, auth.child_id);
  assert(blocked.applications.some((app) => app.identities.some((identity) =>
    identity.identifier === 'MXGJJ98X76:com.valvesoftware.steam.helper')));

  await repository.observeSantaEvents(env, { accountId: auth.account_id, childId: auth.child_id, nativeMacId: 'mac-1' }, [
    { file_name: 'Parallel upload', file_path: '/Applications/Parallel.app/Contents/MacOS/Parallel',
      bundle_id: 'org.example.parallel', team_id: 'DDDDDDDDDD', signing_id: 'org.example.parallel' },
  ]);
  const beforeParallel = sqlite.prepare('SELECT policy_version AS v FROM native_children_v1 WHERE child_id = ?')
    .get('thomas').v;
  await Promise.all([
    presets.reconcilePredefinedItems(env, auth.account_id, auth.child_id),
    presets.reconcilePredefinedItems(env, auth.account_id, auth.child_id),
  ]);
  assert.equal(sqlite.prepare('SELECT policy_version AS v FROM native_children_v1 WHERE child_id = ?')
    .get('thomas').v, beforeParallel + 1, '并发重复发现只提升一次策略版本');

  const version = sqlite.prepare('SELECT policy_version AS v FROM native_children_v1 WHERE child_id = ?')
    .get('thomas').v;
  await presets.importPredefinedItems(env, auth, items);
  assert.equal(sqlite.prepare('SELECT policy_version AS v FROM native_children_v1 WHERE child_id = ?')
    .get('thomas').v, version, '重复导入不提升策略版本');
  const hashKey = listed.items[3].identities[0].identity_key;
  assert(await presets.decidePredefinedIdentity(env, auth, 4, hashKey, 'CONFIRM'));
  assert.equal(await presets.decidePredefinedIdentity(env, auth, 4, hashKey, 'CONFIRM'), false);
  blocked = await repository.loadBlockedPolicy(env, auth.child_id);
  assert(blocked.applications.some((app) => app.identities.some((identity) => identity.identifier === 'a'.repeat(64))));
  listed = await presets.listPredefinedItems(env, auth);
  assert.equal(listed.items[3].status, '待同步');
  const desired = sqlite.prepare('SELECT desired_policy_version AS v FROM native_macs_v1 WHERE id = ?')
    .get('mac-1').v;
  sqlite.prepare('UPDATE native_macs_v1 SET applied_policy_version = ? WHERE id = ?').run(desired, 'mac-1');
  listed = await presets.listPredefinedItems(env, auth);
  assert.equal(listed.items[3].status, '已生效');
  sqlite.prepare('INSERT INTO native_macs_v1 (id, child_id, display_name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    .run('mac-1b', 'thomas', 'Second Mac');
  listed = await presets.listPredefinedItems(env, auth);
  assert.equal(listed.items[3].status, '部分生效', '第二台 Mac 未报告应用版本时不得宣称全部生效');

  const steam = (await repository.listApplications(env, auth, 'REVIEW')).find((app) => app.display_name === 'Steam');
  assert(await repository.decideApplication(env, auth, steam.id, 'IGNORE'));
  listed = await presets.listPredefinedItems(env, auth);
  assert.equal(listed.items[0].status, '已停用');
  assert.equal(listed.items[1].status, '已停用', '忽略父应用同步停用核验组件');
  await presets.reconcilePredefinedItems(env, auth.account_id, auth.child_id);
  assert.equal((await presets.listPredefinedItems(env, auth)).items[0].status, '已停用');
  assert.equal((await repository.loadBlockedPolicy(env, auth.child_id)).applications.some((app) =>
    app.identities.some((identity) => identity.identifier === 'MXGJJ98X76:com.valvesoftware.steam')), false);

  const changed = sourceItems();
  changed[0] = { sourceIndex: 1, displayName: 'Steam', bundleId: 'org.changed.identity' };
  await assert.rejects(() => presets.importPredefinedItems(env, auth, changed), /source_identity_changed/);

  const alreadyBlocked = database();
  const secondAuth = seed(alreadyBlocked.sqlite, 'thomas-2', 'mac-2');
  await repository.importNativeMacInventory(alreadyBlocked.env, secondAuth, 'mac-2', [
    signed('Edge', 'com.microsoft.edgemac', 'UBF8T346G9'),
  ]);
  const edge = (await repository.listApplications(alreadyBlocked.env, secondAuth, 'REVIEW'))[0];
  await repository.decideApplication(alreadyBlocked.env, secondAuth, edge.id, 'BLOCK');
  const beforeImportVersion = alreadyBlocked.sqlite.prepare('SELECT policy_version AS v FROM native_children_v1 WHERE child_id = ?')
    .get('thomas-2').v;
  const secondSource = sourceItems();
  secondSource[0] = { sourceIndex: 1, displayName: 'Microsoft Edge', bundleId: 'com.microsoft.edgemac' };
  await presets.importPredefinedItems(alreadyBlocked.env, secondAuth, secondSource);
  assert.equal(alreadyBlocked.sqlite.prepare('SELECT policy_version AS v FROM native_children_v1 WHERE child_id = ?')
    .get('thomas-2').v, beforeImportVersion, '关联已有 BLOCK 不再次下发策略版本');
  const linked = await presets.listPredefinedItems(alreadyBlocked.env, secondAuth);
  assert.equal(linked.items[0].identities[0].match_origin, 'existing_block');
  const existingPolicy = await repository.loadBlockedPolicy(alreadyBlocked.env, secondAuth.child_id);
  rules = policy.compileSantaRules(existingPolicy.applications, existingPolicy.publishers,
    { identifier: '0'.repeat(64), policy: 'ALLOWLIST', rule_type: 'BINARY' });
  assert.equal(rules.filter((rule) => rule.identifier === 'UBF8T346G9:com.microsoft.edgemac').length, 1);

  const admin = loadModule('native-app-control/worker/src/admin.ts', {
    './auth': { authenticateModule: async () => auth },
    './repository': { ensureNativeChild: async () => {} },
    './presets': presets,
  });
  const wrongChild = await admin.handleAdminRequest(new Request('https://native.test/native/v1/predefined/import', {
    method: 'POST', body: JSON.stringify({ expectedChildId: 'other', items }),
  }), env);
  assert.equal(wrongChild.status, 409, '生产导入必须再次绑定当前 Child');
  const read = await admin.handleAdminRequest(new Request('https://native.test/native/v1/predefined'), env);
  assert.equal((await read.json()).data.sourceCount, 21);
  console.log('Native App predefined controls tests: passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
