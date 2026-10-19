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

function moduleSource(instance, requireLegacySourceStage = false, inputSource = originalSource) {
  const source = inputSource;
  return source
    .replace(/import \* as sourceStatisticsContract from '\.\.\/core\/shared-contracts\/1\.56\.0\/source-statistics\.js';/,
      'const sourceStatisticsContract=globalThis.__GUARDIAN_QUOTA_BUCKETS_CONTRACT;')
    .replace(/from '\.\.\/core\/shared-forced-use-runtime-v2.js'/, `from '${require('node:url').pathToFileURL(path.join(root, 'extension/core/shared-forced-use-runtime-v2.js')).href}'`)
.replace(/from '\.\.\/core\/shared-contracts\/1\.58\.0\/source-statistics.js'/, `from '${require('node:url').pathToFileURL(path.join(root, 'extension/core/shared-contracts/1.58.0/source-statistics.js')).href}'`)
    .replace(/from '\.\/mac-guardian-health.js'/, `from '${require('node:url').pathToFileURL(path.join(root, 'extension/infra/mac-guardian-health.js')).href}'`)
    .replace(/from '\.\.\/core\/shared-web-native.js'/, `from '${require('node:url').pathToFileURL(path.join(root, 'extension/core/shared-web-native.js')).href}'`)
    .replace(/import \{ MANAGED_POLICY_KEYS, readManagedActivationPolicy \} from '\.\.\/core\/activation-gate\.js';/, `const MANAGED_POLICY_KEYS = globalThis.__guardianPolicyKeys;\nconst readManagedActivationPolicy = (...args) => globalThis.__guardianReadPolicy(...args);`)
    .replace(/import \{ readNativeHostDeploymentMarker, readNativeHostDevelopmentMarker \} from '\.\.\/core\/deployment-mode\.js';/, 'const readNativeHostDeploymentMarker = (...args) => globalThis.__guardianReadMarker(...args);\nconst readNativeHostDevelopmentMarker = (...args) => globalThis.__guardianReadDevelopmentMarker(...args);')
    .replace(/import \{ budgetedLocalSet \} from '\.\/storage-budget\.js';/, 'const budgetedLocalSet = (...args) => globalThis.__guardianBudgetedSet(...args);')
    .replace(/import \{ registerPersistedUsageSegmentObserver \} from '\.\.\/core\/usage-segments\.js';/, 'const registerPersistedUsageSegmentObserver = (observer) => { globalThis.__persistedSegmentObserver = observer; };')
    .replace(/import \{ readCurrentWeekBrowserSnapshots \} from '\.\/browser-bridge-v3-snapshot\.js';/, 'const readCurrentWeekBrowserSnapshots = (...args) => globalThis.__readBrowserSnapshots(...args);')
    .replace(/import \{ browserExecutionFence, browserExecutionIdentityHash \} from '\.\/shared-browser-execution-fence\.js';/,
      fs.readFileSync(path.join(root, 'extension', 'infra', 'shared-browser-execution-fence.js'), 'utf8').replace(/export (function|const) /g, '$1 '))
    .replace(/import \{ sharedBrowserExecutionAttempts \} from '\.\/shared-browser-execution-attempts\.js';/,
      'const retirementEvidence = []; const sharedBrowserExecutionAttempts = {retireAttempt:async proof=>{const evidence=browserExecutionFence.evidence(proof);retirementEvidence.push(evidence);return {ok:!!evidence,retired:true};}};')
    .replace(/import \{ checkSharedReminderStateV2, checkSharedReminderMessageV2 \} from '\.\/shared-forced-use-runtime-v2.js';/g, '')
    + `\nexport const executionFenceForTest = browserExecutionFence; export const retirementEvidenceForTest = retirementEvidence; export const expireSnapshotRetryForTest=()=>{snapshotRetryAtMs=0;};\n// test-instance-${instance}`;
}

async function loadGuardian({ storage, incognito = false, connectNative, policy, policyRead = null, development = false, snapshots = [], platform = 'win', requireLegacySourceStage = false, sourceOverride = originalSource } = {}) {
  const sourceContractPath = process.env.TIMEONCHROME_SOURCE_STATISTICS_CONTRACT_PATH;
  if (sourceContractPath) {
    const ts = require('typescript');
    const contractJs = ts.transpileModule(fs.readFileSync(sourceContractPath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    globalThis.__GUARDIAN_QUOTA_BUCKETS_CONTRACT = await import('data:text/javascript;base64,' + Buffer.from(contractJs).toString('base64'));
  } else globalThis.__GUARDIAN_QUOTA_BUCKETS_CONTRACT = await import(require('node:url')
    .pathToFileURL(path.join(root, 'extension/core/shared-contracts/1.58.0/source-statistics.js')).href);
  globalThis.__GUARDIAN_PROFILE_SCOPE = await import(require('node:url')
    .pathToFileURL(path.join(root, 'extension/core/profile-account-shadow-v2.js')).href);
  const alarms = { onAlarm: createEvent(), created: [] };
  alarms.get = async () => null;
  alarms.create = async (name, options) => { alarms.created.push({ name, options }); };
  const runtime = {
    id: 'jdcancbiocacabbjdkngadmjpjmkdnih',
    getManifest: () => ({ version: '1.7.25' }),
    getPlatformInfo: async () => ({ os: platform }),
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

  const encoded = Buffer.from(moduleSource(Math.random(), requireLegacySourceStage, sourceOverride)).toString('base64');
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

function installSourceBinding(host, ensure = async () => ({ ok: true,
  bindingContextId: 'c'.repeat(64), expiresAtMs: Date.now() + 300_000 })) {
  host.module.setApplicationIdentityBindingEnsurer(ensure);
  host.module.setApplicationIdentityBindingReader(ensure);
}

async function testAutomaticBindingLifecycle(policy, holdCloud = false) {
  const context = { apiBase: 'https://binding.invalid', deviceToken: 'synthetic-token',
    childId: 'automatic-binding-child', deviceId: 'automatic-binding-device' };
  const payloads = [], ports = [];
  const store = { cloud_profile_id: context.childId, cloud_device_id: context.deviceId };
  const sourceClock = { value: Date.now() };
  let releaseProof;
  const proofAvailable = new Promise(resolve => { releaseProof = resolve; });
  let releaseCloud;
  const cloudAvailable = new Promise(resolve => { releaseCloud = resolve; });
  const cloudControl = { hold: holdCloud, reads: 0 };
  const host = await loadGuardian({ policy,
    storage: store,
    connectNative: () => {
      const port = createPort((request, onMessage) => {
        payloads.push(request);
        const now = Date.now(), v3 = request.protocolVersion === 3;
        const response = { ok: true, receivedAt: now, requestId: request.requestId,
          supportedProtocols: [1, 2, 3], capabilities: ['health', ...(v3 ? [
            'quota-buckets-read-v1', 'shared-web-source-reusable-v2', 'application-usage-seconds-read-v1',
          ] : [])],
          ...(request.messageType === 'getSharedWebSourceScope' ? { sharedWebSourceScope: {
            schemaVersion: 2, keyId: 'a'.repeat(64), signature: 'A'.repeat(86), claims: {
              schemaVersion: 2, audience: 'timeonchrome:shared-web-machine-scope:v2',
              applicationSourceKey: 'e'.repeat(64), childScopeHash: 'f'.repeat(64), assignmentVersion: 1,
              issuedAtMs: now, expiresAtMs: now + 300_000,
            },
          } } : {}),
          ...(request.messageType === 'bindSharedWebSourceV2' ? { sharedWebIdentity: {
            status: 'verified', webSourceKey: request.payload.proof.claims.webSourceKey,
            expiresAtMs: request.payload.proof.claims.expiresAtMs,
          } } : {}),
          ...(request.messageType === 'exchangeQuotaBuckets' ? { applicationUsage: {
            schemaVersion: 2, durationUnit: 'seconds', source: 'application', childId: context.childId,
            fromDate: request.payload.fromDate, toDate: request.payload.toDate, readAtMs: now,
            days: globalThis.__GUARDIAN_QUOTA_BUCKETS_CONTRACT.sourceStatisticsDates(request.payload.fromDate, request.payload.toDate)
              .map(date => ({ date, bucketsSeconds: { study: 0, composite: 45, rest: 0 },
                settledThroughMs: null, complete: false, reasonCodes: ['LOCAL_STATISTICS_INCOMPLETE'] })),
          } } : {}),
        };
        queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
      });
      ports.push(port); return port;
    },
  });
  chrome.storage.onChanged = createEvent();
  const reusableContract = await import(require('node:url').pathToFileURL(path.join(root, 'extension/core/shared-contracts/1.58.0/shared-web-sync.js')).href);
  const native = await import(require('node:url').pathToFileURL(path.join(root, 'extension/core/shared-web-native.js')).href);
  let registeredReader;
  globalThis.__automaticBindingFixture = { reusableContract, native, host, context, store, proofAvailable, sourceClock,
    cloudAvailable, cloudControl,
    setReader(reader) { registeredReader = reader; host.module.setApplicationIdentityBindingReader(reader); } };
  const prefix = `const fixture=globalThis.__automaticBindingFixture;
    const {canonicalSharedWebSync,validateSharedWebReusableProofV2}=fixture.reusableContract;
    const {SHARED_WEB_IDENTITY_ERRORS}=fixture.native;
    const {observeSharedAccessPolicyCapability,
      requestApplicationIdentityBindingNative,readApplicationIdentityBindingConnection,
      setApplicationIdentityBindingEnsurer}=fixture.host.module;
    const setApplicationIdentityBindingReader=fixture.setReader;
    const readSharedAccessPolicyContext=async()=>({...fixture.context});
    const requestCloudSharedWebSourceBindingV2=async(context,scope)=>{await fixture.proofAvailable;return {ok:true,value:{
      schemaVersion:2,keyId:'a'.repeat(64),signature:'A'.repeat(86),claims:{...scope.claims,
      audience:'timeonchrome:shared-web-source:v2',webSourceKey:'web:'+'b'.repeat(64),bindingEpochHash:'d'.repeat(64)}}};};
  `;
  const source = fs.readFileSync(path.join(root, 'extension/infra/shared-web-reusable-binding.js'), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '');
  const binding = await import('data:text/javascript;base64,' + Buffer.from(prefix + source + `\n// lifecycle-${holdCloud}`).toString('base64'));
  globalThis.__automaticBindingFixture.binding = binding;
  let sourceInstance = null, readyNotifications = 0;
  binding.initApplicationIdentityBinding({ identityAllowed: () => true, onIdentityReady: () => {
    readyNotifications++;
    sourceInstance?.invalidate();
    return sourceInstance?.refresh({ force: true });
  } });
  const shadowSource = fs.readFileSync(path.join(root, 'extension/infra/source-statistics-shadow.js'), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '');
  const shadowPrefix = `const fixture=globalThis.__automaticBindingFixture;
    const Date=class extends globalThis.Date {static now(){return fixture.sourceClock.value;}};
    const readApplicationStatisticsSourceProof=(...args)=>fixture.binding.readApplicationStatisticsSourceProof(...args);
    const sourceStatisticsContract=globalThis.__GUARDIAN_QUOTA_BUCKETS_CONTRACT;
    const {PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY,isProfileAccountShadowScopeCurrent}=globalThis.__GUARDIAN_PROFILE_SCOPE;
    const {readSourceStatisticsNativeContext,requestQuotaBucketsExchange}=fixture.host.module;
    const readSharedAccessPolicyContext=async()=>({...fixture.context,scopeHash:'automatic-source-scope'});
    const readQuotaReadModelV2=async({date})=>({ok:true,date,
      usage:{studySeconds:0,compositeSeconds:0,restSeconds:0},completeness:{complete:true}});
    const budgetedLocalSet=async values=>{Object.assign(fixture.store,structuredClone(values));return {ok:true};};
    const readCloudSourceStatistics=async(options,q)=>{fixture.cloudControl.reads++;
      if(fixture.cloudControl.hold)await fixture.cloudAvailable;
      return {ok:true,snapshot:{schemaVersion:2,durationUnit:'seconds',
      source:'application',childId:fixture.context.childId,fromDate:q.fromDate,toDate:q.toDate,readAtMs:Date.now(),
      days:sourceStatisticsContract.sourceStatisticsDates(q.fromDate,q.toDate).map(date=>({date,
      bucketsSeconds:{study:0,composite:0,rest:0},settledThroughMs:null,complete:false,reasonCodes:['SOURCE_PARTIAL']}))}};};
  `;
  const shadow = await import('data:text/javascript;base64,' + Buffer.from(shadowPrefix + shadowSource + `\n// lifecycle-${holdCloud}`).toString('base64'));
  sourceInstance = shadow.initSourceStatisticsShadow({ isEnabled: () => true });
  const readReady = async () => {
    let ready;
    const start = Date.now();
    do {
      ready = await registeredReader();
      if (ready.ok) return ready;
      await new Promise(resolve => setTimeout(resolve, 5));
    } while (Date.now() - start < 1000);
    assert.equal(ready.ok, true, 'automatic preparation must make its own registered reader ready');
  };
  await host.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
  await waitFor(() => cloudControl.reads > 0, 1000);
  if (!holdCloud) {
    await waitFor(() => store.source_statistics_shadow_v1?.source?.application?.origin === 'cloud', 1000);
    assert.equal(store.source_statistics_shadow_v1.nativeAttempt.sent, false,
      'first read must not wait for delayed independent cloud proof preparation');
  } else assert.equal(sourceInstance.inspect().busy, true, 'old cloud fallback remains in flight');
  releaseProof();
  await readReady();
  await waitFor(() => store.source_statistics_shadow_v1?.nativeAttempt?.accepted === true, 1000);
  assert.equal(store.source_statistics_shadow_v1.source.application.origin, 'native',
    'identity readiness must automatically read Native without waiting for the periodic alarm');
  releaseCloud();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(store.source_statistics_shadow_v1.source.application.origin, 'native',
    'a late cloud fallback from an invalidated generation must not replace Native');
  const notificationsBeforeCachedRead = readyNotifications;
  assert.equal((await binding.ensureApplicationIdentityBinding()).ok, true);
  assert.equal(readyNotifications, notificationsBeforeCachedRead, 'cached ready binding does not notify again');
  const query = { fromDate: '2026-10-17', toDate: '2026-10-17', webUsage: null };
  const first = await host.module.requestQuotaBucketsExchange(query);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.nativeAttempt.accepted, true);
  const bindingsBeforeReconnect = payloads.filter(p => p.messageType === 'bindSharedWebSourceV2').length;
  ports.at(-1).disconnect();
  assert.equal((await registeredReader()).ok, false, 'retired Port binding must not remain ready');
  await host.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
  await readReady();
  assert(payloads.filter(p => p.messageType === 'bindSharedWebSourceV2').length > bindingsBeforeReconnect);
  await waitFor(() => store.source_statistics_shadow_v1?.nativeAttempt?.accepted === true
    && store.source_statistics_shadow_v1.nativeAttempt.connectionGeneration === first.connectionGeneration + 2, 1000);
  assert.equal((await host.module.requestQuotaBucketsExchange(query)).ok, true);
  const beforePolicyRefresh = payloads.filter(p => p.messageType === 'bindSharedWebSourceV2').length;
  chrome.storage.onChanged.listeners.forEach(listener => listener({ shared_access_policy_lkg_v1: {
    oldValue: { receivedAtMs: 1, policy: { revision: 'same-policy' } },
    newValue: { receivedAtMs: 2, policy: { revision: 'same-policy' } },
  } }, 'local'));
  const policyRefreshInvalidated = !(await registeredReader()).ok;
  await readReady();
  const afterPolicyRefresh = payloads.filter(p => p.messageType === 'bindSharedWebSourceV2').length;
  console.log('[Automatic binding lifecycle] real init/prepare/reader/bucket/reconnect PASS',
    JSON.stringify({ accepted: true, automaticSourceRead: true, lateCloudProtected: holdCloud,
      policyTimestampOnlyInvalidated: policyRefreshInvalidated,
      policyTimestampOnlyAdditionalBinds: afterPolicyRefresh - beforePolicyRefresh }));
}

async function testColdProtocolNegotiation(policy) {
  const baseCaps = ['health', 'ledger-item-ack', 'ledger-durable-shadow', 'authoritative-daily-snapshot', 'application-usage-read'];
  async function createHost({ sourceOverride = originalSource, missing = false, fault = null } = {}) {
    const messages = [], ports = [], store = { cloud_profile_id: 'protocol-child', cloud_device_id: 'protocol-device' };
    const control = { missing, old: false, fault };
    const host = await loadGuardian({ policy, storage: store, sourceOverride,
      connectNative: () => {
        if (control.missing) throw Error('Host unavailable');
        const port = createPort((request, onMessage, onDisconnect) => {
          messages.push(request);
          if (request.protocolVersion === 3 && request.channel === 'health') {
            if (control.fault === 'disconnect') { queueMicrotask(() => onDisconnect.listeners.forEach(listener => listener())); return; }
            if (control.fault === 'timeout') return;
          }
          const modern = request.protocolVersion === 3 && !control.old;
          const response = { ok: true, requestId: request.requestId, receivedAt: Date.now(),
            supportedProtocols: control.old ? [1] : [1, 2, 3], capabilities: modern
              ? [...baseCaps, 'quota-buckets-read-v1', 'application-usage-seconds-read-v1'] : baseCaps };
          if (request.messageType === 'getApplicationUsage') {
            response.ok = false; response.errorCode = 'BROWSER_BRIDGE_MESSAGE_REJECTED';
          }
          if (request.messageType === 'getApplicationUsageSeconds') response.applicationUsageSeconds = { revision: 'seconds-read' };
          if (request.messageType === 'exchangeQuotaBuckets') response.applicationUsage = {
            schemaVersion: 2, durationUnit: 'seconds', source: 'application', childId: store.cloud_profile_id,
            fromDate: request.payload.fromDate, toDate: request.payload.toDate, readAtMs: Date.now(),
            days: [{ date: request.payload.fromDate, bucketsSeconds: { study: 0, composite: 0, rest: 600 },
              settledThroughMs: null, complete: true, reasonCodes: [] }] };
          if (control.fault === 'missingId' && request.protocolVersion === 3 && request.channel === 'health') delete response.requestId;
          queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
        });
        ports.push(port); return port;
      } });
    await waitFor(() => missing ? store.local_guardian_status_v1?.lastErrorCode === 'native_host_unavailable'
      : store.local_guardian_status_v1?.lastSuccessAt > 0);
    return { ...host, messages, ports, store, control };
  }
  const cold = await createHost({ missing: true });
  cold.control.missing = false;
  const context = await cold.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
  assert.equal(context.ok, true);
  assert.equal(cold.ports.length, 1);
  assert.equal(cold.messages[0].protocolVersion, 3);
  assert.equal(cold.messages.filter(row => row.channel === 'health' && row.protocolVersion === 3).length, 1);
  installSourceBinding(cold, async () => {
    assert(cold.messages.some(row => row.channel === 'health' && row.protocolVersion === 3));
    return { ok: true, bindingContextId: 'c'.repeat(64), expiresAtMs: Date.now() + 300000 };
  });
  assert.equal((await cold.module.requestQuotaBucketsExchange({ fromDate: '2026-10-16', toDate: '2026-10-16',
    webUsage: null, expectedContextId: context.contextId })).ok, true);
  cold.ports.at(-1).disconnect();
  const before = cold.messages.length;
  const reconnected = await cold.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
  assert.equal(reconnected.ok, true);
  assert.notEqual(reconnected.contextId, context.contextId);
  assert.equal(cold.messages.slice(before).find(row => ['heartbeat', 'probe'].includes(row.messageType)).protocolVersion, 3,
    'a new Port directly negotiates the current protocol');
  assert.equal(cold.messages.slice(before).filter(row => row.channel === 'health' && row.protocolVersion === 3).length, 1);
  const app = await createHost();
  const read = await app.module.requestApplicationUsage({ fromDate: '2026-10-16', toDate: '2026-10-16', offset: 0 });
  assert.equal(read.ok, true);
  assert.equal(read.readUnit, 'seconds');
  assert(app.messages.some(row => row.messageType === 'getApplicationUsageSeconds'));
  assert(!app.messages.some(row => row.messageType === 'getApplicationUsage'));
  const concurrent = await createHost();
  const together = await Promise.all([concurrent.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true }),
    concurrent.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true })]);
  assert(together.every(result => result.ok));
  assert.equal(concurrent.messages.filter(row => row.channel === 'health' && row.protocolVersion === 3).length, 1,
    'concurrent consumers share one completed V3 negotiation on the same Port');
  const old = await createHost({ missing: true });
  old.control.missing = false; old.control.old = true;
  assert.equal((await old.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true })).errorCode,
    'source_statistics_native_unsupported');
  assert(old.messages.some(row => row.protocolVersion === 3), 'old peer receives only current protocol negotiation');
  assert(!old.messages.some(row => row.protocolVersion === 1), 'unsupported peer never triggers a legacy retry');
  for (const [fault, code] of [['disconnect', 'native_port_disconnected'], ['timeout', 'native_response_timeout'],
    ['missingId', 'native_invalid_response']]) {
    const interrupted = await createHost({ missing: true, fault });
    interrupted.control.missing = false;
    const result = await interrupted.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
    assert.equal(result.errorCode, code);
    assert.equal(interrupted.module.readNativeHostDiagnosticState().connected, false);
    assert.equal(interrupted.messages.filter(row => row.channel === 'health' && row.protocolVersion === 3).length, 1);
  }
  console.log('[Native cold protocol] current V3, seconds, recovery, reconnect, no downgrade, timeout and correlation passed');
}

async function run() {
  const policy = {
    enabled: true,
    deploymentMode: 'managed',
    cloudEndpoint: 'https://example.test',
    managedDeviceToken: 'secret-token-a',
    managedProfileEmail: 'child@example.test',
  };
  await testColdProtocolNegotiation(policy);
  if (process.argv.includes('--current-binding-only')) {
    await testAutomaticBindingLifecycle(policy);
    await testAutomaticBindingLifecycle(policy, true);
    console.log('[Current-only subset] cold V3 and actual init/binding/bucket/reconnect without legacy capabilities PASS; this subset does not replace the full file');
    process.exit(0);
  }
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
          ok: true, requestId: payload.requestId, receivedAt: 1787160000, supportedProtocols: [1, 2, 3],
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

  assert.strictEqual(alarms.onAlarm.listeners.length, 2);
  assert.strictEqual(runtime.onStartup.listeners.length, 2);
  assert.strictEqual(runtime.onInstalled.listeners.length, 2);
  assert.strictEqual(runtime.onMessage.listeners.length, 2);
  assert.strictEqual(alarms.created.some((entry) => entry.name === 'timeonchromeLocalGuardianHeartbeat' && entry.options.periodInMinutes === 1), true);
  assert.strictEqual(alarms.created.some((entry) => entry.name === 'timeonchromeBrowserBridgeReconcile' && entry.options.periodInMinutes === 60), true);

  const boot = payloads[0];
  assert.deepStrictEqual(Object.keys(boot).sort(), [
    'channel', 'extensionId', 'messageType', 'payload', 'profileId',
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
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, requestId: payload.requestId, receivedAt: 1787160004, supportedProtocols: [3], capabilities: ['health'] })));
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
        ok: true, requestId: payload.requestId, receivedAt: 1787160005, supportedProtocols: [1, 2], capabilities: ['ledger-item-ack'],
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
        if (payload.channel === 'health') {
          onMessage.listeners.forEach((listener) => listener({
            ok: true, requestId: payload.requestId, receivedAt: 1787160200, supportedProtocols: [1, 2, 3], capabilities: ['authoritative-daily-snapshot'],
          }));
          return;
        }
        snapshotAttempts += 1;
        onMessage.listeners.forEach((listener) => listener({
          ok: true, requestId: payload.requestId, receivedAt: 1787160201, acceptedRevision: payload.payload.snapshotRevision,
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
  let businessRejected = false;
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
            ok: true, requestId: payload.requestId, receivedAt: 1787160200, supportedProtocols: [1, 3],
            capabilities: ['authoritative-daily-snapshot'],
          } : businessRejected ? {
            ok: false, requestId: payload.requestId, receivedAt: 1787160201,
            errorCode: 'BROWSER_BRIDGE_MESSAGE_REJECTED',
          } : !serviceAvailable ? {
            ok: false, requestId: payload.requestId, receivedAt: 1787160201, errorCode: 'RUNTIME_SERVICE_UNAVAILABLE',
          } : {
            ok: true, requestId: payload.requestId, receivedAt: 1787160202,
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
  businessRejected = true;
  const connectedBeforeBusinessRejection = laterConnections;
  await later.module.requestLocalGuardianHeartbeat({ trigger: 'business_rejected', force: true });
  await waitFor(() => later.module.readNativeHostDiagnosticState().lastResponseRejection?.reason === 'service_message_rejected', 1_000);
  assert.strictEqual(later.module.readNativeHostDiagnosticState().connected, true);
  assert.strictEqual(laterStorage.local_guardian_status_v1.lastErrorCode, null, 'statistics rejection must not replace health success');
  assert.strictEqual(laterStorage.browser_bridge_v3_state_v1.pendingDates['2026-09-21'], 'corrected-revision');
  assert.notStrictEqual(laterStorage.browser_bridge_v3_state_v1.acknowledgedRevisions['2026-09-21'], 'corrected-revision');
  assert.strictEqual(laterConnections, connectedBeforeBusinessRejection);
  const rejectedSnapshotCount = laterPayloads.filter(payload => payload.messageType === 'dailyUsageSnapshot').length;
  for (let i = 0; i < 10; i++) await later.module.requestLocalGuardianHeartbeat({ trigger: 'during_snapshot_cooldown', force: true });
  assert.strictEqual(laterPayloads.filter(payload => payload.messageType === 'dailyUsageSnapshot').length, rejectedSnapshotCount,
    'repeated triggers during cooldown must not loop rejected snapshot frames');
  assert.strictEqual(later.module.readNativeHostDiagnosticState().connected, true);
  later.module.expireSnapshotRetryForTest();
  businessRejected = false;
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
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, requestId: payload.requestId, receivedAt: 1787160001, supportedProtocols: [3], capabilities: ['health'] })));
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
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, requestId: payload.requestId, receivedAt: 1787160002, supportedProtocols: [3], capabilities: ['health'] })));
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
    connectNative: () => createPort((payload, onMessage) => {
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, requestId: payload.requestId, receivedAt: 'not-a-number' })));
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
    connectNative: () => createPort((payload, onMessage) => {
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({
        ok: false, requestId: payload.requestId, receivedAt: 1787160004, errorCode: 'RUNTIME_SERVICE_UNAVAILABLE',
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
      queueMicrotask(() => onMessage.listeners.forEach((listener) => listener({ ok: true, requestId: payload.requestId, receivedAt: 1787160003, supportedProtocols: [3], capabilities: ['health'] })));
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
        requestId: payload.requestId, receivedAt: 1787160100 + queuedPayloads.length, supportedProtocols:[3], capabilities:['health'],
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
        capabilities: ['health', 'authoritative-daily-snapshot', 'application-usage-seconds-read-v1'],
        ...(payload.messageType === 'getApplicationUsageSeconds' ? { applicationUsageSeconds: { revision: 'fixture' } } : {}) })));
    }) });
  await waitFor(() => appPayloads.length > 0);
  const query = { fromDate: '2026-09-21', toDate: '2026-09-27', offset: 0 };
  const firstApplicationResult = await appRead.module.requestApplicationUsage(query);
  assert.strictEqual(firstApplicationResult.ok, true, JSON.stringify(firstApplicationResult));
  assert.strictEqual(firstApplicationResult.applicationUsageSeconds.revision, 'fixture');
  assert.strictEqual(appPayloads.at(-1).channel, 'application');
  assert.strictEqual(appPayloads.at(-1).messageType, 'getApplicationUsageSeconds');
  assert.deepStrictEqual(appRead.runtime.messages, [{ type: 'TIMEONCHROME_APPLICATION_USAGE_AVAILABLE' }]);
  assert.deepStrictEqual(appPayloads.at(-1).payload, query);
  assert.strictEqual((await appRead.module.requestApplicationUsage({ ...query, localUserId: 'other' })).ok, false);

  const secondsPayloads = [];
  const secondsContextStorage = { cloud_profile_id: 'child-a', cloud_device_id: 'device-a' };
  const secondsApp = await loadGuardian({ storage: secondsContextStorage, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      secondsPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
        requestId: payload.requestId, supportedProtocols: [1, 2, 3],
        capabilities: ['health', 'application-usage-read', 'application-usage-seconds-read-v1'],
        ...(payload.messageType === 'getApplicationUsageSeconds' ? { applicationUsageSeconds: { revision: 'seconds:golden1' } } : {}) })));
    }) });
  await waitFor(() => secondsPayloads.length > 0);
  const secondsQuery = { fromDate: '2026-10-06', toDate: '2026-10-06', offset: 100, expectedRevision: 'seconds:view:one' };
  const secondsResult = await secondsApp.module.requestApplicationUsage(secondsQuery);
  assert.equal(secondsResult.ok, true);
  assert.equal(secondsResult.readUnit, 'seconds');
  assert.equal(secondsResult.applicationUsageSeconds.revision, 'seconds:golden1');
  assert.equal(secondsPayloads.at(-1).messageType, 'getApplicationUsageSeconds');
  assert.deepStrictEqual(secondsPayloads.at(-1).payload, secondsQuery);
  const contextResponse = await new Promise(resolve => secondsApp.runtime.onMessage.listeners[0](
    { type: secondsApp.module.APPLICATION_USAGE_CONTEXT_MESSAGE, contextOnly: true },
    { id: secondsApp.runtime.id, url: secondsApp.runtime.getURL('admin/admin.html') }, resolve));
  assert.equal(contextResponse.ok, true);
  assert.equal(contextResponse.readUnit, 'seconds');
  assert.equal(contextResponse.contextId, secondsResult.contextId);
  const previousContext = contextResponse.contextId;
  secondsContextStorage.cloud_profile_id = 'child-b';
  const changedContext = await secondsApp.module.requestApplicationUsageReadContext();
  assert.equal(changedContext.ok, true);
  assert.notEqual(changedContext.contextId, previousContext, 'profile binding change invalidates cache context');

  const revisionRead = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => queueMicrotask(() => onMessage.listeners.forEach(listener => listener({
      ok: payload.messageType !== 'getApplicationUsageSeconds',
      ...(payload.messageType === 'getApplicationUsageSeconds' ? { errorCode: 'APPLICATION_SECONDS_REVISION_CHANGED' } : {}),
      receivedAt: Date.now(), requestId: payload.requestId, supportedProtocols: [1, 2, 3],
      capabilities: ['health', 'application-usage-seconds-read-v1'],
    })))) });
  await waitFor(() => revisionRead.module.readNativeHostDiagnosticState().applicationUsageSecondsSupported === true);
  assert.equal((await revisionRead.module.requestApplicationUsage(secondsQuery)).errorCode,
    'application_usage_seconds_revision_changed', 'Native seconds revision conflict reaches the paging retry path');

  let secondsReadPayload;
  let secondsReadPort;
  const correlation = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => {
      secondsReadPort = createPort((payload, onMessage) => {
        if (payload.messageType !== 'getApplicationUsageSeconds') {
          queueMicrotask(() => onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
            requestId: payload.requestId, supportedProtocols: [1, 2, 3], capabilities: ['health', 'application-usage-seconds-read-v1'] })));
        } else secondsReadPayload = { payload, onMessage };
      });
      return secondsReadPort;
    } });
  await waitFor(() => correlation.module.readNativeHostDiagnosticState().applicationUsageSecondsSupported === true);
  let correlationSettled = false;
  const correlatedRead = correlation.module.requestApplicationUsage(secondsQuery).then(value => {
    correlationSettled = true;
    return value;
  });
  await waitFor(() => secondsReadPayload);
  secondsReadPayload.onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
    requestId: `${secondsReadPayload.payload.requestId}-late`, applicationUsageSeconds: { revision: 'late' } }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(correlationSettled, false, 'a mismatched nonempty seconds requestId is ignored as a late response');
  secondsReadPayload.onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
    requestId: secondsReadPayload.payload.requestId, applicationUsageSeconds: { revision: 'correlated' } }));
  assert.equal((await correlatedRead).applicationUsageSeconds.revision, 'correlated');
  const previousSecondsRequestId = secondsReadPayload.payload.requestId;
  const missingRequestIdRead = correlation.module.requestApplicationUsage(secondsQuery);
  await waitFor(() => secondsReadPayload.payload.requestId !== previousSecondsRequestId);
  secondsReadPayload.onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
    applicationUsageSeconds: { revision: 'uncorrelated' } }));
  assert.equal((await missingRequestIdRead).errorCode, 'native_invalid_response', 'a seconds response without requestId is rejected');

  const secondsPendingPayloads = [];
  const secondsPending = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      secondsPendingPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener({ ok: payload.messageType !== 'getApplicationUsageSeconds',
        receivedAt: Date.now(), requestId: payload.requestId, supportedProtocols: [1, 2, 3],
        capabilities: ['health', 'application-usage-read', 'application-usage-seconds-read-v1'],
        ...(payload.messageType === 'getApplicationUsageSeconds' ? { errorCode: 'APPLICATION_USAGE_SECONDS_PENDING' } : {}) })));
    }) });
  await waitFor(() => secondsPendingPayloads.length > 0);
  assert.equal((await secondsPending.module.requestApplicationUsage(query)).errorCode, 'application_usage_seconds_pending');
  assert.equal(secondsPendingPayloads.filter(payload => payload.messageType === 'getApplicationUsage').length, 0,
    'a seconds failure never falls back to the older millisecond DTO');

  const changingCapabilities = ['health', 'application-usage-read'];
  const capabilityPayloads = [];
  const dualCapability = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      capabilityPayloads.push(payload);
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener({
        ok: true, receivedAt: Date.now(), requestId: payload.requestId, supportedProtocols: [1, 2, 3], capabilities: changingCapabilities,
      })));
    }) });
  await dualCapability.module.requestLocalGuardianHeartbeat({ force: true });
  await waitFor(() => capabilityPayloads.length >= 2);
  assert.equal(dualCapability.runtime.messages.filter(message => message.type === 'TIMEONCHROME_APPLICATION_USAGE_AVAILABLE').length, 0,
    'retired millisecond capability does not announce current application availability');
  changingCapabilities.push('application-usage-seconds-read-v1');
  await dualCapability.module.requestLocalGuardianHeartbeat({ force: true });
  await waitFor(() => capabilityPayloads.length >= 3);
  assert.equal(dualCapability.runtime.messages.filter(message => message.type === 'TIMEONCHROME_APPLICATION_USAGE_AVAILABLE').length, 1,
    'current seconds capability notifies a page exactly once');

  // Removed schema1 mixed-state/result fixtures; current bucket and V2 lifecycle cases below preserve transport safety.
  let denied;
  appRead.runtime.onMessage.listeners[0]({ type: appRead.module.APPLICATION_USAGE_READ_MESSAGE, query },
    { id: appRead.runtime.id, url: 'https://example.test/' }, value => { denied = value; });
  assert.strictEqual(denied.errorCode, 'probe_sender_rejected');
  const appOldService = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => queueMicrotask(() =>
      onMessage.listeners.forEach(listener => listener({ ok: true, receivedAt: Date.now(),
        requestId: payload.requestId, supportedProtocols: [1, 2, 3], capabilities: ['health', 'authoritative-daily-snapshot'] })))) });
  assert.strictEqual((await appOldService.module.requestApplicationUsage(query)).errorCode, 'application_usage_unsupported');
  const pendingPayloads = [];
  const appPending = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      pendingPayloads.push(payload);
      queueMicrotask(() =>
      onMessage.listeners.forEach(listener => listener({
        ok: payload.messageType !== 'getApplicationUsageSeconds', receivedAt: Date.now(), requestId: payload.requestId,
        supportedProtocols: [1, 2, 3], capabilities: ['health', 'application-usage-seconds-read-v1'],
        ...(payload.messageType === 'getApplicationUsageSeconds' ? { errorCode: 'APPLICATION_USAGE_SECONDS_PENDING' } : {})
      })));
    }) });
  await waitFor(() => pendingPayloads.length > 0);
  assert.strictEqual((await appPending.module.requestApplicationUsage(query)).errorCode, 'application_usage_seconds_pending');
  const reconnectPorts = [], reconnectReplies = [];
  const reconnect = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => {
      const port = createPort((payload, onMessage) => {
        const reply = () => onMessage.listeners.forEach(listener => listener({ ok: true,
          receivedAt: Date.now(), requestId: payload.requestId,
          supportedProtocols: [1, 2, 3], capabilities: ['health', 'application-usage-seconds-read-v1'],
          ...(payload.messageType === 'getApplicationUsageSeconds' ? { applicationUsageSeconds: { revision: payload.requestId } } : {}) }));
        if (payload.messageType === 'getApplicationUsageSeconds') reconnectReplies.push(reply);
        else queueMicrotask(reply);
      });
      reconnectPorts.push(port);
      return port;
    } });
  assert.strictEqual((await reconnect.module.requestLocalGuardianHeartbeat({ type: 'heartbeat', force: true })).ok, true);
  await new Promise(resolve => setTimeout(resolve, 5));
  reconnectPorts[0].disconnect();
  assert.strictEqual((await reconnect.module.requestLocalGuardianHeartbeat({ type: 'heartbeat', force: true })).ok, true);
  assert.strictEqual(reconnectPorts.length, 2);
  const reconnectedRead = reconnect.module.requestApplicationUsage(query);
  await waitFor(() => reconnectReplies.length === 1);
  reconnectPorts[0].disconnect(); // A late event from the old port cannot reject the new request.
  reconnectReplies[0]();
  assert.strictEqual((await reconnectedRead).ok, true, 'old port disconnect must not reject the new application read');
  const serializedRequests = [], appResolvers = [];
  const serialized = await loadGuardian({ storage: {}, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      serializedRequests.push(payload);
      const reply = requestId => onMessage.listeners.forEach(listener => listener({ ok: true,
        receivedAt: Date.now(), requestId: requestId || payload.requestId,
        supportedProtocols: [1, 2, 3], capabilities: ['health', 'application-usage-seconds-read-v1'],
        ...(payload.messageType === 'getApplicationUsageSeconds' ? { applicationUsageSeconds: { revision: payload.requestId } } : {}) }));
      if (payload.messageType === 'getApplicationUsageSeconds') appResolvers.push(reply);
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
  assert.strictEqual((await firstApp).applicationUsageSeconds.revision, firstAppId);
  assert.strictEqual((await probeDuringApp).ok, true);
  await waitFor(() => appResolvers.length === 2);
  assert.deepStrictEqual(serializedRequests.slice(-3).map(r => r.messageType), ['getApplicationUsageSeconds', 'probe', 'getApplicationUsageSeconds']);
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
  assert(bridgeReply.applicationUsageSeconds);

  // Reproduce the real 2.6.7 week read (>3s): a health timeout must not cancel it.
  let delayedApplicationReply;
  const slowStorage = {};
  const slow = await loadGuardian({ storage: slowStorage, policy, development: true,
    connectNative: () => createPort((payload, onMessage) => {
      const reply = () => onMessage.listeners.forEach(listener => listener({ ok: true,
        receivedAt: Date.now(), requestId: payload.requestId, supportedProtocols: [1, 2, 3],
        capabilities: ['health', 'application-usage-seconds-read-v1'],
        ...(payload.messageType === 'getApplicationUsageSeconds' ? { applicationUsageSeconds: { revision: 'slow-week' } } : {}) }));
      if (payload.messageType === 'getApplicationUsageSeconds') delayedApplicationReply = reply;
      else queueMicrotask(reply);
    }) });
  const slowResult = slow.module.requestApplicationUsage(query);
  await waitFor(() => delayedApplicationReply);
  await new Promise(resolve => setTimeout(resolve, 4_400));
  assert.notStrictEqual(slowStorage.local_guardian_status_v1?.lastErrorCode, 'native_response_timeout');
  delayedApplicationReply();
  assert.strictEqual((await slowResult).applicationUsageSeconds.revision, 'slow-week');

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

  // Current V2 lifecycle/activity wire cases below replace retired schema1 fixtures.
  // Both real clients share identity, but not Port, pending ACK or business queue.
  const dualStorage = {}, dualMessages = [], dualPorts = {};
  let holdNative = true, holdGuardian = false, holdApplication = false, releaseApplication;
  const dual = await loadGuardian({ storage: dualStorage, policy, platform: 'mac',
    connectNative(host) {
      const port = createPort((payload, onMessage) => {
        dualMessages.push({ host, payload });
        if ((host === 'com.timeonchrome.nativehost' && holdNative)
          || (host === 'com.timeonchrome.guardian' && holdGuardian)) return;
        const reply = () => onMessage.listeners.forEach(fn => fn({ ok: true, requestId: payload.requestId, receivedAt: 1787160000,
          ...(host === 'com.timeonchrome.nativehost' ? { requestId: payload.requestId,
            supportedProtocols: [1, 2, 3], capabilities: ['health', 'application-usage-seconds-read-v1'],
            ...(payload.messageType === 'getApplicationUsageSeconds' ? { applicationUsageSeconds: { revision: payload.requestId } } : {}),
            acceptedIds: [], duplicateIds: [], rejected: [] } : {}) }));
        if (payload.messageType === 'getApplicationUsageSeconds' && holdApplication) releaseApplication = reply;
        else queueMicrotask(reply);
      });
      dualPorts[host] = port;
      return port;
    } });
  await waitFor(() => dualStorage.mac_guardian_health_status_v1?.lastSuccessAt > 0);
  await waitFor(() => dualMessages.some(x => x.host === 'com.timeonchrome.nativehost'));
  const oldBoot = dualMessages.find(x => x.host === 'com.timeonchrome.guardian').payload;
  const newBoot = dualMessages.find(x => x.host === 'com.timeonchrome.nativehost').payload;
  assert.strictEqual(oldBoot.profile, newBoot.profileId, 'first-run UUID must be identical across both clients');
  assert.strictEqual(oldBoot.monitoringStatus, 'booting');
  assert.strictEqual(dualStorage.local_guardian_status_v1?.lastSuccessAt ?? null, null,
    'Guardian health must never synthesize Native ACK');
  dual.module.configureLocalGuardianStateProvider(() => ({ bootstrapState: 'ready',
    activationState: { activated: true }, monitoringEnabled: 1 }));
  const ready = dual.module.notifyLocalGuardianBootstrapResult('ready');
  await waitFor(() => dualMessages.some(x => x.host === 'com.timeonchrome.guardian'
    && x.payload.monitoringStatus === 'active'));
  assert.strictEqual(dualStorage.mac_guardian_health_status_v1.lastErrorCode, null,
    'Native hang must not degrade independent local health');
  holdNative = false;
  dualPorts['com.timeonchrome.nativehost'].onMessage.listeners.forEach(fn => fn({ ok: true,
    receivedAt: 1787160000, requestId: newBoot.requestId, supportedProtocols: [3], capabilities: ['health'] }));
  await ready;
  await waitFor(() => dualStorage.local_guardian_status_v1?.lastSuccessAt > 0);
  await new Promise(resolve => setTimeout(resolve, 5));
  holdGuardian = true;
  const nativeBefore = dualMessages.filter(x => x.host === 'com.timeonchrome.nativehost').length;
  assert.strictEqual((await dual.module.notifyLocalGuardianBootstrapResult('ready', 'independence')).ok, true);
  await waitFor(() => dualMessages.filter(x => x.host === 'com.timeonchrome.nativehost').length > nativeBefore);
  dualPorts['com.timeonchrome.guardian'].disconnect();
  await waitFor(() => dualStorage.mac_guardian_health_status_v1?.lastErrorCode === 'guardian_port_disconnected');
  assert.strictEqual(dualStorage.local_guardian_status_v1.lastErrorCode, null);
  assert.strictEqual(dual.module.readNativeHostDiagnosticState().connected, true);
  assert.strictEqual((await dual.module.requestApplicationUsage(query)).ok, true,
    'Guardian failure cannot block Native business');
  holdGuardian = false; holdApplication = true;
  const business = dual.module.requestApplicationUsage(query);
  await waitFor(() => releaseApplication);
  const oldBefore = dualMessages.filter(x => x.host === 'com.timeonchrome.guardian').length;
  // Request a probe on both listeners: the Native probe queues behind its business read.
  const dualProbeResults = [];
  for (const listener of dual.runtime.onMessage.listeners) listener({ type: 'TIMEONCHROME_LOCAL_HEALTH_PROBE' },
    { id: dual.runtime.id, url: dual.runtime.getURL('health-probe.html') }, result => dualProbeResults.push(result));
  try { await waitFor(() => dualMessages.filter(x => x.host === 'com.timeonchrome.guardian').length > oldBefore); }
  catch (error) { throw Error(`${error.message}: isolated dual probe ${JSON.stringify(dualProbeResults)}`); }
  assert.strictEqual(dualMessages.filter(x => x.host === 'com.timeonchrome.guardian').at(-1).payload.type, 'probe');
  releaseApplication(); assert.strictEqual((await business).ok, true);
  await waitFor(() => dualStorage.mac_guardian_health_status_v1.lastErrorCode === null);
  assert.deepStrictEqual(Object.keys(dualStorage).filter(key => key === 'usage_segments_v1'), [],
    'health tests must not create an authoritative ledger');
  const bucketOnlyBindingPayloads = [];
  const bucketOnlyBinding = await loadGuardian({
    storage: { cloud_profile_id: 'bucket-binding-child', cloud_device_id: 'bucket-binding-device' }, policy,
    connectNative: () => createPort((payload, onMessage) => {
      bucketOnlyBindingPayloads.push(payload);
      const response = { ok: true, receivedAt: Date.now(), requestId: payload.requestId,
        supportedProtocols: [3], capabilities: ['health', 'quota-buckets-read-v1', 'shared-web-source-reusable-v2'],
        ...(payload.messageType === 'getSharedWebSourceScope' ? { sharedWebSourceScope: {
          schemaVersion: 2, keyId: 'a'.repeat(64), signature: 'A'.repeat(86), claims: {
            schemaVersion: 2, audience: 'timeonchrome:shared-web-machine-scope:v2',
            applicationSourceKey: 'e'.repeat(64), childScopeHash: 'f'.repeat(64), assignmentVersion: 1,
            issuedAtMs: Date.now(), expiresAtMs: Date.now() + 300_000,
          },
        } } : {}),
        ...(payload.messageType === 'bindSharedWebSourceV2' ? { sharedWebIdentity: {
          status: 'verified', webSourceKey: payload.payload.proof.claims.webSourceKey,
          expiresAtMs: payload.payload.proof.claims.expiresAtMs,
        } } : {}),
      };
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
    }),
  });
  assert.equal((await bucketOnlyBinding.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true })).capabilityAvailable, true);
  assert.equal(Object.hasOwn(bucketOnlyBinding.module.readNativeHostDiagnosticState(), 'applicationIdentityUsageSupported'), false);
  const bucketOnlyScope = await bucketOnlyBinding.module.requestApplicationIdentityBindingNative('getSharedWebSourceScope', {});
  assert.equal(bucketOnlyScope.ok, true, 'reusable binding must not require the unrelated application identity detail capability');
  const bucketOnlyBind = await bucketOnlyBinding.module.requestApplicationIdentityBindingNative('bindSharedWebSourceV2', {
    proof: { schemaVersion: 2, keyId: 'a'.repeat(64), signature: 'A'.repeat(86), claims: {
      schemaVersion: 2, audience: 'timeonchrome:shared-web-source:v2',
      applicationSourceKey: 'e'.repeat(64), childScopeHash: 'f'.repeat(64), assignmentVersion: 1,
      issuedAtMs: Date.now(), expiresAtMs: Date.now() + 300_000,
      webSourceKey: `web:${'b'.repeat(64)}`, bindingEpochHash: 'd'.repeat(64),
    } },
  });
  assert.equal(bucketOnlyBind.ok, true);
  assert.deepEqual(bucketOnlyBindingPayloads.filter(item => ['getSharedWebSourceScope', 'bindSharedWebSourceV2'].includes(item.messageType))
    .map(item => item.messageType), ['getSharedWebSourceScope', 'bindSharedWebSourceV2']);
  await testAutomaticBindingLifecycle(policy);
  await testAutomaticBindingLifecycle(policy, true);
  // Current application seconds is the sole application query; independent bucket exchange follows.
  {
    const child = 'synthetic-bucket-child';
    const query = { fromDate: '2026-10-07', toDate: '2026-10-07' };
    const quotaBucketRequests = [];
    let quotaFault = null;
    let bucketSources;
    const bucketSnapshot = { schemaVersion: 2, durationUnit: 'seconds', source: 'application', childId: child,
      fromDate: query.fromDate, toDate: query.toDate, readAtMs: Date.now(), days: [{ date: query.fromDate,
        bucketsSeconds: { study: 0, composite: 0, rest: 600 }, settledThroughMs: null, complete: true, reasonCodes: [] }] };
    const bucketHost = await loadGuardian({ policy,
      storage: { cloud_profile_id: child, cloud_device_id: 'synthetic-bucket-device' },
      connectNative: () => createPort((request, onMessage) => {
        quotaBucketRequests.push(request);
        const response = { ok: true, receivedAt: Date.now(), requestId: request.requestId, supportedProtocols: [3],
          capabilities: ['health', 'quota-buckets-read-v1', 'quota-buckets-sources-v1'] };
        if (request.messageType === 'exchangeQuotaBuckets') {
          response.applicationSources = structuredClone(bucketSources);
          response.applicationUsage = quotaFault === 'missing' ? null : structuredClone(bucketSnapshot);
          if (quotaFault === 'child') response.applicationUsage.childId = 'different-child';
          if (quotaFault === 'unit') response.applicationUsage.durationUnit = 'milliseconds';
          if (quotaFault === 'date') response.applicationUsage.toDate = '1970-01-01';
          if (quotaFault === 'requestId') response.requestId = null;
          if (quotaFault === 'service') { response.ok = false; response.errorCode = 'SOURCE_STATISTICS_CONTEXT_CHANGED'; }
          if (quotaFault?.startsWith('service:')) { response.ok = false; response.errorCode = quotaFault.slice(8); }
        }
        queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
      }) });
    await waitFor(() => bucketHost.module.readNativeHostDiagnosticState().capabilities?.includes('quota-buckets-read-v1'));
    installSourceBinding(bucketHost);
    bucketHost.module.setApplicationIdentityBindingEnsurer(async () => { throw Error('hot read must not prepare identity'); });
    const bucketQuery = { fromDate: query.fromDate, toDate: query.toDate, webUsage: null };
    const bucketsRead = await bucketHost.module.requestQuotaBucketsExchange(bucketQuery);
    assert.equal(bucketsRead.ok, true);
    assert.equal(bucketsRead.snapshot.days[0].bucketsSeconds.rest, 600);
    assert.equal(bucketsRead.nativeAttempt.accepted, true);
    assert.equal(bucketsRead.applicationSources, null, 'missing optional sources keeps the combined response usable');
    for (const otherState of ['none', 'unknown', 'available']) {
      bucketSources = { local: structuredClone(bucketSnapshot), other: otherState === 'available' ? structuredClone(bucketSnapshot) : null, otherState };
      const explained = await bucketHost.module.requestQuotaBucketsExchange(bucketQuery);
      assert.equal(explained.ok, true);
      assert.deepEqual(explained.applicationSources, bucketSources);
      assert.equal(explained.snapshot.days[0].bucketsSeconds.rest, 600, 'sidecar never adds to the combined usage');
    }
    for (const malformed of [
      { ...bucketSources, otherState: 'none' },
      { ...bucketSources, local: { ...bucketSnapshot, childId: 'wrong-child' } },
      { ...bucketSources, local: { ...bucketSnapshot, toDate: '1970-01-01' } },
      { ...bucketSources, privateToken: 'not-allowed' },
    ]) {
      bucketSources = malformed;
      const explained = await bucketHost.module.requestQuotaBucketsExchange(bucketQuery);
      assert.equal(explained.ok, true, 'invalid optional sources cannot reject a valid combined snapshot');
      assert.equal(explained.applicationSources, null);
    }
    bucketSources = undefined;
    assert.deepEqual(quotaBucketRequests.find(row => row.messageType === 'exchangeQuotaBuckets').payload, bucketQuery);
    const requestsAfterReady = quotaBucketRequests.length;
    assert.equal((await bucketHost.module.requestQuotaBucketsExchange(bucketQuery)).ok, true);
    assert.deepEqual(quotaBucketRequests.slice(requestsAfterReady).map(row => row.messageType), ['exchangeQuotaBuckets'],
      'a ready hot read only exchanges buckets, without Scope/Bind or health re-preparation');
    assert.deepEqual(bucketHost.module.readQuotaBucketsReadCapability(), { known: true, available: true });
    quotaFault = 'missing';
    const missingBuckets = await bucketHost.module.requestQuotaBucketsExchange(bucketQuery);
    assert.equal(missingBuckets.ok, true);
    assert.equal(missingBuckets.snapshot, null);
    assert.equal(missingBuckets.missing, true);
    for (quotaFault of ['child', 'unit', 'date', 'requestId', 'service']) {
      const result = await bucketHost.module.requestQuotaBucketsExchange(bucketQuery);
      assert.equal(result.ok, false, quotaFault);
      assert.equal(result.errorCode, quotaFault === 'service' ? 'SOURCE_STATISTICS_CONTEXT_CHANGED'
        : 'source_statistics_native_invalid_response');
    }
    for (const code of ['QUOTA_BUCKETS_INVALID', 'QUOTA_BUCKETS_CONTEXT_CHANGED', 'QUOTA_BUCKETS_STALE',
      'QUOTA_BUCKETS_UNAVAILABLE', 'QUOTA_BUCKETS_TIMEOUT', 'QUOTA_BUCKETS_REDIRECTED', 'QUOTA_BUCKETS_RESPONSE_TOO_LARGE']) {
      quotaFault = 'service:' + code;
      const rejected = await bucketHost.module.requestQuotaBucketsExchange(bucketQuery);
      assert.equal(rejected.errorCode, code);
      assert.equal(rejected.nativeAttempt.sent, true);
      assert.equal(rejected.nativeAttempt.responseReceived, true);
    }
    const legacyBuckets = await loadGuardian({ policy,
      storage: { cloud_profile_id: child }, connectNative: () => createPort((request, onMessage) => {
        queueMicrotask(() => onMessage.listeners.forEach(listener => listener({ ok:true,
          receivedAt:Date.now(), requestId:request.requestId, supportedProtocols:[3],
          capabilities:['health','source-statistics-read-v1'] })));
      }) });
    await legacyBuckets.module.requestLocalGuardianHeartbeat({force:true});
    const legacyRejection = await legacyBuckets.module.requestQuotaBucketsExchange(bucketQuery);
    assert.equal(legacyRejection.errorCode, 'source_statistics_native_unsupported');
    assert.equal(legacyRejection.nativeAttempt.sent, false, 'retired capability cannot impersonate current buckets');
    const bucketWire = JSON.parse(fs.readFileSync(process.env.TOC_NATIVE_QUOTA_BUCKETS_WIRE
      || path.join(__dirname, '../fixtures/native-quota-buckets-dispatcher.json'), 'utf8'))[0];
    const producerBuckets = await loadGuardian({ policy,
      storage: { cloud_profile_id: bucketWire.response.applicationUsage.childId, cloud_device_id: 'synthetic-producer-device' },
      connectNative: () => createPort((request, onMessage) => {
        const response = request.messageType === 'exchangeQuotaBuckets' ? structuredClone(bucketWire.response)
          : { ok: true, supportedProtocols: [3], capabilities: ['health', 'quota-buckets-read-v1'] };
        response.requestId = request.requestId; response.receivedAt = Date.now();
        queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
      }) });
    await waitFor(() => producerBuckets.module.readNativeHostDiagnosticState().capabilities?.includes('quota-buckets-read-v1'));
    installSourceBinding(producerBuckets);
    const producerResult = await producerBuckets.module.requestQuotaBucketsExchange(bucketWire.request.payload);
    assert.equal(producerResult.ok, true, 'actual new Dispatcher/RuntimeJson wire must be accepted without stage or revision');
    assert.deepEqual(producerResult.snapshot, bucketWire.response.applicationUsage);
    if (process.env.TOC_NATIVE_QUOTA_SOURCES_WIRE) {
      const sourcesWire = JSON.parse(fs.readFileSync(process.env.TOC_NATIVE_QUOTA_SOURCES_WIRE, 'utf8'));
      for (const supportsSources of [true, false]) {
        const wireHost = await loadGuardian({ policy,
          storage: { cloud_profile_id: sourcesWire.applicationUsage.childId, cloud_device_id: 'synthetic-sources-device' },
          connectNative: () => createPort((request, onMessage) => {
            const response = request.messageType === 'exchangeQuotaBuckets' ? structuredClone(sourcesWire)
              : { ok: true, supportedProtocols: [3], capabilities: ['health', 'quota-buckets-read-v1',
                ...(supportsSources ? ['quota-buckets-sources-v1'] : [])] };
            response.requestId = request.requestId; response.receivedAt = Date.now();
            queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
          }) });
        await waitFor(() => wireHost.module.readNativeHostDiagnosticState().capabilities?.includes('quota-buckets-read-v1'));
        installSourceBinding(wireHost);
        const actual = await wireHost.module.requestQuotaBucketsExchange({ fromDate: sourcesWire.applicationUsage.fromDate,
          toDate: sourcesWire.applicationUsage.toDate, webUsage: null });
        assert.equal(actual.ok, true);
        assert.deepEqual(actual.snapshot, sourcesWire.applicationUsage);
        assert.deepEqual(actual.applicationSources, supportsSources ? sourcesWire.applicationSources : null,
          'same actual Host response is accepted only as negotiated source explanation');
      }
      console.log('[Actual Dispatcher/Host source sidecar replay] new capability accepted; old capability ignores sidecar PASS');
    }
    console.log('[Source statistics C# wire replay] success, child/date/unit/requestId/connection checks passed');
  }
  const v2PolicyIdentity = { schemaVersion: 2, revision: 'profile-config:1', effectiveAtMs: 0,
    stage: 'shared', policyHash: 'a'.repeat(64) };
  const v2State = { schemaVersion: 2, roundId: 'v2-round', reminderId: 'v2-reminder', deliveryId: 'v2-delivery',
    policyRevision: 'profile-config:1', stateRevision: 'v2-state', date: '2026-10-16', kinds: ['entry'],
    presenter: 'browser', stage: 'shared', issuedAtMs: 1000, offerExpiresAtMs: 100000,
    visibleAtMs: null, responseDeadlineSeconds: 60, timeoutAction: 'end', status: 'offered', resolution: null,
    policyIdentity: v2PolicyIdentity, ruleScopeKey: 'b'.repeat(64), reasonCodes: ['timeWindow'],
    forcedUsageSeconds: 0, confirmedAtUsageSeconds: null };
  let wrongRetiredRound = false;
  const v2Messages = [];
  const v2Host = await loadGuardian({
    storage: { cloud_profile_id: 'v2-child', cloud_device_id: 'v2-device' }, policy,
    connectNative: () => createPort((payload, onMessage) => {
      v2Messages.push(payload);
      const response = { ok: true, requestId: payload.requestId, receivedAt: Date.now(), supportedProtocols: [3],
        capabilities: ['health', 'shared-access-policy-v2', 'shared-forced-use-runtime-v2'], browserActivityLeaseId: 'v2-lease' };
      if (payload.messageType === 'reportBrowserActivity') response.browserActivityAck = {
        schemaVersion: 2, leaseId: payload.payload.leaseId, acceptedSequence: payload.payload.sequence,
        duplicate: false, stale: false, ownership: 'accepted',
        retiredIndependentRoundId: wrongRetiredRound ? 'wrong-round' : payload.payload.independentRoundId };
      if (payload.messageType === 'getSharedReminderState') response.sharedReminder = v2State;
      queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
    }),
  });
  await waitFor(() => v2Host.module.readNativeHostDiagnosticState().capabilities?.includes('shared-forced-use-runtime-v2'));
  v2Host.module.configureSharedQuotaNativeBridge({ enabled: true });
  assert.equal(v2Host.module.getSharedBrowserActivityLease(), 'v2-lease');
  const v2Activity = { schemaVersion: 2, leaseId: 'v2-lease', activityId: 'v2-activity', sequence: 1,
    status: 'active', quotaBucket: 'composite', presentationEligible: true, policyIdentity: v2PolicyIdentity,
    ruleScopeKey: 'b'.repeat(64), reasonCodes: ['timeWindow'], independentRoundId: 'old-independent-round' };
  const v2Accepted = await v2Host.module.reportSharedBrowserActivity(v2Activity);
  assert.equal(v2Accepted.ok, true);
  assert.equal(v2Accepted.receipt.ownership, 'accepted');
  wrongRetiredRound = true;
  assert.equal((await v2Host.module.reportSharedBrowserActivity({ ...v2Activity, sequence: 2 })).ok, false,
    'Service must confirm the exact retired independent round');
  assert.equal((await v2Host.module.requestSharedReminderLifecycle('getSharedReminderState',
    { schemaVersion: 2, date: '2026-10-16' })).state.schemaVersion, 2);
  assert.equal((await v2Host.module.requestSharedReminderLifecycle('getSharedReminderState',
    { date: '2026-10-16' })).ok, false, 'V1 request cannot use V2 capability as a fallback');
  assert.deepEqual(v2Messages.find(message => message.messageType === 'getSharedReminderState').payload,
    { schemaVersion: 2, date: '2026-10-16' });
  if (process.env.TOC_NATIVE_V2_WIRE_SEQUENCE) {
    const wire = JSON.parse(fs.readFileSync(process.env.TOC_NATIVE_V2_WIRE_SEQUENCE, 'utf8'));
    const health = wire.find(row => row.response?.browserActivityLeaseId);
    let replayResponse = null;
    const replayHost = await loadGuardian({
      storage: { cloud_profile_id: 'isolated-wire-child', cloud_device_id: 'isolated-wire-device' }, policy,
      connectNative: () => createPort((payload, onMessage) => {
        const sourceReply = ['probe', 'heartbeat'].includes(payload.messageType) ? health.response : replayResponse;
        if (!sourceReply) throw Error('unexpected replay request');
        const response = structuredClone(sourceReply);
        response.requestId = payload.requestId; response.receivedAt = Date.now();
        queueMicrotask(() => onMessage.listeners.forEach(listener => listener(response)));
      }),
    });
    await waitFor(() => replayHost.module.readNativeHostDiagnosticState().capabilities?.includes('shared-forced-use-runtime-v2'));
    replayHost.module.configureSharedQuotaNativeBridge({ enabled: true });
    let replayed = 0;
    for (const row of wire.filter(item => item.request.channel === 'sharedQuota')) {
      replayResponse = row.response;
      const result = row.request.messageType === 'reportBrowserActivity'
        ? await replayHost.module.reportSharedBrowserActivity(row.request.payload)
        : await replayHost.module.requestSharedReminderLifecycle(row.request.messageType, row.request.payload);
      assert.equal(result.ok, row.response.ok, row.request.messageType + ': actual C# response must pass the production consumer');
      replayed++;
    }
    console.log('[Native V2 C# wire replay] ' + replayed + ' actual responses accepted by production client');
  }
  console.log('[Local Guardian] passed');
  process.exit(0);
}

async function runNativeProcess() {
  const config = JSON.parse(process.env.TOC_NATIVE_PROCESS_CONFIG);
  assert.equal(typeof config.command, 'string');
  assert(Array.isArray(config.args) && config.args.every(value => typeof value === 'string'));
  const { spawn } = require('node:child_process');
  const children = [], ports = [], requests = [], errors = [], diagnostics = [];
  let processArgs = config.args;
  function connectNative() {
    const child = spawn(config.command, processArgs, { cwd: config.cwd || root,
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(child);
    let pending = Buffer.alloc(0), disconnected = false, diagnosticText = '';
    const onMessage = createEvent(), onDisconnect = createEvent();
    const disconnect = () => {
      if (disconnected) return;
      disconnected = true;
      child.stdin.destroy(); child.kill();
      onDisconnect.listeners.forEach(listener => listener());
    };
    child.stderr.on('data', bytes => {
      const text = bytes.toString('utf8');
      errors.push(text); if (errors.length > 8) errors.shift();
      diagnosticText += text;
      let newline;
      while ((newline = diagnosticText.indexOf('\n')) >= 0) {
        const line = diagnosticText.slice(0, newline).trim();
        diagnosticText = diagnosticText.slice(newline + 1);
        try {
          const value = JSON.parse(line);
          if (['harness_ready', 'response'].includes(value.eventName)) diagnostics.push(value);
          if (diagnostics.length > 120) diagnostics.shift();
        } catch (_) { /* Build output is not a Native frame or harness diagnostic. */ }
      }
      if (diagnosticText.length > 8192) diagnosticText = diagnosticText.slice(-8192);
    });
    child.on('error', error => { errors.push(error.code || 'spawn_failed'); disconnect(); });
    child.on('exit', disconnect);
    child.stdin.on('error', disconnect);
    child.stdout.on('data', bytes => {
      pending = Buffer.concat([pending, bytes]);
      while (pending.length >= 4) {
        const size = pending.readUInt32LE(0);
        if (!size || size > 8 * 1024 * 1024) { errors.push('invalid_native_frame_length'); disconnect(); return; }
        if (pending.length < size + 4) return;
        let value;
        try { value = JSON.parse(pending.subarray(4, size + 4).toString('utf8')); }
        catch (_) { errors.push('invalid_native_frame_json'); disconnect(); return; }
        pending = pending.subarray(size + 4);
        onMessage.listeners.forEach(listener => listener(value));
      }
    });
    const port = { onMessage, onDisconnect, disconnect, postMessage(value) {
      assert.equal(disconnected, false, 'cannot send to an exited Native process');
      requests.push({ messageType: value.messageType, protocolVersion: value.protocolVersion });
      const body = Buffer.from(JSON.stringify(value)), length = Buffer.alloc(4);
      length.writeUInt32LE(body.length);
      child.stdin.write(Buffer.concat([length, body]));
    } };
    ports.push(port);
    return port;
  }
  try {
    const childId = config.childId || 'child', day = config.date || '2026-10-17';
    const expectedRest = config.expectedRestSeconds ?? 600;
    const host = await loadGuardian({ storage: { cloud_profile_id: childId,
      cloud_device_id: 'isolated-process-device' }, policy: { enabled: true, deploymentMode: 'managed',
      cloudEndpoint: 'https://isolated.invalid', managedDeviceToken: 'synthetic-token',
      managedProfileEmail: 'synthetic@example.invalid' }, connectNative });
    installSourceBinding(host);
    host.module.setApplicationIdentityBindingEnsurer(async () => { throw Error('hot bucket read cannot prepare identity'); });
    const contract = globalThis.__GUARDIAN_QUOTA_BUCKETS_CONTRACT;
    const source = fs.readFileSync(path.join(root, 'extension/infra/source-statistics-shadow.js'), 'utf8')
      .replace(/^import .*;\r?\n/gm, '');
    globalThis.__processBucketContract = contract;
    const consumer = await import('data:text/javascript;base64,' + Buffer.from(
      'const sourceStatisticsContract=globalThis.__processBucketContract;\n'
      + 'const {PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY,isProfileAccountShadowScopeCurrent}=globalThis.__GUARDIAN_PROFILE_SCOPE;\n' + source).toString('base64'));
    const stored = {};
    let cloudReads = 0;
    const reader = consumer.createSourceStatisticsShadow({ isEnabled: () => true,
      now: Date.now,
      readContext: async () => ({ apiBase: 'https://isolated.invalid', deviceToken: 'synthetic-token', childId,
        scopeHash: 'synthetic-process-scope' }),
      readModel: async ({ date }) => ({ ok: true, date,
        usage: { studySeconds: 0, compositeSeconds: 0, restSeconds: 600 }, completeness: { complete: true } }),
      storage: { get: async key => ({ [key]: stored[key] }) },
      write: async values => { Object.assign(stored, structuredClone(values)); return { ok: true }; },
      nativeContext: options => host.module.readSourceStatisticsNativeContext(options),
      nativeExchange: request => host.module.requestQuotaBucketsExchange(request),
      cloudRead: () => { cloudReads++; return new Promise(() => {}); } });
    async function refresh() {
      let timer;
      return Promise.race([reader.refresh({ force: true }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('real Native read timed out; stderr=' + errors.join('').slice(-1000))), 15000);
      })]).finally(() => clearTimeout(timer));
    }
    const result = await refresh();
    assert.equal(result.ok, true, JSON.stringify(result));
    const usage = await reader.readSources(day);
    assert.equal(usage.sourceStatistics.web.days.find(row => row.date === day).bucketsSeconds.rest, 600);
    assert.equal(usage.sourceStatistics.application.days.find(row => row.date === day).bucketsSeconds.rest, expectedRest);
    assert.equal(cloudReads, 0, 'local exchange must not enter a permanently pending cloud fallback');
    assert.equal(requests.filter(row => row.messageType === 'exchangeQuotaBuckets').length, 1);
    await waitFor(() => diagnostics.some(row => row.eventName === 'response'
      && row.messageType === 'exchangeQuotaBuckets'), 2000);
    const ready = diagnostics.find(row => row.eventName === 'harness_ready');
    assert.equal(ready?.syntheticOnly, true);
    assert.equal(ready.sharedEnabled, false);
    assert.equal(ready.cloudPending, true, 'actual Native background cloud request remains pending');
    const responses = diagnostics.filter(row => row.eventName === 'response');
    if (config.requireActualHost === true) {
      assert(responses.length > 0 && responses.every(row => row.actualHost === true),
        'every observed response must pass through the actual Native Host and isolated pipe');
    }
    const cloudCalls = responses[0].cloudCalls;
    assert(Number.isInteger(cloudCalls) && cloudCalls > 0);
    assert(responses.every(row => row.cloudPending === true && row.cloudCalls === cloudCalls),
      'actual Dispatcher exchanges do not start or wait for another cloud refresh');
    assert(!requests.some(row => ['getSharedWebSourceScope', 'bindSharedWebSourceV2',
      'replaceSharedWebContribution', 'replaceSharedWebContributionV2'].includes(row.messageType)));
    const dailyMinutes = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      .map(key => [key, { study: null, composite: null, rest: null }]));
    const projected = contract.projectQuotaBucketsSeconds({ dailyMinutes }, day,
      usage.sourceStatistics.web, usage.sourceStatistics.application);
    assert.equal(projected.usedSeconds.rest, config.expectedCombinedRestSeconds ?? 1200,
      'production contract combines the independently read sources');
    if (config.fullScenario === true) {
      const observed = [expectedRest];
      for (const expected of [100, 100]) {
        assert.equal((await refresh()).ok, true);
        const current = await reader.readSources(day);
        const actual = current.sourceStatistics.application.days.find(row => row.date === day).bucketsSeconds.rest;
        observed.push(actual);
        assert.equal(actual, expected, 'decreased application data replaces, not accumulates');
        assert.equal(contract.projectQuotaBucketsSeconds({ dailyMinutes }, day,
          current.sourceStatistics.web, current.sourceStatistics.application).usedSeconds.rest, 700);
        await waitFor(() => diagnostics.filter(row => row.eventName === 'response'
          && row.messageType === 'exchangeQuotaBuckets' && row.ok === true).length >= observed.length, 2000);
      }
      const oldContext = await host.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
      assert.equal(oldContext.ok, true);
      ports.at(-1).disconnect();
      const newContext = await host.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
      assert.equal(newContext.ok, true);
      assert.notEqual(newContext.connectionGeneration, oldContext.connectionGeneration);
      const query = { fromDate: usage.sourceStatistics.web.fromDate, toDate: usage.sourceStatistics.web.toDate,
        webUsage: usage.sourceStatistics.web };
      const sentBeforeStale = requests.length;
      const stale = await host.module.requestQuotaBucketsExchange({ ...query, expectedContextId: oldContext.contextId });
      assert.equal(stale.ok, false);
      assert.equal(stale.errorCode, 'source_statistics_native_context_changed');
      assert.equal(requests.length, sentBeforeStale, 'old context never reaches the new process');
      installSourceBinding(host);
      const reconnected = await host.module.requestQuotaBucketsExchange({ ...query, expectedContextId: newContext.contextId });
      assert.equal(reconnected.ok, true, JSON.stringify(reconnected));
      assert.equal(reconnected.snapshot.days.find(row => row.date === day).bucketsSeconds.rest, expectedRest);
      await waitFor(() => diagnostics.filter(row => row.eventName === 'response'
        && row.messageType === 'exchangeQuotaBuckets' && row.ok === true).length >= 4, 2000);
      const wrongChild = structuredClone(query.webUsage); wrongChild.childId = 'different-synthetic-child';
      const sentBeforeInvalid = requests.length;
      const invalid = await host.module.requestQuotaBucketsExchange({ ...query, webUsage: wrongChild });
      assert.equal(invalid.errorCode, 'source_statistics_native_invalid_request');
      assert.equal(requests.length, sentBeforeInvalid, 'production JS contract rejects wrong child before transport');
      host.module.setApplicationIdentityBindingReader(async () => ({ ok: true,
        bindingContextId: 'c'.repeat(64), expiresAtMs: Date.now() - 1 }));
      const expired = await host.module.requestQuotaBucketsExchange(query);
      assert.equal(expired.ok, false);
      assert.equal(expired.nativeAttempt.sent, false, 'expired fixture receipt is rejected by real client');
      processArgs = [...config.args, '--proof', 'expired'];
      ports.at(-1).disconnect();
      const expiredContext = await host.module.readSourceStatisticsNativeContext({ prepare: true, quotaBuckets: true });
      assert.equal(expiredContext.ok, true);
      installSourceBinding(host);
      const nativeExpired = await host.module.requestQuotaBucketsExchange({ ...query, expectedContextId: expiredContext.contextId });
      assert.equal(nativeExpired.ok, false);
      assert.equal(nativeExpired.nativeAttempt.sent, true);
      assert.equal(nativeExpired.nativeAttempt.responseReceived, true);
      assert.equal(nativeExpired.errorCode, 'QUOTA_BUCKETS_CONTEXT_CHANGED', 'actual Dispatcher rejects expired fixture context');
      // Rejection can close the Port before the test process writes its trailing stderr line.
      // The four successful exchanges must have metadata; rejection is proven by the actual response above.
      await waitFor(() => diagnostics.filter(row => row.eventName === 'response'
        && row.messageType === 'exchangeQuotaBuckets' && row.ok === true).length >= 4, 2000);
      assert(diagnostics.filter(row => row.eventName === 'response').every(row => row.cloudPending === true
        && row.cloudCalls === cloudCalls), 'all observed Native response metadata retain the pending cloud call');
      assert.equal(cloudReads, 0);
      console.log('[Native process extended] decline/repeat/reconnect/stale JS context/wrong JS child/expired JS receipt/expired Native fixture PASS',
        JSON.stringify({ observed, oldGeneration: oldContext.connectionGeneration,
          newGeneration: newContext.connectionGeneration, cloudReads, nativeCloudCallsPerProcess: cloudCalls }));
    }
    if (config.requireActualHost === true) {
      assert(diagnostics.filter(row => row.eventName === 'response').every(row => row.actualHost === true),
        'reconnected and rejected responses must retain the actual Host boundary');
    }
    console.log(config.requireActualHost === true
      ? '[Native process] actual Host/isolated pipe/Dispatcher/framing and production consumer PASS'
      : '[Native process] actual Dispatcher framing, cold handshake, bucket exchange and source consumer PASS',
      JSON.stringify({ webRest: 600, applicationRest: expectedRest, cloudReads,
        nativeCloudCalls: cloudCalls, nativeCloudPending: true, requests }));
  } finally {
    for (const child of children) { child.stdin.destroy(); child.kill(); }
  }
}

(process.env.TOC_NATIVE_PROCESS_CONFIG ? runNativeProcess() : run()).catch((error) => {
  console.error(error);
  process.exit(1);
});
