'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const load = s => import('data:text/javascript;base64,' + Buffer.from(s).toString('base64'));
async function run() {
  const { SHARED_WEB_IDENTITY_ERRORS } = await import(pathToFileURL(path.join(root, 'extension/core/shared-web-native.js')).href);
  globalThis.__sharedIdentityErrors = SHARED_WEB_IDENTITY_ERRORS;
  globalThis.__sourceStatisticsContract = await load(read('extension/core/shared-contracts/1.58.0/source-statistics.js'));
  globalThis.__profileShadow = await load(read('extension/core/profile-account-shadow-v2.js').replace(/^import .*;\r?\n/gm, ''));
  const mod = await load('const SHARED_WEB_IDENTITY_ERRORS=globalThis.__sharedIdentityErrors;\n'
    + 'const sourceStatisticsContract=globalThis.__sourceStatisticsContract;\n'
    + 'const {PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY,isProfileAccountShadowScopeCurrent}=globalThis.__profileShadow;\n'
    + 'const readCurrentApplicationIdentityConfirmation=async()=>({confirmed:null}),readNativeHostDiagnosticState=()=>({});\n'
    + read('extension/infra/shared-sync-diagnostics.js').replace(/^import .*;\r?\n/gm, ''));
  const now = Date.parse('2026-10-03T04:00:00Z');
  const stored = { local_guardian_status_v1: { lastSuccessAt: now, lastErrorCode: 'private_identifier' } };
  const model = mod.buildSharedSyncDiagnostics(stored, {}, {}, now, '1.7.40');
  assert.equal(model.connection.connectedCurrent, null);
  assert.equal(model.connection.capabilities, null);
  assert.equal(model.connection.applicationUsageSupported, null);
  assert(!JSON.stringify(model).includes('private'));
  const policyV2 = { schemaVersion: 2, revision: 'profile-config:35', stage: 'shadow', effectiveAtMs: 0 };
  const sourceCache = { childId: 'private_child', scopeHash: 'private_scope', fromDate: '2026-09-28', toDate: '2026-10-03',
    applicationOrigin: 'native', webDayOrigins: { '2026-10-03': { origin: 'cloud_other', readAtMs: now } },
    applicationDayOrigins: { '2026-10-03': { origin: 'native', readAtMs: now } } };
  for (const source of ['web', 'application']) sourceCache[source] = { childId: 'private_child', source,
    fromDate: sourceCache.fromDate, toDate: sourceCache.toDate, readAtMs: now,
    days: [{ date: '2026-10-03', totalSeconds: 120, complete: false, settledThroughMs: now - 1000,
      categoriesSeconds: { rest: 60, private_title: 60 }, reasonCodes: ['PRIVATE_PATH'] }] };
  const v2Stored = { source_statistics_shadow_cache_v1: sourceCache,
    shared_access_policy_lkg_v2: { scopeHash: 'private_scope', policy: policyV2, policyHash: 'c'.repeat(64), receivedAtMs: now },
    source_statistics_shadow_v1: { fromDate: sourceCache.fromDate, toDate: sourceCache.toDate,
      readAtMs: now,
      source: { web: { origin: 'local_plus_cloud_other', readAtMs: now }, application: { origin: 'native', readAtMs: now } },
      applicationErrorCode: 'PRIVATE_TOKEN' } };
  const contextV2 = { childId: 'private_child', scopeHash: 'private_scope', apiBase: 'https://private.invalid', deviceId: 'private-device' };
  const v2 = mod.projectSharedV2Observation(v2Stored, contextV2, { ok: true, policy: policyV2 }, true, now);
  const sourceSnapshot = (amount, complete = true) => ({ schemaVersion: 2, durationUnit: 'seconds', source: 'application',
    childId: contextV2.childId, fromDate: sourceCache.fromDate, toDate: sourceCache.toDate, readAtMs: now,
    days: globalThis.__sourceStatisticsContract.sourceStatisticsDates(sourceCache.fromDate, sourceCache.toDate).map(date => ({
      date, bucketsSeconds: { study: 0, composite: amount, rest: 0 }, settledThroughMs: now - 1000,
      complete, reasonCodes: complete ? [] : ['QUOTA_BUCKETS_PARTIAL'] })) });
  const webStored = structuredClone(v2Stored);
  webStored.source_statistics_shadow_cache_v1.webSources = {
    local: sourceSnapshot(41), other: sourceSnapshot(17, false), otherState: 'none' };
  const unscopedWeb = mod.projectSharedV2Observation(webStored, contextV2, { ok: false }, null, now);
  assert.equal(unscopedWeb.webSources.other, null, 'old unscoped other values cannot leak into the current child');
  assert.equal(unscopedWeb.webSources.otherState, 'unknown');
  webStored.profile_account_v2_shadow_cache = { scope: { apiBase: contextV2.apiBase, deviceId: contextV2.deviceId, childId: contextV2.childId },
    current: { schemaVersion: 2, snapshotId: 'current-web', snapshotHash: 'a'.repeat(64), totalHash: 'b'.repeat(64),
      verifiedAt: now, expiresAt: now + 10000, period: { weekStart: sourceCache.fromDate, weekEnd: '2026-10-04' },
      deviceAccounts: [{ deviceId: 'another-device' }], completeness: { inventoryAvailable: true, expectedDevices: ['another-device'],
        missingDevices: [], incompatibleDevices: [], staleDevices: [], incompleteDevices: [] } } };
  webStored.source_statistics_shadow_cache_v1.webSources.snapshotId = 'current-web';
  const webSeparated = mod.projectSharedV2Observation(webStored, contextV2, { ok: false }, null, now);
  assert.equal(webSeparated.webSources.local.days[0].complete, true);
  assert.equal(webSeparated.webSources.local.days[0].bucketsSeconds.composite, 41);
  assert.equal(webSeparated.webSources.local.days[0].settledThroughMs, null, 'quota projections have no reliable settlement cutoff');
  assert.equal(webSeparated.webSources.otherState, 'unknown', 'unproven cached none is not promoted to confirmed absence');
  assert.equal(webSeparated.webSources.other.days[0].bucketsSeconds.composite, 17);
  const scopedWebNone = structuredClone(webStored);
  scopedWebNone.profile_account_v2_shadow_cache.current.deviceAccounts = [];
  scopedWebNone.profile_account_v2_shadow_cache.current.completeness.expectedDevices = [contextV2.deviceId];
  scopedWebNone.profile_account_v2_shadow_cache.current.completeness.incompleteDevices = [contextV2.deviceId];
  scopedWebNone.source_statistics_shadow_cache_v1.webSources.other = null;
  scopedWebNone.source_statistics_shadow_cache_v1.webSources.local.days[0].complete = false;
  assert.equal(mod.projectSharedV2Observation(scopedWebNone, contextV2, { ok: false }, null, now).webSources.otherState, 'none');
  assert(!JSON.stringify(webSeparated.webSources).includes(contextV2.childId));
  const brokenWebOther = structuredClone(webStored);
  brokenWebOther.source_statistics_shadow_cache_v1.webSources.other.toDate = '1970-01-01';
  const brokenOtherView = mod.projectSharedV2Observation(brokenWebOther, contextV2, { ok: false }, null, now);
  assert.equal(brokenOtherView.webSources.other, null);
  assert.equal(brokenOtherView.webSources.local.days[0].complete, true, 'invalid other explanation cannot poison local');
  const expiredWeb = structuredClone(webStored);
  expiredWeb.source_statistics_shadow_cache_v1.webSources.local.readAtMs = now - 9 * 86400000;
  assert.equal(mod.projectSharedV2Observation(expiredWeb, contextV2, { ok: false }, null, now).webSources.local, null);
  assert.equal(mod.projectSharedV2Observation(webStored, { ...contextV2, childId: 'another-child' }, { ok: false }, null, now).webSources.available, false);
  const separated = {};
  for (const otherState of ['none', 'available', 'unknown']) {
    const sourceStored = structuredClone(v2Stored);
    sourceStored.source_statistics_shadow_cache_v1.application = sourceSnapshot(163, false);
    sourceStored.source_statistics_shadow_cache_v1.applicationSources = {
      local: sourceSnapshot(163), other: otherState === 'available' ? sourceSnapshot(0) : null, otherState };
    separated[otherState] = mod.projectSharedV2Observation(sourceStored, contextV2, { ok: false }, null, now);
    assert.equal(separated[otherState].applicationSources.local.days[0].complete, true);
    assert.equal(separated[otherState].sources.application.days[0].complete, false);
    assert.equal(separated[otherState].applicationSources.otherState, otherState);
    assert(!JSON.stringify(separated[otherState].applicationSources).includes(contextV2.childId));
    const invalidSourceStored = structuredClone(sourceStored);
    invalidSourceStored.source_statistics_shadow_cache_v1.applicationSources.local.childId = 'another-child';
    assert.equal(mod.projectSharedV2Observation(invalidSourceStored, contextV2, { ok: false }, null, now).applicationSources.available, false);
    const foreignScope = { ...contextV2, scopeHash: 'another-scope' };
    assert.equal(mod.projectSharedV2Observation(sourceStored, foreignScope, { ok: false }, null, now).applicationSources.available, false);
  }
  const missingLocal = structuredClone(v2Stored);
  missingLocal.source_statistics_shadow_cache_v1.applicationSources = { local: null, other: sourceSnapshot(7, false), otherState: 'available' };
  const missingLocalView = mod.projectSharedV2Observation(missingLocal, contextV2, { ok: false }, null, now);
  assert.equal(missingLocalView.applicationSources.local, null, 'other data cannot become a zero or inferred local source');
  assert.equal(missingLocalView.applicationSources.other.days[0].complete, false);
  const reasonFixture = structuredClone(missingLocal);
  reasonFixture.source_statistics_shadow_cache_v1.applicationSources.other.days[0].reasonCodes =
    ['LOCAL_STATISTICS_MISSING', 'APPLICATION_OTHER_MISSING', 'QUOTA_BUCKETS_PARTIAL', 'PRIVATE_PATH'];
  assert.deepEqual(mod.projectSharedV2Observation(reasonFixture, contextV2, { ok: false }, null, now)
    .applicationSources.other.days[0].reasonCodes,
  ['LOCAL_STATISTICS_MISSING', 'APPLICATION_OTHER_MISSING', 'QUOTA_BUCKETS_PARTIAL', 'UNKNOWN_REASON']);
  const staleSources = structuredClone(missingLocal);
  staleSources.source_statistics_shadow_cache_v1.applicationSources.other.readAtMs = now - 9 * 86400000;
  assert.equal(mod.projectSharedV2Observation(staleSources, contextV2, { ok: false }, null, now).applicationSources.available, false);
  assert.equal(v2.scopeCurrent, true); assert.equal(v2.debuggerGranted, true);
  assert.equal(v2.nativePeerSameChild, null, 'a cached Native source never claims current peer verification');
  const currentNative = { connected: true, connectionGeneration: 7 };
  const confirmation = { confirmed: true, connectionGeneration: 7, expiresAtMs: now + 1000 };
  const confirmedPeer = mod.projectSharedV2Observation(v2Stored, contextV2, { ok: false }, null, now, currentNative, confirmation);
  assert.equal(confirmedPeer.nativePeerSameChild, true);
  for (const [state, receipt] of [
    [{ connected: false, connectionGeneration: 7 }, confirmation],
    [{ connected: true, connectionGeneration: 8 }, confirmation],
    [currentNative, { ...confirmation, expiresAtMs: now }],
    [currentNative, { ...confirmation, confirmed: null }],
    [currentNative, null],
  ]) assert.equal(mod.projectSharedV2Observation(v2Stored, contextV2, { ok: false }, null, now, state, receipt).nativePeerSameChild, null);
  const fullContext = { ...contextV2, apiBase: 'https://private.invalid', deviceId: 'private-device', deviceToken: 'private-token' };
  const observePeer = async overrides => mod.readSharedV2Observation(v2Stored, null, {
    readContext: async () => fullContext, readPolicy: async () => ({ ok: false }),
    readConfirmation: async expected => { assert.deepEqual(expected, fullContext); return confirmation; },
    readNative: () => currentNative, nativeState: currentNative, now: () => now, ...overrides,
  });
  assert.equal((await observePeer()).nativePeerSameChild, true);
  assert.equal((await observePeer({ readConfirmation: async () => { throw Error('private-proof'); } })).nativePeerSameChild, null);
  assert.equal((await observePeer({ readConfirmation: async () => { throw Error('private-proof'); } })).scopeCurrent, true,
    'identity confirmation errors do not hide same-scope statistics');
  assert.equal((await observePeer({ readNative: () => ({ connected: true, connectionGeneration: 8 }) })).nativePeerSameChild, null);
  assert.equal((await observePeer({ readNative: () => ({ connected: false, connectionGeneration: 7 }) })).nativePeerSameChild, null);
  let contextReads = 0;
  assert.equal((await observePeer({ readConfirmation: async () => confirmation,
    readContext: async () => ++contextReads === 1 ? fullContext : { ...fullContext, childId: 'different-child' } })).nativePeerSameChild, null);
  contextReads = 0;
  assert.equal((await observePeer({ readContext: async () => ++contextReads === 1 ? fullContext
    : { ...fullContext, childId: 'different-child' } })).scopeCurrent, false, 'in-flight child changes cannot return former-child source rows');
  assert(!JSON.stringify(await observePeer()).match(/private|bindingContextId|expiresAtMs|connectionGeneration/));
  assert.equal(v2.policy.policyHash, 'c'.repeat(64)); assert.equal(v2.policy.stage, 'shadow');
  assert.equal(v2.sources.web.days[0].totalSeconds, 120);
  assert.equal(v2.sources.application.origin, 'native');
  assert.equal(v2.sources.application.errorCode, 'unknown');
  const quotaCache = structuredClone(v2Stored);
  quotaCache.source_statistics_shadow_cache_v1.schemaVersion = 2;
  const quotaApplication = quotaCache.source_statistics_shadow_cache_v1.application;
  quotaApplication.schemaVersion = 2;
  quotaApplication.days = quotaApplication.days.map(day => ({ date: day.date,
    bucketsSeconds: { study: 100, composite: 200, rest: 600 }, complete: false,
    reasonCodes: ['APPLICATION_LOCAL_MISSING', 'QUOTA_BUCKETS_PARTIAL'], settledThroughMs: null }));
  const bucketView = mod.projectSharedV2Observation(quotaCache, contextV2, { ok: false }, null, now);
  assert.deepEqual(bucketView.sources.application.days[0].bucketsSeconds, { study: 100, composite: 200, rest: 600 });
  assert.equal(bucketView.sources.application.days[0].totalSeconds, null, 'diagnostics do not rebuild totals from buckets');
  assert.deepEqual(bucketView.sources.application.days[0].reasonCodes, ['APPLICATION_LOCAL_MISSING', 'QUOTA_BUCKETS_PARTIAL']);
  const missingApplication = structuredClone(v2Stored);
  missingApplication.source_statistics_shadow_cache_v1.application = null;
  missingApplication.source_statistics_shadow_v1.applicationErrorCode = 'source_statistics_native_unavailable';
  missingApplication.source_statistics_shadow_v1.source.application = { origin: 'unavailable', readAtMs: null };
  assert.equal(mod.projectSharedV2Observation(missingApplication, contextV2, { ok: false }, null, now)
    .sources.application.errorCode, 'source_statistics_native_unavailable', 'missing snapshot must not hide current read failure');
  assert.equal(mod.projectSharedV2Observation(missingApplication, { ...contextV2, scopeHash: 'other' }, { ok: false }, null, now)
    .sources.application.errorCode, null, 'another scope cannot inherit a report error');
  const unrelatedReport = structuredClone(missingApplication);
  unrelatedReport.source_statistics_shadow_v1.source.web.readAtMs--;
  assert.equal(mod.projectSharedV2Observation(unrelatedReport, contextV2, { ok: false }, null, now)
    .sources.application.errorCode, null, 'a report without a current cached read anchor stays unverified');
  assert.equal(v2.sources.web.weeklyTotalSeconds, null, 'diagnostics do not calculate a new weekly aggregate');
  assert(!JSON.stringify(v2).match(/private|PRIVATE|childFingerprint|childId|scopeHash/));
  for (const changedContext of [{ ...contextV2, childId: 'other' }, { ...contextV2, scopeHash: 'other' }]) {
    assert.equal(mod.projectSharedV2Observation(v2Stored, changedContext, { ok: false }, null, now).sources.web.available, false);
  }
  assert.equal(mod.projectSharedV2Observation(v2Stored, contextV2, { ok: false }, null, now + 86400000).sources.web.available, false);
  assert.equal(mod.projectSharedV2Observation(v2Stored, contextV2, { ok: false }, null, now + 2 * 86400000).scopeCurrent, false);
  const permissionFailure = await mod.readSharedV2Observation(v2Stored, { contains() { throw Error('private'); } },
    { readContext: async () => contextV2, readPolicy: async () => ({ ok: true, policy: policyV2 }), now: () => now });
  assert.equal(permissionFailure.debuggerGranted, null);
  assert.equal(permissionFailure.policy.revision, policyV2.revision, 'permission read errors do not erase other observations');
  const attempted = structuredClone(v2Stored);
  attempted.source_statistics_shadow_v1.scopeHash = contextV2.scopeHash;
  attempted.source_statistics_shadow_v1.nativeAttempt = { sent: true, responseReceived: true, accepted: false,
    errorCode: 'SOURCE_STATISTICS_CONTEXT_CHANGED', connectionGeneration: 7, startedAtMs: now };
  const memoryAttempt = attempted.source_statistics_shadow_v1.nativeAttempt;
  const observedAttempt = mod.projectSharedV2Observation(attempted, contextV2, { ok: false }, null, now,
    { connected: true, connectionGeneration: 7, sourceStatisticsAttempt: memoryAttempt });
  assert.equal(observedAttempt.nativeAttempt.current, true);
  assert.equal(observedAttempt.nativeAttempt.errorCode, 'SOURCE_STATISTICS_CONTEXT_CHANGED');
  for (const code of ['source_statistics_native_binding_required', 'source_statistics_native_binding_unavailable',
    'application_identity_usage_binding_unavailable', 'WEB_SOURCE_PROOF_EXPIRED', 'shared_web_identity_changed',
    'QUOTA_BUCKETS_CONTEXT_CHANGED', 'QUOTA_BUCKETS_UNAVAILABLE']) {
    const preparationFailure = structuredClone(attempted);
    Object.assign(preparationFailure.source_statistics_shadow_v1.nativeAttempt,
      { sent: false, responseReceived: false, accepted: false, errorCode: code });
    const projected = mod.projectSharedV2Observation(preparationFailure, contextV2, { ok: false }, null, now);
    assert.equal(projected.nativeAttempt.errorCode, code);
    assert.equal(projected.nativeAttempt.sent, false);
    assert.equal(projected.nativeAttempt.responseReceived, false);
  }
  for (const state of [{ connected: true, connectionGeneration: 8, sourceStatisticsAttempt: memoryAttempt }, { connected: false, connectionGeneration: null }]) {
    const oldAttempt = mod.projectSharedV2Observation(attempted, contextV2, { ok: false }, null, now, state);
    assert.equal(oldAttempt.nativeAttempt.current, false);
    assert.equal(oldAttempt.nativeAttempt.available, true);
    assert.equal(oldAttempt.nativeAttempt.sent, true);
    assert.equal(oldAttempt.nativeAttempt.errorCode, 'SOURCE_STATISTICS_CONTEXT_CHANGED');
  }
  const formerSuccess = structuredClone(attempted);
  Object.assign(formerSuccess.source_statistics_shadow_v1.nativeAttempt, { accepted: true, errorCode: null });
  const reconnected = mod.projectSharedV2Observation(formerSuccess, contextV2, { ok: false }, null, now,
    { connected: true, connectionGeneration: 8, sourceStatisticsAttempt: memoryAttempt });
  assert.equal(reconnected.nativeAttempt.accepted, true);
  assert.equal(reconnected.nativeAttempt.current, false, 'a former accepted exchange is not current-connection confirmation');
  const restarted = mod.projectSharedV2Observation(formerSuccess, contextV2, { ok: false }, null, now,
    { connected: true, connectionGeneration: 7 });
  assert.equal(restarted.nativeAttempt.current, null, 'reused generation after background restart cannot confirm a persistent attempt');
  assert.equal(mod.projectSharedV2Observation(attempted, { ...contextV2, scopeHash: 'other' }, { ok: false }, null, now)
    .nativeAttempt.errorCode, null);
  let listener, reads = 0, nativeReads = 0, reply;
  const runtime = { id: 'self', getURL: p => 'chrome-extension://self/' + p,
    getManifest: () => ({ version: '1.7.40' }), onMessage: { addListener: fn => { listener = fn; } } };
  mod.registerSharedSyncDiagnosticsReader({ runtime, storage: { get: async keys => { reads++; assert(!keys.some(k => /token|config|usage_stats|usage_segments/.test(k))); return stored; } },
    native: () => { nativeReads++; return {}; }, live: () => ({}), observeV2: async () => v2 });
  assert.equal(listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, { id: 'self', url: 'https://untrusted/' }, v => reply = v), false);
  assert.equal(reads, 0); assert.equal(reply.errorCode, 'diagnostics_sender_rejected');
  assert.equal(listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, { id: 'self', url: runtime.getURL('admin/admin.html') }, v => reply = v), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reply.ok, true); assert.equal(reads, 1); assert.equal(nativeReads, 1);
  assert.deepEqual(reply.diagnostics.v2, v2);
  for (const suffix of ['?view=system-management', '#system-management', '?view=system-management#local']) {
    assert.equal(listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, { id: 'self', url: runtime.getURL('admin/admin.html') + suffix }, v => reply = v), true);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(reply.ok, true);
  }
  for (const sender of [
    { id: 'other', url: runtime.getURL('admin/admin.html') },
    { id: 'self', url: 'chrome-extension://other/admin/admin.html' },
    { id: 'self', url: runtime.getURL('popup/popup.html') },
    { id: 'self', url: 'https://self/admin/admin.html' },
  ]) {
    assert.equal(listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, sender, v => reply = v), false);
    assert.equal(reply.errorCode, 'diagnostics_sender_rejected');
  }
  for (const [stage, options] of [
    ['storage', { storage: { get: async () => { throw Error('private_token'); } } }],
    ['native', { native: () => { throw Error('private_token'); } }],
  ]) {
    mod.registerSharedSyncDiagnosticsReader({ runtime, storage: { get: async () => stored }, native: () => ({}), live: () => ({}), ...options });
    listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, { id: 'self', url: runtime.getURL('admin/admin.html') }, v => reply = v);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reply.errorCode, `diagnostics_${stage}_read_failed`); assert(!JSON.stringify(reply).includes('private_token'));
  }
  const nativeSource = read('extension/infra/native-host-client.js');
  const recordBody = nativeSource.match(/function recordResponseRejection\(request, reason, serviceErrorCode = null\) \{([\s\S]*?)\n\}/)[1];
  const sourceErrorsDeclaration = nativeSource.match(/const SOURCE_STATISTICS_ERRORS = new Set\([\s\S]*?\);/)[0];
  const record = new Function('request', 'reason', 'serviceErrorCode', `${sourceErrorsDeclaration} const SHARED_WEB_IDENTITY_ERRORS=globalThis.__sharedIdentityErrors; const SOURCE_STATISTICS_EXCHANGE_MESSAGE='exchangeSourceStatistics'; let lastResponseRejection; const safeNow=()=>123; ${recordBody}; return lastResponseRejection;`);
  assert.deepEqual(record({ messageType: 'dailyUsageSnapshot', channel: 'statistics', requestId: 'private_id', proof: 'private_token' }, 'snapshot_stale'),
    { atMs: 123, reason: 'snapshot_stale', serviceErrorCode: null, messageType: 'dailyUsageSnapshot', channel: 'statistics' });
  assert.equal(record({ messageType: 'private_token', channel: 'private_id' }, 'negative_response').messageType, 'unknown');
  const rejectionModel = mod.buildSharedSyncDiagnostics({}, { lastResponseRejection: { atMs: 123, reason: 'private_token', messageType: 'private_id', channel: 'private_channel' } }, {}, now);
  assert(!JSON.stringify(rejectionModel).includes('private_'));
  for (const messageType of ['getApplicationUsageSeconds', 'exchangeQuotaBuckets']) {
    const readable = mod.buildSharedSyncDiagnostics({}, { lastResponseRejection: {
      atMs: now, reason: 'negative_response', messageType, channel: messageType === 'exchangeSourceStatistics' ? 'sharedQuota' : 'application' } }, {}, now);
    assert.equal(readable.connection.responseRejection.messageType, messageType);
  }
  for (const code of ['WEB_SOURCE_PROOF_EXPIRED', 'WEB_SOURCE_SCOPE_MISMATCH', 'WEB_SOURCE_CONTEXT_CHANGED', 'WEB_SOURCE_PROOF_REQUIRED']) {
    const rejection = record({ messageType: 'bindSharedWebSourceV2', channel: 'sharedQuota' }, 'negative_response', code);
    const diagnostic = mod.buildSharedSyncDiagnostics({}, { connected: true, lastResponseRejection: rejection }, { bindingState: 'expired_or_changed' }, now);
    assert.equal(diagnostic.connection.connectedCurrent, true);
    assert.equal(diagnostic.connection.responseRejection.serviceErrorCode, code);
    assert.equal(diagnostic.connection.responseRejection.messageType, 'bindSharedWebSourceV2');
    assert.equal(Object.hasOwn(diagnostic, 'bindingState'), false, 'current identity is reported only by V2 confirmation');
  }
  const callbackBody = nativeSource.slice(nativeSource.indexOf('  port.onMessage.addListener((response) => {') + '  port.onMessage.addListener((response) => {'.length,
    nativeSource.indexOf('\n  port.onDisconnect.addListener'));
  const callback = new Function('response', 'pendingAck', 'recordResponseRejection', 'rejectPendingAck', 'disconnectPort', 'LIFECYCLE_ERRORS', 'clearTimeout',
    'const port = {}, nativePort = port;\n' + callbackBody.replace(/\n  \}\);\s*$/, ''));
  for (const [response, expected] of [[{ ok: false, errorCode: 'BROWSER_BRIDGE_MESSAGE_REJECTED' }, 'service_message_rejected'],
    [{ ok: false, errorCode: 'private_token' }, 'negative_response'], [{ ok: true, receivedAt: '123' }, 'received_at_invalid']]) {
    let reason, disconnected = false;
    callback(response, { messageType: 'heartbeat', channel: 'health' }, (_, value) => reason = value, () => {}, () => disconnected = true, new Set(), () => {});
    assert.equal(reason, expected); assert.equal(disconnected, true);
  }
  for (const [response, isolated] of [
    [{ ok: false, requestId: 'match', receivedAt: 123, errorCode: 'BROWSER_BRIDGE_MESSAGE_REJECTED' }, true],
    [{ ok: false, requestId: 'match', receivedAt: '123', errorCode: 'BROWSER_BRIDGE_MESSAGE_REJECTED' }, false],
    [{ ok: false, requestId: 'match', receivedAt: 123, errorCode: 'private_error' }, false],
  ]) {
    let rejected, disconnected = false;
    callback(response, { requestId: 'match', messageType: 'dailyUsageSnapshot', channel: 'statistics' }, () => {}, value => rejected = value,
      () => disconnected = true, new Set(), () => {});
    assert.equal(disconnected, !isolated); assert.equal(rejected, isolated ? 'native_snapshot_rejected' : 'native_invalid_response');
  }
  const body = nativeSource.match(/export function readNativeHostDiagnosticState\(\) \{([\s\S]*?)\n\}/)[1];
  const inspect = new Function('nativePort', 'sharedNativeV3', 'sharedNativeCapabilities', 'applicationUsageSecondsSupported', 'lastResponseRejection',
    "const applicationConnectionGeneration=7,lastSourceStatisticsAttempt=null;\n" + body);
  assert.equal(inspect({}, false, new Set(), false).applicationUsageSupported, null);
  assert.equal(inspect(null, true, new Set(), true).applicationUsageSupported, null);
  assert.equal(inspect({}, true, new Set(['private_capability', 'quota-buckets-read-v1']), false).capabilities.length, 1);
  assert.equal(inspect({}, true, new Set(['application-usage-seconds-read-v1']), true).applicationUsageSupported, true);
  assert.deepEqual(inspect({}, true, new Set(['shared-quota-state-read', 'shared-web-contribution-sync-v1']), false).capabilities, []);
  const ui = await load(read('extension/admin/shared-sync-diagnostics-view.js'));
  class Element {
    constructor(doc) { this.ownerDocument = doc; this.children = []; this.textContent = ''; }
    append(e) { this.children.push(e); } replaceChildren() { this.children = []; }
  }
  const doc = { hidden: false, createElement: () => new Element(doc) };
  const container = new Element(doc), handlers = {}, pending = [];
  const contents = element => [element.textContent, ...element.children.map(contents)].join(' ');
  ui.renderSharedSyncDiagnostics(container, { ...model, connection: { lastSuccessAtMsHistorical: now, lastErrorCodeHistorical: 'native_port_disconnected', connectedCurrent: false } });
  assert(contents(container).includes('历史连接成功时间')); assert(contents(container).includes('native_port_disconnected'));
  ui.renderSharedSyncDiagnostics(container, { ...model, v2, days: [] });
  assert(contents(container).includes('V2 当前只读观测'));
  assert(contents(container).includes('已授予'));
  assert(contents(container).includes('本地组件'));
  assert(contents(container).includes('未知；不能由缓存来源推断'));
  assert(!contents(container).includes('以下为旧版历史贡献'));
  assert(!Object.hasOwn(model, 'days'), 'current diagnostics has no legacy contribution projection');
  assert(!contents(container).match(/private|PRIVATE|指纹/));
  ui.renderSharedSyncDiagnostics(container, { ...model, v2: confirmedPeer, days: [] });
  assert(contents(container).includes('V2 当前本地连接同孩子核验'));
  assert(!contents(container).includes('未知；不能由缓存来源推断'));
  assert(contents(container).includes('已确认'));
  assert(!contents(container).match(/bindingContextId|expiresAtMs|connectionGeneration|private|PRIVATE/));
  for (const [otherState, expectedText] of [['none', '无其他设备'], ['available', '其他设备已知用量'], ['unknown', '其他设备用量未知；不影响本机显示']]) {
    ui.renderSharedSyncDiagnostics(container, { ...model, v2: separated[otherState], days: [] });
    const rendered = contents(container);
    assert(rendered.includes(expectedText));
    assert(rendered.includes('应用本机 2026-10-03'));
    assert(rendered.includes('复合163秒／休息0秒 · 完整'));
    assert(rendered.includes('应用合计 2026-10-03'));
    if (otherState === 'available') {
      assert(rendered.includes('应用其他设备 2026-10-03'));
      assert(!rendered.includes('无其他设备'));
    }
  }
  ui.renderSharedSyncDiagnostics(container, { ...model, v2, days: [] });
  assert(contents(container).includes('应用合计，无法区分本机'));
  ui.renderSharedSyncDiagnostics(container, { ...model, v2: missingLocalView, days: [] });
  assert(contents(container).includes('本机用量暂不可读'));
  assert(contents(container).includes('其他设备已知用量'));
  ui.renderSharedSyncDiagnostics(container, { ...model, v2: webSeparated, days: [] });
  assert(contents(container).includes('本浏览器网页 2026-10-03'));
  assert(contents(container).includes('复合41秒／休息0秒 · 完整 · 结算截至 未提供'));
  assert(contents(container).includes('其他设备来源范围未确认'));
  assert(contents(container).includes('网页其他设备（已知部分）'));
  ui.renderSharedSyncDiagnostics(container, { ...model, v2: bucketView, days: [] });
  assert(contents(container).includes('休息600秒'));
  assert(contents(container).includes('缺少应用本机用量'));
  assert(contents(container).includes('配额桶数据不完整'));
  ui.renderSharedSyncDiagnostics(container, { ...model, v2: observedAttempt, days: [] });
  assert(contents(container).includes('已实际发送至本地组件'));
  assert(contents(container).includes('SOURCE_STATISTICS_CONTEXT_CHANGED'));
  ui.renderSharedSyncDiagnostics(container, { ...model, v2: reconnected, days: [] });
  assert(contents(container).includes('是否属于当前连接'));
  assert(contents(container).includes('不代表当前连接已确认'));
  assert(contents(container).includes('原因未知')); assert(!contents(container).includes('UNKNOWN_REASON'));
  ui.renderSharedSyncDiagnostics(container, null, 'private_token', '1.7.41');
  assert(!contents(container).includes('private_token')); assert(contents(container).includes('1.7.41'));
  container.replaceChildren();
  for (const [response, code] of [
    [{ error: 'Unknown message type' }, 'diagnostics_background_unsupported'],
    [undefined, 'diagnostics_response_invalid'],
    [{ ok: false, errorCode: 'diagnostics_sender_rejected' }, 'diagnostics_sender_rejected'],
  ]) {
    const localHandlers = {};
    const localDetails = { open: true, addEventListener: (k, fn) => localHandlers[k] = fn, removeEventListener() {} };
    const stop = ui.attachSharedSyncDiagnostics(localDetails, container, {
      runtime: { getManifest: () => ({ version: '1.7.41' }), sendMessage: async () => response },
      storage: { onChanged: { addListener() {}, removeListener() {} } }, schedule: () => 1, cancel() {} });
    localHandlers.toggle(); await new Promise(resolve => setImmediate(resolve));
    assert(contents(container).includes(code)); stop();
  }
  container.replaceChildren();
  const details = { open: false, addEventListener: (k, fn) => handlers[k] = fn, removeEventListener: k => delete handlers[k] };
  let timers = 0, cancels = 0;
  const dispose = ui.attachSharedSyncDiagnostics(details, container, {
    runtime: { sendMessage: () => new Promise(resolve => pending.push(resolve)) },
    storage: { onChanged: { addListener() {}, removeListener() {} } }, schedule: () => ++timers, cancel: () => cancels++ });
  assert.equal(pending.length, 0);
  details.open = true; handlers.toggle();
  details.open = false; handlers.toggle(); details.open = true; handlers.toggle();
  pending[0]({ ok: true, diagnostics: { version: 'OLD' } }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(container.children.length, 0);
  pending[1]({ ok: true, diagnostics: model }); await new Promise(resolve => setImmediate(resolve));
  assert(container.children.length > 0);
  handlers.toggle(); const before = container.children; dispose();
  pending[2]({ ok: true, diagnostics: { version: 'LATE' } }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(container.children, before); assert.equal(timers, 3); assert(cancels >= 3);
  console.log('Shared sync diagnostics PASS: privacy, unknowns, scope/policy/revision isolation, read-only sender, Native negotiation and UI lifecycle');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
