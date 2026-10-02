'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const clone = value => structuredClone(value);
const date = '2026-10-02';
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const policy = { schemaVersion: 1, revision: 'profile-config:4', effectiveAtMs: 1234, stage: 'legacy',
  dailyMinutes: Object.fromEntries(days.map(day => [day, { study: null, composite: 60, rest: 240 }])), weeklyRestMinutes: 840,
  timeWindows: Object.fromEntries(days.map(day => [day, { study: null, composite: null, rest: [{ start: '07:00', end: '24:00' }] }])),
  autonomy: { restrictedEntryConfirmationRequired: true, dailyFirstReminderMinutes: 120, weeklyFirstReminderMinutes: 840,
    repeatReminderMinutes: 60, softReminderTimeoutAction: 'end_rest', visibleResponseDeadlineSeconds: 60 } };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function makePages({ profileId = 'child-A', revision = 'a'.repeat(64), count = 54, missing = false } = {}) {
  const coverage = [], entries = [], scopes = [];
  for (let index = 0; index < 5; index++) {
    const sourceDate = new Date(Date.parse('2026-09-28T00:00:00Z') + index * 86400000).toISOString().slice(0, 10);
    const sourceCount = index === 4 ? count : 2;
    coverage.push({ date: sourceDate, sourceCount, reasonCodes: missing && index === 4 ? ['APPLICATION_COVERAGE_MISSING'] : [] });
    for (let n = 0; n < sourceCount; n++) {
      const source = n % 2 === 0 ? 'web' : 'application';
      const contribution = { schemaVersion: 1, source, sourceKey: `${source}-${n}`, date: sourceDate, revision: `s-${n}`,
        statisticsRevision: 'stats:1', correctionRevision: 'correction:0', policyRevision: policy.revision,
        settledAtMs: 1234, complete: true, reasonCodes: [], bucketsMs: { study: 0, composite: 0, rest: 1000 },
        ...(source === 'application' ? { productAssociationVersion: 'products:1', chromeExcludedMs: 0,
          applicationClassesMs: { study: 0, composite: 0, restrictedEntertainment: 1000, unclassified: 0, other: 0 } } : {}) };
      entries.push({ publicationRevision: `pub-${n}`, revisionOrdinal: 1, contribution });
      if (n === 0) scopes.push({ source, sourceKey: contribution.sourceKey, date: sourceDate });
    }
  }
  const pages = [];
  for (let offset = 0; offset < entries.length; offset += 50) pages.push({ schemaVersion: 1, profileId, basisRevision: revision,
    policyRevision: policy.revision, fromDate: '2026-09-28', toDate: date, days: clone(coverage), authorizedScopes: clone(scopes),
    page: { offset, limit: 50, total: entries.length, nextOffset: offset + 50 < entries.length ? offset + 50 : null,
      items: clone(entries.slice(offset, offset + 50)) } });
  return pages;
}
async function run() {
  const contractPath = path.join(root, 'extension/core/shared-contracts/1.28.0/shared-quota-execution.js');
  const contractUrl = pathToFileURL(contractPath).href;
  if (process.argv[2]) {
    const archive = fs.readFileSync(process.argv[2]);
    assert.equal(createHash('sha256').update(archive).digest('hex'), '72dbd1f611c0471913f07a72b23be519ad0066eb1c5d29f5433c7655b4b59c04');
    assert.equal(archive.length, 90991);
    for (const file of ['shared-access.js', 'shared-quota-execution.js']) {
      const packed = execFileSync('tar', ['-xOf', process.argv[2], `package/dist/${file}`]);
      assert.deepEqual(fs.readFileSync(path.join(path.dirname(contractPath), file)), packed, 'fixed contract bytes must remain unchanged');
    }
  }
  const source = fs.readFileSync(path.join(root, 'extension/infra/shared-quota-execution-reader.js'), 'utf8')
    .replace(/from '\.\.\/core\/shared-contracts\/1.28.0\/shared-quota-execution.js'/, `from '${contractUrl}'`)
    .replace(/from '\.\.\/core\/shared-access-policy.js'/, `from '${pathToFileURL(path.join(root, 'extension/core/shared-access-policy.js')).href}'`)
    .replace(/import \{ readSharedAccessPolicyContext, readSharedAccessPolicyLkg, SHARED_ACCESS_POLICY_LKG_KEY \} from '[^']+';/,
      'const readSharedAccessPolicyContext=()=>{throw Error("no default identity read")};const readSharedAccessPolicyLkg=()=>{throw Error("no default policy read")};const SHARED_ACCESS_POLICY_LKG_KEY="shared_access_policy_lkg_v1";')
    .replace(/import \{ readCloudSharedQuotaExecutionPage \} from '[^']+';/, 'const readCloudSharedQuotaExecutionPage=()=>{throw Error("no default network")};')
    .replace(/import \{ hasSharedAccessPolicyCapability, observeSharedAccessPolicyCapability \} from '[^']+';/,
      'const hasSharedAccessPolicyCapability=()=>false;const observeSharedAccessPolicyCapability=fn=>fn(false);')
    .replace(/import \{ runStorageMutation \} from '[^']+';/, 'const runStorageMutation=()=>{throw Error("no default writes")};');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const key = mod.SHARED_QUOTA_EXECUTION_LKG_KEY;
  function fixture() {
    let cache, context = { apiBase: 'https://fixture.invalid', deviceId: 'device-A', childId: 'child-A', deviceToken: 'fixture-A' };
    let currentPolicy = clone(policy), pages = makePages(), custom, writeFailure = false, queue = Promise.resolve(), supported = true, writeNotice = () => {};
    const calls = [], writes = [];
    const options = { enabled: true, readContext: async () => clone(context), readPolicy: async () => ({ ok: true, policy: clone(currentPolicy) }),
      supported: () => supported, now: () => Date.parse(`${date}T12:00:00+08:00`), readCache: async () => clone(cache),
      request: async input => { calls.push(input); return custom ? custom(input) : { ok: true, page: clone(pages.find(page => page.page.offset === input.offset)) }; },
      mutate: (task, metadata) => {
        assert.equal(metadata.priority, 'derived');
        const result = queue.then(() => task({
          get: async requested => { assert.equal(requested, key); return { [key]: clone(cache) }; },
          set: async items => { assert.deepEqual(Object.keys(items), [key]); if (writeFailure) throw Error('budget fixture'); cache = clone(items[key]); writes.push(clone(cache)); writeNotice(); },
          remove: async requested => { assert.equal(requested, key); cache = undefined; },
        })); queue = result.catch(() => {}); return result;
      } };
    return { options, calls, writes, reader: () => mod.createSharedQuotaExecutionReader(options), cache: () => clone(cache),
      context: patch => { context = { ...context, ...patch }; }, policy: patch => { currentPolicy = { ...currentPolicy, ...patch }; },
      pages: value => { pages = clone(value); }, response: value => { custom = value; }, setCache: value => { cache = clone(value); },
      support: value => { supported = value; }, failWrite: value => { writeFailure = value; }, onWrite: fn => { writeNotice = fn; } };
  }
  const f = fixture();
  assert.equal((await mod.createSharedQuotaExecutionReader({ ...f.options, enabled: false }).refresh()).errorCode, 'shared_execution_disabled');
  f.support(false); assert.equal((await f.reader().refresh()).errorCode, 'shared_access_unsupported'); assert.equal(f.calls.length, 0); f.support(true);
  const reader = f.reader(), fresh = await reader.refresh();
  assert.equal(fresh.status, 'fresh'); assert.equal(fresh.complete, true); assert.equal(fresh.executionEnabled, false);
  assert.deepEqual(f.calls.map(call => call.offset), [0, 50]); assert.equal(f.calls[0].revision, undefined); assert.equal(f.calls[1].revision, 'a'.repeat(64));
  const stored = f.cache(); assert.equal(Object.keys(stored).length, 7);
  for (const text of ['fixture-A', 'device-A', 'child-A', 'https://fixture.invalid']) assert(!JSON.stringify(stored).includes(text));
  assert.equal((await f.reader().read()).status, 'lkg', 'restart reads the complete persisted record');
  assert.equal((await reader.read('2026-10-03')).ok, false, 'different daily cutoff cannot consume old coverage');
  f.response(async () => ({ ok: false, errorCode: 'shared_access_unavailable' }));
  assert.equal((await reader.refresh()).status, 'lkg'); assert.deepEqual(f.cache(), stored);
  f.response(null); f.failWrite(true);
  assert.equal((await reader.refresh()).status, 'lkg'); assert.deepEqual(f.cache(), stored); f.failWrite(false);
  for (const change of [pages => { pages[1].basisRevision = 'b'.repeat(64); }, pages => { pages[1].days[0].sourceCount++; },
    pages => { pages[1].page.items.pop(); }, pages => { pages[0].authorizedScopes[0].sourceKey = 'not-in-basis'; },
    pages => { pages[1].policyRevision = 'profile-config:5'; }, pages => { pages[0].unexpected = 'bad'; }]) {
    const pages = makePages(); change(pages); f.pages(pages);
    const rejected = await reader.refresh(); assert.equal(rejected.status, 'lkg'); assert.deepEqual(f.cache(), stored, 'bad pages never partly publish');
  }
  f.pages([makePages()[0]]);
  assert.equal((await reader.refresh()).status, 'lkg'); assert.deepEqual(f.cache(), stored, 'missing last page is not zero or revoked authorization');
  const tooLarge = makePages(); tooLarge[0].padding = 'x'.repeat(512 * 1024); f.pages(tooLarge);
  assert.equal((await reader.refresh()).errorCode, 'shared_execution_size_limit'); assert.deepEqual(f.cache(), stored);
  const empty = makePages()[0]; empty.authorizedScopes = [];
  empty.days.forEach(day => { day.sourceCount = 0; day.reasonCodes = []; });
  empty.page = { offset: 0, limit: 50, total: 0, nextOffset: null, items: [] }; f.pages([empty]);
  const noSources = await reader.refresh(); assert.equal(noSources.complete, false); assert.equal(noSources.executionEnabled, false);
  assert(noSources.reasonCodes.includes('WEB_COVERAGE_MISSING'));
  f.pages(makePages({ missing: true }));
  const incomplete = await reader.refresh(); assert.equal(incomplete.complete, false); assert.equal(incomplete.executionEnabled, false);
  assert(incomplete.reasonCodes.includes('APPLICATION_COVERAGE_MISSING'));
  const damaged = f.cache(); damaged.assembled.basis.days[0].sources[0].contribution.bucketsMs.rest = 9000; f.setCache(damaged);
  assert.equal((await f.reader().read()).ok, false, 'damaged persisted body is not trusted');
  for (const patch of [{ childId: 'child-B' }, { deviceId: 'device-B' }, { deviceToken: 'fixture-B' }, { apiBase: 'https://different.invalid' }]) {
    const isolated = fixture(); await isolated.reader().refresh(); isolated.context(patch);
    assert.equal((await isolated.reader().read()).ok, false);
  }
  const policyChanged = fixture(); await policyChanged.reader().refresh(); policyChanged.policy({ effectiveAtMs: 1235 });
  assert.equal((await policyChanged.reader().read()).ok, false, 'full policy body, not revision alone, binds the cache');
  const changingPolicy = fixture(), cp = changingPolicy.reader(), cpEntered = deferred(), cpGate = deferred();
  changingPolicy.response(() => { cpEntered.resolve(); return cpGate.promise; });
  const cpRead = cp.refresh(); await cpEntered.promise; changingPolicy.policy({ effectiveAtMs: 1235 });
  cpGate.resolve({ ok: true, page: makePages()[0] });
  assert.equal((await cpRead).errorCode, 'shared_execution_identity_changed'); assert.equal(changingPolicy.writes.length, 0);
  const conflict = fixture(); let conflicts = 0;
  conflict.response(async input => {
    if (input.offset === 50 && conflicts++ === 0) return { ok: false, errorCode: 'shared_access_snapshot_changed' };
    return { ok: true, page: clone(makePages().find(page => page.page.offset === input.offset)) };
  });
  assert.equal((await conflict.reader().refresh()).ok, true); assert.deepEqual(conflict.calls.map(call => call.offset), [0, 50, 0, 50]);
  const twice = fixture(); twice.response(async () => ({ ok: false, errorCode: 'shared_access_snapshot_changed' }));
  assert.equal((await twice.reader().refresh()).ok, false); assert.equal(twice.calls.length, 2); assert.equal(twice.writes.length, 0);
  for (const errorCode of ['shared_access_unauthorized', 'shared_access_unbound', 'shared_access_unsupported']) {
    const auth = fixture(), r = auth.reader(); await r.refresh(); auth.response(async () => ({ ok: false, errorCode }));
    assert.equal((await r.refresh()).errorCode, errorCode); assert.equal(auth.cache(), undefined); assert.equal((await auth.reader().read()).ok, false);
  }
  const wrong = fixture(), wr = wrong.reader(); await wr.refresh(); wrong.pages(makePages({ profileId: 'child-B' }));
  assert.equal((await wr.refresh()).errorCode, 'shared_access_identity_mismatch'); assert.equal(wrong.cache(), undefined);
  const late = fixture(), lr = late.reader(), entered = deferred(), gate = deferred();
  const published = deferred(); late.onWrite(() => published.resolve());
  late.response(async () => { entered.resolve(); return gate.promise; });
  const oldRead = lr.refresh(); await entered.promise;
  late.context({ childId: 'child-B', deviceToken: 'fixture-B' }); lr.invalidate();
  late.pages(makePages({ profileId: 'child-B', revision: 'b'.repeat(64) })); late.response(null);
  assert.equal((await lr.refresh()).errorCode, 'shared_execution_busy');
  gate.resolve({ ok: true, page: makePages()[0] });
  assert.equal((await oldRead).ok, false);
  let publishTimer;
  try { await Promise.race([published.promise, new Promise((_, reject) => { publishTimer = setTimeout(() => reject(Error('queued publish timeout')), 2000); })]); }
  finally { clearTimeout(publishTimer); }
  assert.equal(late.cache().assembled.basis.revision, 'b'.repeat(64)); assert.equal(late.writes.length, 1);
  const timed = fixture(), tr = mod.createSharedQuotaExecutionReader({ ...timed.options, roundTimeoutMs: 10 }); await tr.refresh();
  const never = deferred(); timed.response(() => never.promise);
  assert.equal((await tr.refresh()).status, 'lkg'); assert.equal(timed.calls.at(-1).signal.aborted, true);
  never.resolve({ ok: true, page: makePages()[0] }); await new Promise(resolve => setImmediate(resolve)); assert.equal(timed.writes.length, 1);
  // Default boot wires lifecycle/identity listeners only, never reads identity/network/storage.
  const beforeChrome = global.chrome, events = {};
  const event = name => ({ addListener(fn) { (events[name] ||= []).push(fn); } });
  try {
    global.chrome = { runtime: { onStartup: event('startup'), onInstalled: event('installed') }, storage: { onChanged: event('changed') } };
    mod.initSharedQuotaExecutionReader(); mod.initSharedQuotaExecutionReader(); assert(Object.values(events).every(list => list.length === 1));
    events.startup[0](); events.installed[0](); events.changed[0]({ shared_access_policy_lkg_v1: {} }, 'local');
    assert.equal((await mod.readSharedQuotaExecutionLkg()).errorCode, 'shared_execution_disabled');
  } finally { global.chrome = beforeChrome; }
  // Execute actual bounded transport; its streaming regression is shared with the policy reader suite.
  const cloud = fs.readFileSync(path.join(root, 'extension/infra/cloud-sync.js'), 'utf8');
  const transport = cloud.slice(cloud.indexOf('// Optional read adapter:'), cloud.indexOf('async function requireRuntimeActivation()')).replace(/export /g, '');
  const calls = []; let response = new Response(JSON.stringify(makePages()[0]));
  const context = { AbortController, TextDecoder, setTimeout, clearTimeout, CLOUD_CONFIG: { REQUEST_TIMEOUT_MS: 15000 },
    requireRuntimeActivation: async () => ({ ok: true }), getCloudApiBase: () => 'https://fixture.invalid',
    fetch: async (url, options) => { calls.push({ url, options }); return response; } };
  vm.runInNewContext(`${transport};this.page=readCloudSharedQuotaExecutionPage;`, context);
  const input = { deviceToken: 'fixture-A', apiBase: 'https://fixture.invalid', date, offset: 0 };
  assert.equal((await context.page(input)).page.profileId, 'child-A');
  assert.equal(calls[0].url, `https://fixture.invalid/device/shared-quota-execution/v1?date=${date}&offset=0&limit=50`);
  response = new Response(JSON.stringify(makePages()[1]));
  assert.equal((await context.page({ ...input, offset: 50, revision: 'a'.repeat(64) })).ok, true);
  assert(calls[1].url.endsWith(`&revision=${'a'.repeat(64)}`));
  const before = calls.length;
  for (const patch of [{ date: '2026-02-30' }, { offset: 50 }, { offset: -1 }, { offset: 0, revision: 'not-hash' }]) {
    assert.equal((await context.page({ ...input, ...patch })).ok, false);
  }
  assert.equal(calls.length, before);
  response = new Response('ignored private error body', { status: 409 });
  assert.equal((await context.page(input)).errorCode, 'shared_access_snapshot_changed');
  console.log('[Shared quota execution reader] fixed assembly, pagination, 409, scope, cache, timeout and default-off passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
