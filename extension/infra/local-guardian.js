// infra/local-guardian.js - managed-only Native Messaging health signal.

import { MANAGED_POLICY_KEYS, readManagedActivationPolicy } from '../core/activation-gate.js';
import { readManagedDeploymentMarker } from '../core/deployment-mode.js';
import { budgetedLocalSet } from './storage-budget.js';

export const LOCAL_GUARDIAN_HOST = 'com.timeonchrome.guardian';
export const LOCAL_GUARDIAN_ALARM = 'timeonchromeLocalGuardianHeartbeat';
export const LOCAL_GUARDIAN_PROBE_MESSAGE = 'TIMEONCHROME_LOCAL_HEALTH_PROBE';
export const LOCAL_GUARDIAN_PROFILE_KEY = 'local_guardian_profile_uuid_v1';
export const LOCAL_GUARDIAN_STATUS_KEY = 'local_guardian_status_v1';

const HEARTBEAT_INTERVAL_MS = 60_000;
const SCHEDULE_DEDUP_MS = 55_000;
const NATIVE_RESPONSE_TIMEOUT_MS = 3_000;
const PROBE_COOLDOWN_MS = 5_000;
const VALID_MONITORING_STATUSES = new Set([
  'booting',
  'active',
  'degraded',
  'disabled_by_policy',
  'privacy_consent_required',
]);

let stateProvider = () => ({ bootstrapState: 'booting' });
let nativePort = null;
let heartbeatTimer = null;
let pendingAck = null;
let activeSendPromise = null;
let queuedHeartbeat = null;
let queuedProbe = null;
let lastScheduledAttemptAt = 0;
let lastProbeAt = 0;
let persistedStatus = null;

function safeNow() {
  return Date.now();
}

function validUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createUuid() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function canonicalizePolicyValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizePolicyValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalizePolicyValue(value[key]);
      return result;
    }, {});
}

export function sanitizeManagedPolicyForHash(raw = {}) {
  return MANAGED_POLICY_KEYS
    .slice()
    .sort()
    .reduce((result, key) => {
      if (key === 'managedDeviceToken') {
        result[key] = typeof raw?.[key] === 'string' && raw[key].trim().length > 0;
      } else if (Object.prototype.hasOwnProperty.call(raw || {}, key)) {
        result[key] = canonicalizePolicyValue(raw[key]);
      }
      return result;
    }, {});
}

export async function hashManagedPolicy(raw = {}) {
  const canonical = JSON.stringify(canonicalizePolicyValue(sanitizeManagedPolicyForHash(raw)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function resolveLocalGuardianMonitoringStatus(snapshot = {}) {
  if (snapshot.bootstrapState === 'booting') return 'booting';
  if (snapshot.bootstrapState === 'failed' || snapshot.healthReadFailed === true) return 'degraded';

  const activation = snapshot.activationState;
  if (!activation || typeof activation !== 'object') return 'degraded';
  if (activation.privacyConsentRequired === true) return 'privacy_consent_required';
  if (activation.activated !== true || snapshot.monitoringEnabled === 0) return 'disabled_by_policy';
  return snapshot.bootstrapState === 'ready' ? 'active' : 'degraded';
}

export function configureLocalGuardianStateProvider(provider) {
  stateProvider = typeof provider === 'function' ? provider : stateProvider;
}

async function getOrCreateProfileUuid() {
  const stored = await chrome.storage.local.get(LOCAL_GUARDIAN_PROFILE_KEY);
  if (validUuid(stored?.[LOCAL_GUARDIAN_PROFILE_KEY])) return stored[LOCAL_GUARDIAN_PROFILE_KEY];

  const candidate = createUuid();
  await budgetedLocalSet({ [LOCAL_GUARDIAN_PROFILE_KEY]: candidate }, {
    priority: 'critical',
    source: 'local_guardian_profile',
  });
  const confirmed = await chrome.storage.local.get(LOCAL_GUARDIAN_PROFILE_KEY);
  if (!validUuid(confirmed?.[LOCAL_GUARDIAN_PROFILE_KEY])) throw new Error('profile_uuid_unavailable');
  return confirmed[LOCAL_GUARDIAN_PROFILE_KEY];
}

async function loadPersistedStatus() {
  if (persistedStatus) return persistedStatus;
  const stored = await chrome.storage.local.get(LOCAL_GUARDIAN_STATUS_KEY).catch(() => ({}));
  const raw = stored?.[LOCAL_GUARDIAN_STATUS_KEY];
  persistedStatus = raw && typeof raw === 'object' ? {
    lastAttemptAt: Number(raw.lastAttemptAt) || null,
    lastSuccessAt: Number(raw.lastSuccessAt) || null,
    lastAckReceivedAt: Number(raw.lastAckReceivedAt) || null,
    lastErrorCode: typeof raw.lastErrorCode === 'string' ? raw.lastErrorCode.slice(0, 64) : null,
    consecutiveFailures: Math.max(0, Math.min(9999, Number(raw.consecutiveFailures) || 0)),
    portConnected: raw.portConnected === true,
    lastTrigger: typeof raw.lastTrigger === 'string' ? raw.lastTrigger.slice(0, 64) : null,
  } : {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastAckReceivedAt: null,
    lastErrorCode: null,
    consecutiveFailures: 0,
    portConnected: false,
    lastTrigger: null,
  };
  return persistedStatus;
}

async function persistStatus(patch) {
  try {
    const previous = await loadPersistedStatus();
    persistedStatus = { ...previous, ...patch };
    await budgetedLocalSet({ [LOCAL_GUARDIAN_STATUS_KEY]: persistedStatus }, {
      priority: 'diagnostic',
      source: 'local_guardian_status',
    });
  } catch (_) {
    // Local guardian diagnostics must never affect extension behavior.
  }
}

function normalizeErrorCode(value) {
  const allowed = new Set([
    'native_host_unavailable',
    'native_port_disconnected',
    'native_response_timeout',
    'native_invalid_response',
    'native_post_failed',
    'managed_marker_unavailable',
    'policy_read_failed',
    'profile_uuid_unavailable',
    'heartbeat_build_failed',
  ]);
  return allowed.has(value) ? value : 'heartbeat_build_failed';
}

function stopHeartbeatTimer() {
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeatTimer() {
  if (heartbeatTimer !== null) return;
  heartbeatTimer = setInterval(() => {
    requestLocalGuardianHeartbeat({ trigger: 'native_port_timer' }).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
}

function rejectPendingAck(errorCode) {
  if (!pendingAck) return;
  const current = pendingAck;
  pendingAck = null;
  clearTimeout(current.timeoutId);
  current.reject(new Error(normalizeErrorCode(errorCode)));
}

function disconnectPort() {
  const port = nativePort;
  nativePort = null;
  stopHeartbeatTimer();
  try {
    port?.disconnect();
  } catch (_) {
    // Best effort only.
  }
}

function ensureNativePort() {
  if (nativePort) return nativePort;
  let port;
  try {
    port = chrome.runtime.connectNative(LOCAL_GUARDIAN_HOST);
  } catch (_) {
    throw new Error('native_host_unavailable');
  }
  if (!port?.postMessage || !port?.onMessage?.addListener || !port?.onDisconnect?.addListener) {
    throw new Error('native_host_unavailable');
  }

  nativePort = port;
  port.onMessage.addListener((response) => {
    if (!pendingAck) return;
    if (response?.ok !== true || !Number.isFinite(response.receivedAt)) {
      rejectPendingAck('native_invalid_response');
      disconnectPort();
      return;
    }
    const current = pendingAck;
    pendingAck = null;
    clearTimeout(current.timeoutId);
    current.resolve({ ok: true, receivedAt: response.receivedAt });
  });
  port.onDisconnect.addListener(() => {
    if (nativePort === port) nativePort = null;
    stopHeartbeatTimer();
    const hadPendingAck = pendingAck !== null;
    rejectPendingAck('native_port_disconnected');
    if (!hadPendingAck) persistStatus({ portConnected: false }).catch(() => {});
  });
  startHeartbeatTimer();
  return port;
}

function postToNativeHost(payload) {
  const port = ensureNativePort();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!pendingAck || pendingAck.timeoutId !== timeoutId) return;
      pendingAck = null;
      disconnectPort();
      reject(new Error('native_response_timeout'));
    }, NATIVE_RESPONSE_TIMEOUT_MS);
    pendingAck = { resolve, reject, timeoutId };
    try {
      port.postMessage(payload);
    } catch (_) {
      pendingAck = null;
      clearTimeout(timeoutId);
      disconnectPort();
      reject(new Error('native_post_failed'));
    }
  });
}

async function buildHeartbeatPayload({ type, monitoringStatus }) {
  const [profile, managedRead] = await Promise.all([
    getOrCreateProfileUuid(),
    readManagedActivationPolicy().catch(() => ({ available: false, raw: {} })),
  ]);
  const policyHash = await hashManagedPolicy(managedRead.raw || {});
  let snapshot;
  try {
    snapshot = await Promise.resolve(stateProvider());
  } catch (_) {
    snapshot = { bootstrapState: 'ready', healthReadFailed: true };
  }
  const status = monitoringStatus || resolveLocalGuardianMonitoringStatus({
    ...(snapshot || {}),
    healthReadFailed: snapshot?.healthReadFailed === true || managedRead?.available !== true,
  });
  if (!VALID_MONITORING_STATUSES.has(status)) throw new Error('heartbeat_build_failed');

  return {
    type,
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    profile,
    incognito: chrome.extension?.inIncognitoContext === true,
    policyHash,
    monitoringStatus: status,
    timestamp: safeNow(),
  };
}

async function performSend(options) {
  const trigger = String(options.trigger || 'unspecified').slice(0, 64);
  const attemptedAt = safeNow();

  try {
    const payload = await buildHeartbeatPayload(options);
    const ack = await postToNativeHost(payload);
    await persistStatus({
      lastAttemptAt: attemptedAt,
      lastSuccessAt: safeNow(),
      lastAckReceivedAt: ack.receivedAt,
      lastErrorCode: null,
      consecutiveFailures: 0,
      portConnected: true,
      lastTrigger: trigger,
    });
    return { ok: true, receivedAt: ack.receivedAt };
  } catch (error) {
    const code = normalizeErrorCode(error?.message);
    const current = await loadPersistedStatus().catch(() => ({ consecutiveFailures: 0 }));
    await persistStatus({
      lastAttemptAt: attemptedAt,
      lastErrorCode: code,
      consecutiveFailures: Math.min(9999, (Number(current?.consecutiveFailures) || 0) + 1),
      portConnected: nativePort !== null,
      lastTrigger: trigger,
    });
    return { ok: false, errorCode: code };
  }
}

function drainQueuedSend() {
  if (activeSendPromise) return;
  if (queuedProbe) {
    const queued = queuedProbe;
    queuedProbe = null;
    startSend(queued.options).then(queued.resolve, queued.resolve);
    return;
  }
  if (queuedHeartbeat) {
    const options = queuedHeartbeat;
    queuedHeartbeat = null;
    startSend(options).catch(() => {});
  }
}

function startSend(options) {
  const task = performSend(options);
  activeSendPromise = task;
  task.finally(() => {
    if (activeSendPromise === task) activeSendPromise = null;
    drainQueuedSend();
  }).catch(() => {});
  return task;
}

export async function requestLocalGuardianHeartbeat(options = {}) {
  const managed = await readManagedDeploymentMarker().catch(() => false);
  if (!managed) return { ok: false, skipped: true, errorCode: 'managed_marker_unavailable' };

  const type = options.type === 'probe' ? 'probe' : 'heartbeat';
  const trigger = String(options.trigger || (type === 'probe' ? 'health_probe' : 'scheduled'));
  const now = safeNow();

  if (type === 'probe') {
    if (now - lastProbeAt < PROBE_COOLDOWN_MS) {
      return { ok: false, skipped: true, errorCode: 'probe_rate_limited' };
    }
    lastProbeAt = now;
  } else if (options.force !== true && now - lastScheduledAttemptAt < SCHEDULE_DEDUP_MS) {
    return { ok: true, skipped: true, reason: 'deduplicated' };
  } else {
    lastScheduledAttemptAt = now;
  }

  const normalized = { type, trigger, monitoringStatus: options.monitoringStatus };
  if (!activeSendPromise) return startSend(normalized);

  if (type === 'probe') {
    if (queuedProbe) return queuedProbe.promise;
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    queuedProbe = { options: normalized, promise, resolve };
    return promise;
  }

  queuedHeartbeat = normalized;
  return { ok: true, queued: true };
}

export function notifyLocalGuardianBootstrapResult(bootstrapState, trigger = 'bootstrap_result') {
  const monitoringStatus = bootstrapState === 'failed' ? 'degraded' : undefined;
  return requestLocalGuardianHeartbeat({
    trigger,
    force: true,
    monitoringStatus,
  }).catch(() => ({ ok: false, errorCode: 'heartbeat_build_failed' }));
}

function isTrustedProbeSender(sender) {
  return sender?.id === chrome.runtime.id
    && sender?.url === chrome.runtime.getURL('health-probe.html');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== LOCAL_GUARDIAN_ALARM) return;
  requestLocalGuardianHeartbeat({ trigger: 'alarm' }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  requestLocalGuardianHeartbeat({ trigger: 'onStartup' }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  requestLocalGuardianHeartbeat({ trigger: 'onInstalled' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== LOCAL_GUARDIAN_PROBE_MESSAGE) return false;
  if (!isTrustedProbeSender(sender)) {
    sendResponse({ ok: false, errorCode: 'probe_sender_rejected' });
    return false;
  }
  requestLocalGuardianHeartbeat({ type: 'probe', trigger: 'health_probe', force: true })
    .then(sendResponse, () => sendResponse({ ok: false, errorCode: 'heartbeat_build_failed' }));
  return true;
});

Promise.resolve().then(async () => {
  const managed = await readManagedDeploymentMarker().catch(() => false);
  if (!managed) return;
  const existing = await chrome.alarms.get(LOCAL_GUARDIAN_ALARM).catch(() => null);
  if (!existing || Number(existing.periodInMinutes) !== 1) {
    await chrome.alarms.create(LOCAL_GUARDIAN_ALARM, { periodInMinutes: 1 });
  }
  await requestLocalGuardianHeartbeat({
    trigger: 'service_worker_load',
    force: true,
    monitoringStatus: 'booting',
  });
}).catch(() => {});
