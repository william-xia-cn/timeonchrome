// Run with: node tests/unit/local-guardian.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const modulePath = path.join(root, 'extension', 'infra', 'native-host-client.js');
const originalSource = fs.readFileSync(modulePath, 'utf8');
const POLICY_KEYS = [
  'enabled', 'deploymentMode', 'cloudEndpoint', 'managedDeviceToken',
  'managedDeviceLabel', 'managedProfileEmail', 'allowIdentityRecovery',
  'tenantId', 'devicePolicyId',
];

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
  };
}

function createPort(onPost) {
  const onMessage = createEvent();
  const onDisconnect = createEvent();
  return {
    onMessage,
    onDisconnect,
    postMessage(payload) { onPost(payload, onMessage, onDisconnect); },
    disconnect() { onDisconnect.listeners.forEach((listener) => listener()); },
  };
}

function moduleSource(instance) {
  return originalSource
    .replace(/from '\.\.\/core\/shared-web-native.js'/, `from '${require('node:url').pathToFileURL(path.join(root, 'extension/core/shared-web-native.js')).href}'`)
    .replace(/import \{ MANAGED_POLICY_KEYS, readManagedActivationPolicy \} from '\.\.\/core\/activation-gate\.js';/, `const MANAGED_POLICY_KEYS = globalThis.__guardianPolicyKeys;\nconst readManagedActivationPolicy = (...args) => globalThis.__guardianReadPolicy(...args);`)
    .replace(/import \{ readNativeHostDeploymentMarker, readNativeHostDevelopmentMarker \} from '\.\.\/core\/deployment-mode\.js';/, 'const readNativeHostDeploymentMarker = (...args) => globalThis.__guardianReadMarker(...args);\nconst readNativeHostDevelopmentMarker = (...args) => globalThis.__guardianReadDevelopmentMarker(...args);')
    .replace(/import \{ budgetedLocalSet \} from '\.\/storage-budget\.js';/, 'const budgetedLocalSet = (...args) => globalThis.__guardianBudgetedSet(...args);')
    .replace(/import \{ registerPersistedUsageSegmentObserver \} from '\.\.\/core\/usage-segments\.js';/, 'const registerPersistedUsageSegmentObserver = (observer) => { globalThis.__persistedSegmentObserver = observer; };')
    .replace(/import \{ readCurrentWeekBrowserSnapshots \} from '\.\/browser-bridge-v3-snapshot\.js';/, 'const readCurrentWeekBrowserSnapshots = (...args) => globalThis.__readBrowserSnapshots(...args);')
    .replace(/import \{ validateSharedQuotaStateV1, validateSharedAccessPolicyIdentityV1 \} from '\.\.\/core\/shared-quota-state\.js';/,
      fs.readFileSync(path.join(root, 'extension', 'core', 'shared-quota-state.js'), 'utf8').replace(/export function /g, 'function '))
    .replace(/import \{ validateSharedReminderResultV1 \} from '\.\.\/core\/shared-reminder-result\.js';/,
      fs.readFileSync(path.join(root, 'extension', 'core', 'shared-reminder-result.js'), 'utf8').replace(/export function /g, 'function '))
    .replace(/import \{ validateSharedReminderMessage, validateSharedReminderState \} from '\.\.\/core\/shared-reminder-lifecycle\.js';/,
      fs.readFileSync(path.join(root, 'extension', 'core', 'shared-reminder-lifecycle.js'), 'utf8').replace(/export function /g, 'function '))
    .replace(/import \{ validateSharedBrowserActivity \} from '\.\.\/core\/shared-browser-activity\.js';/,
      fs.readFileSync(path.join(root, 'extension', 'core', 'shared-browser-activity.js'), 'utf8').replace(/export function /g, 'function '))
    .replace(/import \{ validateSharedBrowserExecution \} from '\.\.\/core\/shared-browser-execution\.js';/,
      fs.readFileSync(path.join(root, 'extension', 'core', 'shared-browser-execution.js'), 'utf8').replace(/export function /g, 'function '))
    .replace(/import \{ browserExecutionFence, browserExecutionIdentityHash \} from '\.\/shared-browser-execution-fence\.js';/,
      fs.readFileSync(path.join(root, 'extension', 'infra', 'shared-browser-execution-fence.js'), 'utf8').replace(/export (function|const) /g, '$1 '))
    .replace(/import \{ sharedBrowserExecutionAttempts \} from '\.\/shared-browser-execution-attempts\.js';/,
      'const retirementEvidence = []; const sharedBrowserExecutionAttempts = {retireAttempt:async proof=>{const evidence=browserExecutionFence.evidence(proof);retirementEvidence.push(evidence);return {ok:!!evidence,retired:true};}};')
    + `\nexport const executionFenceForTest = browserExecutionFence; export const retirementEvidenceForTest = retirementEvidence;\n// test-instance-${instance}`;
}

async function loadGuardian({ storage, incognito = false, connectNative, policy, policyRead = null, development = false, snapshots = [] } = {}) {
  const alarms = { onAlarm: createEvent(), created: [] };
  alarms.get = async () => null;
  alarms.create = async (name, options) => { alarms.created.push({ name, options }); };
  const runtime = {
    id: 'jdcancbiocacabbjdkngadmjpjmkdnih',
    getManifest: () => ({ version: '1.7.25' }),
    getURL: (value) => `chrome-extension://jdcancbiocacabbjdkngadmjpjmkdnih/${value}`,
    connectNative,
    onStartup: createEvent(),
    onInstalled: createEvent(),
    onMessage: createEvent(),
    messages: [],
    async sendMessage(message) { this.messages.push(message); },
  };
  global.chrome = {
    alarms,
    runtime,
    extension: { inIncognitoContext: incognito },
    storage: {
      local: {
        async get(key) {
          if (key == null) return { ...storage };
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(keys.map((name) => [name, storage[name]]));
        },
      },
    },
  };
  global.__guardianPolicyKeys = POLICY_KEYS;
  global.__readBrowserSnapshots = async () => snapshots;
  global.__guardianReadMarker = async () => true;
  global.__guardianReadDevelopmentMarker = async () => development;
  global.__guardianReadPolicy = async () => policyRead || ({ available: true, raw: policy });
  global.__guardianBudgetedSet = async (items) => {
    Object.assign(storage, items);
    return { ok: true };
  };

  const encoded = Buffer.from(moduleSource(Math.random())).toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}`);
  return { module, alarms, runtime };
}

async function waitFor(predicate, timeoutMs = 300) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('condition timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function run() {
  const policy = {
    enabled: true,
    deploymentMode: 'managed',
    cloudEndpoint: 'https://example.test',
    managedDeviceToken: 'secret-token-a',
    managedProfileEmail: 'child@example.test',
  };
  const storage = {};
  const payloads = [];
  const ports = [];
  const { module, alarms, runtime } = await loadGuardian({
    storage,
    policy,
    connectNative(host) {
      assert.strictEqual(host, 'com.timeonchrome.nativehost');
      const port = createPort((payload, onMessage) => {
        payloads.push(payload);
        queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({
          ok: true, receivedAt: 1787160000, supportedProtocols: [1, 2, 3],
          capabilities: ['health', 'authoritative-daily-snapshot'],
          acceptedIds: payload.payload?.segments?.map((segment) => segment.segmentId) || [],
          duplicateIds: [], rejected: [],
        })));
      });
      ports.push(port);
      return port;
    },
  });
  await waitFor(() => payloads.length >= 1);

  assert.strictEqual(alarms.onAlarm.listeners.length, 1);
  assert.strictEqual(runtime.onStartup.listeners.length, 1);
  assert.strictEqual(runtime.onInstalled.listeners.length, 1);
  assert.strictEqual(runtime.onMessage.listeners.length, 1);
  assert.strictEqual(alarms.created.some((entry) => entry.name === 'timeonchromeLocalGuardianHeartbeat' && entry.options.periodInMinutes === 1), true);
  assert.strictEqual(alarms.created.some((entry) => entry.name === 'timeonchromeBrowserBridgeReconcile' && entry.options.periodInMinutes === 60), true);

  const boot = payloads[0];
  assert.deepStrictEqual(Object.keys(boot).sort(), [
    'extensionId', 'messageType', 'payload', 'profileId',
    'protocolVersion', 'requestId', 'sentAtMs',
  ].sort());
  assert.strictEqual(boot.messageType, 'heartbeat');
  assert.strictEqual(boot.payload.monitoringStatus, 'booting');
  assert.strictEqual(boot.extensionId, runtime.id);
  assert.strictEqual(boot.payload.version, '1.7.25');
  assert.strictEqual(boot.payload.policyHash.length, 64);
  assert.strictEqual(JSON.stringify(boot).includes('secret-token-a'), false);
  assert.strictEqual(JSON.stringify(boot).includes('child@example.test'), false);

  module.configureLocalGuardianStateProvider(() => ({
    bootstrapState: 'ready',
    activationState: { activated: true, privacyConsentRequired: false },
    monitoringEnabled: 1,
  }));
  const activeResult = await module.requestLocalGuardianHeartbeat({ trigger: 'unit_active', force: true });
  assert.strictEqual(activeResult.ok, true);
  await waitFor(() => payloads.some((payload) => payload.messageType === 'heartbeat' && payload.payload.monitoringStatus === 'active'));

  const beforeMirror = payloads.length;
  const persistedSegment = {
    id: 'segment-1', startMs: 1000, endMs: 4000, durationSeconds: 3,
    channel: 'active', sourceState: 'ACTIVE', quotaBucketAtTime: 'pending_composite',
    mode: 'composite', domain: 'private.example.test', title: 'private title',
  };
  storage.usage_segments_v1 = { 'segment-1': persistedSegment };
  await global.__persistedSegmentObserver([persistedSegment]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(payloads.slice(beforeMirror).some((payload) => payload.channel === 'ledger'), false);
  assert.strictEqual(JSON.stringify(payloads).includes('private.example.test'), false);
  assert.strictEqual(JSON.stringify(payloads).includes('private title'), false);

  assert.strictEqual(module.resolveLocalGuardianMonitoringStatus({ bootstrapState: 'booting' }), 'booting');
  assert.strictEqual(module.resolveLocalGuardianMonitoringStatus({ bootstrapState: 'failed' }), 'degraded');
  assert.strictEqual(module.resolveLocalGuardianMonitoringStatus({ bootstrapState: 'ready', activationState: { privacyConsentRequired: true } }), 'privacy_consent_required');
  assert.strictEqual(module.resolveLocalGuardianMonitoringStatus({ bootstrapState: 'ready', activationState: { activated: false } }), 'disabled_by_policy');
  assert.strictEqual(module.resolveLocalGuardianMonitoringStatus({ bootstrapState: 'ready', activationState: { activated: true }, monitoringEnabled: 1 }), 'active');

  const hashA = await module.hashManagedPolicy({ ...policy, managedDeviceToken: 'token-a' });
  const hashB = await module.hashManagedPolicy({ ...policy, managedDeviceToken: 'token-b' });
  const hashMissing = await module.hashManagedPolicy({ ...policy, managedDeviceToken: undefined });
  assert.strictEqual(hashA, hashB);
  assert.notStrictEqual(hashA, hashMissing);

  const largeLedger = Object.fromEntries(Array.from({ length: 10_000 }, (_, index) => [
    `large-${index}`,
    { id: `large-${index}`, startMs: index, endMs: index + 1 },
  ]));
  assert.strictEqual(module.selectBrowserBridgeLedgerBatch(Object.keys(largeLedger), largeLedger).length, 100);

  const developmentPayloads = [];
  await loadGuardian({
    storage: {}, policy, development: true,
    policyRead: null,
    connectNative: () => createPort((payload, onMessage) => {
      developmentPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, receivedAt: 1787160004 })));
    }),
  });
  await waitFor(() => developmentPayloads.length >= 1);
  assert.strictEqual(developmentPayloads[0].payload.policyHash, null);

  const oldServicePayloads = [];
  const oldService = await loadGuardian({
    storage: {}, policy,
    connectNative: () => createPort((payload, onMessage) => {
      oldServicePayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({
        ok: true, receivedAt: 1787160005, supportedProtocols: [1, 2], capabilities: ['ledger-item-ack'],
      })));
    }),
  });
  await waitFor(() => oldServicePayloads.length >= 1);
  await oldService.module.mirrorPersistedUsageSegments([{ id: 'old-service-segment', startMs: 1, endMs: 2 }]);
  await oldService.module.requestLocalGuardianHeartbeat({ trigger: 'old_service', force: true });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.strictEqual(oldServicePayloads.some((payload) => payload.channel === 'ledger'
    || payload.messageType === 'settledUsageSegments'), false);

  const recoveryStorage = {
    browser_bridge_v3_state_v1: { acknowledgedRevisions: {}, pendingDates: {}, lastSnapshotAckAtMs: 0 },
    browser_bridge_v2_state_v1: {
      bridgeEpochId: '11111111-1111-4111-8111-111111111111', enabledAtMs: 1,
      pendingIds: ['legacy-id'], dirtyDates: ['2026-09-21'], acknowledgedDateDigests: {},
      permanentRejections: [], acceptedCount: 2, duplicateCount: 0, rejectedCount: 0,
    },
    usage_segments_v1: { 'legacy-id': { id: 'legacy-id', startMs: 1, endMs: 2 } },
  };
  const recoveryPayloads = [];
  let snapshotAttempts = 0;
  const { alarms: recoveryAlarms } = await loadGuardian({
    storage: recoveryStorage, policy,
    snapshots: [{ date: '2026-09-22', snapshotRevision: 'revision-1', statisticsRevision: 'stats-1',
      correctionRevision: 'correction-1', computedAtMs: 1, activeSeconds: 3,
      quotaBucketSeconds: { study: 3 }, complete: true, incompleteReasonCodes: [],
      intervals: [{ startMs: 1, endMs: 3001, creditedSeconds: 3, quotaBucket: 'study' }] }],
    connectNative: () => createPort((payload, onMessage) => {
      recoveryPayloads.push(payload);
      queueMicrotask(() => {
        if (payload.protocolVersion === 1) {
          onMessage.listeners.forEach((listener) => listener({
            ok: true, receivedAt: 1787160200, supportedProtocols: [1, 2, 3], capabilities: ['authoritative-daily-snapshot'],
          }));
          return;
        }
        snapshotAttempts += 1;
        onMessage.listeners.forEach((listener) => listener({
          ok: true, receivedAt: 1787160201, acceptedRevision: payload.payload.snapshotRevision,
        }));
      });
    }),
  });
  await waitFor(() => recoveryPayloads.some((payload) => payload.channel === 'statistics'), 1_000);
  assert.strictEqual(recoveryPayloads.some((payload) => payload.channel === 'ledger'), false);
  assert.deepStrictEqual(recoveryStorage.browser_bridge_v2_state_v1.pendingIds, []);
  assert.ok(recoveryStorage.usage_segments_v1['legacy-id']);
  recoveryAlarms.onAlarm.listeners[0]({ name: 'timeonchromeBrowserBridgeReconcile' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.strictEqual(snapshotAttempts, 1);

  // Installing the Host later replays this week's authoritative snapshots;
  // neither Service errors nor an ACK for another revision may discard them.
  const laterStorage = { usage_segments_v1: { original: { id: 'original' } } };
  const laterSnapshots = ['2026-09-21', '2026-09-22'].map((date) => ({
    date, snapshotRevision: `snapshot-${date}`, statisticsRevision: 'stats',
    correctionRevision: 'correction', computedAtMs: 1, activeSeconds: 3,
    quotaBucketSeconds: { study: 3 }, complete: true, incompleteReasonCodes: [],
    intervals: [{ startMs: 1, endMs: 3001, creditedSeconds: 3, quotaBucket: 'study' }],
  }));
  let hostInstalled = false;
  let serviceAvailable = false;
  let wrongRevision = false;
  let laterConnections = 0;
  const laterPayloads = [];
  const later = await loadGuardian({
    storage: laterStorage, policy, snapshots: laterSnapshots,
    connectNative: () => {
      laterConnections += 1;
      if (!hostInstalled) throw new Error('Host not installed');
      return createPort((payload, onMessage) => {
        laterPayloads.push(payload);
        queueMicrotask(() => onMessage.listeners.forEach((listener) => listener(
          payload.messageType === 'heartbeat' || payload.messageType === 'probe' ? {
            ok: true, receivedAt: 1787160200, supportedProtocols: [1, 3],
            capabilities: ['authoritative-daily-snapshot'],
          } : !serviceAvailable ? {
            ok: false, receivedAt: 1787160201, errorCode: 'RUNTIME_SERVICE_UNAVAILABLE',
          } : {
            ok: true, receivedAt: 1787160202,
            acceptedRevision: wrongRevision ? 'unrelated-revision' : payload.payload.snapshotRevision,
          }
        )));
      });
    },
  });
  await waitFor(() => laterStorage.local_guardian_status_v1?.lastErrorCode === 'native_host_unavailable');
  const missingHostConnections = laterConnections;
  await later.module.mirrorPersistedUsageSegments([{ id: 'new-settlement' }]);
  assert.strictEqual(laterConnections, missingHostConnections, 'settlement must not connect to a missing Host');
  hostInstalled = true;
  await later.module.requestLocalGuardianHeartbeat({ trigger: 'host_installed', force: true });
  await waitFor(() => laterStorage.local_guardian_status_v1?.lastErrorCode === 'runtime_service_unavailable', 1_000);
  assert.strictEqual(Object.keys(laterStorage.browser_bridge_v3_state_v1.pendingDates).length, 2);
  assert.deepStrictEqual(laterStorage.browser_bridge_v3_state_v1.acknowledgedRevisions, {});
  serviceAvailable = true;
  await later.module.requestLocalGuardianHeartbeat({ trigger: 'service_recovered', force: true });
  await waitFor(() => Object.keys(laterStorage.browser_bridge_v3_state_v1.pendingDates).length === 0, 1_000);
  for (const snapshot of laterSnapshots) {
    assert.strictEqual(laterStorage.browser_bridge_v3_state_v1.acknowledgedRevisions[snapshot.date], snapshot.snapshotRevision);
  }
  laterSnapshots[0] = { ...laterSnapshots[0], snapshotRevision: 'corrected-revision' };
  laterStorage.daily_usage_stats_v1 = { fixtureRevision: 2 };
  wrongRevision = true;
  await later.module.requestLocalGuardianHeartbeat({ trigger: 'wrong_ack', force: true });
  await waitFor(() => laterStorage.local_guardian_status_v1?.lastErrorCode === 'native_invalid_response', 1_000);
  assert.strictEqual(laterStorage.browser_bridge_v3_state_v1.pendingDates['2026-09-21'], 'corrected-revision');
  wrongRevision = false;
  await later.module.requestLocalGuardianHeartbeat({ trigger: 'ack_recovered', force: true });
  await waitFor(() => laterStorage.browser_bridge_v3_state_v1.acknowledgedRevisions['2026-09-21'] === 'corrected-revision', 1_000);
  assert.deepStrictEqual(laterStorage.usage_segments_v1, { original: { id: 'original' } });
  assert.strictEqual(laterPayloads.some((payload) => payload.channel === 'ledger'), false);

  let rejectedResponse = null;
  const probeListener = runtime.onMessage.listeners[0];
  const rejectedReturn = probeListener(
    { type: 'TIMEONCHROME_LOCAL_HEALTH_PROBE' },
    { id: runtime.id, url: 'chrome-extension://jdcancbiocacabbjdkngadmjpjmkdnih/popup/popup.html' },
    (response) => { rejectedResponse = response; }
  );
  assert.strictEqual(rejectedReturn, false);
  assert.strictEqual(rejectedResponse.errorCode, 'probe_sender_rejected');

  let acceptedResponse = null;
  const acceptedReturn = probeListener(
    { type: 'TIMEONCHROME_LOCAL_HEALTH_PROBE' },
    { id: runtime.id, url: runtime.getURL('health-probe.html') },
    (response) => { acceptedResponse = response; }
  );
  assert.strictEqual(acceptedReturn, true);
  await waitFor(() => acceptedResponse !== null);
  assert.strictEqual(acceptedResponse.ok, true);
  assert.strictEqual(payloads.at(-1).messageType, 'probe');

  const firstUuid = boot.profileId;
  ports.forEach((port) => port.disconnect());
  const secondPayloads = [];
  const second = await loadGuardian({
    storage,
    incognito: true,
    policy,
    connectNative: () => createPort((payload, onMessage) => {
      secondPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, receivedAt: 1787160001 })));
    }),
  });
  await waitFor(() => secondPayloads.length >= 1);
  assert.strictEqual(secondPayloads[0].profileId, firstUuid);
  assert.strictEqual(secondPayloads[0].payload.incognito, true);

  const otherStorage = {};
  const otherPayloads = [];
  await loadGuardian({
    storage: otherStorage,
    policy,
    connectNative: () => createPort((payload, onMessage) => {
      otherPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, receivedAt: 1787160002 })));
    }),
  });
  await waitFor(() => otherPayloads.length >= 1);
  assert.notStrictEqual(otherPayloads[0].profileId, firstUuid);

  const unavailableStorage = {};
  const unavailable = await loadGuardian({
    storage: unavailableStorage,
    policy,
    connectNative: () => { throw new Error('raw native host error with secret-token-a'); },
  });
  await waitFor(() => unavailableStorage.local_guardian_status_v1?.lastErrorCode === 'native_host_unavailable');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const unavailableResult = await unavailable.module.requestLocalGuardianHeartbeat({ trigger: 'unit_missing_host', force: true });
  assert.strictEqual(unavailableResult.ok, false);
  assert.strictEqual(unavailableResult.errorCode, 'native_host_unavailable');
  const savedStatus = unavailableStorage.local_guardian_status_v1;
  assert.deepStrictEqual(Object.keys(savedStatus).sort(), [
    'consecutiveFailures', 'lastAckReceivedAt', 'lastAttemptAt', 'lastErrorCode',
    'lastSuccessAt', 'lastTrigger', 'nextRetryAt', 'portConnected',
  ].sort());
  assert.strictEqual(JSON.stringify(savedStatus).includes('secret-token-a'), false);
  assert(savedStatus.nextRetryAt > savedStatus.lastAttemptAt);
  const backoffResult = await unavailable.module.requestLocalGuardianHeartbeat({ trigger: 'unit_missing_host_backoff' });
  assert.strictEqual(backoffResult.skipped, true);
  assert.strictEqual(backoffResult.errorCode, 'native_host_unavailable');
  const manualRetry = await unavailable.module.requestLocalGuardianHeartbeat({ type: 'probe', trigger: 'unit_manual_retry' });
  assert.strictEqual(manualRetry.errorCode, 'native_host_unavailable');

  const invalidStorage = {};
  await loadGuardian({
    storage: invalidStorage,
    policy,
    connectNative: () => createPort((_payload, onMessage) => {
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, receivedAt: 'not-a-number' })));
    }),
  });
  await waitFor(() => invalidStorage.local_guardian_status_v1?.lastErrorCode === 'native_invalid_response');
  assert.strictEqual(invalidStorage.local_guardian_status_v1.portConnected, false);

  const disconnectedStorage = {};
  await loadGuardian({
    storage: disconnectedStorage,
    policy,
    connectNative: () => createPort((_payload, _onMessage, onDisconnect) => {
      queueMicrotask(() => onDisconnect.listeners.forEach((listener) => listener()));
    }),
  });
  await waitFor(() => disconnectedStorage.local_guardian_status_v1?.lastErrorCode === 'native_port_disconnected');
  assert.strictEqual(disconnectedStorage.local_guardian_status_v1.consecutiveFailures >= 1, true);

  const stoppedServiceStorage = {};
  await loadGuardian({
    storage: stoppedServiceStorage,
    policy,
    connectNative: () => createPort((_payload, onMessage) => {
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({
        ok: false, receivedAt: 1787160004, errorCode: 'RUNTIME_SERVICE_UNAVAILABLE',
      })));
    }),
  });
  await waitFor(() => stoppedServiceStorage.local_guardian_status_v1?.lastErrorCode === 'runtime_service_unavailable');
  assert(stoppedServiceStorage.local_guardian_status_v1.nextRetryAt > stoppedServiceStorage.local_guardian_status_v1.lastAttemptAt);

  const degradedStorage = {};
  const degradedPayloads = [];
  const degraded = await loadGuardian({
    storage: degradedStorage,
    policy,
    policyRead: { available: false, raw: {} },
    connectNative: () => createPort((payload, onMessage) => {
      degradedPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, receivedAt: 1787160003 })));
    }),
  });
  degraded.module.configureLocalGuardianStateProvider(() => ({
    bootstrapState: 'ready',
    activationState: { activated: true },
    monitoringEnabled: 1,
  }));
  await degraded.module.requestLocalGuardianHeartbeat({ trigger: 'unit_policy_read_failed', force: true });
  await waitFor(() => degradedPayloads.some((payload) => payload.payload?.monitoringStatus === 'degraded'));
  const degradedPayload = degradedPayloads.find((payload) => payload.payload?.monitoringStatus === 'degraded');
  assert.strictEqual(degradedPayload.payload.policyHash.length, 64);

  const deduped = await module.requestLocalGuardianHeartbeat({ trigger: 'unit_dedup' });
  const dedupedAgain = await module.requestLocalGuardianHeartbeat({ trigger: 'unit_dedup_repeat' });
  assert.strictEqual(deduped.ok, true);
  assert.strictEqual(dedupedAgain.skipped, true);
  assert.strictEqual(dedupedAgain.reason, 'deduplicated');

  const queuedStorage = {};
  const queuedPayloads = [];
  const acknowledgements = [];
  const queuedGuardian = await loadGuardian({
    storage: queuedStorage,
    policy,
    connectNative: () => createPort((payload, onMessage) => {
      queuedPayloads.push(payload);
      acknowledgements.push(() => onMessage.listeners.forEach((listener) => listener({
        ok: true,
        receivedAt: 1787160100 + queuedPayloads.length,
      })));
    }),
  });
  await waitFor(() => queuedPayloads.length === 1);
  const queuedHeartbeatResult = await queuedGuardian.module.requestLocalGuardianHeartbeat({ trigger: 'unit_queued_heartbeat', force: true });
  const queuedProbePromise = queuedGuardian.module.requestLocalGuardianHeartbeat({ type: 'probe', trigger: 'unit_queued_probe', force: true });
  const coalescedHeartbeatResult = await queuedGuardian.module.requestLocalGuardianHeartbeat({ trigger: 'unit_coalesced_heartbeat', force: true });
  assert.strictEqual(queuedHeartbeatResult.queued, true);
  assert.strictEqual(coalescedHeartbeatResult.queued, true);
  assert.strictEqual(queuedPayloads.length, 1);
  acknowledgements[0]();
  await waitFor(() => queuedPayloads.length === 2);
  assert.strictEqual(queuedPayloads[1].messageType, 'probe');
  acknowledgements[1]();
  assert.strictEqual((await queuedProbePromise).ok, true);
  await waitFor(() => queuedPayloads.length === 3);
  assert.strictEqual(queuedPayloads[2].messageType, 'heartbeat');
  assert.strictEqual(queuedPayloads[2].payload.monitoringStatus, 'booting');
  acknowledgements[2]();

  const timeoutStorage = {};
  await loadGuardian({
    storage: timeoutStorage,
    policy,
    connectNative: () => createPort(() => {}),
  });
  await waitFor(() => timeoutStorage.local_guardian_status_v1?.lastErrorCode === 'native_response_timeout', 3_500);
  assert.strictEqual(timeoutStorage.local_guardian_status_v1.portConnected, false);

  const source = originalSource;
  const appPayloads = [];
  const appRead = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      appPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
        requestId: payload.requestId, supportedProtocols: [1, 2, 3],
        capabilities: ['health', 'authoritative-daily-snapshot', 'application-usage-read'],
        ...(payload.messageType === 'getApplicationUsage' ? { applicationUsage: { revision: 'fixture' } } : {}) })));
    }) });
  await waitFor(() => appPayloads.length > 0);
  const query = { fromDate: '2026-09-21', toDate: '2026-09-27', offset: 0 };
  const firstApplicationResult = await appRead.module.requestApplicationUsage(query);
  assert.strictEqual(firstApplicationResult.ok, true, JSON.stringify(firstApplicationResult));
  assert.strictEqual(firstApplicationResult.applicationUsage.revision, 'fixture');
  assert.strictEqual(appPayloads.at(-1).channel, 'application');
  assert.strictEqual(appPayloads.at(-1).messageType, 'getApplicationUsage');
  assert.deepStrictEqual(appRead.runtime.messages, [{ type: 'TIMEONCHROME_APPLICATION_USAGE_AVAILABLE' }]);
  assert.deepStrictEqual(appPayloads.at(-1).payload, query);
  assert.strictEqual((await appRead.module.requestApplicationUsage({ ...query, localUserId: 'other' })).ok, false);

  const sharedState = {
    schemaVersion: 1, policyRevision: 'profile-config:12', revision: 'shared:1',
    computedAtMs: Date.now(), settledAtMs: Date.now(), complete: true, reasonCodes: [], sources: [],
    day: { date: '2026-10-02', usedMs: { study: 0, composite: 0, rest: 60000 },
      remainingMs: { study: null, composite: null, rest: 3600000 }, borrowedRestMs: 0 },
    week: { fromDate: '2026-09-28', toDate: '2026-10-02', complete: true, reasonCodes: [],
      restUsedMs: 60000, restRemainingMs: null }, offline: false,
  };
  const sharedPayloads = [];
  let identityCapabilities = ['health', 'shared-quota-state-read'], sharedIdentity, nativePreparation;
  let sharedPolicyTestPort;
  const sharedRead = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => (sharedPolicyTestPort = createPort((payload, onMessage) => {
      sharedPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener({ ok: true,
        receivedAt: Date.now(), requestId: payload.requestId, supportedProtocols: [1, 2, 3],
        capabilities: identityCapabilities,
        ...(payload.messageType === 'getSharedQuotaState' ? { sharedQuota: sharedState, sharedAccessPolicyIdentity: sharedIdentity, sharedQuotaPreparation: nativePreparation } : {}) })));
    })) });
  const expectedShared = { date: '2026-10-02', weekStart: '2026-09-28', policyRevision: 'profile-config:12' };
  assert.strictEqual(sharedRead.module.hasSharedAccessPolicyCapability(), false);
  const policyAvailability = [];
  const stopPolicyObservation = sharedRead.module.observeSharedAccessPolicyCapability(value => policyAvailability.push(value));
  assert.deepStrictEqual(policyAvailability, [false]);
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).errorCode, 'shared_quota_disabled');
  sharedRead.module.configureSharedQuotaNativeBridge({ enabled: true });
  const sharedResult = await sharedRead.module.requestSharedQuotaState(expectedShared);
  assert.strictEqual(sharedResult.ok, true, JSON.stringify(sharedResult));
  assert.strictEqual(sharedResult.policyIdentityStatus, 'unverified');
  sharedIdentity = { schemaVersion: 1, revision: expectedShared.policyRevision, effectiveAtMs: 1234, stage: 'shadow', policyHash: 'a'.repeat(64) };
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).policyIdentityStatus, 'unverified', 'unnegotiated identity is not trusted');
  identityCapabilities = [...identityCapabilities, 'shared-access-policy-identity-read'];
  await sharedRead.module.requestLocalGuardianHeartbeat({ trigger: 'identity_capability_fixture', force: true });
  const identityResult = await sharedRead.module.requestSharedQuotaState(expectedShared);
  assert.strictEqual(identityResult.policyIdentityStatus, 'available');
  assert.deepStrictEqual(identityResult.sharedAccessPolicyIdentity, sharedIdentity);
  nativePreparation = { schemaVersion: 1, basisRevision: null, policyIdentity: sharedIdentity, projection: null,
    transportStatus: 'unavailable', replacementVersions: [], reasonCodes: ['BASIS_UNAVAILABLE'], executionEnabled: false };
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).sharedQuotaPreparation, undefined, 'unnegotiated preparation is ignored');
  identityCapabilities.push('shared-quota-execution-preparation-read-v1');
  await sharedRead.module.requestLocalGuardianHeartbeat({ force: true });
  assert.deepStrictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).sharedQuotaPreparation, nativePreparation);
  nativePreparation.executionEnabled = true;
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).preparationStatus, 'invalid');
  nativePreparation = undefined;
  sharedIdentity.policyHash = 'invalid';
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).errorCode, 'shared_policy_identity_invalid');
  sharedIdentity = undefined;
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).policyIdentityStatus, 'unverified', 'negotiated old/missing field is still unverified');
  assert.strictEqual(sharedRead.module.hasSharedAccessPolicyCapability(), true);
  assert.strictEqual(policyAvailability.at(-1), true);
  // A failed observer cannot break the existing health/shared read path.
  sharedRead.module.observeSharedAccessPolicyCapability(() => { throw Error('observer fixture'); });
  assert.strictEqual(sharedPayloads.at(-1).channel, 'sharedQuota');
  assert.strictEqual(sharedPayloads.at(-1).messageType, 'getSharedQuotaState');
  assert.deepStrictEqual(sharedPayloads.at(-1).payload, { date: expectedShared.date });
  sharedState.complete = false;
  sharedState.reasonCodes = ['APPLICATION_SOURCE_INCOMPLETE'];
  const partialShared = await sharedRead.module.requestSharedQuotaState(expectedShared);
  assert.strictEqual(partialShared.ok, true);
  assert.strictEqual(partialShared.state.complete, false);
  assert.deepStrictEqual(partialShared.state.reasonCodes, ['APPLICATION_SOURCE_INCOMPLETE']);
  sharedState.complete = true;
  sharedState.reasonCodes = [];
  sharedState.week.toDate = '2026-10-04';
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).errorCode, 'shared_quota_stale_state');
  sharedState.week.toDate = '2026-10-02';
  sharedState.week.complete = false;
  sharedState.week.reasonCodes = ['WEB_COVERAGE_MISSING'];
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState(expectedShared)).errorCode, 'shared_quota_invalid_state');
  sharedState.complete = false;
  sharedState.reasonCodes = ['WEEK_PENDING'];
  const partialWeek = await sharedRead.module.requestSharedQuotaState(expectedShared);
  assert.strictEqual(partialWeek.ok, true);
  assert.strictEqual(partialWeek.state.week.complete, false);
  assert.deepStrictEqual(partialWeek.state.week.reasonCodes, ['WEB_COVERAGE_MISSING']);
  sharedState.complete = true; sharedState.reasonCodes = [];
  sharedState.week.complete = true; sharedState.week.reasonCodes = [];
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState({ ...expectedShared, date: '2026-10-03' })).errorCode,
    'shared_quota_stale_state');
  assert.strictEqual((await sharedRead.module.requestSharedQuotaState({})).errorCode, 'shared_quota_query_invalid');
  sharedPolicyTestPort.disconnect();
  assert.strictEqual(sharedRead.module.hasSharedAccessPolicyCapability(), false);
  assert.strictEqual(policyAvailability.at(-1), false);
  stopPolicyObservation();
  const oldSharedHost = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => queueMicrotask(() =>
      onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(), requestId: payload.requestId })))) });
  oldSharedHost.module.configureSharedQuotaNativeBridge({ enabled: true });
  assert.strictEqual((await oldSharedHost.module.requestSharedQuotaState(expectedShared)).errorCode,
    'shared_quota_unsupported');
  assert.strictEqual(oldSharedHost.module.hasSharedAccessPolicyCapability(), false);
  const reportPayloads = [], reportPorts = [];
  let reportError = null, omitReportRequestId = false, holdSharedRead = false, releaseSharedRead;
  let holdReport = false, releaseReport;
  let sharedCapabilities = ['health', 'shared-quota-state-read', 'shared-reminder-result-shadow'];
  const reportHost = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => {
      const port = createPort((payload, onMessage) => {
        reportPayloads.push(payload);
        const reply = () => onMessage.listeners.forEach(listener => listener({
          ok: !(payload.messageType === 'reportReminderResult' && reportError), receivedAt: Date.now(),
          ...(!(payload.messageType === 'reportReminderResult' && omitReportRequestId) ? { requestId: payload.requestId } : {}),
          supportedProtocols: [1, 2, 3], capabilities: sharedCapabilities,
          ...(payload.messageType === 'getSharedQuotaState' ? { sharedQuota: sharedState } : {}),
          ...(payload.messageType === 'reportReminderResult' ? { errorCode: reportError, duplicate: true } : {}),
        }));
        if (payload.messageType === 'getSharedQuotaState' && holdSharedRead) releaseSharedRead = reply;
        else if (payload.messageType === 'reportReminderResult' && holdReport) releaseReport = reply;
        else queueMicrotask(reply);
      });
      reportPorts.push(port);
      return port;
    } });
  const reminderResult = { schemaVersion: 1, reminderId: 'native-issued-test', policyRevision: 'profile-config:12',
    stateRevision: 'shared:1', kind: 'daily', delivery: 'visible', visibleAtMs: 1000,
    action: 'end_rest', resolvedAtMs: 2000 };
  assert.strictEqual((await reportHost.module.reportSharedReminderResult(reminderResult)).errorCode, 'shared_reminder_disabled');
  reportHost.module.configureSharedQuotaNativeBridge({ enabled: true });
  assert.strictEqual((await reportHost.module.reportSharedReminderResult({ ...reminderResult, force: true })).errorCode,
    'shared_reminder_result_invalid');
  holdSharedRead = true;
  const readingShared = reportHost.module.requestSharedQuotaState(expectedShared);
  await waitFor(() => releaseSharedRead);
  const sendingResult = reportHost.module.reportSharedReminderResult(reminderResult);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.strictEqual(reportPayloads.some(payload => payload.messageType === 'reportReminderResult'), false);
  releaseSharedRead();
  assert.strictEqual((await readingShared).ok, true);
  assert.strictEqual((await sendingResult).duplicate, true);
  assert.deepStrictEqual(reportPayloads.at(-1).payload, reminderResult);
  assert.strictEqual(reportPayloads.at(-1).channel, 'sharedQuota');
  reportError = 'SHARED_REMINDER_NOT_ISSUED';
  assert.strictEqual((await reportHost.module.reportSharedReminderResult(reminderResult)).errorCode, 'shared_reminder_not_issued');
  reportError = null;
  omitReportRequestId = true;
  assert.strictEqual((await reportHost.module.reportSharedReminderResult(reminderResult)).errorCode, 'shared_reminder_invalid_ack');
  omitReportRequestId = false;
  holdReport = true;
  const disconnectedReport = reportHost.module.reportSharedReminderResult(reminderResult);
  await waitFor(() => releaseReport);
  reportPorts[0].disconnect();
  assert.strictEqual((await disconnectedReport).errorCode, 'native_port_disconnected');
  holdReport = false;
  releaseReport();
  await reportHost.module.requestLocalGuardianHeartbeat({ force: true });
  assert.strictEqual((await reportHost.module.reportSharedReminderResult(reminderResult)).ok, true);
  sharedCapabilities = ['health'];
  await reportHost.module.requestLocalGuardianHeartbeat({ force: true });
  const beforeUnsupported = reportPayloads.length;
  assert.strictEqual((await reportHost.module.reportSharedReminderResult(reminderResult)).errorCode, 'shared_reminder_unsupported');
  assert.strictEqual((await reportHost.module.requestSharedQuotaState(expectedShared)).errorCode, 'shared_quota_unsupported');
  assert.strictEqual(reportPayloads.length, beforeUnsupported);
  reportPorts.at(-1).disconnect();
  assert.strictEqual((await reportHost.module.reportSharedReminderResult(reminderResult)).ok, false);
  assert.strictEqual(reportPayloads.filter(payload => payload.messageType === 'reportReminderResult').length, 5);
  let denied;
  appRead.runtime.onMessage.listeners[0]({ type: appRead.module.APPLICATION_USAGE_READ_MESSAGE, query },
    { id: appRead.runtime.id, url: 'https://example.test/' }, value => { denied = value; });
  assert.strictEqual(denied.errorCode, 'probe_sender_rejected');
  const appOldService = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => queueMicrotask(() =>
      onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
        supportedProtocols: [1, 2, 3], capabilities: ['health', 'authoritative-daily-snapshot'] })))) });
  assert.strictEqual((await appOldService.module.requestApplicationUsage(query)).errorCode, 'application_usage_unsupported');
  const serializedRequests = [], appResolvers = [];
  const serialized = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      serializedRequests.push(payload);
      const reply = requestId => onMessage.listeners.forEach(listener => listener({ ok: true,
        receivedAt: Date.now(), requestId: requestId || payload.requestId,
        supportedProtocols: [1, 2, 3], capabilities: ['health', 'application-usage-read'],
        ...(payload.messageType === 'getApplicationUsage' ? { applicationUsage: { revision: payload.requestId } } : {}) }));
      if (payload.messageType === 'getApplicationUsage') appResolvers.push(reply);
      else queueMicrotask(() => reply());
    }) });
  await waitFor(() => serializedRequests.length > 0);
  const firstApp = serialized.module.requestApplicationUsage(query);
  await waitFor(() => appResolvers.length === 1);
  const firstAppId = serializedRequests.at(-1).requestId;
  const probeDuringApp = serialized.module.requestLocalGuardianHeartbeat({ type: 'probe', force: true });
  const secondApp = serialized.module.requestApplicationUsage(query);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.strictEqual((await serialized.module.requestApplicationUsage(query)).errorCode, 'application_usage_busy');
  appResolvers[0]();
  assert.strictEqual((await firstApp).applicationUsage.revision, firstAppId);
  assert.strictEqual((await probeDuringApp).ok, true);
  await waitFor(() => appResolvers.length === 2);
  assert.deepStrictEqual(serializedRequests.slice(-3).map(r => r.messageType), ['getApplicationUsage', 'probe', 'getApplicationUsage']);
  let secondFinished = false;
  secondApp.then(() => { secondFinished = true; });
  appResolvers[1](firstAppId); // Late duplicate ACK must not consume the new application's slot.
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.strictEqual(secondFinished, false);
  appResolvers[1]();
  assert.strictEqual((await secondApp).ok, true);
  const requestCount = serializedRequests.length;
  assert.strictEqual((await serialized.module.requestApplicationUsage({ ...query, sid: 'other' }, { recheck: true })).ok, false);
  assert.strictEqual(serializedRequests.length, requestCount);
  global.__guardianReadMarker = async () => false;
  assert.strictEqual((await serialized.module.requestApplicationUsage(query)).errorCode, 'managed_marker_unavailable');
  assert.strictEqual(serializedRequests.length, requestCount); // Ordinary/CWS mode never connects for this view.
  global.__guardianReadMarker = async () => true;
  const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
  // Exercise the actual background listener alongside the bridge listener.
  // Chrome uses the first response, so a generic unknown-message response must
  // never consume a request owned by the Native Host client.
  const listenerStart = background.indexOf('chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {');
  const listenerEnd = background.indexOf('\n});', listenerStart) + '\n});'.length;
  assert(listenerStart >= 0 && listenerEnd > listenerStart);
  let genericListener;
  const routed = [];
  new Function('chrome', 'runtimeActivationState', 'ensureBootstrapped', 'handleMessage',
    background.slice(listenerStart, listenerEnd))({ runtime: { id: runtime.id,
      getURL: runtime.getURL, onMessage: { addListener(fn) { genericListener = fn; } } } },
    { activated: true }, async () => {}, async msg => {
      routed.push(msg.type); return { error: 'Unknown message type' };
    });
  for (const type of ['TIMEONCHROME_APPLICATION_USAGE_READ', 'TIMEONCHROME_LOCAL_HEALTH_RECHECK',
    'TIMEONCHROME_APPLICATION_USAGE_AVAILABLE', 'TIMEONCHROME_LOCAL_HEALTH_PROBE']) {
    const replies = [];
    assert.strictEqual(genericListener({ type }, { id: runtime.id }, reply => replies.push(reply)), false);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepStrictEqual(replies, []);
  }
  assert.deepStrictEqual(routed, []);
  const bridgeReply = await new Promise(resolve => {
    const message = { type: appRead.module.APPLICATION_USAGE_READ_MESSAGE, query };
    const sender = { id: runtime.id, url: runtime.getURL('admin/admin.html') };
    genericListener(message, sender, resolve);
    appRead.runtime.onMessage.listeners[0](message, sender, resolve);
  });
  assert.strictEqual(bridgeReply.ok, true);
  assert(bridgeReply.applicationUsage);

  // Reproduce the real 2.6.7 week read (>3s): a health timeout must not cancel it.
  let delayedApplicationReply;
  const slowStorage = {};
  const slow = await loadGuardian({ storage: slowStorage, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      const reply = () => onMessage.listeners.forEach(listener => listener({ ok: true,
        receivedAt: Date.now(), requestId: payload.requestId, supportedProtocols: [1, 2, 3],
        capabilities: ['health', 'application-usage-read'],
        ...(payload.messageType === 'getApplicationUsage' ? { applicationUsage: { revision: 'slow-week' } } : {}) }));
      if (payload.messageType === 'getApplicationUsage') delayedApplicationReply = reply;
      else queueMicrotask(reply);
    }) });
  const slowResult = slow.module.requestApplicationUsage(query);
  await waitFor(() => delayedApplicationReply);
  await new Promise(resolve => setTimeout(resolve, 4_400));
  assert.notStrictEqual(slowStorage.local_guardian_status_v1?.lastErrorCode, 'native_response_timeout');
  delayedApplicationReply();
  assert.strictEqual((await slowResult).applicationUsage.revision, 'slow-week');

  // Exercise the real timeout callback with a controlled timer; never wait forever.
  const realSetTimeout = global.setTimeout;
  let applicationDeadline;
  global.setTimeout = (callback, delay, ...args) => {
    if (delay === 15_000) applicationDeadline = callback;
    return realSetTimeout(callback, delay, ...args);
  };
  try {
    const expired = slow.module.requestApplicationUsage(query);
    await waitFor(() => applicationDeadline);
    const lateReply = delayedApplicationReply;
    applicationDeadline();
    assert.strictEqual((await expired).errorCode, 'native_response_timeout');
    assert.strictEqual(slowStorage.local_guardian_status_v1.portConnected, false);
    lateReply();
    assert.strictEqual(slowStorage.local_guardian_status_v1.lastErrorCode, 'native_response_timeout');
  } finally {
    global.setTimeout = realSetTimeout;
  }
  assert.match(source, /NATIVE_RESPONSE_TIMEOUT_MS = 3_000/);
  assert.match(source, /APPLICATION_USAGE_RESPONSE_TIMEOUT_MS = 15_000/);
  assert.match(source, /PROBE_COOLDOWN_MS = 5_000/);
  assert.match(background, /configureLocalGuardianStateProvider/);
  assert.match(background, /TIMEONCHROME_LOCAL_HEALTH_PROBE/);

  const lifecycleState = { schemaVersion: 1, roundId: 'round-1', reminderId: 'reminder-1', deliveryId: 'delivery-1',
    policyRevision: 'policy-1', stateRevision: 'state-1', date: '2026-10-02', kinds: ['daily', 'weekly'],
    presenter: 'browser', stage: 'shadow', issuedAtMs: 1000, offerExpiresAtMs: 300000,
    visibleAtMs: null, responseDeadlineSeconds: 60, timeoutAction: 'end', status: 'offered', resolution: null };
  const lifecycleRequests = [];
  let lifecycleError = null;
  let lifecycleSupported = true;
  let missingLifecycleId = false;
  let holdLifecycle = false;
  let releaseLifecycle;
  let lifecycleExecution = null;
  let wrongExecutionReceipt = false;
  let duplicateExecutionReceipt = false;
  const lifecycle = await loadGuardian({ storage: {}, policy,
    connectNative: () => createPort((payload, onMessage) => {
      lifecycleRequests.push(payload);
      const isLifecycle = ['getSharedReminderState', 'acknowledgeSharedReminderDelivery', 'resolveSharedReminder', 'acknowledgeBrowserExecution'].includes(payload.messageType);
      const reply = () => onMessage.listeners.forEach(listener => listener({
        ok: !(isLifecycle && lifecycleError), errorCode: lifecycleError,
        receivedAt: Date.now(), requestId: isLifecycle && missingLifecycleId ? undefined : payload.requestId,
        supportedProtocols: [1, 2, 3], capabilities: lifecycleSupported ? ['shared-reminder-lifecycle-v1', 'shared-browser-activity-v1'] : [],
        browserActivityLeaseId: 'fixture-lease',
        ...(isLifecycle ? { sharedReminder: { ...lifecycleState,
          ...(payload.messageType === 'acknowledgeSharedReminderDelivery' ? { status: 'visible', visibleAtMs: 2500 } : {}),
          ...(payload.messageType === 'resolveSharedReminder' ? { status: 'resolved', visibleAtMs: 2500, resolution: payload.payload.action } : {}),
          ...(lifecycleExecution ? { stage: 'shared', status: 'resolved', visibleAtMs: 2500, resolution: 'end_rest' } : {}) },
          browserExecution: lifecycleExecution,
          ...(payload.messageType === 'acknowledgeBrowserExecution' ? { browserExecutionAck: {
            executionId: wrongExecutionReceipt ? 'old-execution' : payload.payload.executionId, duplicate: duplicateExecutionReceipt } } : {}) } : {}) }));
      if (isLifecycle && holdLifecycle) releaseLifecycle = reply;
      else queueMicrotask(reply);
    }) });
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('getSharedReminderState', { date: lifecycleState.date })).errorCode, 'shared_reminder_disabled');
  lifecycle.module.configureSharedQuotaNativeBridge({ enabled: true });
  holdLifecycle = true;
  const lifecycleRead = lifecycle.module.requestSharedReminderLifecycle('getSharedReminderState', { date: lifecycleState.date });
  await waitFor(() => releaseLifecycle);
  const { date, kinds, presenter, stage, issuedAtMs, offerExpiresAtMs, visibleAtMs, responseDeadlineSeconds, timeoutAction, status, resolution, ...lifeIdentity } = lifecycleState;
  const lifeAck = lifecycle.module.requestSharedReminderLifecycle('acknowledgeSharedReminderDelivery', { ...lifeIdentity, delivery: 'visible' });
  const heldCount = lifecycleRequests.length;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(lifecycleRequests.length, heldCount);
  holdLifecycle = false;
  releaseLifecycle();
  assert.strictEqual((await lifecycleRead).state.status, 'offered');
  assert.strictEqual((await lifeAck).state.visibleAtMs, 2500);
  assert.deepStrictEqual(lifecycleRequests.at(-1).payload, { ...lifeIdentity, delivery: 'visible' });
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('resolveSharedReminder', { ...lifeIdentity, action: 'end_rest' })).state.resolution, 'end_rest');
  const lifeCount = lifecycleRequests.length;
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('resolveSharedReminder', { ...lifeIdentity, action: 'timeout_end' })).ok, false);
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('acknowledgeSharedReminderDelivery', { ...lifeIdentity, delivery: 'visible', visibleAtMs: 1 })).ok, false);
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('getSharedReminderState', { date: '2026-02-30' })).ok, false);
  assert.strictEqual(lifecycleRequests.length, lifeCount);
  lifecycleError = 'SHARED_REMINDER_DEADLINE_ELAPSED';
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('resolveSharedReminder', { ...lifeIdentity, action: 'continue' })).errorCode, lifecycleError);
  lifecycleError = null;
  missingLifecycleId = true;
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('getSharedReminderState', { date })).errorCode, 'shared_reminder_invalid_ack');
  missingLifecycleId = false;
  lifecycleSupported = false;
  await lifecycle.module.requestLocalGuardianHeartbeat({ trigger: 'test_lifecycle_revoked', force: true });
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('getSharedReminderState', { date })).errorCode, 'shared_reminder_unsupported');
  lifecycleSupported = true;
  await lifecycle.module.requestLocalGuardianHeartbeat({ trigger: 'test_execution_available', force: true });
  lifecycleExecution = { ...lifeIdentity, executionId: 'execution-1', leaseId: 'fixture-lease', activityId: 'fixture-activity',
    targetSource: 'browser', effect: 'request-normal-close', maxAgeMs: 5000 };
  const executionRequestStarted = Math.floor(performance.now());
  const executionRead = await lifecycle.module.requestSharedReminderLifecycle('getSharedReminderState', { date });
  assert.strictEqual(executionRead.browserExecution.executionId, 'execution-1');
  assert(executionRead.requestStartedMonotonicMs >= executionRequestStarted
    && executionRead.requestStartedMonotonicMs <= Math.floor(performance.now()));
  const executionAck = { ...lifeIdentity, executionId: 'execution-1', leaseId: 'fixture-lease', activityId: 'fixture-activity', outcome: 'stale' };
  const beforeExecutionAck = lifecycle.module.executionFenceForTest.capture();
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('acknowledgeBrowserExecution', executionAck)).receipt.executionId, 'execution-1');
  assert.strictEqual(lifecycle.module.executionFenceForTest.current(beforeExecutionAck), false, 'durable ACK fences older requests');
  assert.strictEqual(lifecycle.module.retirementEvidenceForTest.at(-1).outcome, 'stale');
  assert.strictEqual(lifecycle.module.retirementEvidenceForTest.at(-1).executionId, 'execution-1');
  assert.match(lifecycle.module.retirementEvidenceForTest.at(-1).identityHash, /^[a-f0-9]{64}$/);
  assert.deepStrictEqual(lifecycleRequests.at(-1).payload, executionAck);
  wrongExecutionReceipt = true;
  const beforeInvalidAck = lifecycle.module.executionFenceForTest.capture();
  const retirementCount = lifecycle.module.retirementEvidenceForTest.length;
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('acknowledgeBrowserExecution', executionAck)).ok, false);
  assert.strictEqual(lifecycle.module.executionFenceForTest.current(beforeInvalidAck), true, 'invalid ACK does not authorize retirement');
  assert.strictEqual(lifecycle.module.retirementEvidenceForTest.length, retirementCount);
  wrongExecutionReceipt = false;
  duplicateExecutionReceipt = true;
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('acknowledgeBrowserExecution', executionAck)).receipt.duplicate, true);
  duplicateExecutionReceipt = false;
  lifecycleError = 'SHARED_BROWSER_EXECUTION_ACK_CONFLICT';
  const beforeConflict = lifecycle.module.executionFenceForTest.capture();
  const beforeConflictCount = lifecycle.module.retirementEvidenceForTest.length;
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('acknowledgeBrowserExecution', { ...executionAck, outcome: 'failed' })).ok, false);
  assert.strictEqual(lifecycle.module.executionFenceForTest.current(beforeConflict), true);
  assert.strictEqual(lifecycle.module.retirementEvidenceForTest.length, beforeConflictCount);
  lifecycleError = null;
  const executionCount = lifecycleRequests.length;
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('acknowledgeBrowserExecution', { ...executionAck, url: 'private' })).ok, false);
  assert.strictEqual(lifecycleRequests.length, executionCount);
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('acknowledgeBrowserExecution', { ...executionAck, leaseId: 'old-lease' })).ok, false);
  assert.strictEqual(lifecycleRequests.length, executionCount);
  lifecycleExecution = { ...lifecycleExecution, reminderId: 'old-reminder' };
  assert.strictEqual((await lifecycle.module.requestSharedReminderLifecycle('getSharedReminderState', { date })).ok, false);
  const activityRequests = [];
  const leasesObserved = [];
  let activityPort;
  let activityLease = 'fixture-lease-1';
  let activityCapable = true;
  let holdActivity = false;
  let releaseActivity;
  let badActivityAck = false;
  let staleActivityAck = false;
  const activity = await loadGuardian({ storage: {}, policy,
    connectNative: () => {
      activityPort = createPort((payload, onMessage) => {
        activityRequests.push(payload);
        const isActivity = payload.messageType === 'reportBrowserActivity';
        const reply = () => onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
          requestId: isActivity && badActivityAck ? undefined : payload.requestId,
          supportedProtocols: [1, 2, 3], capabilities: activityCapable
            ? ['shared-browser-activity-v1', 'application-usage-read'] : ['health'],
          browserActivityLeaseId: activityLease,
          ...(isActivity ? { browserActivityAck: { leaseId: payload.payload.leaseId,
            acceptedSequence: payload.payload.sequence, duplicate: false, stale: staleActivityAck } } : {}),
          ...(payload.messageType === 'getApplicationUsage' ? { applicationUsage: { revision: 'fair-read' } } : {}) }));
        if (isActivity && holdActivity) releaseActivity = reply;
        else queueMicrotask(reply);
      });
      return activityPort;
    } });
  const makeActivity = sequence => ({ schemaVersion: 1, leaseId: activityLease, activityId: 'fixture-activity',
    sequence, status: 'active', quotaBucket: 'rest', presentationEligible: true });
  activity.module.observeSharedBrowserActivityLease(value => leasesObserved.push(value));
  await activity.module.requestLocalGuardianHeartbeat({ force: true });
  assert.strictEqual(activity.module.getSharedBrowserActivityLease(), null, 'default-off even with Service capability');
  const beforeActivity = activityRequests.length;
  assert.strictEqual((await activity.module.reportSharedBrowserActivity(makeActivity(1))).ok, false);
  assert.strictEqual(activityRequests.length, beforeActivity);
  activity.module.configureSharedQuotaNativeBridge({ enabled: true });
  assert.strictEqual(activity.module.getSharedBrowserActivityLease(), activityLease);
  assert.strictEqual((await activity.module.reportSharedBrowserActivity(makeActivity(1))).ok, true);
  assert.deepStrictEqual(activityRequests.at(-1).payload, makeActivity(1));
  assert.strictEqual((await activity.module.reportSharedBrowserActivity({ ...makeActivity(2), sentAtMs: 1 })).ok, false);
  holdActivity = true;
  const firstActivity = activity.module.reportSharedBrowserActivity(makeActivity(2));
  await waitFor(() => releaseActivity);
  const secondActivity = activity.module.reportSharedBrowserActivity(makeActivity(3));
  const lastActivity = activity.module.reportSharedBrowserActivity(makeActivity(4));
  assert.strictEqual((await secondActivity).reason, 'activity_superseded');
  const concurrentRead = activity.module.requestApplicationUsage(query);
  await new Promise(resolve => setTimeout(resolve, 0));
  const fairStart = activityRequests.length;
  holdActivity = false;
  releaseActivity();
  assert.strictEqual((await firstActivity).ok, true);
  assert.strictEqual((await concurrentRead).ok, true);
  assert.strictEqual((await lastActivity).ok, true);
  assert.deepStrictEqual(activityRequests.slice(fairStart).map(item => item.messageType), ['getApplicationUsage', 'reportBrowserActivity']);
  badActivityAck = true;
  assert.strictEqual((await activity.module.reportSharedBrowserActivity(makeActivity(5))).ok, false);
  badActivityAck = false;
  staleActivityAck = true;
  assert.strictEqual((await activity.module.reportSharedBrowserActivity(makeActivity(6))).ok, false);
  staleActivityAck = false;
  holdActivity = true; releaseActivity = null;
  const disconnecting = activity.module.reportSharedBrowserActivity(makeActivity(7));
  await waitFor(() => releaseActivity);
  const lateActivityReply = releaseActivity;
  activityPort.disconnect();
  assert.strictEqual((await disconnecting).ok, false);
  assert.strictEqual(activity.module.getSharedBrowserActivityLease(), null);
  lateActivityReply();
  assert.strictEqual(activity.module.getSharedBrowserActivityLease(), null, 'late ACK cannot restore disconnected lease');
  holdActivity = false;
  activityLease = 'fixture-lease-2';
  await activity.module.requestLocalGuardianHeartbeat({ force: true });
  assert.strictEqual(activity.module.getSharedBrowserActivityLease(), activityLease);
  assert.strictEqual((await activity.module.reportSharedBrowserActivity({ ...makeActivity(8), leaseId: 'fixture-lease-1' })).ok, false);
  assert.strictEqual((await activity.module.reportSharedBrowserActivity(makeActivity(1))).ok, true);
  activityCapable = false;
  await activity.module.requestLocalGuardianHeartbeat({ force: true });
  const oldHostCount = activityRequests.length;
  assert.strictEqual((await activity.module.reportSharedBrowserActivity(makeActivity(2))).ok, false);
  assert.strictEqual(activityRequests.length, oldHostCount);
  assert(leasesObserved.includes(null) && leasesObserved.includes('fixture-lease-2'));
  const webRequests = [], challenge = { schemaVersion: 1, challengeId: 'c'.repeat(64), connectionHash: 'd'.repeat(64), expiresAtMs: Date.now() + 300000 };
  let webCapable = true, badWebReceipt = false;
  const webHost = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      webRequests.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(), requestId: payload.requestId,
        supportedProtocols: [3], capabilities: ['health', ...(webCapable ? ['shared-web-contribution-sync-v1'] : [])],
        ...(payload.messageType === 'getSharedWebSourceChallenge' ? { sharedWebSourceChallenge: badWebReceipt ? { ...challenge, deviceToken: 'forbidden' } : challenge } : {}),
        ...(payload.messageType === 'bindSharedWebSource' ? { sharedWebSourceBound: { challengeId: challenge.challengeId, webSourceKey: payload.payload.proof.claims.webSourceKey, expiresAtMs: payload.payload.proof.claims.expiresAtMs } } : {}),
        ...(payload.messageType === 'replaceSharedWebContribution' ? { sharedWebContributionAccepted: {
          date: payload.payload.upload.date, revisionOrdinal: payload.payload.upload.revisionOrdinal,
          contentHash: payload.payload.upload.contentHash, duplicate: false } } : {}) })));
    }) });
  await webHost.module.requestLocalGuardianHeartbeat({ force: true });
  assert.strictEqual((await webHost.module.requestSharedWebSync('getSharedWebSourceChallenge', {})).ok, false);
  webHost.module.configureSharedQuotaNativeBridge({ enabled: true });
  assert.deepStrictEqual((await webHost.module.requestSharedWebSync('getSharedWebSourceChallenge', {})).value, challenge);
  const proof = { schemaVersion: 1, keyId: 'a'.repeat(64), signature: 'A'.repeat(86), claims: { schemaVersion: 1,
    audience: 'timeonchrome:shared-web-source:v1', challengeId: challenge.challengeId, connectionHash: challenge.connectionHash,
    applicationSourceKey: 'e'.repeat(64), childScopeHash: 'f'.repeat(64), assignmentVersion: 1, webSourceKey: 'web:' + 'b'.repeat(64),
    issuedAtMs: challenge.expiresAtMs - 300000, expiresAtMs: challenge.expiresAtMs } };
  assert.strictEqual((await webHost.module.requestSharedWebSync('bindSharedWebSource', { proof })).ok, true);
  assert.strictEqual(webRequests.at(-1).channel, 'sharedQuota');
  assert.deepStrictEqual(webRequests.at(-1).payload, { proof });
  assert.strictEqual((await webHost.module.requestSharedWebSync('bindSharedWebSource', { proof, deviceToken: 'forbidden' })).ok, false);
  badWebReceipt = true;
  assert.strictEqual((await webHost.module.requestSharedWebSync('getSharedWebSourceChallenge', {})).ok, false);
  webCapable = false;
  await webHost.module.requestLocalGuardianHeartbeat({ force: true });
  const unsupportedCount = webRequests.length;
  assert.strictEqual((await webHost.module.requestSharedWebSync('getSharedWebSourceChallenge', {})).ok, false);
  assert.strictEqual(webRequests.length, unsupportedCount);
  console.log('[Local Guardian] passed');
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
