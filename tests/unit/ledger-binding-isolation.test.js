'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../extension');
const copy = value => JSON.parse(JSON.stringify(value));
const A = { device_token: 'synthetic-A', device_id: 'device-A', profile_id: 'child-A' };
const B = { device_token: 'synthetic-B', device_id: 'device-B', profile_id: 'child-B' };
const date = new Date(Date.now() + 28800000).toISOString().slice(0, 10);
function fixture(initial = {}) {
  const values = copy(initial), sessionValues = {}, requests = [], modules = new Map();
  let failCommit = false, bytesOverride = null, fetchHook = null, maintenanceCalls = 0;
  let rejectPostCommitProbe = false, bindingCommitted = false;
  let commitHook = null;
  const area = data => ({
    async get(keys = null) {
      const names = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      return copy(Object.fromEntries(names.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]])));
    },
    async set(items) {
      if (failCommit && Object.hasOwn(items, 'ledger_binding_scope_v1')) throw Error('synthetic_write_failed');
      if (commitHook && Object.hasOwn(items, 'ledger_binding_scope_v1')) await commitHook(items);
      Object.assign(data, copy(items));
      if (Object.hasOwn(items, 'ledger_binding_scope_v1')) bindingCommitted = true;
    },
    async remove(keys) { for (const key of [].concat(keys)) delete data[key]; },
    async getBytesInUse(keys = null) {
      if (rejectPostCommitProbe && bindingCommitted) throw Error('synthetic_post_commit_probe_failed');
      if (bytesOverride !== null && data === values && keys === null) return bytesOverride;
      return Buffer.byteLength(JSON.stringify(await this.get(keys)));
    },
  });
  const chrome = { storage: { local: area(values), session: area(sessionValues), onChanged: { addListener() {} } },
    runtime: { id: 'fixture-extension', getManifest: () => ({ version: '1.7.63' }),
      getURL: relative => 'chrome-extension://fixture-extension/' + relative.replace(/^\//, ''), sendMessage: async () => {} } };
  const context = vm.createContext({ chrome, console: { log() {}, warn() {}, error() {} },
    crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams,
    AbortController, DOMException, setTimeout, clearTimeout, queueMicrotask, structuredClone, atob, btoa,
    fetch: async (url, options) => {
      const request = { url, headers: options.headers, body: options.body ? JSON.parse(options.body) : null };
      requests.push(request);
      if (fetchHook) { const response = await fetchHook(request); if (response) return response; }
      let body = { success: true };
      if (url.endsWith('/device/usage-segments/v1')) body = {
        accepted: request.body.segments.map(segment => ({ id: segment.id, contentHash: segment.contentHash })), rejected: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
  const logs = new Proxy({}, { get: () => () => Promise.resolve() });
  function load(file) {
    const filename = path.resolve(root, file);
    if (modules.has(filename)) return modules.get(filename).exports;
    if (file === 'infra/client-logs.js') return logs;
    if (['product/interceptor.js', 'product/quota.js', 'product/mode-service.js', 'product/mode-effects.js',
      'stats/managed-statistics.js', 'core/classification-effective-boundary.js'].includes(file)) return logs;
    if (file === 'infra/native-host-client.js') return new Proxy({}, { get: () => () => { throw Error('Native is outside this isolated binding test'); } });
    if (file === 'core/activation-gate.js') return { resolveActivationState: async () => ({ activated: true }) };
    if (file === 'infra/storage.js') return { DEFAULT_CONFIG: {}, getDateKey: () => date,
      getStatsRange: async () => ({}), getConfig: async () => values.guardian_config || {} };
    if (file === 'infra/storage-maintenance.js') return { runV1StorageMaintenance: async () => ({}) };
    const module = { exports: {} }; modules.set(filename, module);
    let source = fs.readFileSync(filename, 'utf8');
    if (file === 'infra/cloud-sync.js') source += '\nexport { uploadDeviceAccountV2Shadow, buildUsageDateUploadPackage, cloudRequest };';
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const execute = vm.runInContext('(function(require,module,exports){' + output + '\n})', context, { filename });
    execute(specifier => {
      assert(specifier.startsWith('.'), 'unexpected dependency: ' + specifier);
      return load(path.relative(root, path.resolve(path.dirname(filename), specifier)).replaceAll('\\', '/'));
    }, module, module.exports);
    return module.exports;
  }
  const cloud = load('infra/cloud-sync.js'), ledger = load('core/usage-segments.js');
  const budget = load('infra/storage-budget.js');
  budget.registerStoragePressureHandler(async () => { maintenanceCalls++; });
  return { values, requests, cloud, ledger, load, chrome, fetch: context.fetch,
    fail(value) { failCommit = value; }, pressure(value) { bytesOverride = value; }, hook(value) { fetchHook = value; },
    maintenance: () => maintenanceCalls,
    commitHook(hook) { commitHook = hook; },
    rejectProbeAfterCommit() { rejectPostCommitProbe = true; bindingCommitted = false; },
    async bind(binding) { return cloud.cloudBind(null, binding); },
    async settle(binding, offset = 0) {
      const endMs = Date.now() - 1000 - offset;
      return ledger.settleUsageDuration({ profileId: binding.profile_id, deviceId: binding.device_id,
        timezone: 'Asia/Shanghai', startMs: endMs - 5000, endMs,
        domain: 'fixture.invalid', sourceState: 'ACTIVE', settlementReason: 'periodic_checkpoint', mode: 'study',
        targetClassificationAtTime: 'study', quotaBucketAtTime: 'study' });
    },
  };
}
const archived = f => Object.values(f.values.ledger_binding_archives_v1 || {});
async function run() {
  const f = fixture();
  assert((await f.bind(A)).success);
  await f.settle(A);
  const initialRaw = copy(f.values.usage_segments_v1), initialStats = copy(f.values.daily_usage_stats_v1);
  f.values.device_account_v2_state = { schemaVersion: 1, byDate: { [date]: { revision: 7, status: 'published', manifestHash: 'A' } } };
  f.values.usage_stats_history_synced_through_date_v1 = date;
  assert((await f.bind(B)).success);
  assert.deepEqual(f.values.usage_segments_v1, {});
  assert.deepEqual(archived(f)[0].values.usage_segments_v1, initialRaw);
  assert.deepEqual(archived(f)[0].values.daily_usage_stats_v1, initialStats);
  assert.equal(f.values.device_account_v2_state.byDate, undefined);
  assert.equal(f.values.usage_stats_history_synced_through_date_v1, null);
  await f.settle(B);
  const uploaded = await f.cloud.uploadUsageSegmentsV1({ enabled: true });
  assert.equal(uploaded.failed, 0);
  assert(f.requests.length > 0);
  assert(f.requests.every(request => request.headers.Authorization === 'Bearer synthetic-B'));
  assert(f.requests.flatMap(request => request.body?.segments || []).every(segment => !Object.hasOwn(initialRaw, segment.id)));
  assert((await f.bind(A)).success);
  assert.deepEqual(f.values.usage_segments_v1, initialRaw);
  assert.deepEqual(f.values.daily_usage_stats_v1, initialStats);
  assert.equal(f.values.device_account_v2_state.byDate[date].revision, 7);
  assert.equal(f.values.device_account_v2_state.byDate[date].status, 'published');
  const beforeRotation = copy(f.values);
  assert((await f.bind({ ...A, device_token: 'synthetic-A-rotated' })).success);
  for (const key of ['usage_segments_v1', 'daily_usage_stats_v1', 'device_account_v2_state', 'ledger_binding_archives_v1']) {
    assert.deepEqual(f.values[key], beforeRotation[key]);
  }
  const otherDevice = { ...A, device_id: 'device-A2', device_token: 'synthetic-A2' };
  assert((await f.bind(otherDevice)).success);
  assert.deepEqual(f.values.usage_segments_v1, {});
  console.log('PASS: real cloudBind, settlement, raw upload, same-day A/B/A and token/device boundaries');

  const concurrent = fixture(); await concurrent.bind(A); await concurrent.settle(A);
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  concurrent.hook(async request => {
    if (request.url.endsWith('/device/usage-segments/v1')) {
      entered(); await new Promise(resolve => { release = resolve; });
    }
  });
  const sending = concurrent.cloud.uploadUsageSegmentsV1({ enabled: true });
  await started;
  const change = concurrent.bind(B);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(concurrent.values.cloud_profile_id, A.profile_id, 'switch waits through response and ACK');
  release(); await sending; assert((await change).success);
  assert.deepEqual(concurrent.values.usage_segments_v1, {});
  assert(concurrent.requests.every(request => request.headers.Authorization === 'Bearer synthetic-A'));
  assert(archived(concurrent)[0].values.segment_sync_outbox_v1.dirtySegmentIds.length === 0);
  console.log('PASS: actual in-flight upload and ACK finish in A before B is committed');

  const v2 = fixture(); await v2.bind(A); await v2.settle(A);
  const manifests = new Map();
  v2.hook(async request => {
    let body;
    if (request.url.endsWith('/device/accounts/v2/manifests')) {
      const id = request.headers.Authorization.slice(7) + '-manifest';
      manifests.set(id, request.body);
      body = { manifestId: id, revision: request.body.revision };
    } else if (request.url.endsWith('/commit')) {
      const id = request.url.split('/').at(-2), manifest = manifests.get(id);
      body = { status: 'committed', revision: manifest.revision, publishedRevision: manifest.revision, publishedAt: 100 };
    }
    return body && new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
  const publish = async () => v2.cloud.uploadDeviceAccountV2Shadow(await v2.cloud.buildUsageDateUploadPackage(date), { enabled: true });
  assert.equal((await publish()).failed, 0);
  assert.equal(v2.values.device_account_v2_state.byDate[date].status, 'published');
  const aPublished = copy(v2.values.device_account_v2_state);
  await v2.bind(B); await v2.settle(B);
  const beforeB = v2.requests.length;
  assert.equal((await publish()).failed, 0);
  assert(v2.requests.slice(beforeB).some(request => request.url.endsWith('/device/accounts/v2/manifests')
    && request.headers.Authorization === 'Bearer synthetic-B'));
  assert.equal(v2.values.device_account_v2_state.byDate[date].status, 'published');
  await v2.bind(A);
  assert.deepEqual(v2.values.device_account_v2_state, aPublished);
  console.log('PASS: real V2 prepare/manifest/chunk/commit publishes B despite A published state; A restored exactly');

  const late = fixture(); await late.bind(A);
  let finishBody, bodyEntered;
  const enteredBody = new Promise(resolve => { bodyEntered = resolve; });
  late.hook(async request => request.url.endsWith('/synthetic/late') ? {
    ok: true, status: 200, headers: { get: () => 'application/json' },
    json: () => { bodyEntered(); return new Promise(resolve => { finishBody = resolve; }); },
  } : null);
  const oldResponse = late.cloud.cloudRequest('POST', '/synthetic/late', {}, 1);
  await enteredBody; await late.bind(B);
  const bRaw = copy(late.values.usage_segments_v1), bState = copy(late.values.device_account_v2_state);
  finishBody({ success: true });
  await assert.rejects(oldResponse, /ledger_binding_changed/);
  assert.deepEqual(late.values.usage_segments_v1, bRaw);
  assert.deepEqual(late.values.device_account_v2_state, bState);
  assert(late.requests.filter(request => request.url.endsWith('/synthetic/late'))
    .every(request => request.headers.Authorization === 'Bearer synthetic-A'));
  console.log('PASS: real cloudRequest rejects late old-scope response without accepting it for B');

  for (const failure of ['write', 'capacity']) {
    const failed = fixture(); await failed.bind(A); await failed.settle(A);
    const before = copy(failed.values);
    if (failure === 'write') failed.fail(true); else failed.pressure(9 * 1024 * 1024);
    assert.equal((await failed.bind(B)).success, false);
    assert.deepEqual(failed.values, before);
    assert.equal(failed.maintenance(), 0, 'binding commit cannot delete facts to make room');
    failed.fail(false); failed.pressure(null);
    const restarted = fixture(failed.values);
    assert((await restarted.bind(A)).success);
    assert.deepEqual(restarted.values.usage_segments_v1, before.usage_segments_v1);
  }
  console.log('PASS: persistent/capacity failures preserve old book/binding; restart uses that scope');
  const postCommit = fixture(); await postCommit.bind(A); postCommit.rejectProbeAfterCommit();
  assert((await postCommit.bind(B)).success, 'no fallible after-write budget observation may report a committed switch as failed');
  assert.equal(postCommit.values.cloud_profile_id, B.profile_id);
  assert.equal(postCommit.cloud.getSyncState().profileId, B.profile_id);

  const retry = fixture(); await retry.bind(A); await retry.settle(A);
  const ids = Object.keys(retry.values.usage_segments_v1);
  retry.hook(async () => new Response('{"error":"synthetic"}', { status: 503 }));
  assert((await retry.cloud.uploadUsageSegmentsV1({ enabled: true })).failed > 0);
  retry.hook(null);
  assert.equal((await retry.cloud.uploadUsageSegmentsV1({ enabled: true })).failed, 0);
  assert.deepEqual(Object.keys(retry.values.usage_segments_v1), ids);
  assert.equal(retry.values.segment_sync_outbox_v1.dirtySegmentIds.length, 0);
  console.log('PASS: same-scope retry keeps fact IDs; committed binding is not reported as rolled back');

  const unknown = fixture({ daily_usage_stats_v1: { [date]: { opaqueLegacy: 5 } },
    ledger_binding_archives_v1: { 'unattributed:0': { scope: null, values: { old: 1 } },
      'unattributed:2': { scope: null, values: { old: 2 } } } });
  assert((await unknown.bind(B)).success);
  assert.deepEqual(unknown.values.daily_usage_stats_v1, {});
  assert.equal(archived(unknown).length, 3);
  assert.deepEqual(unknown.values.ledger_binding_archives_v1['unattributed:2'].values, { old: 2 });
  assert(archived(unknown).some(item => item.scope === null && item.values.daily_usage_stats_v1?.[date]?.opaqueLegacy === 5));
  console.log('PASS: unattributed legacy data is preserved, not adopted; sparse archives cannot be overwritten');

  const boundary = fixture(); await boundary.bind(A);
  await boundary.load('runtime/session.js').saveSession({ state: 'ACTIVE', domain: 'fixture.invalid',
    startTime: Date.now() - 5000, lastHeartbeat: Date.now(), tabId: 1, windowId: 1,
    targetClassificationAtTime: 'study', quotaBucketAtTime: 'study' });
  assert((await boundary.bind(B)).success);
  const closed = Object.values(archived(boundary)[0].values.usage_segments_v1);
  assert(closed.some(segment => segment.durationSeconds > 0 && segment.profileId === A.profile_id
    && segment.deviceId === A.device_id && segment.settlementReason === 'binding_scope_changed'));
  assert.deepEqual(boundary.values.usage_segments_v1, {});
  console.log('PASS: actual session close settles positive seconds in A, never B');

  const activeFailure = fixture(); await activeFailure.bind(A); await activeFailure.settle(A, 10000);
  await activeFailure.load('runtime/session.js').saveSession({ state: 'ACTIVE', domain: 'fixture.invalid',
    startTime: Date.now() - 5000, lastHeartbeat: Date.now(), tabId: 1, windowId: 1 });
  const activeBefore = copy(activeFailure.values);
  activeFailure.pressure(9 * 1024 * 1024);
  assert.equal((await activeFailure.bind(B)).success, false);
  assert.equal(activeFailure.maintenance(), 0);
  assert.deepEqual(activeFailure.values.usage_segments_v1, activeBefore.usage_segments_v1);
  assert.equal(activeFailure.values.cloud_device_token, A.device_token);
  assert.equal(activeFailure.values.cloud_profile_id, A.profile_id);
  console.log('PASS: active A boundary under storage pressure never invokes ledger cleanup or binds B');

  const queued = fixture(); await queued.bind(A);
  const queueSession = queued.load('runtime/session.js');
  let finishCommit, commitEntered;
  const committing = new Promise(resolve => { commitEntered = resolve; });
  queued.commitHook(async items => {
    if (items.cloud_profile_id === B.profile_id) {
      commitEntered(); await new Promise(resolve => { finishCommit = resolve; });
    }
  });
  const changing = queued.bind(B); await committing;
  const staleWeb = queueSession.transitionStateAt('ACTIVE', 'stale.invalid', Date.now() - 1000, 'transition');
  const staleMedia = queued.load('runtime/media-session.js').applyMediaFacts([], 'media_fact', Date.now() - 1000);
  finishCommit(); assert((await changing).success);
  assert.equal((await staleWeb).reason, 'binding_scope_changed');
  assert.equal((await staleMedia).reason, 'binding_scope_changed');
  queued.commitHook(null);
  await queueSession.initSession();
  await new Promise(resolve => setTimeout(resolve, 2));
  await queueSession.transitionStateAt('ACTIVE', 'new.invalid', Date.now(), 'transition', {
    tabId: 2, windowId: 1, targetClassificationAtTime: 'study', quotaBucketAtTime: 'study' });
  assert.equal((await queueSession.getSession()).domain, 'new.invalid');
  assert.deepEqual(queued.values.usage_segments_v1, {});
  console.log('PASS: events queued across successful cutover cannot open B in the past; new B observation still opens');

  const page = fixture(); await page.bind(A); await page.settle(A);
  const router = page.load('message-router.js');
  const nodes = new Map(), element = id => {
    if (!nodes.has(id)) nodes.set(id, { value: 'synthetic@example.invalid', classList: { add() {}, remove() {} }, style: {} });
    return nodes.get(id);
  };
  const code = fs.readFileSync(path.join(root, 'bind.js'), 'utf8');
  const tree = ts.createSourceFile('bind.js', code, ts.ScriptTarget.Latest, true);
  const doBind = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'doBind').getText(tree);
  const beforePage = copy(page.values);
  let bindFails = true;
  const runPage = vm.runInNewContext('(async function(){' + doBind + '; await doBind("child-B");})', {
    getChromeIdentityPayload: async () => ({}), getClientPlatform: () => 'windows', showStep() {},
    window: { GUARDIAN_CONFIG: { API_BASE: 'https://fixture.invalid' }, close() {} },
    accountToken: 'synthetic-parent', accountRefreshToken: null, setTimeout() {},
    document: { getElementById: element },
    fetch: async () => new Response(JSON.stringify(bindFails ? { error: 'synthetic_bind_failed' } : B), { status: bindFails ? 500 : 200 }),
    chrome: { ...page.chrome, storage: { local: { set() { throw Error('page must not write live binding'); } } },
      runtime: { ...page.chrome.runtime, sendMessage: async message => {
        assert.equal(page.values.cloud_profile_id, A.profile_id, 'page has not changed credentials before route');
        return router.handleMessage(message, { id: 'fixture-extension', url: page.chrome.runtime.getURL('bind.html') });
      } } },
  });
  await runPage(); assert.deepEqual(page.values, beforePage);
  bindFails = false; await runPage();
  assert.equal(page.values.cloud_profile_id, B.profile_id);
  assert.deepEqual(archived(page)[0].values.usage_segments_v1, beforePage.usage_segments_v1);
  const denied = await router.handleMessage({ type: 'CLOUD_BIND', binding: A },
    { id: 'fixture-extension', url: 'https://fixture.invalid' });
  assert.equal(denied.success, false); assert.equal(page.values.cloud_profile_id, B.profile_id);
  console.log('PASS: real doBind -> CLOUD_BIND router -> background; remote failure and untrusted sender retain old binding');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
