'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const url = f => pathToFileURL(path.join(root, f)).href;
const clone = v => structuredClone(v);
const dataModule = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const stripImports = s => s.replace(/^import[\s\S]*?;\r?\n/gm, '');
async function run() {
  const fixed = await import(url('extension/core/shared-contracts/1.30.0/shared-web-sync.js'));
  if (process.argv[2]) {
    const archive = fs.readFileSync(process.argv[2]);
    assert.equal(archive.length, 109153);
    assert.equal(createHash('sha256').update(archive).digest('hex'), '83138e4e8b66cebc8331ac6b87cc4b58a2b9f1f2169c976b1eb440f8915984d7');
    for (const name of ['shared-access.js', 'shared-web-sync.js', 'shared-quota-execution.js', 'shared-reminder-lifecycle.js']) {
      assert.equal(fs.readFileSync(path.join(root, 'extension/core/shared-contracts/1.30.0', name), 'utf8').replace(/\r\n/g, '\n'),
        execFileSync('tar', ['-xOf', process.argv[2], `package/dist/${name}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n'));
    }
    const v = JSON.parse(execFileSync('tar', ['-xOf', process.argv[2], 'package/shared-web-sync.vectors.json'], { encoding: 'utf8' }));
    assert.deepEqual(await fixed.verifySharedWebContributionV1(v.upload), v.upload);
    const lease = { schemaVersion: 1, scopeRevision: 'a'.repeat(64), policyIdentity: v.upload.policyIdentity,
      claims: v.proof.claims, verifiedAtMs: v.verificationTimeMs };
    for (const example of v.localLeaseCases) {
      assert.equal(fixed.sharedWebLocalLeaseCurrentV1({ ...lease, ...example.lease }, {
        scopeRevision: lease.scopeRevision, policyIdentity: { ...lease.policyIdentity, ...example.currentPolicy },
        connectionLive: true, capabilityNegotiated: true, nowMs: v.verificationTimeMs, ...example.current,
      }), example.expected, example.name);
    }
    const key = await crypto.subtle.importKey('jwk', v.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const { challengeId, connectionHash, applicationSourceKey, childScopeHash, assignmentVersion } = v.proof.claims;
    const expected = { challengeId, connectionHash, applicationSourceKey, childScopeHash, assignmentVersion };
    await fixed.verifySharedWebSourceBindingV1(v.proof, v.proof.keyId, key, expected, v.verificationTimeMs);
    await assert.rejects(fixed.verifySharedWebSourceBindingV1(v.proof, v.proof.keyId, key, { ...expected, connectionHash: '0'.repeat(64) }, v.verificationTimeMs));
    await assert.rejects(fixed.verifySharedWebSourceBindingV1(v.proof, v.proof.keyId, key, expected, 301000));
  }
  const quota = await dataModule(stripImports(fs.readFileSync(path.join(root, 'extension/core/quota-read-model-v2.js'), 'utf8')));
  const dates = await dataModule(stripImports(fs.readFileSync(path.join(root, 'extension/core/profile-account-v2.js'), 'utf8')));
  globalThis.__sharedWebQuota = quota; globalThis.__sharedWebDates = dates;
  let source = fs.readFileSync(path.join(root, 'extension/infra/shared-web-contribution-sync.js'), 'utf8');
  source = source.replace(/from '(\.\.\/core\/shared-contracts\/[^']+|\.\.\/core\/shared-access-policy.js)'/g,
    (_, p) => `from '${url('extension/' + path.posix.normalize('infra/' + p))}'`)
    .replace(/import \{ buildLocalQuotaProjectionV2 \}[^;]+;/, 'const {buildLocalQuotaProjectionV2}=globalThis.__sharedWebQuota;')
    .replace(/import \{ getBeijingWeekPeriod \}[^;]+;/, 'const {getBeijingWeekPeriod}=globalThis.__sharedWebDates;')
    .replace(/import \{ readSharedAccessPolicyContext[^;]+;/, 'const readSharedAccessPolicyContext=()=>null,readSharedAccessPolicyLkg=()=>null,SHARED_ACCESS_POLICY_LKG_KEY="policy";')
    .replace(/import \{ readCloudSharedWebCapabilities[^;]+;/, 'const readCloudSharedWebCapabilities=()=>null,readCloudSharedWebWatermark=()=>null,postCloudSharedWebContribution=()=>null,requestCloudSharedWebSourceBinding=()=>null;')
    .replace(/import \{ requestSharedWebSync, observeSharedAccessPolicyCapability, readSharedWebLocalConnection \}[^;]+;/, 'const requestSharedWebSync=()=>null,observeSharedAccessPolicyCapability=()=>null,readSharedWebLocalConnection=()=>({connection:null,capabilityNegotiated:false});')
    .replace(/import \{ runStorageMutation \}[^;]+;/, 'const runStorageMutation=()=>null;')
    .replace(/import \{ readSharedQuotaExecutionLkg \}[^;]+;/, 'const readSharedQuotaExecutionLkg=()=>null;');
  const mod = await dataModule(source);
  const policyCore = await import(url('extension/core/shared-access-policy.js'));
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const policy = { schemaVersion: 1, revision: 'profile-config:4', effectiveAtMs: 1234, stage: 'shadow',
    dailyMinutes: Object.fromEntries(weekdays.map(d => [d, { study: null, composite: 60, rest: 240 }])), weeklyRestMinutes: 840,
    timeWindows: Object.fromEntries(weekdays.map(d => [d, { study: null, composite: null, rest: null }])),
    autonomy: { restrictedEntryConfirmationRequired: true, dailyFirstReminderMinutes: 120, weeklyFirstReminderMinutes: 840,
      repeatReminderMinutes: 60, softReminderTimeoutAction: 'end_rest', visibleResponseDeadlineSeconds: 60 } };
  assert.equal(policyCore.validateSharedAccessPolicyV1(policy).ok, true);
  const now = Date.parse('2026-10-03T12:00:00Z'), sourceKey = 'web:' + 'b'.repeat(64);
  function fixture(enabled = true) {
    let clock = now, connection = {}, leaseCapability = true;
    let context = { apiBase: 'https://fixture.invalid', deviceId: 'fixture-device', childId: 'fixture-child', deviceToken: 'fixture-token' };
    let currentPolicy = clone(policy);
    const store = { daily_usage_stats_v1: {}, guardian_config: {} }, heads = new Map(), calls = [], nativeCalls = [];
    for (let d = 28; d <= 33; d++) {
      const date = d <= 30 ? `2026-09-${d}` : `2026-10-0${d - 30}`;
      store.daily_usage_stats_v1[date] = { domains: {}, targets: {} };
    }
    store.daily_usage_stats_v1['2026-10-03'] = { domains: { 'fixture.invalid': { activeSeconds: 1200 } },
      targets: { fixture: { activeByQuotaBucket: { study: 600, other: 600 } } } };
    const head = d => heads.get(d) || { schemaVersion: 1, sourceKey, date: d, revisionOrdinal: 0, contentHash: null, publicationRevision: null };
    let cap = true, failed = false, responseHook = null;
    const options = { enabled, now: () => clock, readConnection: () => ({ connection, capabilityNegotiated: leaseCapability }),
      readContext: async () => clone(context), readPolicy: async () => ({ ok: true, policy: clone(currentPolicy) }),
      readStorage: async () => clone(store), mutate: async fn => fn({ get: async () => clone(store), set: async v => Object.assign(store, clone(v)) }),
      capabilities: async () => ({ ok: true, value: { schemaVersion: 1, protocol: 'shared-web-sync-v1', enabled: cap } }),
      readWatermark: async (_c, d) => ({ ok: true, value: clone(head(d)) }),
      exchange: async () => ({ ok: true, value: { schemaVersion: 1, keyId: 'a'.repeat(64), signature: 'A'.repeat(86), claims: {
        schemaVersion: 1, audience: 'timeonchrome:shared-web-source:v1', challengeId: 'c'.repeat(64), connectionHash: 'd'.repeat(64),
        applicationSourceKey: 'e'.repeat(64), childScopeHash: 'f'.repeat(64), assignmentVersion: 1, webSourceKey: sourceKey,
        issuedAtMs: now, expiresAtMs: now + 300000 } } }),
      native: async (method, payload) => {
        nativeCalls.push({ method, payload: clone(payload) });
        if (method === 'getSharedWebSourceChallenge') return { ok: true, value: { schemaVersion: 1, challengeId: 'c'.repeat(64), connectionHash: 'd'.repeat(64), expiresAtMs: now + 90000 } };
        if (method === 'bindSharedWebSource') return { ok: true, value: { challengeId: 'c'.repeat(64), webSourceKey: sourceKey, expiresAtMs: now + 300000 } };
        return { ok: true, value: { date: payload.upload.date, revisionOrdinal: payload.upload.revisionOrdinal, contentHash: payload.upload.contentHash, duplicate: false } };
      }, upload: async (_c, u) => {
        calls.push(clone(u)); await fixed.verifySharedWebContributionV1(u);
        if (responseHook) await responseHook(u);
        if (failed) return { ok: false, errorCode: 'shared_access_unavailable' };
        const watermark = { schemaVersion: 1, sourceKey, date: u.date, revisionOrdinal: u.revisionOrdinal, contentHash: u.contentHash, publicationRevision: `${u.revisionOrdinal}:${u.contentHash}` };
        heads.set(u.date, watermark);
        return { ok: true, value: { ...watermark, status: 'accepted', submittedRevisionOrdinal: u.revisionOrdinal } };
      }, readBasis: async () => ({ ok: false }) };
    return { store, calls, nativeCalls, heads, options, sync: mod.createSharedWebContributionSync(options),
      clock: v => { clock = v; }, connection: v => { connection = v; }, leaseCapability: v => { leaseCapability = v; },
      cap: v => { cap = v; }, fail: v => { failed = v; }, hook: v => { responseHook = v; }, context: v => { context = v; }, policy: v => { currentPolicy = v; } };
  }
  const disabled = fixture(false); assert.equal((await disabled.sync.refresh()).ok, false); assert.equal(disabled.calls.length, 0);
  const f = fixture(); assert.equal((await f.sync.refresh()).ok, true); assert.equal(f.calls.length, 6);
  const current = f.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-10-03'];
  assert.equal(current.upload.activeMs, 1200000); assert.equal(current.upload.otherMs, 600000);
  assert.equal(current.upload.bucketsMs.study, 600000); assert.equal(current.cloudConfirmed, true);
  const firstHash = current.upload.contentHash;
  await f.sync.refresh(); assert.equal(f.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-10-03'].upload.contentHash, firstHash);
  assert.equal(f.calls.length, 6, 'unchanged confirmed week does not upload again');
  assert.equal(f.nativeCalls.filter(c => c.method === 'replaceSharedWebContribution').length, 6,
    'same live Host receipt prevents resending unchanged week');
  f.store.daily_usage_stats_v1['2026-10-03'].domains['fixture.invalid'].activeSeconds = 1260;
  f.store.daily_usage_stats_v1['2026-10-03'].targets.fixture.activeByQuotaBucket.rest = 60;
  await f.sync.refresh(); assert.equal(f.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-10-03'].upload.revisionOrdinal, 2);
  assert.equal(f.calls.length, 7, 'only the changed date uploads');
  f.store.daily_usage_stats_v1['2026-10-03'] = { domains: { fixture: { activeSeconds: 600 } }, targets: { fixture: { activeByQuotaBucket: { study: 600 } } } };
  await f.sync.refresh();
  assert.equal(f.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-10-03'].upload.activeMs, 600000);
  assert.equal(f.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-10-03'].upload.revisionOrdinal, 3, 'higher version can replace with lower derived use');
  f.policy({ ...policy, weeklyRestMinutes: 841 });
  await f.sync.refresh();
  assert.equal(f.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-10-03'].upload.revisionOrdinal, 4, 'whole policy hash changes even with the same opaque revision');
  const offline = fixture(); offline.cap(false); await offline.sync.refresh();
  assert.equal(Object.keys(offline.store[mod.SHARED_WEB_QUEUE_KEY].days).length, 6); assert.equal(offline.calls.length, 0);
  const retry = fixture(); retry.fail(true); await retry.sync.refresh();
  assert.equal(retry.calls.length, 1); assert.equal(retry.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-09-28'].cloudConfirmed, false);
  assert.ok(retry.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-09-28'].nextRetryAtMs > now);
  const switched = fixture(); switched.hook(async () => { switched.context({ apiBase: 'https://fixture.invalid', deviceId: 'new-device', childId: 'new-child', deviceToken: 'new-token' }); });
  assert.equal((await switched.sync.refresh()).errorCode, 'shared_web_identity_changed');
  assert.notEqual(switched.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-09-28'].cloudConfirmed, true);
  const newer = fixture(); newer.hook(async u => {
    const entry = newer.store[mod.SHARED_WEB_QUEUE_KEY].days[u.date];
    const body = { ...entry.upload, revisionOrdinal: u.revisionOrdinal + 1 };
    body.contentHash = await fixed.sharedWebContributionHashV1(body);
    entry.upload = body;
  });
  await newer.sync.refresh();
  assert.notEqual(newer.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-09-28'].cloudConfirmed, true, 'old ACK cannot clear a newer persisted ordinal');
  const restart = fixture(); await restart.sync.refresh();
  restart.sync = mod.createSharedWebContributionSync(restart.options); await restart.sync.refresh();
  assert.equal(restart.calls.length, 6, 'restart reconciles watermark without uploading confirmed content');
  assert.equal(restart.nativeCalls.filter(c => c.method === 'replaceSharedWebContribution').length, 12);
  assert.equal((await restart.sync.readBinding()).ok, true);
  assert.equal(restart.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-10-03'].upload.revisionOrdinal, 1);
  const expiredChallenge = fixture(); let exchanges = 0;
  expiredChallenge.options.native = async () => ({ ok: true, value: { schemaVersion: 1,
    challengeId: 'c'.repeat(64), connectionHash: 'd'.repeat(64), expiresAtMs: now } });
  expiredChallenge.options.exchange = async () => { exchanges++; throw Error('expired challenge must not exchange'); };
  expiredChallenge.sync = mod.createSharedWebContributionSync(expiredChallenge.options);
  await expiredChallenge.sync.refresh();
  assert.equal(exchanges, 0); assert.equal((await expiredChallenge.sync.readBinding()).ok, false);
  const rebase = fixture(); rebase.heads.set('2026-09-28', { schemaVersion: 1, sourceKey, date: '2026-09-28', revisionOrdinal: 9, contentHash: 'a'.repeat(64), publicationRevision: '9:' + 'a'.repeat(64) });
  await rebase.sync.refresh(); assert.equal(rebase.calls[0].revisionOrdinal, 10, 'independent watermark recovers ordinal');
  const prepared = fixture();
  prepared.options.readBasis = async date => ({ ok: true, status: 'fresh',
    basis: { schemaVersion: 1, revision: 'a'.repeat(64), policyRevision: policy.revision, fromDate: '2026-09-28', toDate: date,
      days: [...prepared.heads.keys()].sort().map(d => ({ date: d, reasonCodes: [], sources: [
        fixed.sharedWebExecutionSourceV1(prepared.store[mod.SHARED_WEB_QUEUE_KEY].days[d].upload, sourceKey),
        { publicationRevision: 'app-fixture', revisionOrdinal: 1, contribution: { schemaVersion: 1, source: 'application', sourceKey: 'e'.repeat(64),
          date: d, revision: 'app-fixture', statisticsRevision: 'app-statistics', correctionRevision: 'app-corrections', policyRevision: policy.revision,
          settledAtMs: null, complete: true, reasonCodes: [], bucketsMs: { study: 0, composite: 0, rest: 0 },
          productAssociationVersion: 'products:1', chromeExcludedMs: 0,
          applicationClassesMs: { study: d === '2026-10-03' ? 600000 : 0, composite: 0, restrictedEntertainment: 0, unclassified: 0, other: 0 } } } ] })) },
    authorizedScopes: [...prepared.heads.keys()].map(d => ({ source: 'web', sourceKey, date: d })) });
  prepared.sync = mod.createSharedWebContributionSync(prepared.options);
  await prepared.sync.refresh();
  const p = await prepared.sync.readPreparation();
  assert.equal(p.executionEnabled, false); assert.equal(p.projection.days.at(-1).usedMs.study, 1200000, 'web ten minutes plus application ten minutes equals twenty without granting application replacement authority');
  assert.equal(p.replacementVersions.length, 6);
  prepared.store.daily_usage_stats_v1['2026-10-03'].domains['fixture.invalid'].activeSeconds++;
  assert.equal((await prepared.sync.readPreparation()).errorCode, 'shared_web_local_version_changed');
  prepared.store.daily_usage_stats_v1['2026-10-03'].targets.fixture.activeByQuotaBucket.rest = 1;
  const cloudCalls = prepared.calls.length;
  const nativeCount = prepared.nativeCalls.filter(x => x.method === 'replaceSharedWebContribution').length;
  prepared.cap(false); prepared.clock(now + 3600000);
  await prepared.sync.refresh();
  const offlinePrepared = await prepared.sync.readPreparation();
  assert.equal(offlinePrepared.projection.complete, true, 'live negotiated local lease accepts growth after proof expiry');
  assert.equal(offlinePrepared.projection.days.at(-1).usedMs.rest, 1000);
  assert.equal(prepared.calls.length, cloudCalls, 'offline lease never uploads an expired proof');
  assert.equal(prepared.nativeCalls.filter(x => x.method === 'replaceSharedWebContribution').length, nativeCount + 1,
    'only changed local date is replaced');
  assert.equal((await prepared.sync.readBinding()).ok, true);
  prepared.leaseCapability(false);
  assert.equal((await prepared.sync.readBinding()).ok, false, 'old Host cannot extend proof lifetime');
  prepared.leaseCapability(true); prepared.connection({});
  assert.equal((await prepared.sync.readPreparation()).ok, false, 'new Port cannot inherit old local lease');
  await prepared.sync.refresh();
  assert.equal((await prepared.sync.readBinding()).ok, false, 'offline reconnect requires a new signed binding');
  const stale = fixture(); stale.options.upload = async (_c, u) => ({ ok: true, value: {
    schemaVersion: 1, sourceKey, date: u.date, revisionOrdinal: u.revisionOrdinal + 1, contentHash: 'a'.repeat(64),
    publicationRevision: `${u.revisionOrdinal + 1}:` + 'a'.repeat(64), status: 'stale', submittedRevisionOrdinal: u.revisionOrdinal } });
  stale.sync = mod.createSharedWebContributionSync(stale.options);
  assert.equal((await stale.sync.refresh()).errorCode, 'shared_web_stale');
  assert.equal(stale.store[mod.SHARED_WEB_QUEUE_KEY].days['2026-09-28'].cloudConfirmed, false);
  const nativeValidator = await import(url('extension/core/shared-web-native.js'));
  assert.deepEqual(nativeValidator.captureSharedQuotaPreparation(p, { date: '2026-10-03', weekStart: '2026-09-28', policyRevision: policy.revision }), p);
  assert.throws(() => nativeValidator.captureSharedQuotaPreparation({ ...p, executionEnabled: true }, { date: '2026-10-03', weekStart: '2026-09-28', policyRevision: policy.revision }));
  for (const fixture of [f, retry, switched]) {
    assert.equal(JSON.stringify(fixture.nativeCalls).includes('fixture-token'), false);
    assert.equal(JSON.stringify(fixture.store[mod.SHARED_WEB_QUEUE_KEY]).includes('fixture-token'), false);
    for (const request of fixture.calls) assert.equal(Object.hasOwn(request, 'sourceKey'), false);
  }
  const native = await import(url('extension/core/shared-web-native.js'));
  await assert.rejects(native.captureSharedWebNativeRequest('getSharedWebSourceChallenge', { deviceToken: 'secret' }));
  await assert.rejects(native.captureSharedWebNativeRequest('replaceSharedWebContribution', { challengeId: 'c'.repeat(64), upload: { ...current.upload, contentHash: '0'.repeat(64) } }));
  console.log('Shared web contribution: fixed hash/proof, queue rebuild, ACK, ordinal, offline, retry and identity isolation PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
