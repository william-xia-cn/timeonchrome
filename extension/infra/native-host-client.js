// infra/native-host-client.js - managed-only TimeOnChrome Native Host client.

import { MANAGED_POLICY_KEYS, readManagedActivationPolicy } from '../core/activation-gate.js';
import { readNativeHostDeploymentMarker, readNativeHostDevelopmentMarker } from '../core/deployment-mode.js';
import { budgetedLocalSet } from './storage-budget.js';
import { registerPersistedUsageSegmentObserver } from '../core/usage-segments.js';
import { readCurrentWeekBrowserSnapshots } from './browser-bridge-v3-snapshot.js';

export const TIMEONCHROME_NATIVE_HOST = 'com.timeonchrome.nativehost';
export const LEGACY_LOCAL_GUARDIAN_HOST = 'com.timeonchrome.guardian';
export const LOCAL_GUARDIAN_HOST = TIMEONCHROME_NATIVE_HOST;
export const LOCAL_GUARDIAN_ALARM = 'timeonchromeLocalGuardianHeartbeat';
export const LOCAL_GUARDIAN_PROBE_MESSAGE = 'TIMEONCHROME_LOCAL_HEALTH_PROBE';
export const LOCAL_GUARDIAN_RECHECK_MESSAGE = 'TIMEONCHROME_LOCAL_HEALTH_RECHECK';
export const LOCAL_GUARDIAN_PROFILE_KEY = 'local_guardian_profile_uuid_v1';
export const LOCAL_GUARDIAN_STATUS_KEY = 'local_guardian_status_v1';
export const BROWSER_BRIDGE_V2_STATE_KEY = 'browser_bridge_v2_state_v1';
export const BROWSER_BRIDGE_V3_STATE_KEY = 'browser_bridge_v3_state_v1';
export const BROWSER_BRIDGE_RECONCILE_ALARM = 'timeonchromeBrowserBridgeReconcile';

const HEARTBEAT_INTERVAL_MS = 60_000;
const SCHEDULE_DEDUP_MS = 55_000;
const NATIVE_RESPONSE_TIMEOUT_MS = 3_000;
const PROBE_COOLDOWN_MS = 5_000;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 15 * 60_000;
const LEDGER_BATCH_SIZE = 100;
const MAX_PERMANENT_REJECTIONS = 50;
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
let queuedLegacyLedger = null;
let ledgerDrainRequested = false;
let preferHealthAfterLedger = false;
let v2Supported = false;
let v3Supported = false;
let snapshotDrainRequested = false;
let v3ReplayPending = true;
let lastV3LocalVersion = null;
let lastScheduledAttemptAt = 0;
let lastProbeAt = 0;
let persistedStatus = null;

function normalizeBridgeState(raw) {
  if (!raw || typeof raw !== 'object' || !validUuid(raw.bridgeEpochId)) return null;
  return {
    bridgeEpochId: raw.bridgeEpochId,
    enabledAtMs: Math.max(0, Number(raw.enabledAtMs) || 0),
    pendingIds: [...new Set(Array.isArray(raw.pendingIds) ? raw.pendingIds.filter((id) => typeof id === 'string') : [])],
    dirtyDates: [...new Set(Array.isArray(raw.dirtyDates) ? raw.dirtyDates.filter((date) => typeof date === 'string') : [])],
    acknowledgedDateDigests: raw.acknowledgedDateDigests && typeof raw.acknowledgedDateDigests === 'object'
      ? { ...raw.acknowledgedDateDigests } : {},
    permanentRejections: Array.isArray(raw.permanentRejections) ? raw.permanentRejections.slice(-MAX_PERMANENT_REJECTIONS) : [],
    permanentlyRejectedIds: [...new Set(Array.isArray(raw.permanentlyRejectedIds) ? raw.permanentlyRejectedIds.filter((id) => typeof id === 'string') : [])],
    acceptedCount: Math.max(0, Number(raw.acceptedCount) || 0),
    duplicateCount: Math.max(0, Number(raw.duplicateCount) || 0),
    rejectedCount: Math.max(0, Number(raw.rejectedCount) || 0),
    lastLedgerAckAtMs: Math.max(0, Number(raw.lastLedgerAckAtMs) || 0),
  };
}

async function loadBridgeState({ create = true } = {}) {
  const stored = await chrome.storage.local.get(BROWSER_BRIDGE_V2_STATE_KEY).catch(() => ({}));
  const existing = normalizeBridgeState(stored?.[BROWSER_BRIDGE_V2_STATE_KEY]);
  if (existing || !create) return existing;
  const state = {
    bridgeEpochId: createUuid(), enabledAtMs: safeNow(), pendingIds: [], dirtyDates: [],
    acknowledgedDateDigests: {}, permanentRejections: [], permanentlyRejectedIds: [], acceptedCount: 0,
    duplicateCount: 0, rejectedCount: 0, lastLedgerAckAtMs: 0,
  };
  await saveBridgeState(state);
  return state;
}

async function saveBridgeState(state) {
  await budgetedLocalSet({ [BROWSER_BRIDGE_V2_STATE_KEY]: state }, {
    priority: 'critical', source: 'browser_bridge_v2_state',
  });
}

async function retireV2DeliveryQueue() {
  const legacy = await loadBridgeState({ create: false });
  if (!legacy || (legacy.pendingIds.length === 0 && legacy.dirtyDates.length === 0)) return;
  // v2 delivery is disabled in this extension. Preserve counts/rejections for diagnostics,
  // but release the obsolete IDs so the original web ledger's normal retention can proceed.
  legacy.pendingIds = [];
  legacy.dirtyDates = [];
  await saveBridgeState(legacy);
}

function segmentDate(segment) {
  if (typeof segment?.date === 'string' && segment.date.length >= 10) return segment.date.slice(0, 10);
  return new Date(Math.max(0, Number(segment?.endMs) || 0)).toISOString().slice(0, 10);
}

function segmentObservedAt(segment) {
  return Number(segment?.updatedAtMs ?? segment?.settledAtMs ?? segment?.endMs) || 0;
}

async function stableDigest(value) {
  const canonical = JSON.stringify(canonicalizePolicyValue(value));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

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
    nextRetryAt: Math.max(0, Number(raw.nextRetryAt) || 0),
    lastTrigger: typeof raw.lastTrigger === 'string' ? raw.lastTrigger.slice(0, 64) : null,
  } : {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastAckReceivedAt: null,
    lastErrorCode: null,
    consecutiveFailures: 0,
    portConnected: false,
    nextRetryAt: 0,
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
    'runtime_service_unavailable',
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
  v2Supported = false;
  v3Supported = false;
  v3ReplayPending = true;
  lastV3LocalVersion = null;
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
    port = chrome.runtime.connectNative(TIMEONCHROME_NATIVE_HOST);
  } catch (_) {
    throw new Error('native_host_unavailable');
  }
  if (!port?.postMessage || !port?.onMessage?.addListener || !port?.onDisconnect?.addListener) {
    throw new Error('native_host_unavailable');
  }

  nativePort = port;
  port.onMessage.addListener((response) => {
    if (!pendingAck) return;
    if (response?.ok !== true) {
      rejectPendingAck(response?.errorCode === 'RUNTIME_SERVICE_UNAVAILABLE'
        ? 'runtime_service_unavailable' : 'native_invalid_response');
      if (response?.errorCode !== 'RUNTIME_SERVICE_UNAVAILABLE') disconnectPort();
      return;
    }
    if (!Number.isFinite(response.receivedAt)) {
      rejectPendingAck('native_invalid_response');
      disconnectPort();
      return;
    }
    const current = pendingAck;
    pendingAck = null;
    clearTimeout(current.timeoutId);
    current.resolve({
      ok: true,
      receivedAt: response.receivedAt,
      supportedProtocols: Array.isArray(response.supportedProtocols) ? response.supportedProtocols : [],
      capabilities: Array.isArray(response.capabilities) ? response.capabilities : [],
      acceptedIds: Array.isArray(response.acceptedIds) ? response.acceptedIds : [],
      duplicateIds: Array.isArray(response.duplicateIds) ? response.duplicateIds : [],
      rejected: Array.isArray(response.rejected) ? response.rejected : [],
      retryAfterMs: Number.isFinite(response.retryAfterMs) ? response.retryAfterMs : null,
      acceptedRevision: typeof response.acceptedRevision === 'string' ? response.acceptedRevision : null,
      duplicate: response.duplicate === true,
      stale: response.stale === true,
    });
  });
  port.onDisconnect.addListener(() => {
    if (nativePort === port) nativePort = null;
    stopHeartbeatTimer();
    const hadPendingAck = pendingAck !== null;
    const detail = String(chrome.runtime?.lastError?.message || '').toLowerCase();
    const code = detail.includes('native messaging host not found') || detail.includes('specified native messaging host')
      ? 'native_host_unavailable' : 'native_port_disconnected';
    rejectPendingAck(code);
    if (!hadPendingAck) persistStatus({ portConnected: false, lastErrorCode: code }).catch(() => {});
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

async function buildHeartbeatPayload({ type, monitoringStatus }, protocolVersion = 1) {
  const profile = await getOrCreateProfileUuid();
  const development = await readNativeHostDevelopmentMarker().catch(() => false);
  const managedRead = development
    ? { available: true, raw: {} }
    : await readManagedActivationPolicy().catch(() => ({ available: false, raw: {} }));
  const policyHash = development ? null : await hashManagedPolicy(managedRead.raw || {});
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
  const bridgeState = await loadV3State();

  return {
    protocolVersion,
    ...(protocolVersion >= 2 ? { channel: 'health' } : {}),
    requestId: createUuid(),
    messageType: type === 'probe' ? 'probe' : 'heartbeat',
    extensionId: chrome.runtime.id,
    profileId: profile,
    sentAtMs: safeNow(),
    payload: {
      version: chrome.runtime.getManifest().version,
      incognito: chrome.extension?.inIncognitoContext === true,
      policyHash,
      monitoringStatus: status,
      browserBridgePendingCount: Object.keys(bridgeState.pendingDates).length,
    },
  };
}

function toSettledUsageSegment(segment) {
  const startMs = Number(segment?.startMs) || 0;
  const endMs = Number(segment?.endMs) || 0;
  const explicitDurationMs = Number(segment?.durationMs);
  const durationMs = Number.isFinite(explicitDurationMs)
    ? Math.max(0, explicitDurationMs)
    : Math.max(0, endMs - startMs);
  const quotaBucket = segment?.quotaBucketAtTime ?? segment?.quotaBucket;

  return {
    segmentId: String(segment?.id || ''),
    startMs,
    endMs,
    durationMs,
    channel: String(segment?.channel || (segment?.sourceState === 'PIP_ACTIVE' ? 'pip' : 'active')),
    sourceState: String(segment?.sourceState || 'UNKNOWN').slice(0, 64),
    quotaBucket: typeof quotaBucket === 'string' ? quotaBucket.slice(0, 64) : null,
    mode: typeof segment?.mode === 'string' ? segment.mode.slice(0, 64) : null,
    estimated: segment?.estimated === true,
    diagnostic: segment?.diagnostic === true || durationMs === 0,
  };
}

async function buildSettledSegmentsPayload(segments, bridgeState = null) {
  const profileId = await getOrCreateProfileUuid();
  if (bridgeState) {
    return {
      protocolVersion: 2,
      channel: 'ledger',
      requestId: createUuid(),
      messageType: 'settledUsageSegments',
      extensionId: chrome.runtime.id,
      profileId,
      sentAtMs: safeNow(),
      bridgeEpochId: bridgeState.bridgeEpochId,
      batchId: createUuid(),
      payload: { segments: segments.slice(0, LEDGER_BATCH_SIZE).map(toSettledUsageSegment) },
    };
  }
  return {
    protocolVersion: 1,
    requestId: createUuid(),
    messageType: 'settledUsageSegments',
    extensionId: chrome.runtime.id,
    profileId,
    sentAtMs: safeNow(),
    payload: { segments: segments.slice(0, 100).map(toSettledUsageSegment) },
  };
}

async function markPersistedSegmentsPending(segments) {
  const state = await loadBridgeState();
  const ids = new Set(state.pendingIds);
  const dates = new Set(state.dirtyDates);
  for (const segment of segments || []) {
    if (typeof segment?.id !== 'string' || segment.id.length === 0) continue;
    ids.add(segment.id);
    dates.add(segmentDate(segment));
  }
  state.pendingIds = [...ids];
  state.dirtyDates = [...dates];
  await saveBridgeState(state);
  return state;
}

async function reconcileBrowserBridgeLedger() {
  const state = await loadBridgeState();
  const stored = await chrome.storage.local.get('usage_segments_v1').catch(() => ({}));
  const ledger = stored?.usage_segments_v1 && typeof stored.usage_segments_v1 === 'object'
    ? stored.usage_segments_v1 : {};
  const byDate = new Map();
  for (const segment of Object.values(ledger)) {
    if (!segment || typeof segment.id !== 'string') continue;
    const observedAt = segmentObservedAt(segment);
    if (observedAt < state.enabledAtMs && !state.pendingIds.includes(segment.id)) continue;
    const date = segmentDate(segment);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(segment);
  }
  const pending = new Set(state.pendingIds);
  const permanentlyRejected = new Set(state.permanentlyRejectedIds);
  const dirty = new Set(state.dirtyDates);
  for (const [date, segments] of byDate) {
    const stable = segments.map(toSettledUsageSegment).sort((a, b) => a.segmentId.localeCompare(b.segmentId));
    const digest = await stableDigest(stable);
    if (dirty.has(date) || state.acknowledgedDateDigests[date] !== digest) {
      stable.forEach((segment) => {
        if (!permanentlyRejected.has(segment.segmentId)) pending.add(segment.segmentId);
      });
      dirty.add(date);
    }
  }
  state.pendingIds = [...pending];
  state.dirtyDates = [...dirty];
  await saveBridgeState(state);
  return { state, ledger, byDate };
}

async function acknowledgeLedgerBatch(state, ledger, ack) {
  const accepted = new Set([...(ack.acceptedIds || []), ...(ack.duplicateIds || [])]);
  const retryable = new Set((ack.rejected || []).filter((item) => item?.retryable === true).map((item) => item.segmentId));
  const permanent = (ack.rejected || []).filter((item) => item?.retryable !== true);
  state.pendingIds = state.pendingIds.filter((id) => !accepted.has(id) && (retryable.has(id) || !permanent.some((item) => item.segmentId === id)));
  state.acceptedCount += (ack.acceptedIds || []).length;
  state.duplicateCount += (ack.duplicateIds || []).length;
  state.rejectedCount += (ack.rejected || []).length;
  state.lastLedgerAckAtMs = ack.receivedAt || safeNow();
  for (const item of permanent) {
    if (typeof item.segmentId === 'string') state.permanentlyRejectedIds.push(item.segmentId);
    state.permanentRejections.push({
      segmentIdHash: await stableDigest(String(item.segmentId || 'invalid')),
      errorCode: String(item.errorCode || 'SEGMENT_REJECTED').slice(0, 64),
      rejectedAtMs: safeNow(),
    });
  }
  state.permanentRejections = state.permanentRejections.slice(-MAX_PERMANENT_REJECTIONS);
  state.permanentlyRejectedIds = [...new Set(state.permanentlyRejectedIds)].slice(-MAX_PERMANENT_REJECTIONS);
  const pendingSet = new Set(state.pendingIds);
  const remainingDirty = [];
  for (const date of state.dirtyDates) {
    const segments = Object.values(ledger).filter((segment) => (
      segmentDate(segment) === date && segmentObservedAt(segment) >= state.enabledAtMs
    ));
    if (segments.some((segment) => pendingSet.has(segment.id))) {
      remainingDirty.push(date);
      continue;
    }
    const stable = segments.map(toSettledUsageSegment).sort((a, b) => a.segmentId.localeCompare(b.segmentId));
    state.acknowledgedDateDigests[date] = await stableDigest(stable);
  }
  state.dirtyDates = remainingDirty;
  await saveBridgeState(state);
}

export function selectBrowserBridgeLedgerBatch(pendingIds, ledger) {
  return (Array.isArray(pendingIds) ? pendingIds : [])
    .slice(0, LEDGER_BATCH_SIZE)
    .map((id) => ledger?.[id])
    .filter(Boolean);
}

async function performLedgerDrain() {
  if (!v2Supported) return { ok: false, skipped: true, errorCode: 'browser_bridge_v2_unavailable' };
  const { state, ledger } = await reconcileBrowserBridgeLedger();
  const ids = state.pendingIds.slice(0, LEDGER_BATCH_SIZE);
  if (ids.length === 0) return { ok: true, skipped: true, reason: 'ledger_empty' };
  const segments = selectBrowserBridgeLedgerBatch(ids, ledger);
  if (segments.length !== ids.length) {
    state.pendingIds = state.pendingIds.filter((id) => Boolean(ledger[id]));
    await saveBridgeState(state);
  }
  if (segments.length === 0) return { ok: true, skipped: true, reason: 'ledger_empty' };
  const payload = await buildSettledSegmentsPayload(segments, state);
  const ack = await postToNativeHost(payload);
  await acknowledgeLedgerBatch(state, ledger, ack);
  ledgerDrainRequested = state.pendingIds.length > 0;
  return { ok: true, receivedAt: ack.receivedAt, pendingCount: state.pendingIds.length };
}

function normalizeV3State(raw) {
  return {
    acknowledgedRevisions: raw?.acknowledgedRevisions && typeof raw.acknowledgedRevisions === 'object'
      ? { ...raw.acknowledgedRevisions } : {},
    pendingDates: raw?.pendingDates && typeof raw.pendingDates === 'object'
      ? { ...raw.pendingDates } : {},
    lastSnapshotAckAtMs: Math.max(0, Number(raw?.lastSnapshotAckAtMs) || 0),
  };
}

async function loadV3State() {
  const stored = await chrome.storage.local.get(BROWSER_BRIDGE_V3_STATE_KEY).catch(() => ({}));
  return normalizeV3State(stored?.[BROWSER_BRIDGE_V3_STATE_KEY]);
}

async function saveV3State(state) {
  await budgetedLocalSet({ [BROWSER_BRIDGE_V3_STATE_KEY]: state }, {
    priority: 'critical', source: 'browser_bridge_v3_state',
  });
}

async function readV3LocalVersion() {
  const stored = await chrome.storage.local.get(['daily_usage_stats_v1', 'guardian_config']);
  return stableDigest({
    daily: stored.daily_usage_stats_v1 || {},
    corrections: stored.guardian_config?.usageAccountingCorrectionsV1 || [],
  });
}

async function performSnapshotDrain() {
  if (!v3Supported) return { ok: false, skipped: true, errorCode: 'browser_bridge_v3_unavailable' };
  const snapshots = await readCurrentWeekBrowserSnapshots();
  const state = await loadV3State();
  const currentDates = new Set(snapshots.map((snapshot) => snapshot.date));
  for (const date of Object.keys(state.pendingDates)) {
    if (!currentDates.has(date)) delete state.pendingDates[date];
  }
  for (const snapshot of snapshots) {
    if (v3ReplayPending || state.acknowledgedRevisions[snapshot.date] !== snapshot.snapshotRevision) {
      state.pendingDates[snapshot.date] = snapshot.snapshotRevision;
    }
  }
  v3ReplayPending = false;
  await saveV3State(state);
  const snapshot = snapshots.find((item) => state.pendingDates[item.date] === item.snapshotRevision);
  if (!snapshot) return { ok: true, skipped: true, reason: 'snapshot_current' };
  const payload = {
    protocolVersion: 3, channel: 'statistics', requestId: createUuid(),
    messageType: 'dailyUsageSnapshot', extensionId: chrome.runtime.id,
    profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: snapshot,
  };
  const ack = await postToNativeHost(payload);
  if (ack.acceptedRevision !== snapshot.snapshotRevision || ack.stale === true) {
    throw new Error('native_invalid_response');
  }
  state.acknowledgedRevisions[snapshot.date] = snapshot.snapshotRevision;
  delete state.pendingDates[snapshot.date];
  state.lastSnapshotAckAtMs = ack.receivedAt;
  await saveV3State(state);
  snapshotDrainRequested = Object.keys(state.pendingDates).length > 0;
  return { ok: true, receivedAt: ack.receivedAt, pendingCount: Object.keys(state.pendingDates).length };
}

async function performSend(options) {
  const trigger = String(options.trigger || 'unspecified').slice(0, 64);
  const attemptedAt = safeNow();

  try {
    const ack = options.type === 'snapshotDrain'
      ? await performSnapshotDrain()
      : options.type === 'ledgerDrain'
      ? await performLedgerDrain()
      : options.type === 'legacyLedger'
        ? await postToNativeHost(await buildSettledSegmentsPayload(options.segments || []))
        : await postToNativeHost(await buildHeartbeatPayload(options, v3Supported ? 3 : 1));
    if (ack.supportedProtocols?.includes(3)
      && ack.capabilities?.includes('authoritative-daily-snapshot')) {
      if (!v3Supported) {
        v3ReplayPending = true;
        snapshotDrainRequested = true;
      }
      v3Supported = true;
      let version = null;
      try { version = await readV3LocalVersion(); } catch (_) { /* Health remains independent. */ }
      if (version === null || lastV3LocalVersion !== version) {
        lastV3LocalVersion = version;
        snapshotDrainRequested = true;
      }
    }
    if (ack.supportedProtocols?.includes(2)) {
      v2Supported = true;
    }
    await persistStatus({
      lastAttemptAt: attemptedAt,
      lastSuccessAt: safeNow(),
      lastAckReceivedAt: ack.receivedAt,
      lastErrorCode: null,
      consecutiveFailures: 0,
      nextRetryAt: 0,
      portConnected: true,
      lastTrigger: trigger,
    });
    return { ok: true, receivedAt: ack.receivedAt };
  } catch (error) {
    v3ReplayPending = true;
    lastV3LocalVersion = null;
    const code = normalizeErrorCode(error?.message);
    const current = await loadPersistedStatus().catch(() => ({ consecutiveFailures: 0 }));
    const failureCount = Math.min(9999, (Number(current?.consecutiveFailures) || 0) + 1);
    await persistStatus({
      lastAttemptAt: attemptedAt,
      lastErrorCode: code,
      consecutiveFailures: failureCount,
      nextRetryAt: attemptedAt + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(4, failureCount - 1)),
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
  if (preferHealthAfterLedger && queuedHeartbeat) {
    const options = queuedHeartbeat;
    queuedHeartbeat = null;
    preferHealthAfterLedger = false;
    startSend(options).catch(() => {});
    return;
  }
  if (snapshotDrainRequested && v3Supported) {
    snapshotDrainRequested = false;
    preferHealthAfterLedger = true;
    startSend({ type: 'snapshotDrain', trigger: 'snapshot_drain' }).catch(() => {});
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
  const nativeHostEnabled = await readNativeHostDeploymentMarker().catch(() => false);
  if (!nativeHostEnabled) return { ok: false, skipped: true, errorCode: 'managed_marker_unavailable' };

  const type = options.type === 'probe' ? 'probe' : 'heartbeat';
  const trigger = String(options.trigger || (type === 'probe' ? 'health_probe' : 'scheduled'));
  const now = safeNow();

  if (type !== 'probe' && options.force !== true) {
    const status = await loadPersistedStatus();
    if (now < status.nextRetryAt) {
      return { ok: false, skipped: true, errorCode: status.lastErrorCode, retryAfterMs: status.nextRetryAt - now };
    }
  }

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

export async function mirrorPersistedUsageSegments(segments) {
  const nativeHostEnabled = await readNativeHostDeploymentMarker().catch(() => false);
  if (!nativeHostEnabled || !Array.isArray(segments) || segments.length === 0) {
    return { ok: false, skipped: true };
  }
  // Only mark the statistics snapshot dirty. The v3 extension never sends raw web segments.
  snapshotDrainRequested = true;
  // The minute health tick or an in-flight send drains this; settlement never opens a Host.
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

function isTrustedRecheckSender(sender) {
  try {
    const expected = new URL(chrome.runtime.getURL('admin/admin.html'));
    const actual = new URL(sender?.url || '');
    return sender?.id === chrome.runtime.id
      && actual.origin === expected.origin && actual.pathname === expected.pathname;
  } catch (_) {
    return false;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === LOCAL_GUARDIAN_ALARM) {
    requestLocalGuardianHeartbeat({ trigger: 'alarm' }).catch(() => {});
    return;
  }
  if (alarm?.name === BROWSER_BRIDGE_RECONCILE_ALARM) {
    snapshotDrainRequested = true;
    drainQueuedSend();
  }
});

chrome.runtime.onStartup.addListener(() => {
  requestLocalGuardianHeartbeat({ trigger: 'onStartup' }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  requestLocalGuardianHeartbeat({ trigger: 'onInstalled' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === LOCAL_GUARDIAN_RECHECK_MESSAGE) {
    if (!isTrustedRecheckSender(sender)) {
      sendResponse({ ok: false, errorCode: 'probe_sender_rejected' });
      return false;
    }
    requestLocalGuardianHeartbeat({ type: 'probe', trigger: 'admin_recheck', force: true })
      .then(sendResponse, () => sendResponse({ ok: false, errorCode: 'heartbeat_build_failed' }));
    return true;
  }
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
  const nativeHostEnabled = await readNativeHostDeploymentMarker().catch(() => false);
  if (!nativeHostEnabled) return;
  const existing = await chrome.alarms.get(LOCAL_GUARDIAN_ALARM).catch(() => null);
  if (!existing || Number(existing.periodInMinutes) !== 1) {
    await chrome.alarms.create(LOCAL_GUARDIAN_ALARM, { periodInMinutes: 1 });
  }
  const reconcileAlarm = await chrome.alarms.get(BROWSER_BRIDGE_RECONCILE_ALARM).catch(() => null);
  if (!reconcileAlarm || Number(reconcileAlarm.periodInMinutes) !== 60) {
    await chrome.alarms.create(BROWSER_BRIDGE_RECONCILE_ALARM, { periodInMinutes: 60 });
  }
  await loadV3State();
  await retireV2DeliveryQueue();
  snapshotDrainRequested = true;
  await requestLocalGuardianHeartbeat({
    trigger: 'service_worker_load',
    force: true,
    monitoringStatus: 'booting',
  });
}).catch(() => {});

registerPersistedUsageSegmentObserver((segments) => mirrorPersistedUsageSegments(segments));
