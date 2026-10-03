'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const load = s => import('data:text/javascript;base64,' + Buffer.from(s).toString('base64'));
async function run() {
  const mod = await load(read('extension/infra/shared-sync-diagnostics.js').replace(/^import .*;\r?\n/gm, ''));
  const now = Date.parse('2026-10-03T04:00:00Z');
  const identity = { schemaVersion: 1, revision: 'profile-config:34', stage: 'shadow', effectiveAtMs: 0, policyHash: 'a'.repeat(64) };
  const upload = { revisionOrdinal: 1, contentHash: 'b'.repeat(64), complete: false,
    reasonCodes: ['LOCAL_BUCKETS_INCOMPLETE', 'PRIVATE_ACCOUNT_IDENTIFIER'], policyIdentity: identity,
    activeMs: 906000, bucketsMs: { study: 1000, composite: 2000, rest: 603000 }, otherMs: 0 };
  const stored = { shared_web_contribution_queue_v1: { scopeHash: 'private_scope', days: { '2026-09-30': {
    upload, cloudConfirmed: true, nativeAccepted: true, failures: 2, nextRetryAtMs: now + 1000,
    lastErrorCode: 'shared_web_private_account_identifier' } } },
    shared_access_policy_lkg_v1: { policyHash: identity.policyHash, policy: identity, receivedAtMs: now },
    shared_web_sync_diagnostics_v1: { scopeHash: 'private_scope', policyIdentity: identity,
      cloudAckAtMsByDate: { '2026-09-30': now }, cloudAckVersionsByDate: { '2026-09-30': { revisionOrdinal: 1, contentHash: upload.contentHash } },
      coverageByDate: { '2026-09-30': { revisionOrdinal: 1, contentHash: upload.contentHash, allBucketMs: 906000, knownBucketMs: 606000, unknownBucketKeyCount: 1 } },
      failedStage: 'cloud_watermark', failedDate: '2026-10-01', lastErrorCode: 'shared_web_watermark_unavailable' },
    local_guardian_status_v1: { privateToken: 'private_token', lastSuccessAt: now, lastErrorCode: 'private_identifier' } };
  const model = mod.buildSharedSyncDiagnostics(stored, {}, { cacheScopeCurrent: true }, now, '1.7.40');
  assert.equal(model.days.length, 6);
  assert.equal(model.connection.connectedCurrent, null);
  assert.equal(model.connection.capabilities, null);
  assert.equal(model.connection.applicationUsageSupported, null);
  assert.equal(model.historyCurrent, true);
  assert.equal(model.days[2].cloudAckAtMs, now);
  assert.equal(model.days[3].activeMs, null);
  assert.equal(model.days[3].nativeConfirmedCurrent, null);
  assert.equal(model.days[2].nativeAcceptedHistorical, true);
  assert.equal(model.days[2].nativeConfirmedCurrent, null);
  assert.deepEqual(model.days[2].storedBucketCoverageBeforeCorrections,
    { allBucketMs: 906000, knownBucketMs: 606000, unknownBucketKeyCount: 1 });
  assert.deepEqual(model.days[2].reasonCodes, ['LOCAL_BUCKETS_INCOMPLETE', 'UNKNOWN_REASON']);
  assert.equal(model.days[2].lastErrorCode, 'unknown');
  const serialized = JSON.stringify(model);
  for (const value of ['private', identity.policyHash, upload.contentHash, 'PRIVATE_ACCOUNT_IDENTIFIER']) assert(!serialized.includes(value));
  const rebound = structuredClone(stored); rebound.shared_web_contribution_queue_v1.scopeHash = 'new_scope';
  assert.equal(mod.buildSharedSyncDiagnostics(rebound, {}, {}, now).days[2].cloudAckAtMs, null);
  const changed = structuredClone(stored); changed.shared_access_policy_lkg_v1.policy = { ...changed.shared_access_policy_lkg_v1.policy, stage: 'shared' };
  assert.equal(mod.buildSharedSyncDiagnostics(changed, {}, {}, now).historyCurrent, false);
  const advanced = structuredClone(stored); advanced.shared_web_contribution_queue_v1.days['2026-09-30'].upload.revisionOrdinal++;
  assert.equal(mod.buildSharedSyncDiagnostics(advanced, {}, {}, now).days[2].cloudAckAtMs, null);
  assert.equal(mod.buildSharedSyncDiagnostics({}, {}, {}, now).historyCurrent, false);
  assert.equal(mod.buildSharedSyncDiagnostics(stored, {}, {}, now).days[2].cloudAckAtMs, null);
  assert.equal(mod.buildSharedSyncDiagnostics(stored, {}, {}, now).days[2].cloudConfirmedHistorical, null);
  const partial = structuredClone(stored); partial.shared_access_policy_lkg_v1.policy = { revision: identity.revision };
  assert.equal(mod.buildSharedSyncDiagnostics(partial, {}, { cacheScopeCurrent: true }, now).days[2].policyMatchesCurrentCache, null);
  assert.equal(mod.buildSharedSyncDiagnostics({}, {}, {}, Date.parse('2026-10-04T16:00:00Z')).days.length, 1);
  let listener, reads = 0, nativeReads = 0, reply;
  const runtime = { id: 'self', getURL: p => 'chrome-extension://self/' + p,
    getManifest: () => ({ version: '1.7.40' }), onMessage: { addListener: fn => { listener = fn; } } };
  mod.registerSharedSyncDiagnosticsReader({ runtime, storage: { get: async keys => { reads++; assert(!keys.some(k => /token|config|usage_stats|usage_segments/.test(k))); return stored; } },
    native: () => { nativeReads++; return {}; }, live: () => ({}) });
  assert.equal(listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, { id: 'self', url: 'https://untrusted/' }, v => reply = v), false);
  assert.equal(reads, 0); assert.equal(reply.errorCode, 'diagnostics_sender_rejected');
  assert.equal(listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, { id: 'self', url: runtime.getURL('admin/admin.html') }, v => reply = v), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reply.ok, true); assert.equal(reads, 1); assert.equal(nativeReads, 1);
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
    ['shared', { live: () => { throw Error('private_token'); } }],
  ]) {
    mod.registerSharedSyncDiagnosticsReader({ runtime, storage: { get: async () => stored }, native: () => ({}), live: () => ({}), ...options });
    listener({ type: mod.SHARED_SYNC_DIAGNOSTICS_MESSAGE }, { id: 'self', url: runtime.getURL('admin/admin.html') }, v => reply = v);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reply.errorCode, `diagnostics_${stage}_read_failed`); assert(!JSON.stringify(reply).includes('private_token'));
  }
  const nativeSource = read('extension/infra/native-host-client.js');
  const recordBody = nativeSource.match(/function recordResponseRejection\(request, reason, serviceErrorCode = null\) \{([\s\S]*?)\n\}/)[1];
  const record = new Function('request', 'reason', 'serviceErrorCode', `let lastResponseRejection; const safeNow=()=>123; ${recordBody}; return lastResponseRejection;`);
  assert.deepEqual(record({ messageType: 'dailyUsageSnapshot', channel: 'statistics', requestId: 'private_id', proof: 'private_token' }, 'snapshot_stale'),
    { atMs: 123, reason: 'snapshot_stale', serviceErrorCode: null, messageType: 'dailyUsageSnapshot', channel: 'statistics' });
  assert.equal(record({ messageType: 'private_token', channel: 'private_id' }, 'negative_response').messageType, 'unknown');
  const rejectionModel = mod.buildSharedSyncDiagnostics({}, { lastResponseRejection: { atMs: 123, reason: 'private_token', messageType: 'private_id', channel: 'private_channel' } }, {}, now);
  assert(!JSON.stringify(rejectionModel).includes('private_'));
  const callbackBody = nativeSource.slice(nativeSource.indexOf('  port.onMessage.addListener((response) => {') + '  port.onMessage.addListener((response) => {'.length,
    nativeSource.indexOf('\n  port.onDisconnect.addListener'));
  const callback = new Function('response', 'pendingAck', 'recordResponseRejection', 'rejectPendingAck', 'disconnectPort', 'LIFECYCLE_ERRORS', 'clearTimeout',
    callbackBody.replace(/\n  \}\);\s*$/, ''));
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
  const inspect = new Function('nativePort', 'sharedNativeV3', 'sharedNativeCapabilities', 'applicationUsageSupported', 'lastResponseRejection', body);
  assert.equal(inspect({}, false, new Set(), false).applicationUsageSupported, null);
  assert.equal(inspect(null, true, new Set(), true).applicationUsageSupported, null);
  assert.equal(inspect({}, true, new Set(['private_capability', 'shared-web-local-lease-v1']), false).capabilities.length, 1);
  const url = f => pathToFileURL(path.join(root, f)).href;
  const syncSource = read('extension/infra/shared-web-contribution-sync.js')
    .replace(/from '(\.\.\/core\/shared-contracts\/[^']+|\.\.\/core\/shared-access-policy.js)'/g,
      (_, p) => `from '${url('extension/' + path.posix.normalize('infra/' + p))}'`)
    .replace(/import \{ buildLocalQuotaProjectionV2 \}[^;]+;/, 'const buildLocalQuotaProjectionV2=()=>{};')
    .replace(/import \{ getBeijingWeekPeriod \}[^;]+;/, 'const getBeijingWeekPeriod=()=>({weekStart:"2026-09-28"});')
    .replace(/import \{ readSharedAccessPolicyContext[^;]+;/, 'const readSharedAccessPolicyContext=()=>null,readSharedAccessPolicyLkg=()=>null,SHARED_ACCESS_POLICY_LKG_KEY="policy";')
    .replace(/import \{ readCloudSharedWebCapabilities[^;]+;/, 'const readCloudSharedWebCapabilities=()=>null,readCloudSharedWebWatermark=()=>null,postCloudSharedWebContribution=()=>null,requestCloudSharedWebSourceBinding=()=>null;')
    .replace(/import \{ requestSharedWebSync[^;]+;/, 'const requestSharedWebSync=()=>null,observeSharedAccessPolicyCapability=()=>null,readSharedWebLocalConnection=()=>({connection:null});')
    .replace(/import \{ runStorageMutation[^;]+;/, 'const runStorageMutation=()=>null,budgetedLocalSet=async(value,options)=>globalThis.__diagnosticWrites.push({value,options});')
    .replace(/import \{ readSharedQuotaExecutionLkg[^;]+;/, 'const readSharedQuotaExecutionLkg=()=>null;');
  globalThis.__diagnosticWrites = [];
  const syncModule = await load(syncSource);
  assert.deepEqual(syncModule.summarizeStoredBucketCoverage({ targets: { private_target: { activeByQuotaBucket: { rest: 606, private_bucket: 300 } } } }),
    { allBucketMs: 906000, knownBucketMs: 606000, unknownBucketKeyCount: 1 });
  assert.equal(syncModule.summarizeStoredBucketCoverage({}).allBucketMs, null);
  assert.equal(mod.buildSharedSyncDiagnostics(advanced, {}, {}, now).days[2].storedBucketCoverageBeforeCorrections.allBucketMs, null);
  const failureSync = syncModule.createSharedWebContributionSync({ enabled: true,
    readContext: async () => { throw Error('private_raw_exception'); }, now: () => now });
  assert.equal((await failureSync.refresh()).errorCode, 'shared_web_sync_unavailable');
  const event = globalThis.__diagnosticWrites[0];
  assert.equal(event.options.priority, 'diagnostic');
  assert.deepEqual(Object.keys(event.value), ['shared_web_sync_diagnostics_v1']);
  assert.equal(event.value.shared_web_sync_diagnostics_v1.failedStage, 'local_context');
  assert(!JSON.stringify(event).includes('private_raw_exception'));
  const beforeReads = globalThis.__diagnosticWrites.length;
  assert.equal(failureSync.readDiagnostics(null, {}).bindingState, 'disconnected');
  assert.equal(globalThis.__diagnosticWrites.length, beforeReads);
  const contract = await import(url('extension/core/shared-contracts/1.30.0/shared-access.js'));
  const policy = { ...contract.projectLegacySharedAccessPolicy({}, 34, 0), stage: 'shadow' };
  const loopSource = syncSource.replace('const buildLocalQuotaProjectionV2=()=>{};',
    'const buildLocalQuotaProjectionV2=()=>({today:{byQuotaBucket:{},onlineSeconds:0,complete:true},complete:true,correctionIssues:[]});');
  const loopModule = await load(loopSource);
  const loopStore = { daily_usage_stats_v1: Object.fromEntries(model.days.map(d => [d.date, { domains: {}, targets: {} }])), guardian_config: {} };
  const sourceKey = 'web:' + 'f'.repeat(64);
  const loop = loopModule.createSharedWebContributionSync({ enabled: true, now: () => now,
    readContext: async () => ({ apiBase: 'https://fixture.invalid', deviceId: 'private_device', childId: 'private_child', deviceToken: 'private_token' }),
    readPolicy: async () => ({ ok: true, policy }), readStorage: async () => loopStore,
    mutate: async fn => fn({ get: async () => loopStore, set: async v => Object.assign(loopStore, v) }),
    capabilities: async () => ({ ok: true, value: { schemaVersion: 1, protocol: 'shared-web-sync-v1', enabled: true } }),
    readWatermark: async (_, date) => date === '2026-10-01' ? { ok: false, errorCode: 'private_identifier' }
      : { ok: true, value: { schemaVersion: 1, sourceKey, date, revisionOrdinal: 0, contentHash: null, publicationRevision: null } },
    native: async () => ({ ok: false }),
    upload: async (_, u) => ({ ok: true, value: { schemaVersion: 1, sourceKey, date: u.date, revisionOrdinal: u.revisionOrdinal,
      contentHash: u.contentHash, publicationRevision: `${u.revisionOrdinal}:${u.contentHash}`, status: 'accepted', submittedRevisionOrdinal: u.revisionOrdinal } }) });
  assert.equal((await loop.refresh()).errorCode, 'private_identifier');
  const loopEvent = globalThis.__diagnosticWrites.at(-1).value.shared_web_sync_diagnostics_v1;
  assert.equal(loopEvent.failedStage, 'cloud_watermark'); assert.equal(loopEvent.failedDate, '2026-10-01');
  assert.equal(loopEvent.lastErrorCode, 'unknown');
  assert.equal(Object.keys(loopEvent.cloudAckAtMsByDate).length, 3);
  assert.equal(Object.keys(loopEvent.coverageByDate).length, 6);
  assert.equal(loopStore.shared_web_contribution_queue_v1.days['2026-10-03'].cloudConfirmed, undefined);
  assert(!JSON.stringify(loopEvent).includes('private_identifier'));
  const receiptBlock = read('extension/infra/shared-web-contribution-sync.js').match(/          if \(nativeAccepted\) \{([\s\S]*?)\n          if \(nativeAccepted\) \{/)[0];
  const applyReceipt = new Function('nativeAccepted', 'nativeReceipts', 'd', 'submitted', 'now', 'diagnostic',
    'const fail=errorCode=>({errorCode});let preparation;\n' + receiptBlock.slice(0, receiptBlock.lastIndexOf('          if (nativeAccepted) {')));
  const receipts = new Map([['day', { hash: 'hash', atMs: 5 }]]);
  applyReceipt(true, receipts, 'day', { contentHash: 'hash' }, () => 10, {});
  assert.equal(receipts.get('day').atMs, 5, 'existing confirmed receipt must not be deleted or re-timestamped');
  applyReceipt(false, receipts, 'day', { contentHash: 'hash' }, () => 10, {});
  assert.equal(receipts.has('day'), false);
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
