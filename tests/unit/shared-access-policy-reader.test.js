'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const clone = value => structuredClone(value);
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const policy = version => ({ schemaVersion: 1, revision: `profile-config:${version}`, effectiveAtMs: 1234, stage: 'legacy',
  dailyMinutes: Object.fromEntries(days.map(day => [day, { study: null, composite: 60, rest: 240 }])),
  weeklyRestMinutes: 840,
  timeWindows: Object.fromEntries(days.map(day => [day, { study: null, composite: null, rest: [{ start: '07:00', end: '24:00' }] }])),
  autonomy: { restrictedEntryConfirmationRequired: true, dailyFirstReminderMinutes: 120,
    weeklyFirstReminderMinutes: 840, repeatReminderMinutes: 60, softReminderTimeoutAction: 'end_rest', visibleResponseDeadlineSeconds: 60 } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function run() {
  const coreUrl = pathToFileURL(path.join(root, 'extension/core/shared-access-policy.js')).href;
  const { validateSharedAccessPolicyV1 } = await import(coreUrl);
  let source = fs.readFileSync(path.join(root, 'extension/infra/shared-access-policy-reader.js'), 'utf8')
    .replace(/from '\.\.\/core\/shared-access-policy.js'/, `from '${coreUrl}'`)
    .replace(/import \{ runStorageMutation \} from '[^']+';/, 'const runStorageMutation = () => { throw Error("no default writes"); };')
    .replace(/import \{ readSharedAccessPolicyCloudScope, readCloudSharedAccessPolicy \} from '[^']+';/,
      'const readSharedAccessPolicyCloudScope = () => { throw Error("no default reads"); }; const readCloudSharedAccessPolicy = () => { throw Error("no default requests"); };')
    .replace(/import \{ hasSharedAccessPolicyCapability, observeSharedAccessPolicyCapability \} from '[^']+';/,
      'const hasSharedAccessPolicyCapability = () => false; const observeSharedAccessPolicyCapability = fn => { fn(false); };');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const key = mod.SHARED_ACCESS_POLICY_LKG_KEY;
  const valid = policy(4);
  assert.equal(validateSharedAccessPolicyV1(valid).ok, true);
  // Optional fixed-package consumer check; no installation or shared-source edits.
  for (const packagePath of process.argv.slice(2)) {
    const file = name => execFileSync('tar', ['-xOf', packagePath, `package/${name}`], { encoding: 'utf8' });
    const metadata = JSON.parse(file('package.json'));
    assert(['1.26.0', '1.27.0'].includes(metadata.version));
    const schema = JSON.parse(file('shared-access-v1.schema.json'));
    assert.deepEqual([...schema.$defs.policy.required].sort(), Object.keys(valid).sort());
    assert.equal(schema.$defs.minutes.maximum, 10080);
    assert.equal(schema.$defs.policy.properties.autonomy.properties.repeatReminderMinutes.maximum, 1440);
    const contract = await import('data:text/javascript;base64,' + Buffer.from(file('dist/shared-access.js')).toString('base64'));
    const projected = contract.projectLegacySharedAccessPolicy({ timeQuota: { daily: { monday: {
      studyMinutes: null, compositeMinutes: 60, restMinutes: 240 } }, weekly: { restMinutes: 840 } },
      timeWindows: { daily: { monday: { restWindows: [{ start: '07:00', end: '24:00' }] } } },
      restConfig: { firstReminderMinutes: 120, weeklyFirstReminderMinutes: 840, repeatReminderMinutes: 60 } }, 12, 1234);
    assert.equal(validateSharedAccessPolicyV1(projected).ok, true);
    assert.equal(projected.timeWindows.monday.rest[0].end, '24:00');
    console.log(`[Shared policy fixed-package consumer] ${metadata.version} passed`);
  }
  for (const change of [value => { delete value.dailyMinutes.sunday; }, value => { value.autonomy.repeatReminderMinutes = 0; },
    value => { value.autonomy.repeatReminderMinutes = 1441; }, value => { value.dailyMinutes.monday.rest = 1.5; },
    value => { value.weeklyRestMinutes = -1; }, value => { value.timeWindows.friday.rest[0].end = '24:30'; },
    value => { value.timeWindows.friday.rest[0].start = '24:00'; }, value => { value.deviceToken = 'forbidden'; },
    value => { value.revision = 'opaque-unordered'; }, value => { value.revision = 'profile-config:9007199254740992'; },
    value => { value.autonomy.visibleResponseDeadlineSeconds = 59; }]) {
    const candidate = clone(valid); change(candidate); assert.equal(validateSharedAccessPolicyV1(candidate).ok, false);
  }
  function fixture() {
    let value, context = { deviceId: 'device-A', childId: 'child-A', deviceToken: 'fixture-credential-A', apiBase: 'https://fixture.invalid' };
    let reply = { ok: true, profileId: context.childId, policy: policy(4) }, support = true, failWrite = false;
    let pending = Promise.resolve();
    const requests = [], writes = [], deletes = [];
    const options = { enabled: true, readContext: async () => clone(context), supported: () => support,
      readCache: async () => clone(value), request: async input => { requests.push(input); return typeof reply === 'function' ? reply(input) : clone(reply); },
      now: () => 555,
      mutate: (operation, metadata) => {
        assert.equal(metadata.priority, 'derived');
        const result = pending.then(() => operation({
          async get(requestedKey) { assert.equal(requestedKey, key); return { [key]: clone(value) }; },
          async set(items) { assert.deepEqual(Object.keys(items), [key]); if (failWrite) throw Error('quota'); value = clone(items[key]); writes.push(clone(items)); },
          async remove(requestedKey) { assert.equal(requestedKey, key); value = undefined; deletes.push(key); },
        }));
        pending = result.catch(() => {}); return result;
      } };
    return { options, requests, writes, deletes, cache: () => clone(value),
      context: patch => { context = { ...context, ...patch }; }, response: next => { reply = next; },
      setCache(next) { value = clone(next); }, setSupported(value) { support = value; }, failWrite(value) { failWrite = value; },
      reader: () => mod.createSharedAccessPolicyReader(options) };
  }
  const f = fixture();
  const disabled = mod.createSharedAccessPolicyReader({ ...f.options, enabled: false });
  assert.equal((await disabled.refresh()).errorCode, 'shared_access_disabled');
  assert.equal((await disabled.read()).ok, false); assert.equal(f.requests.length, 0);
  f.setSupported(false); assert.equal((await f.reader().refresh()).errorCode, 'shared_access_unsupported');
  assert.equal(f.requests.length, 0); f.setSupported(true);
  const reader = f.reader();
  assert.equal((await reader.refresh()).status, 'fresh');
  const stored = f.cache();
  assert.equal(stored.version, 4); assert.equal(stored.policy.revision, 'profile-config:4');
  assert(!JSON.stringify(stored).includes('fixture-credential-A'));
  assert(!JSON.stringify(stored).includes('child-A')); assert(!JSON.stringify(stored).includes('device-A'));
  assert.equal(Object.keys(stored).length, 6);
  assert.equal(f.requests[0].deviceToken, 'fixture-credential-A');
  assert.equal((await f.reader().read()).status, 'lkg', 'SW restart revalidates persisted cache');
  f.response({ ok: false, errorCode: 'shared_access_unavailable' });
  const offline = await reader.refresh();
  assert.equal(offline.status, 'lkg'); assert.equal(offline.errorCode, 'shared_access_unavailable');
  assert.equal(f.writes.length, 1);
  offline.policy.dailyMinutes.monday.rest = 0;
  assert.equal((await reader.read()).policy.dailyMinutes.monday.rest, 240, 'readers cannot mutate LKG');
  f.response({ ok: true, profileId: 'child-A', policy: policy(3) });
  assert.equal((await reader.refresh()).errorCode, 'shared_access_stale_policy');
  assert.equal(f.cache().version, 4);
  const regressedTime = policy(5); regressedTime.effectiveAtMs = 1233;
  f.response({ ok: true, profileId: 'child-A', policy: regressedTime });
  assert.equal((await reader.refresh()).errorCode, 'shared_access_stale_policy');
  assert.equal(JSON.stringify(f.cache()), JSON.stringify(stored), 'new revision cannot move policy effective time backwards');
  const conflict = policy(4); conflict.weeklyRestMinutes = 60;
  f.response({ ok: true, profileId: 'child-A', policy: conflict });
  assert.equal((await reader.refresh()).errorCode, 'shared_access_policy_conflict');
  assert.deepEqual(f.cache(), stored);
  f.response({ ok: true, profileId: 'child-A', policy: policy(5) });
  f.failWrite(true);
  assert.equal((await reader.refresh()).errorCode, 'shared_access_cache_write_failed');
  assert.deepEqual(f.cache(), stored);
  f.failWrite(false);
  const advanced = await reader.refresh(); assert.equal(advanced.version, 5);
  assert.equal(advanced.executionEnabled, false);
  const malformed = policy(6); delete malformed.dailyMinutes.monday;
  f.response({ ok: true, profileId: 'child-A', policy: malformed });
  assert.equal((await reader.refresh()).errorCode, 'shared_access_invalid_policy'); assert.equal(f.cache().version, 5);
  const corrupted = f.cache(); corrupted.policy.weeklyRestMinutes = 12; f.setCache(corrupted);
  assert.equal((await f.reader().read()).ok, false, 'digest corruption is not trusted');
  f.setCache(stored);
  for (const patch of [{ childId: 'child-B' }, { deviceId: 'device-B' }, { deviceToken: 'fixture-credential-B' }, { apiBase: 'https://other.invalid' }]) {
    const isolated = fixture(); await isolated.reader().refresh(); isolated.context(patch);
    assert.equal((await isolated.reader().read()).ok, false, 'different auth generation cannot consume previous LKG');
  }
  for (const errorCode of ['shared_access_unauthorized', 'shared_access_unbound', 'shared_access_unsupported']) {
    const rejected = fixture(), r = rejected.reader(); await r.refresh();
    rejected.response({ ok: false, errorCode }); assert.equal((await r.refresh()).errorCode, errorCode);
    assert.equal(rejected.cache(), undefined); assert.equal((await r.read()).ok, false);
    assert.equal((await rejected.reader().read()).ok, false, 'restart does not resurrect revoked cache');
  }
  const wrongChild = fixture(), wrongReader = wrongChild.reader(); await wrongReader.refresh();
  wrongChild.response({ ok: true, profileId: 'child-B', policy: policy(5) });
  assert.equal((await wrongReader.refresh()).errorCode, 'shared_access_identity_mismatch');
  assert.equal((await wrongReader.read()).ok, false); assert.equal(wrongChild.cache(), undefined);
  // Late responses under the old credential never replace the new Child's policy.
  const late = fixture(), lateReader = late.reader(), entered = deferred(), gate = deferred();
  late.response(async () => { entered.resolve(); return gate.promise; });
  const old = lateReader.refresh(); await entered.promise;
  late.context({ childId: 'child-B', deviceToken: 'fixture-credential-B' });
  late.response({ ok: true, profileId: 'child-B', policy: { ...policy(7), stage: 'shared' } });
  assert.equal((await lateReader.refresh()).version, 7);
  assert.equal(late.requests[0].signal.aborted, true);
  gate.resolve({ ok: true, profileId: 'child-A', policy: policy(99) });
  assert.equal((await old).errorCode, 'shared_access_identity_changed');
  assert.equal(late.cache().version, 7); assert.equal((await lateReader.read()).executionEnabled, false);
  // Identity changes without a new refresh must also reject the in-flight result.
  const changed = fixture(), changedReader = changed.reader(), changeEntered = deferred(), changeGate = deferred();
  changed.response(() => { changeEntered.resolve(); return changeGate.promise; });
  const changing = changedReader.refresh(); await changeEntered.promise;
  changed.context({ deviceToken: 'fixture-credential-B' });
  changeGate.resolve({ ok: true, profileId: 'child-A', policy: policy(10) });
  assert.equal((await changing).errorCode, 'shared_access_identity_changed');
  assert.equal(changed.writes.length, 0);
  // An epoch may change during the awaited identity check itself.
  const delayed = fixture(); await delayed.reader().refresh();
  const identityEntered = deferred(), identityGate = deferred(); let reads = 0;
  const delayedReader = mod.createSharedAccessPolicyReader({ ...delayed.options, readContext: async () => {
    const context = await delayed.options.readContext();
    if (++reads === 2) { identityEntered.resolve(); await identityGate.promise; }
    return context;
  } });
  const delayedRead = delayedReader.read(); await identityEntered.promise;
  delayed.response({ ok: true, profileId: 'child-A', policy: policy(8) });
  assert.equal((await delayedReader.refresh()).version, 8);
  identityGate.resolve();
  assert.equal((await delayedRead).errorCode, 'shared_access_identity_changed');
  assert.equal((await delayedReader.read()).version, 8);
  // Delayed failed reads cannot clear a newer generation's in-memory status.
  const failedRead = fixture(), failEntered = deferred(), failGate = deferred(); let failOnce = true;
  const failedReader = mod.createSharedAccessPolicyReader({ ...failedRead.options, readCache: async () => {
    if (failOnce) { failOnce = false; failEntered.resolve(); await failGate.promise; throw Error('read fixture'); }
    return failedRead.cache();
  } });
  const failing = failedReader.read(); await failEntered.promise;
  assert.equal((await failedReader.refresh()).status, 'fresh');
  failGate.resolve(); await failing;
  assert.equal(failedReader.inspect().hasPolicy, true);
  // Network ignores abort: a bounded wait still preserves LKG, and its late reply is ignored.
  const timed = fixture(), never = deferred();
  const short = mod.createSharedAccessPolicyReader({ ...timed.options, requestTimeoutMs: 10 });
  await short.refresh(); timed.response(() => never.promise);
  assert.equal((await short.refresh()).status, 'lkg'); assert.equal(timed.requests.at(-1).signal.aborted, true);
  never.resolve({ ok: true, profileId: 'child-A', policy: policy(100) });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(timed.cache().version, 4);
  // Default bootstrap only registers listeners; no cache/identity/network writes.
  const oldChrome = global.chrome, events = {};
  const event = name => ({ addListener(fn) { (events[name] ||= []).push(fn); } });
  try {
    global.chrome = { runtime: { onStartup: event('startup'), onInstalled: event('installed') }, storage: { onChanged: event('changed') } };
    mod.initSharedAccessPolicyReader(); mod.initSharedAccessPolicyReader();
    assert(Object.values(events).every(list => list.length === 1));
    events.startup[0](); events.installed[0](); events.changed[0]({ cloud_device_token: {} }, 'local');
    assert.equal((await mod.readSharedAccessPolicyLkg()).errorCode, 'shared_access_disabled');
  } finally { global.chrome = oldChrome; }

  // Execute the actual isolated read transport without importing the accounting stack.
  const cloud = fs.readFileSync(path.join(root, 'extension/infra/cloud-sync.js'), 'utf8');
  const transport = cloud.slice(cloud.indexOf('// Optional read adapter:'), cloud.indexOf('async function requireRuntimeActivation()'))
    .replace(/export /g, '');
  let response = new Response(JSON.stringify({ schemaVersion: 1, profileId: 'child-A', policy: policy(4) }));
  const calls = [];
  const context = { AbortController, TextDecoder, setTimeout, clearTimeout, CLOUD_CONFIG: { REQUEST_TIMEOUT_MS: 15000 },
    requireRuntimeActivation: async () => ({ ok: true }), getCloudApiBase: () => 'https://fixture.invalid',
    fetch: async (url, options) => { calls.push({ url, options }); return response; } };
  vm.runInNewContext(`${transport};this.read = readCloudSharedAccessPolicy;`, context);
  const input = { deviceToken: 'fixture-credential-A', apiBase: 'https://fixture.invalid' };
  assert.equal((await context.read(input)).profileId, 'child-A');
  assert.equal(calls[0].url, 'https://fixture.invalid/device/shared-access/v1');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-credential-A');
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.redirect, 'error');
  for (const [status, code] of [[401, 'shared_access_unauthorized'], [403, 'shared_access_unbound'], [404, 'shared_access_unsupported'], [503, 'shared_access_unavailable']]) {
    response = new Response('private backend body must not be returned', { status });
    assert.equal((await context.read(input)).errorCode, code);
  }
  response = new Response('not json'); assert.equal((await context.read(input)).errorCode, 'shared_access_invalid_policy');
  response = new Response(JSON.stringify({ schemaVersion: 1, policy: policy(4) }));
  assert.equal((await context.read(input)).errorCode, 'shared_access_invalid_policy', 'old unscoped envelope refused');
  function streamed(text, chunkSize) {
    const bytes = new TextEncoder().encode(text); let offset = 0, cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        if (offset === bytes.length) { controller.close(); return; }
        const end = Math.min(bytes.length, offset + chunkSize);
        controller.enqueue(bytes.slice(offset, end)); offset = end;
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    return { response: new Response(body), size: bytes.length, consumed: () => offset, cancelled: () => cancelled };
  }
  const unicode = JSON.stringify({ schemaVersion: 1, profileId: '孩子-👦', policy: policy(4) });
  response = streamed(unicode, 1).response;
  assert.equal((await context.read(input)).profileId, '孩子-👦', 'split UTF-8 bytes decode without replacing characters');
  const json = JSON.stringify({ schemaVersion: 1, profileId: 'child-A', policy: policy(4) });
  const exactBytes = streamed(json + ' '.repeat(64 * 1024 - Buffer.byteLength(json)), 4096);
  response = exactBytes.response;
  assert.equal((await context.read(input)).ok, true, 'exact 64KiB body is accepted');
  assert.equal(exactBytes.cancelled(), false);
  const oversizedText = JSON.stringify({ schemaVersion: 1, profileId: '中'.repeat(24000), policy: policy(4) });
  assert(oversizedText.length < 64 * 1024, 'character count alone would incorrectly accept this UTF-8 body');
  const oversized = streamed(oversizedText, 4096); response = oversized.response;
  assert.equal((await context.read(input)).errorCode, 'shared_access_invalid_policy');
  assert.equal(oversized.cancelled(), true);
  assert(oversized.consumed() < oversized.size, 'cancel before consuming the whole oversized response');
  assert(oversized.consumed() <= 64 * 1024 + 4096, 'retain only an admitted byte budget plus the observed chunk');
  let bodyCancelled = false;
  const bodyEntered = deferred();
  response = new Response(new ReadableStream({
    pull() { bodyEntered.resolve(); }, cancel() { bodyCancelled = true; },
  }, { highWaterMark: 0 }));
  const cancelling = new AbortController();
  const pendingBody = context.read({ ...input, signal: cancelling.signal });
  await bodyEntered.promise; cancelling.abort();
  assert.equal((await pendingBody).errorCode, 'shared_access_cancelled');
  assert.equal(bodyCancelled, true, 'cancelled request also cancels a stalled response reader');
  context.CLOUD_CONFIG.REQUEST_TIMEOUT_MS = 10;
  let timeoutCancelled = false;
  response = new Response(new ReadableStream({ cancel() { timeoutCancelled = true; } }, { highWaterMark: 0 }));
  assert.equal((await context.read(input)).errorCode, 'shared_access_unavailable');
  assert.equal(timeoutCancelled, true);
  context.CLOUD_CONFIG.REQUEST_TIMEOUT_MS = 15000;
  const aborted = new AbortController(); aborted.abort(); const before = calls.length;
  assert.equal((await context.read({ ...input, signal: aborted.signal })).errorCode, 'shared_access_cancelled');
  assert.equal(calls.length, before);
  console.log('[Shared access policy reader] policy, identity-bound LKG, atomic failure, restart, old capability, auth, late response and read transport passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
