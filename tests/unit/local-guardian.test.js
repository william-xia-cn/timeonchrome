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
    .replace(/import \{ MANAGED_POLICY_KEYS, readManagedActivationPolicy \} from '\.\.\/core\/activation-gate\.js';/, `const MANAGED_POLICY_KEYS = globalThis.__guardianPolicyKeys;\nconst readManagedActivationPolicy = (...args) => globalThis.__guardianReadPolicy(...args);`)
    .replace(/import \{ readNativeHostDeploymentMarker, readNativeHostDevelopmentMarker \} from '\.\.\/core\/deployment-mode\.js';/, 'const readNativeHostDeploymentMarker = (...args) => globalThis.__guardianReadMarker(...args);\nconst readNativeHostDevelopmentMarker = (...args) => globalThis.__guardianReadDevelopmentMarker(...args);')
    .replace(/import \{ budgetedLocalSet \} from '\.\/storage-budget\.js';/, 'const budgetedLocalSet = (...args) => globalThis.__guardianBudgetedSet(...args);')
    .replace(/import \{ registerPersistedUsageSegmentObserver \} from '\.\.\/core\/usage-segments\.js';/, 'const registerPersistedUsageSegmentObserver = (observer) => { globalThis.__persistedSegmentObserver = observer; };')
    .replace(/import \{ readCurrentWeekBrowserSnapshots \} from '\.\/browser-bridge-v3-snapshot\.js';/, 'const readCurrentWeekBrowserSnapshots = (...args) => globalThis.__readBrowserSnapshots(...args);')
    + `\n// test-instance-${instance}`;
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
  assert.match(source, /NATIVE_RESPONSE_TIMEOUT_MS = 3_000/);
  assert.match(source, /PROBE_COOLDOWN_MS = 5_000/);
  assert.match(background, /configureLocalGuardianStateProvider/);
  assert.match(background, /TIMEONCHROME_LOCAL_HEALTH_PROBE/);

  console.log('[Local Guardian] passed');
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
