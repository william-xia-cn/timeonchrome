const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { checkCopy } = require('../../tools/check-composite-evidence-copy');

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require: key => { assert.ok(key in imports, key); return imports[key]; },
    crypto: webcrypto, URL, Date, TextEncoder, structuredClone, ...globals });
  return module.exports;
}

async function main() {
  checkCopy('extension/core/generated/composite-page-evidence-v1.js');
  const shared = load('extension/core/generated/composite-page-evidence-v1.js');
  let state = { guardian_config: {}, cloud_device_id: 'test-device', cloud_profile_id: 'test-profile' };
  let classification = 'composite';
  const tab = { id: 1, windowId: 2, url: 'https://en.wikipedia.org/wiki/Physics?x=private#fragment', title: 'Physics', incognito: false };
  const observer = load('extension/infra/composite-page-observer.js', {
    '../core/generated/composite-page-evidence-v1.js': shared,
    '../core/managed-targets.js': { resolveManagedTargetAttribution: () => ({
      targetClassificationAtTime: classification, managedTargetValue: 'wikipedia.org',
    }) },
    './storage-budget.js': { runStorageMutation: task => task({
      get: async () => structuredClone(state), set: async items => Object.assign(state, items),
      remove: async key => { delete state[key]; },
    }) },
  }, { chrome: { tabs: { get: async () => tab }, storage: { local: { get: async () => structuredClone(state) } } } });
  await observer.observeCompositeTab(1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY], undefined, 'default off');
  state.guardian_config.compositeReviewConfig = { enabled: true };
  classification = 'pending_composite';
  await observer.observeCompositeTab(1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY].rows.length, 0, 'fallback excluded');
  classification = 'composite';
  await observer.observeCompositeTab(1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY].rows.length, 1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY].rows[0].page.path, '/wiki/Physics');
  assert.ok(!JSON.stringify(state[observer.COMPOSITE_PAGE_KEY]).includes('private'));
  await observer.observeCompositeTab(1, { expectedUrl: 'https://en.wikipedia.org/wiki/Other' });
  assert.equal(state[observer.COMPOSITE_PAGE_KEY].rows.length, 1);
  tab.url = 'https://en.wikipedia.org/wiki/Math';
  await observer.observeCompositeTab(1, { navigation: true });
  tab.title = 'Changed'; await observer.observeCompositeTab(1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY].rows.length, 3);
  tab.incognito = true; await observer.observeCompositeTab(1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY].rows.length, 3);
  tab.incognito = false; tab.url = 'https://en.wikipedia.org/account/private';
  await observer.observeCompositeTab(1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY].rows.length, 3);
  state.guardian_config.compositeReviewConfig.enabled = false;
  await observer.observeCompositeTab(1);
  assert.equal(state[observer.COMPOSITE_PAGE_KEY], undefined, 'off clears observations');
  const now = Date.now();
  const old = observer.trimCompositeObservations({ rows: [{ lastObservedAt: now - 4 * 86400000 }] }, now);
  assert.equal(old.rows.length, 0); assert.equal(old.dropped, 1);
  const huge = observer.trimCompositeObservations({ rows: Array.from({ length: 2000 }, (_, id) => ({ id,
    lastObservedAt: now, page: { title: 'x'.repeat(160), path: '/wiki/A' } })) }, now);
  assert.ok(Buffer.byteLength(JSON.stringify(huge)) <= shared.PAGE_EVIDENCE_MAX_BYTES);

  state.guardian_config.compositeReviewConfig.enabled = true;
  const row = { id: 'row', site: 'wikipedia.org', profileId: 'test-profile', deviceId: 'test-device',
    tabId: 1, windowId: 2, startMs: now - 1000, endMs: now, lastObservedAt: now,
    page: { host: 'en.wikipedia.org', path: '/wiki/A', title: 'A' } };
  state[observer.COMPOSITE_PAGE_KEY] = { rows: [row], frozen: {}, coverageStart: now - 2000, droppedBefore: 0 };
  const authorization = { id: 'request', profileId: 'test-profile', deviceId: 'test-device',
    cutoff: now, dayStart: now - 2000, site: 'wikipedia.org' };
  const posted = [];
  await observer.syncCompositePageEvidence(async (method, _path, body) => {
    if (method === 'GET') return { requests: [authorization] };
    posted.push(body); return { index: body.index, hash: body.hash };
  });
  assert.equal(posted.length, 1); assert.equal(posted[0].complete, true);
  assert.equal(posted[0].hash, await shared.hashPageEvidence(posted[0].rows));
  await assert.rejects(observer.syncCompositePageEvidence(async method => method === 'GET'
    ? { requests: [authorization] } : { index: 0, hash: 'bad' }), /ACK_MISMATCH/);
  for (const status of [403, 404, 409, 410]) {
    await assert.rejects(observer.syncCompositePageEvidence(async method => {
      if (method === 'GET') return { requests: [authorization] };
      throw new Error(`http_${status}`);
    }), new RegExp(`http_${status}`));
  }
  await observer.syncCompositePageEvidence(async () => ({ requests: [{ ...authorization, deviceId: 'other' }] }));
  assert.ok(!JSON.stringify(state).includes('cloud_device_token'));
  console.log('Composite observer: default-off, explicit classification, privacy, retention, budget, authorization and ACK PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
