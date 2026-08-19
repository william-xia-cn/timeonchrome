// Run with: node tests/unit/local-guardian.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const modulePath = path.join(root, 'extension', 'infra', 'local-guardian.js');
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
    .replace(/import \{ readManagedDeploymentMarker \} from '\.\.\/core\/deployment-mode\.js';/, 'const readManagedDeploymentMarker = (...args) => globalThis.__guardianReadMarker(...args);')
    .replace(/import \{ budgetedLocalSet \} from '\.\/storage-budget\.js';/, 'const budgetedLocalSet = (...args) => globalThis.__guardianBudgetedSet(...args);')
    + `\n// test-instance-${instance}`;
}

async function loadGuardian({ storage, incognito = false, connectNative, policy, policyRead = null } = {}) {
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
  global.__guardianReadMarker = async () => true;
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
      assert.strictEqual(host, 'com.timeonchrome.guardian');
      const port = createPort((payload, onMessage) => {
        payloads.push(payload);
        queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, receivedAt: 1787160000 })));
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

  const boot = payloads[0];
  assert.deepStrictEqual(Object.keys(boot).sort(), [
    'extensionId', 'incognito', 'monitoringStatus', 'policyHash',
    'profile', 'timestamp', 'type', 'version',
  ].sort());
  assert.strictEqual(boot.type, 'heartbeat');
  assert.strictEqual(boot.monitoringStatus, 'booting');
  assert.strictEqual(boot.extensionId, runtime.id);
  assert.strictEqual(boot.version, '1.7.25');
  assert.strictEqual(boot.policyHash.length, 64);
  assert.strictEqual(JSON.stringify(boot).includes('secret-token-a'), false);
  assert.strictEqual(JSON.stringify(boot).includes('child@example.test'), false);

  module.configureLocalGuardianStateProvider(() => ({
    bootstrapState: 'ready',
    activationState: { activated: true, privacyConsentRequired: false },
    monitoringEnabled: 1,
  }));
  const activeResult = await module.requestLocalGuardianHeartbeat({ trigger: 'unit_active', force: true });
  assert.strictEqual(activeResult.ok, true);
  assert.strictEqual(payloads.at(-1).monitoringStatus, 'active');

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
  assert.strictEqual(payloads.at(-1).type, 'probe');

  const firstUuid = boot.profile;
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
  assert.strictEqual(secondPayloads[0].profile, firstUuid);
  assert.strictEqual(secondPayloads[0].incognito, true);

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
  assert.notStrictEqual(otherPayloads[0].profile, firstUuid);

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
    'lastSuccessAt', 'lastTrigger', 'portConnected',
  ].sort());
  assert.strictEqual(JSON.stringify(savedStatus).includes('secret-token-a'), false);

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
  await waitFor(() => degradedPayloads.length >= 2);
  assert.strictEqual(degradedPayloads.at(-1).monitoringStatus, 'degraded');
  assert.strictEqual(degradedPayloads.at(-1).policyHash.length, 64);

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
  assert.strictEqual(queuedPayloads[1].type, 'probe');
  acknowledgements[1]();
  assert.strictEqual((await queuedProbePromise).ok, true);
  await waitFor(() => queuedPayloads.length === 3);
  assert.strictEqual(queuedPayloads[2].type, 'heartbeat');
  assert.strictEqual(queuedPayloads[2].monitoringStatus, 'booting');
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
  const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
  assert.match(source, /NATIVE_RESPONSE_TIMEOUT_MS = 3_000/);
  assert.match(source, /PROBE_COOLDOWN_MS = 5_000/);
  assert.match(background, /configureLocalGuardianStateProvider/);
  assert.match(background, /TIMEONCHROME_LOCAL_HEALTH_PROBE/);

  console.log('[Local Guardian] 54/54 passed');
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
