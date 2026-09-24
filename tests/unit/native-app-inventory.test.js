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
    crypto: { randomUUID }, Date, Map, Set, JSON, console,
  });
  return module.exports;
}

const policy = loadModule('native-app-control/worker/src/policy.ts');
const repository = loadModule('native-app-control/worker/src/repository.ts', {
  './policy': policy, './crypto': { hmacHex: async () => '', randomSecret: () => '' },
});

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of ['001_native_app_control_v1.sql', '002_native_app_inventory_v1.sql',
    '003_native_app_predefined_controls_v1.sql', '004_native_app_preconfiguration_source_v1.sql']) {
    sqlite.exec(fs.readFileSync(path.join(ROOT, 'native-app-control', 'worker', 'migrations', migration), 'utf8'));
  }
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => sqlite.prepare(sql).run(...args),
  });
  return {
    sqlite,
    env: {
      DB: {
        prepare: (sql) => statement(sql),
        batch: async (statements) => {
          sqlite.exec('BEGIN');
          try {
            for (const item of statements) await item.run();
            sqlite.exec('COMMIT');
          } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        },
      },
    },
  };
}

function seed(sqlite, childId, macId, accountId = 'account-1') {
  sqlite.prepare('INSERT INTO native_children_v1 (child_id, account_id, created_at, updated_at) VALUES (?, ?, 1, 1)')
    .run(childId, accountId);
  sqlite.prepare('INSERT INTO native_macs_v1 (id, child_id, display_name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    .run(macId, childId, macId);
  return { child_id: childId, account_id: accountId };
}

const signed = (name, bundle, team, signing = bundle, hash = 'a'.repeat(40)) => ({
  displayName: name, bundleId: bundle, teamId: team, signingId: signing,
  cdHash: hash, signatureStatus: 'signed_valid', sourceCategory: 'third_party',
});

(async () => {
  const { sqlite, env } = database();
  const auth = seed(sqlite, 'child-1', 'mac-1');
  seed(sqlite, 'child-2', 'mac-2');
  const edge = signed('Microsoft Edge', 'com.microsoft.edgemac', 'UBF8T346G9');
  const safari = signed('Safari', 'com.apple.Safari', null, 'platform:com.apple.Safari');
  const steam = signed('Steam', 'com.valvesoftware.steam', 'MXGJJ98X76');
  const chatgpt = signed('ChatGPT', 'com.openai.chat', 'OPENAI1234');
  const first = await repository.importNativeMacInventory(env, auth, 'mac-1', [edge, safari, steam, steam, chatgpt]);
  assert.equal(first.count, 4, '重复安装副本只计一款 App');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM application_observations_v1').get().n, 0);
  let rows = await repository.listApplications(env, auth, 'REVIEW');
  assert.equal(rows.length, 4);
  assert(rows.every((row) => row.installed && !row.observed));
  const safariRow = rows.find((row) => row.display_name === 'Safari');
  const edgeRow = rows.find((row) => row.display_name === 'Microsoft Edge');
  const steamRow = rows.find((row) => row.display_name === 'Steam');
  await repository.decideApplication(env, auth, safariRow.id, 'BLOCK');
  await repository.decideApplication(env, auth, edgeRow.id, 'BLOCK');
  await repository.decideApplication(env, auth, steamRow.id, 'BLOCK');
  const before = await repository.loadBlockedPolicy(env, auth.child_id);
  const changedSafari = { ...safari, cdHash: 'b'.repeat(40) };
  const second = await repository.importNativeMacInventory(env, auth, 'mac-1', [edge, changedSafari]);
  assert.equal(second.count, 2);
  const after = await repository.loadBlockedPolicy(env, auth.child_id);
  assert.deepEqual(JSON.parse(JSON.stringify(after)), JSON.parse(JSON.stringify(before)),
    '安装快照不能悄悄扩展已有 Safari BLOCK 身份');
  const blocked = await repository.listApplications(env, auth, 'BLOCK');
  assert.equal(blocked.find((row) => row.display_name === 'Safari').ruleCoversInstalledVersion, true,
    'Apple platform SigningID 稳定覆盖更新后的安装哈希');
  assert.equal(blocked.length, 3, 'Edge、Steam 与 Safari 既有阻止状态保留');
  rows = await repository.listApplications(env, auth, 'REVIEW');
  assert.equal(rows.length, 0, '新快照中消失的 REVIEW 项不再出现在主列表');
  await repository.importNativeMacInventory(env, auth, 'mac-1', [edge, changedSafari]);
  rows = await repository.listApplications(env, auth, 'REVIEW');
  assert.equal(rows.length, 0, '重复导入不增加应用行');

  sqlite.prepare('INSERT INTO native_macs_v1 (id, child_id, display_name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    .run('mac-1b', 'child-1', 'Second Mac');
  await repository.importNativeMacInventory(env, auth, 'mac-1b', [edge]);
  const edgeBlocked = (await repository.listApplications(env, auth, 'BLOCK'))
    .find((row) => row.display_name === 'Microsoft Edge');
  assert.deepEqual([...edgeBlocked.installedOnMacIds].sort(), ['mac-1', 'mac-1b']);

  const secondMacAuth = seed(sqlite, 'child-3', 'mac-3');
  await repository.importNativeMacInventory(env, secondMacAuth, 'mac-3', [edge]);
  const otherChild = await repository.listApplications(env, secondMacAuth, 'REVIEW');
  assert.equal(otherChild.length, 1);
  assert.deepEqual([...otherChild[0].installedOnMacIds], ['mac-3']);
  assert.deepEqual([...edgeBlocked.installedOnMacIds].sort(), ['mac-1', 'mac-1b']);
  assert.equal(await repository.importNativeMacInventory(env, auth, 'mac-3', [edge]), null,
    '不能给另一个 Child 的 Mac 上传清单');

  const historical = database();
  const firstChild = seed(historical.sqlite, 'historical-1', 'historical-mac-1');
  const secondChild = seed(historical.sqlite, 'historical-2', 'historical-mac-2');
  await repository.observeSantaEvents(historical.env, {
    accountId: firstChild.account_id, childId: firstChild.child_id, nativeMacId: 'historical-mac-1',
  }, [{ file_name: 'MSTeams', file_path: '/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams',
    bundle_id: 'com.microsoft.teams2', team_id: 'UBF8T346G9', signing_id: 'com.microsoft.teams2' }]);
  let firstRows = await repository.listApplications(historical.env, firstChild, 'REVIEW');
  assert.equal(firstRows.length, 1);
  assert.equal(firstRows[0].display_name, 'MSTeams');
  const applicationId = firstRows[0].id;
  await repository.importNativeMacInventory(historical.env, firstChild, 'historical-mac-1', [
    signed('Microsoft Teams', 'com.microsoft.teams2', 'UBF8T346G9'),
  ]);
  firstRows = await repository.listApplications(historical.env, firstChild, 'REVIEW');
  assert.equal(firstRows.length, 1, '先 Santa 后清单不复制应用');
  assert.equal(firstRows[0].id, applicationId);
  assert.equal(firstRows[0].display_name, 'Microsoft Teams', '当前 Child 主名以安装快照为准');
  assert.equal(historical.sqlite.prepare('SELECT display_name FROM account_applications_v1 WHERE id = ?')
    .get(applicationId).display_name, 'MSTeams', '不覆盖账号共享身份名称');

  await repository.importNativeMacInventory(historical.env, secondChild, 'historical-mac-2', [
    signed('Teams for School', 'com.microsoft.teams2', 'UBF8T346G9'),
  ]);
  const secondRows = await repository.listApplications(historical.env, secondChild, 'REVIEW');
  assert.equal(secondRows.length, 1);
  assert.equal(secondRows[0].display_name, 'Teams for School');
  assert.equal((await repository.listApplications(historical.env, firstChild, 'REVIEW'))[0].display_name,
    'Microsoft Teams', '另一个 Child 的清单不能改本 Child 主名');

  historical.sqlite.prepare('INSERT INTO native_macs_v1 (id, child_id, display_name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)')
    .run('historical-mac-1b', 'historical-1', 'Second Mac');
  await repository.importNativeMacInventory(historical.env, firstChild, 'historical-mac-1b', [
    signed('Teams New Name', 'com.microsoft.teams2', 'UBF8T346G9'),
  ]);
  historical.sqlite.prepare('UPDATE native_app_inventory_snapshots_v1 SET imported_at = imported_at + 1 WHERE id = '
    + '(SELECT inventory_snapshot_id FROM native_macs_v1 WHERE id = ?)').run('historical-mac-1b');
  assert.equal((await repository.listApplications(historical.env, firstChild, 'REVIEW'))[0].display_name,
    'Teams New Name', '多台 Mac 使用最新有效快照的采集名');
  console.log('Native App inventory tests: passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
