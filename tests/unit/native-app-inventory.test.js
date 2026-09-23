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
    '003_native_app_predefined_controls_v1.sql']) {
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
  console.log('Native App inventory tests: passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
