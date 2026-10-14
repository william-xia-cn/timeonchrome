'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, require: name => load(path.resolve(path.dirname(file), name)) });
  return exports;
}
const downtime = load(path.join(root, 'extension/core/downtime.js'));
const normalizer = load(path.join(root, 'extension/core/site-access-config-normalizer.js'));
const source = ts.createSourceFile('cloud-sync.js', fs.readFileSync(path.join(root, 'extension/infra/cloud-sync.js'), 'utf8'), ts.ScriptTarget.ES2022, true);
const names = ['pickFirstArray', 'normalizeCloudRulesConfig', 'localConfigMissingCloudDefaultLists',
  'responseHasCloudDefaultLists', 'shouldSaveDespiteVersionSkip', 'downtimeConfigNeedsRepair', 'pullCloudConfig'];
const code = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name.text)
  || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ['CLOUD_CONFIG', 'DEFAULT_SITE_LIST_FIELD_GROUPS'].includes(d.name.getText(source))))
  .map(n => n.getText(source)).join('\n').replace(/export async function/g, 'async function');
const policy = { schemaVersion: 1, enabled: true, windowsByWeekday: { monday: [{ start: '22:00', end: '07:00' }] },
  allowedWebsiteTypes: ['study'], allowedApplicationTypes: [] };
async function run({ localPolicy, remotePolicy = policy, profileVersion = 3, systemVersion = 7, localVersion = 10, failSave = false } = {}) {
  const local = normalizer.normalizeRuntimeSiteAccessConfig({ enabled: true, adminPasswordHash: 'fixture-hash', isInitialized: true, lockedDomains: [],
    timeQuota: { accountingVersion: 2 }, ...(localPolicy === undefined ? {} : { downtimeConfig: structuredClone(localPolicy) }) }, { fallbackConfig: {} }).config;
  const response = { data: { enabled: true, timeQuota: { accountingVersion: 2 },
    ...(remotePolicy === undefined ? {} : { downtimeConfig: structuredClone(remotePolicy) }) },
    version: 10, profile_version: profileVersion, system_access_version: systemVersion,
    usage_accounting_corrections_revision: 'fixture-revision' };
  const writes = [], metadata = [];
  const ctx = { ...downtime, ...normalizer, console: { log() {}, warn() {}, error() {} }, Date,
    DEFAULT_CONFIG: {}, syncState: { lastConfigVersion: localVersion, lastProfileConfigVersion: 3,
      lastSystemAccessVersion: 7, lastAccountingCorrectionsRevision: 'fixture-revision' },
    cloudRequest: async () => structuredClone(response), cloudStorageSet: async value => metadata.push(value),
    logCloudSchemaIncompatibility() {}, logCloudFailureIncidentBestEffort() {} };
  vm.runInNewContext(code, ctx);
  const result = await ctx.pullCloudConfig(async () => structuredClone(local), async value => {
    if (failSave) throw Error('fixture storage unavailable');
    writes.push(structuredClone(value));
  }, async () => {});
  return { result, writes, ctx };
}
(async () => {
  const missing = await run();
  assert.equal(missing.result.status, 'updated', 'same revision must repair missing downtime');
  assert.deepEqual(missing.writes[0].downtimeConfig, policy);
  assert.equal(missing.writes[0].adminPasswordHash, 'fixture-hash');
  assert.equal(missing.writes[0].isInitialized, true);
  const disabled = await run({ localPolicy: { ...policy, enabled: false } });
  assert.equal(disabled.result.status, 'updated');
  const same = await run({ localPolicy: policy });
  assert.equal(same.result.status, 'skipped');
  assert.equal(same.writes.length, 0);
  const old = await run({ localPolicy: { ...policy, enabled: false }, profileVersion: 2 });
  assert.equal(old.result.status, 'skipped', 'older cloud policy cannot overwrite new local revision');
  assert.equal(old.writes.length, 0);
  const fresh = await run({ localPolicy: { ...policy, enabled: false }, profileVersion: 4 });
  assert.equal(fresh.result.status, 'updated');
  const off = await run({ localPolicy: policy, remotePolicy: { ...policy, enabled: false } });
  assert.equal(off.result.status, 'updated');
  assert.equal(off.writes[0].downtimeConfig.enabled, false);
  const failed = await run({ failSave: true });
  assert.equal(failed.result.status, 'failed');
  assert.equal(failed.writes.length, 0);
  console.log('Downtime actual config pull: same-revision repair, older rejection, toggle, private fields and failure PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
