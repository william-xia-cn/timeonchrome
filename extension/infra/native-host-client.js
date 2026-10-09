// infra/native-host-client.js - managed-only TimeOnChrome Native Host client.

import { MANAGED_POLICY_KEYS, readManagedActivationPolicy } from '../core/activation-gate.js';
import { readNativeHostDeploymentMarker, readNativeHostDevelopmentMarker } from '../core/deployment-mode.js';
import { budgetedLocalSet } from './storage-budget.js';
import { createMacGuardianHealthClient, MAC_GUARDIAN_STATUS_KEY } from './mac-guardian-health.js';
import { registerPersistedUsageSegmentObserver } from '../core/usage-segments.js';
import { readCurrentWeekBrowserSnapshots } from './browser-bridge-v3-snapshot.js';
import { validateSharedQuotaStateV1, validateSharedAccessPolicyIdentityV1 } from '../core/shared-quota-state.js';
import { validateSharedReminderResultV1 } from '../core/shared-reminder-result.js';
import { validateSharedReminderMessage, validateSharedReminderState } from '../core/shared-reminder-lifecycle.js';
import { validateSharedBrowserActivity } from '../core/shared-browser-activity.js';
import { validateSharedBrowserExecution } from '../core/shared-browser-execution.js';
import { browserExecutionFence, browserExecutionIdentityHash } from './shared-browser-execution-fence.js';
import { sharedBrowserExecutionAttempts } from './shared-browser-execution-attempts.js';
import { captureSharedWebNativeRequest, captureSharedWebNativeReceipt, captureSharedQuotaPreparation, SHARED_WEB_IDENTITY_ERRORS } from '../core/shared-web-native.js';
import { APPLICATION_IDENTITY_USAGE_READ_CAPABILITY, validateApplicationIdentityUsageQuery, validateApplicationIdentityUsageSnapshot } from '../core/shared-contracts/1.43.0/application-usage-seconds.js';

export const TIMEONCHROME_NATIVE_HOST = 'com.timeonchrome.nativehost';
export const LEGACY_LOCAL_GUARDIAN_HOST = 'com.timeonchrome.guardian';
export const LOCAL_GUARDIAN_HOST = TIMEONCHROME_NATIVE_HOST;
export const LOCAL_GUARDIAN_ALARM = 'timeonchromeLocalGuardianHeartbeat';
export const LOCAL_GUARDIAN_PROBE_MESSAGE = 'TIMEONCHROME_LOCAL_HEALTH_PROBE';
export const LOCAL_GUARDIAN_RECHECK_MESSAGE = 'TIMEONCHROME_LOCAL_HEALTH_RECHECK';
export const APPLICATION_USAGE_READ_MESSAGE = 'TIMEONCHROME_APPLICATION_USAGE_READ';
export const APPLICATION_USAGE_CONTEXT_MESSAGE = APPLICATION_USAGE_READ_MESSAGE;
export const APPLICATION_IDENTITY_USAGE_READ_MESSAGE = 'TIMEONCHROME_APPLICATION_IDENTITY_USAGE_READ';
export const LOCAL_GUARDIAN_PROFILE_KEY = 'local_guardian_profile_uuid_v1';
export const LOCAL_GUARDIAN_STATUS_KEY = 'local_guardian_status_v1';
export const BROWSER_BRIDGE_V2_STATE_KEY = 'browser_bridge_v2_state_v1';
export const BROWSER_BRIDGE_V3_STATE_KEY = 'browser_bridge_v3_state_v1';
export const BROWSER_BRIDGE_RECONCILE_ALARM = 'timeonchromeBrowserBridgeReconcile';

const HEARTBEAT_INTERVAL_MS = 60_000;
const SCHEDULE_DEDUP_MS = 55_000;
const NATIVE_RESPONSE_TIMEOUT_MS = 3_000;
// A settled application week is a read query, not a heartbeat. Real ledger reads
// can exceed the health budget; retain a bounded wait without changing other ACKs.
const APPLICATION_USAGE_RESPONSE_TIMEOUT_MS = 15_000;
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
let queuedApplicationRead = null;
let queuedApplicationIdentityRead = null;
let queuedSharedQuotaRead = null;
let queuedSharedReminderReport = null;
let queuedSharedLifecycle = null;
let queuedSharedWeb = null;
let queuedBrowserActivity = null;
let browserActivityLeaseId = null;
let browserActivityObserver = null;
let preferBrowserActivity = true;
let sharedBridgeConfig = { enabled: false };
const SHARED_NATIVE_CAPABILITIES = {
  getSharedWebSourceScope: 'shared-web-source-reusable-v2',
  bindSharedWebSourceV2: 'shared-web-source-reusable-v2',
  replaceSharedWebContributionV2: 'shared-web-source-reusable-v2',
  getSharedWebSourceChallenge: 'shared-web-contribution-sync-v1',
  bindSharedWebSource: 'shared-web-contribution-sync-v1',
  replaceSharedWebContribution: 'shared-web-contribution-sync-v1',
  getSharedQuotaState: 'shared-quota-state-read',
  reportReminderResult: 'shared-reminder-result-shadow',
  getSharedReminderState: 'shared-reminder-lifecycle-v1',
  acknowledgeSharedReminderDelivery: 'shared-reminder-lifecycle-v1',
  resolveSharedReminder: 'shared-reminder-lifecycle-v1',
  reportBrowserActivity: 'shared-browser-activity-v1',
  acknowledgeBrowserExecution: 'shared-reminder-lifecycle-v1',
};
const LIFECYCLE_ERRORS = new Set(['INVALID_SHARED_REMINDER_MESSAGE', 'SHARED_REMINDER_SCOPE_CHANGED',
  'SHARED_REMINDER_PRESENTER_CHANGED', 'SHARED_REMINDER_INSTANCE_CHANGED', 'SHARED_REMINDER_DELIVERY_CONFLICT',
  'SHARED_REMINDER_NOT_VISIBLE', 'SHARED_REMINDER_DEADLINE_ELAPSED', 'SHARED_REMINDER_RESULT_CONFLICT',
  'INVALID_SHARED_BROWSER_ACTIVITY', 'SHARED_BROWSER_ACTIVITY_LEASE_CHANGED', 'SHARED_BROWSER_ACTIVITY_SEQUENCE_CONFLICT',
  'INVALID_SHARED_BROWSER_EXECUTION', 'SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED', 'SHARED_BROWSER_EXECUTION_RESULT_CONFLICT']);
let sharedNativeV3 = false;
let sharedNativeCapabilities = new Set();
const sharedPolicyObservers = new Set();
let applicationUsageSupported = false;
let applicationUsageSecondsSupported = false;
let applicationIdentityUsageSupported = false;
let applicationConnectionGeneration = 0;
let lastApplicationReadUnit = null;
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
let lastResponseRejection = null;
let snapshotRetryAtMs = 0;
function recordResponseRejection(request, reason, serviceErrorCode = null) {
  const types = ['heartbeat', 'probe', 'dailyUsageSnapshot', 'getApplicationUsage', 'getApplicationUsageSeconds', 'settledUsageSegments',
    'getApplicationIdentityUsage',
    'getSharedQuotaState', 'reportReminderResult', 'getSharedReminderState', 'acknowledgeSharedReminderDelivery',
    'resolveSharedReminder', 'reportBrowserActivity', 'acknowledgeBrowserExecution', 'getSharedWebSourceChallenge',
    'bindSharedWebSource', 'replaceSharedWebContribution', 'getSharedWebSourceScope',
    'bindSharedWebSourceV2', 'replaceSharedWebContributionV2'];
  lastResponseRejection = { atMs: safeNow(), reason,
    serviceErrorCode: ['BROWSER_BRIDGE_MESSAGE_REJECTED', 'RUNTIME_SERVICE_UNAVAILABLE',
      'NATIVE_ENVELOPE_REJECTED', 'NATIVE_MESSAGE_INVALID'].includes(serviceErrorCode)
      || SHARED_WEB_IDENTITY_ERRORS.has(serviceErrorCode) ? serviceErrorCode : null,
    messageType: types.includes(request?.messageType) ? request.messageType : 'unknown',
    channel: ['health', 'statistics', 'application', 'ledger', 'sharedQuota'].includes(request?.channel) ? request.channel : 'unknown' };
}

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

let profileInitialization = null;
async function getOrCreateProfileUuid() {
  if (profileInitialization) return profileInitialization;
  const task = initializeProfileUuid();
  profileInitialization = task;
  try { return await task; }
  finally { if (profileInitialization === task) profileInitialization = null; }
}

async function initializeProfileUuid() {
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
  if (LIFECYCLE_ERRORS.has(value) || SHARED_WEB_IDENTITY_ERRORS.has(value) || value === 'shared_reminder_invalid_state') return value;
  const allowed = new Set([
    'native_host_unavailable',
    'native_port_disconnected',
    'native_response_timeout',
    'native_invalid_response',
    'native_snapshot_rejected',
    'native_post_failed',
    'runtime_service_unavailable',
    'managed_marker_unavailable',
    'policy_read_failed',
    'profile_uuid_unavailable',
    'heartbeat_build_failed',
    'application_usage_revision_changed',
    'application_usage_seconds_revision_changed',
    'application_usage_unavailable',
    'application_usage_pending',
    'application_usage_seconds_pending',
    'application_usage_seconds_unavailable',
    'application_usage_context_changed',
    'application_usage_query_invalid',
    'application_identity_usage_unsupported',
    'application_identity_usage_unavailable',
    'application_identity_usage_pending',
    'application_identity_usage_revision_changed',
    'application_identity_usage_context_changed',
    'application_identity_usage_query_invalid',
    'application_identity_usage_invalid_response',
    'shared_quota_unavailable',
    'shared_quota_invalid_state',
    'shared_quota_stale_state',
    'shared_reminder_unavailable',
    'shared_reminder_invalid_ack',
    'shared_reminder_not_issued',
  ]);
  return allowed.has(value) ? value : 'heartbeat_build_failed';
}

function identityUsageErrorCode(value) {
  const code = String(value || '').toUpperCase();
  if (/UNSUPPORTED|NOT_SUPPORTED/.test(code)) return 'application_identity_usage_unsupported';
  if (/REVISION_CHANGED/.test(code)) return 'application_identity_usage_revision_changed';
  if (/PENDING|NOT_READY/.test(code)) return 'application_identity_usage_pending';
  if (/INVALID_QUERY/.test(code)) return 'application_identity_usage_query_invalid';
  if (/INVALID|CONFLICT/.test(code)) return 'application_identity_usage_invalid_response';
  return 'application_identity_usage_unavailable';
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
  browserExecutionFence.invalidate();
  const port = nativePort;
  if (port) applicationConnectionGeneration++;
  nativePort = null;
  v2Supported = false;
  v3Supported = false;
  applicationUsageSupported = false;
  applicationUsageSecondsSupported = false;
  applicationIdentityUsageSupported = false;
  sharedNativeV3 = false;
  sharedNativeCapabilities.clear();
  browserActivityLeaseId = null;
  notifyBrowserActivityLease();
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
  applicationConnectionGeneration++;
  port.onMessage.addListener((response) => {
    if (nativePort !== port) return;
    if (!pendingAck) return;
    if (pendingAck.applicationReadSeconds && response?.requestId
      && response.requestId !== pendingAck.requestId) return;
    if (pendingAck.applicationReadSeconds && !response?.requestId) {
      recordResponseRejection(pendingAck, 'application_request_mismatch');
      rejectPendingAck('native_invalid_response');
      disconnectPort();
      return;
    }
    // A delayed v3 response cannot consume the ACK slot of a different request.
    if (response?.requestId && pendingAck.requestId && response.requestId !== pendingAck.requestId) return;
    if ((pendingAck.sharedWeb || pendingAck.sharedQuotaRead || pendingAck.sharedReminderReport || pendingAck.sharedLifecycle || pendingAck.browserActivity || pendingAck.applicationIdentityRead)
      && response?.requestId !== pendingAck.requestId) {
      rejectPendingAck(pendingAck.applicationIdentityRead ? 'application_identity_invalid_response'
        : pendingAck.sharedReminderReport || pendingAck.sharedLifecycle || pendingAck.browserActivity ? 'shared_reminder_invalid_ack' : 'shared_quota_invalid_state');
      return;
    }
    if (response?.ok !== true) {
      recordResponseRejection(pendingAck, response?.errorCode === 'BROWSER_BRIDGE_MESSAGE_REJECTED'
        ? 'service_message_rejected' : response?.errorCode === 'RUNTIME_SERVICE_UNAVAILABLE'
          ? 'service_unavailable' : 'negative_response', response?.errorCode);
      // A correlated business rejection is not a broken Native transport.
      if (pendingAck.messageType === 'dailyUsageSnapshot' && pendingAck.channel === 'statistics'
        && response?.requestId === pendingAck.requestId && Number.isFinite(response.receivedAt)
        && response.errorCode === 'BROWSER_BRIDGE_MESSAGE_REJECTED') {
        rejectPendingAck('native_snapshot_rejected');
        return;
      }
      const code = response?.errorCode === 'RUNTIME_SERVICE_UNAVAILABLE' ? 'runtime_service_unavailable'
        : pendingAck.sharedLifecycle || pendingAck.browserActivity ? LIFECYCLE_ERRORS.has(response?.errorCode)
          ? response.errorCode : 'shared_reminder_unavailable'
        : pendingAck.sharedReminderReport && response?.errorCode === 'SHARED_REMINDER_NOT_ISSUED' ? 'shared_reminder_not_issued'
      : ['APPLICATION_USAGE_REVISION_CHANGED', 'APPLICATION_USAGE_SECONDS_REVISION_CHANGED', 'APPLICATION_SECONDS_REVISION_CHANGED'].includes(response?.errorCode)
        ? (pendingAck.applicationReadSeconds ? 'application_usage_seconds_revision_changed' : 'application_usage_revision_changed')
        : pendingAck.applicationReadSeconds && ['APPLICATION_USAGE_PENDING', 'APPLICATION_USAGE_SECONDS_PENDING'].includes(response?.errorCode)
          ? 'application_usage_seconds_pending'
        : pendingAck.applicationReadSeconds && response?.errorCode === 'APPLICATION_SECONDS_CONTEXT_CHANGED' ? 'application_usage_context_changed'
        : pendingAck.applicationReadSeconds && response?.errorCode === 'APPLICATION_USAGE_SECONDS_INVALID_QUERY' ? 'application_usage_query_invalid'
        : pendingAck.applicationRead && response?.errorCode === 'APPLICATION_USAGE_PENDING' ? 'application_usage_pending'
        : pendingAck.applicationReadSeconds ? 'application_usage_seconds_unavailable'
        : pendingAck.applicationRead ? 'application_usage_unavailable'
        : pendingAck.sharedWeb ? SHARED_WEB_IDENTITY_ERRORS.has(response?.errorCode)
          ? response.errorCode : 'shared_web_native_unavailable'
        : pendingAck.applicationIdentityRead ? identityUsageErrorCode(response?.errorCode)
        : pendingAck.sharedQuotaRead ? 'shared_quota_unavailable'
        : pendingAck.sharedReminderReport ? 'shared_reminder_unavailable' : 'native_invalid_response';
      rejectPendingAck(code);
      if (code === 'native_invalid_response') disconnectPort();
      return;
    }
    if (!Number.isFinite(response.receivedAt)) {
      recordResponseRejection(pendingAck, 'received_at_invalid');
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
      applicationUsage: response.applicationUsage,
      applicationUsageSeconds: response.applicationUsageSeconds,
      applicationIdentityUsage: response.applicationIdentityUsage,
      sharedQuota: response.sharedQuota,
      sharedAccessPolicyIdentity: response.sharedAccessPolicyIdentity,
      sharedQuotaPreparation: response.sharedQuotaPreparation,
      sharedWebSourceChallenge: response.sharedWebSourceChallenge,
      sharedWebSourceBound: response.sharedWebSourceBound,
      sharedWebSourceScope: response.sharedWebSourceScope,
      sharedWebIdentity: response.sharedWebIdentity,
      sharedWebContributionAccepted: response.sharedWebContributionAccepted,
      sharedReminder: response.sharedReminder,
      browserActivityLeaseId: response.browserActivityLeaseId,
      browserActivityAck: response.browserActivityAck,
      browserExecution: response.browserExecution,
      browserExecutionAck: response.browserExecutionAck,
      requestId: response.requestId,
    });
  });
  port.onDisconnect.addListener(() => {
    // A retired connection cannot mutate or reject its replacement's request.
    if (nativePort !== port) return;
    if (nativePort === port) {
      browserExecutionFence.invalidate();
      nativePort = null;
      sharedNativeV3 = false;
      sharedNativeCapabilities.clear();
      browserActivityLeaseId = null;
      notifyBrowserActivityLease();
    }
    stopHeartbeatTimer();
    const hadPendingAck = pendingAck !== null;
    applicationUsageSupported = false;
    applicationUsageSecondsSupported = false;
    applicationIdentityUsageSupported = false;
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
  const applicationRead = payload.channel === 'application'
    && ['getApplicationUsage', 'getApplicationUsageSeconds'].includes(payload.messageType);
  const applicationReadSeconds = payload.channel === 'application' && payload.messageType === 'getApplicationUsageSeconds';
  const sharedQuotaRead = payload.channel === 'sharedQuota' && payload.messageType === 'getSharedQuotaState';
  const sharedReminderReport = payload.channel === 'sharedQuota' && payload.messageType === 'reportReminderResult';
  const sharedLifecycle = payload.channel === 'sharedQuota' && ['getSharedReminderState',
    'acknowledgeSharedReminderDelivery', 'resolveSharedReminder', 'acknowledgeBrowserExecution'].includes(payload.messageType);
  const browserActivity = payload.channel === 'sharedQuota' && payload.messageType === 'reportBrowserActivity';
  const sharedWeb = payload.channel === 'sharedQuota' && ['getSharedWebSourceChallenge', 'bindSharedWebSource', 'replaceSharedWebContribution',
    'getSharedWebSourceScope', 'bindSharedWebSourceV2', 'replaceSharedWebContributionV2'].includes(payload.messageType);
  const applicationIdentityRead = payload.channel === 'application' && payload.messageType === 'getApplicationIdentityUsage';
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!pendingAck || pendingAck.timeoutId !== timeoutId) return;
      pendingAck = null;
      disconnectPort();
      reject(new Error('native_response_timeout'));
    }, applicationRead || applicationIdentityRead || sharedQuotaRead || sharedWeb ? APPLICATION_USAGE_RESPONSE_TIMEOUT_MS : NATIVE_RESPONSE_TIMEOUT_MS);
    pendingAck = { resolve, reject, timeoutId, requestId: payload.requestId, messageType: payload.messageType || payload.type,
      channel: payload.channel || 'health',
      applicationRead, applicationReadSeconds, applicationIdentityRead, sharedQuotaRead, sharedReminderReport, sharedLifecycle, browserActivity, sharedWeb };
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
    recordResponseRejection(payload, ack.stale === true ? 'snapshot_stale' : 'snapshot_revision_mismatch');
    throw new Error('native_invalid_response');
  }
  state.acknowledgedRevisions[snapshot.date] = snapshot.snapshotRevision;
  snapshotRetryAtMs = 0;
  delete state.pendingDates[snapshot.date];
  state.lastSnapshotAckAtMs = ack.receivedAt;
  await saveV3State(state);
  snapshotDrainRequested = Object.keys(state.pendingDates).length > 0;
  return { ok: true, receivedAt: ack.receivedAt, pendingCount: Object.keys(state.pendingDates).length };
}

async function performSend(options) {
  if (options.type === 'sharedWeb') {
    const port = nativePort;
    try {
      if (!sharedCapabilityAvailable(options.method)) return { ok: false, errorCode: 'shared_web_unsupported' };
      const payload = { protocolVersion: 3, channel: 'sharedQuota', requestId: createUuid(),
        messageType: options.method, extensionId: chrome.runtime.id,
        profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: options.payload };
      if (!port || nativePort !== port) return { ok: false, errorCode: 'shared_web_connection_changed' };
      const ack = await postToNativeHost(payload);
      if (nativePort !== port || ack.requestId !== payload.requestId) return { ok: false, errorCode: 'shared_web_connection_changed' };
      return { ok: true, value: captureSharedWebNativeReceipt(options.method, ack, options.payload, safeNow()) };
    } catch (error) { return { ok: false, errorCode: SHARED_WEB_IDENTITY_ERRORS.has(error?.message)
      ? error.message : 'shared_web_native_unavailable' }; }
  }
  if (options.type === 'browserActivity') {
    if (getSharedBrowserActivityLease() !== options.payload.leaseId) return { ok: false, errorCode: 'SHARED_BROWSER_ACTIVITY_LEASE_CHANGED' };
    try {
      const payload = { protocolVersion: 3, channel: 'sharedQuota', requestId: createUuid(),
        messageType: 'reportBrowserActivity', extensionId: chrome.runtime.id,
        profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: options.payload };
      const ack = await postToNativeHost(payload);
      const receipt = ack.browserActivityAck;
      if (getSharedBrowserActivityLease() !== options.payload.leaseId
        || ack.requestId !== payload.requestId || receipt?.leaseId !== options.payload.leaseId
        || receipt.acceptedSequence !== options.payload.sequence || typeof receipt.duplicate !== 'boolean'
        || receipt.stale !== false) return { ok: false, errorCode: 'shared_reminder_invalid_ack' };
      return { ok: true, receipt: { leaseId: receipt.leaseId, acceptedSequence: receipt.acceptedSequence,
        duplicate: receipt.duplicate, stale: false } };
    } catch (error) { return { ok: false, errorCode: normalizeErrorCode(error?.message) }; }
  }
  if (options.type === 'sharedLifecycle') {
    try {
      if (!sharedCapabilityAvailable(options.method)) return { ok: false, errorCode: 'shared_reminder_unsupported' };
      if (options.method === 'acknowledgeBrowserExecution' && getSharedBrowserActivityLease() !== options.payload.leaseId) {
        return { ok: false, errorCode: 'SHARED_BROWSER_ACTIVITY_LEASE_CHANGED' };
      }
      const payload = { protocolVersion: 3, channel: 'sharedQuota', requestId: createUuid(),
        messageType: options.method, extensionId: chrome.runtime.id,
        profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: options.payload };
      const ack = await postToNativeHost(payload);
      if (ack.requestId !== payload.requestId) return { ok: false, errorCode: 'shared_reminder_invalid_ack' };
      if (options.method === 'acknowledgeBrowserExecution') {
        const receipt = ack.browserExecutionAck;
        if (getSharedBrowserActivityLease() !== options.payload.leaseId || !receipt || Object.keys(receipt).length !== 2 || receipt.executionId !== options.payload.executionId
          || typeof receipt.duplicate !== 'boolean') return { ok: false, errorCode: 'shared_reminder_invalid_ack' };
        const proof = browserExecutionFence.acknowledge(options.identityHash, options.payload.executionId,
          options.payload.leaseId, options.payload.outcome);
        const retirement = await sharedBrowserExecutionAttempts.retireAttempt(proof);
        return { ok: true, receipt: { executionId: receipt.executionId, duplicate: receipt.duplicate }, retirement };
      }
      if (options.method === 'getSharedReminderState' && !browserExecutionFence.current(options.executionGeneration)) {
        return { ok: false, errorCode: 'browser_execution_generation_changed' };
      }
      const state = validateSharedReminderState(ack.sharedReminder, options.expected);
      if (!state.ok) return state;
      if (ack.browserExecution == null) return { ...state, browserExecution: null,
        requestStartedMonotonicMs: options.requestStartedMonotonicMs };
      const execution = validateSharedBrowserExecution(ack.browserExecution);
      if (!execution.ok || !state.state || state.state.stage !== 'shared' || state.state.status !== 'resolved'
        || !Number.isSafeInteger(state.state.visibleAtMs) || Object.keys(sharedReminderIdentityForExecution(state.state))
        .some(field => (field === 'stateRevision'
          ? execution.payload.triggerStateRevision ?? execution.payload.stateRevision : execution.payload[field]) !== state.state[field])
        || execution.payload.triggerStateRevision !== undefined && !hasSharedReminderContinuityCapability()) {
        return { ok: false, errorCode: 'INVALID_SHARED_BROWSER_EXECUTION' };
      }
      return { ...state, browserExecution: execution.payload, requestStartedMonotonicMs: options.requestStartedMonotonicMs };
    } catch (error) {
      return { ok: false, errorCode: normalizeErrorCode(error?.message) };
    }
  }
  if (options.type === 'sharedQuotaRead') {
    try {
      if (!sharedCapabilityAvailable('getSharedQuotaState')) return { ok: false, errorCode: 'shared_quota_unsupported' };
      const payload = { protocolVersion: 3, channel: 'sharedQuota', requestId: createUuid(),
        messageType: 'getSharedQuotaState', extensionId: chrome.runtime.id,
        profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: { date: options.expected.date } };
      const ack = await postToNativeHost(payload);
      if (ack.requestId !== payload.requestId) return { ok: false, errorCode: 'shared_quota_invalid_state' };
      if (ack.sharedQuota == null) return { ok: false, errorCode: 'shared_quota_unavailable' };
      const checked = validateSharedQuotaStateV1(ack.sharedQuota, options.expected);
      if (!checked.ok) return checked;
      let sharedQuotaPreparation = null;
      if (sharedNativeCapabilities.has('shared-quota-execution-preparation-read-v1')
        && ack.capabilities.includes('shared-quota-execution-preparation-read-v1') && ack.sharedQuotaPreparation != null) {
        try { sharedQuotaPreparation = captureSharedQuotaPreparation(ack.sharedQuotaPreparation, options.expected); }
        catch (_) { return { ...checked, policyIdentityStatus: 'unverified', sharedAccessPolicyIdentity: null,
          preparationStatus: 'invalid', sharedQuotaPreparation: null }; }
      }
      const negotiated = nativePort !== null && sharedNativeV3
        && sharedNativeCapabilities.has('shared-access-policy-identity-read')
        && ack.capabilities.includes('shared-access-policy-identity-read');
      if (!negotiated || ack.sharedAccessPolicyIdentity == null) {
        return { ...checked, policyIdentityStatus: 'unverified', sharedAccessPolicyIdentity: null,
          ...(sharedQuotaPreparation ? { sharedQuotaPreparation } : {}) };
      }
      const identity = validateSharedAccessPolicyIdentityV1(ack.sharedAccessPolicyIdentity);
      if (identity.ok && sharedQuotaPreparation?.policyIdentity && ['revision', 'effectiveAtMs', 'stage', 'policyHash']
        .some(key => sharedQuotaPreparation.policyIdentity[key] !== identity.identity[key])) {
        return { ...checked, policyIdentityStatus: 'available', sharedAccessPolicyIdentity: identity.identity,
          preparationStatus: 'invalid', sharedQuotaPreparation: null };
      }
      return identity.ok ? { ...checked, policyIdentityStatus: 'available', sharedAccessPolicyIdentity: identity.identity,
        ...(sharedQuotaPreparation ? { sharedQuotaPreparation } : {}) }
        : identity;
    } catch (error) {
      return { ok: false, errorCode: normalizeErrorCode(error?.message) };
    }
  }
  if (options.type === 'sharedReminderReport') {
    try {
      if (!sharedCapabilityAvailable('reportReminderResult')) return { ok: false, errorCode: 'shared_reminder_unsupported' };
      const payload = { protocolVersion: 3, channel: 'sharedQuota', requestId: createUuid(),
        messageType: 'reportReminderResult', extensionId: chrome.runtime.id,
        profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: options.result };
      const ack = await postToNativeHost(payload);
      if (ack.requestId !== payload.requestId) return { ok: false, errorCode: 'shared_reminder_invalid_ack' };
      return { ok: true, receivedAt: ack.receivedAt, duplicate: ack.duplicate === true };
    } catch (error) {
      return { ok: false, errorCode: normalizeErrorCode(error?.message) };
    }
  }
  if (options.type === 'applicationIdentityRead') {
    try {
      const before = await readApplicationIdentityUsageContext();
      if (!before.ok || !before.supported || before.contextId !== options.expectedContextId) {
        return { ok: false, errorCode: 'application_identity_usage_context_changed' };
      }
      const port = nativePort;
      if (!port) return { ok: false, errorCode: 'application_identity_usage_unavailable' };
      const request = { protocolVersion: 3, channel: 'application', requestId: createUuid(),
        messageType: 'getApplicationIdentityUsage', extensionId: chrome.runtime.id,
        profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: options.query };
      const ack = await postToNativeHost(request);
      if (nativePort !== port || ack.requestId !== request.requestId || !ack.applicationIdentityUsage) {
        recordResponseRejection(request, ack.requestId !== request.requestId
          ? 'application_identity_request_mismatch' : 'application_identity_payload_missing');
        return { ok: false, errorCode: 'application_identity_usage_invalid_response' };
      }
      try { validateApplicationIdentityUsageSnapshot(ack.applicationIdentityUsage, options.query); }
      catch (_) { return { ok: false, errorCode: 'application_identity_usage_invalid_response' }; }
      const after = await readApplicationIdentityUsageContext();
      if (!after.ok || !after.supported || after.contextId !== before.contextId
        || after.connectionGeneration !== before.connectionGeneration || nativePort !== port) {
        return { ok: false, errorCode: 'application_identity_usage_context_changed' };
      }
      return { ok: true, snapshot: ack.applicationIdentityUsage, contextId: after.contextId,
        receivedAt: ack.receivedAt };
    } catch (error) {
      return { ok: false, errorCode: normalizeErrorCode(error?.message) };
    }
  }
  if (options.type === 'applicationRead') {
    try {
      const readUnit = applicationUsageSecondsSupported ? 'seconds'
        : applicationUsageSupported ? 'milliseconds' : null;
      if (!readUnit) return { ok: false, errorCode: 'application_usage_unsupported' };
      const context = await readApplicationUsageContext();
      if (!context.ok || context.readUnit !== readUnit || context.contextId !== options.expectedContextId
        || (options.expectedReadUnit && options.expectedReadUnit !== readUnit)) {
        return { ok: false, errorCode: 'application_usage_context_changed' };
      }
      if (!isValidApplicationUsageQuery(options.query, readUnit)) {
        return { ok: false, errorCode: 'application_usage_query_invalid' };
      }
      const payload = { protocolVersion: 3, channel: 'application', requestId: createUuid(),
        messageType: readUnit === 'seconds' ? 'getApplicationUsageSeconds' : 'getApplicationUsage', extensionId: chrome.runtime.id,
        profileId: await getOrCreateProfileUuid(), sentAtMs: safeNow(), payload: options.query };
      const ack = await postToNativeHost(payload);
      const applicationUsage = readUnit === 'seconds' ? ack.applicationUsageSeconds : ack.applicationUsage;
      if (ack.requestId !== payload.requestId || !applicationUsage) {
        recordResponseRejection(payload, ack.requestId !== payload.requestId ? 'application_request_mismatch' : 'application_payload_missing');
        return { ok: false, errorCode: 'native_invalid_response' };
      }
      const latestContext = await readApplicationUsageContext();
      if (!latestContext.ok || latestContext.contextId !== context.contextId || latestContext.readUnit !== readUnit) {
        return { ok: false, errorCode: 'application_usage_context_changed' };
      }
      return { ok: true, ...(readUnit === 'seconds' ? { applicationUsageSeconds: applicationUsage } : { applicationUsage }),
        readUnit, contextId: context.contextId, receivedAt: ack.receivedAt };
    } catch (error) {
      const code = normalizeErrorCode(error?.message);
      if (['native_host_unavailable', 'native_port_disconnected', 'native_response_timeout', 'runtime_service_unavailable', 'native_post_failed'].includes(code)) {
        const status = await loadPersistedStatus();
        const failures = Math.min(9999, (status.consecutiveFailures || 0) + 1);
        await persistStatus({ lastErrorCode: code, consecutiveFailures: failures,
          nextRetryAt: safeNow() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(4, failures - 1)), portConnected: nativePort !== null });
      }
      return { ok: false, errorCode: code };
    }
  }
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
    if (options.type === 'heartbeat' || options.type === 'probe') {
      sharedNativeV3 = ack.supportedProtocols?.includes(3) === true;
      sharedNativeCapabilities = new Set(ack.capabilities || []);
      browserActivityLeaseId = sharedNativeV3 && sharedNativeCapabilities.has('shared-browser-activity-v1')
        && typeof ack.browserActivityLeaseId === 'string' && ack.browserActivityLeaseId.trim()
        && ack.browserActivityLeaseId.length <= 128 ? ack.browserActivityLeaseId : null;
      notifyBrowserActivityLease();
    }
    // A local drain summary has no negotiation fields and must not erase capabilities.
    if (ack.supportedProtocols?.length) {
      const wasApplicationAvailable = applicationUsageSupported || applicationUsageSecondsSupported;
      const wasApplicationSecondsAvailable = applicationUsageSecondsSupported;
      const wasApplicationIdentityAvailable = applicationIdentityUsageSupported;
      applicationUsageSupported = ack.supportedProtocols.includes(3)
        && ack.capabilities?.includes('application-usage-read') === true;
      applicationUsageSecondsSupported = ack.supportedProtocols.includes(3)
        && ack.capabilities?.includes('application-usage-seconds-read-v1') === true;
      applicationIdentityUsageSupported = ack.supportedProtocols.includes(3)
        && ack.capabilities?.includes(APPLICATION_IDENTITY_USAGE_READ_CAPABILITY) === true;
      if (applicationUsageSecondsSupported) lastApplicationReadUnit = 'seconds';
      else if (applicationUsageSupported) lastApplicationReadUnit = 'milliseconds';
      if ((!wasApplicationAvailable && (applicationUsageSupported || applicationUsageSecondsSupported))
        || (!wasApplicationSecondsAvailable && applicationUsageSecondsSupported)
        || (!wasApplicationIdentityAvailable && applicationIdentityUsageSupported)) {
        // Notify an already-visible page after reconnect; contains no usage or identity.
        chrome.runtime.sendMessage?.({ type: 'TIMEONCHROME_APPLICATION_USAGE_AVAILABLE' })?.catch(() => {});
      }
    }
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
    if (options.type === 'snapshotDrain' && code === 'native_snapshot_rejected') {
      snapshotRetryAtMs = safeNow() + HEARTBEAT_INTERVAL_MS;
      return { ok: false, errorCode: code };
    }
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
  if (queuedBrowserActivity && preferBrowserActivity) {
    sendQueuedBrowserActivity();
    return;
  }
  if (queuedApplicationRead) {
    const queued = queuedApplicationRead;
    queuedApplicationRead = null;
    startSend(queued.options).then(queued.resolve, () => queued.resolve({ ok: false, errorCode: 'application_usage_unavailable' }));
    return;
  }
  if (queuedApplicationIdentityRead) {
    const queued = queuedApplicationIdentityRead;
    queuedApplicationIdentityRead = null;
    startSend(queued.options).then(queued.resolve, () => queued.resolve({ ok: false, errorCode: 'application_identity_usage_unavailable' }));
    return;
  }
  if (queuedSharedQuotaRead) {
    const queued = queuedSharedQuotaRead;
    queuedSharedQuotaRead = null;
    startSend(queued.options).then(queued.resolve, () => queued.resolve({ ok: false, errorCode: 'shared_quota_unavailable' }));
    return;
  }
  if (queuedSharedWeb) {
    const queued = queuedSharedWeb; queuedSharedWeb = null;
    startSend(queued.options).then(queued.resolve, () => queued.resolve({ ok: false, errorCode: 'shared_web_native_unavailable' }));
    return;
  }
  if (queuedSharedReminderReport) {
    const queued = queuedSharedReminderReport;
    queuedSharedReminderReport = null;
    startSend(queued.options).then(queued.resolve, () => queued.resolve({ ok: false, errorCode: 'shared_reminder_unavailable' }));
    return;
  }
  if (queuedSharedLifecycle) {
    const queued = queuedSharedLifecycle;
    queuedSharedLifecycle = null;
    startSend(queued.options).then(queued.resolve, () => queued.resolve({ ok: false, errorCode: 'shared_reminder_unavailable' }));
    return;
  }
  if (snapshotDrainRequested && v3Supported && safeNow() >= snapshotRetryAtMs) {
    snapshotDrainRequested = false;
    preferHealthAfterLedger = true;
    startSend({ type: 'snapshotDrain', trigger: 'snapshot_drain' }).catch(() => {});
    return;
  }
  if (queuedHeartbeat) {
    const options = queuedHeartbeat;
    queuedHeartbeat = null;
    startSend(options).catch(() => {});
    return;
  }
  if (queuedBrowserActivity) sendQueuedBrowserActivity();
}

function sendQueuedBrowserActivity() {
  const queued = queuedBrowserActivity;
  queuedBrowserActivity = null;
  startSend(queued.options).then(queued.resolve, () => queued.resolve({ ok: false, errorCode: 'shared_reminder_unavailable' }));
}

function startSend(options) {
  preferBrowserActivity = options.type !== 'browserActivity';
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
  macGuardianHealth.request({ trigger, force: true }).catch(() => {});
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

function validBeijingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00+08:00`);
  return Number.isFinite(stamp) && new Date(stamp + 28_800_000).toISOString().slice(0, 10) === value;
}

function isValidApplicationUsageQuery(query, readUnit) {
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['fromDate', 'toDate', 'offset', 'expectedRevision'].includes(key))
    || !validBeijingDate(query.fromDate) || !validBeijingDate(query.toDate)
    || Date.parse(`${query.toDate}T00:00:00+08:00`) < Date.parse(`${query.fromDate}T00:00:00+08:00`)
    || Date.parse(`${query.toDate}T00:00:00+08:00`) - Date.parse(`${query.fromDate}T00:00:00+08:00`) > 6 * 86_400_000
    || !Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 20_000
    || (query.offset > 0 && query.expectedRevision === undefined)) return false;
  if (query.expectedRevision === undefined) return true;
  return readUnit === 'seconds'
    ? typeof query.expectedRevision === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(query.expectedRevision)
    : typeof query.expectedRevision === 'string' && /^[a-f0-9]{64}$/.test(query.expectedRevision);
}

async function readApplicationUsageContext() {
  const readUnit = applicationUsageSecondsSupported ? 'seconds'
    : applicationUsageSupported ? 'milliseconds' : lastApplicationReadUnit;
  if (!readUnit) {
    return { ok: false, errorCode: 'application_usage_unsupported' };
  }
  try {
    const profile = await getOrCreateProfileUuid();
    const stored = await chrome.storage.local.get(['cloud_profile_id', 'cloud_device_id']);
    const contextId = await stableDigest({ connectionGeneration: applicationConnectionGeneration, profile,
      cloudProfileId: String(stored?.cloud_profile_id || ''), cloudDeviceId: String(stored?.cloud_device_id || '') });
    return { ok: true, readUnit, contextId, available: nativePort !== null
      && (applicationUsageSecondsSupported || applicationUsageSupported) };
  } catch (_) {
    return { ok: false, errorCode: 'application_usage_context_changed' };
  }
}

async function ensureApplicationUsageCapability({ recheck = false } = {}) {
  if (applicationUsageSecondsSupported || applicationUsageSupported) return { ok: true };
  const initialStatus = await loadPersistedStatus();
  if (recheck && (!nativePort || safeNow() < initialStatus.nextRetryAt)) {
    const health = await requestLocalGuardianHeartbeat({ type: 'probe', trigger: 'application_manual_refresh', force: true });
    if (!health.ok) return health;
  }
  if (activeSendPromise) await activeSendPromise.catch(() => {});
  if (!nativePort) {
    const health = await requestLocalGuardianHeartbeat({ trigger: 'application_read' });
    if (!health.ok) return health;
    if (health.skipped && !nativePort) {
      const status = await loadPersistedStatus();
      return { ok: false, errorCode: status.lastErrorCode || 'native_port_disconnected' };
    }
  }
  return applicationUsageSecondsSupported || applicationUsageSupported
    ? { ok: true } : { ok: false, errorCode: 'application_usage_unsupported' };
}

async function ensureApplicationIdentityUsageCapability({ recheck = false } = {}) {
  if (!nativePort || !sharedNativeV3 || recheck) {
    if (activeSendPromise) await activeSendPromise.catch(() => {});
    const health = await requestLocalGuardianHeartbeat({ type: recheck ? 'probe' : 'heartbeat',
      trigger: recheck ? 'application_identity_manual_refresh' : 'application_identity_read', force: recheck });
    if (!health.ok && !nativePort) return health;
  }
  return { ok: true, supported: applicationIdentityUsageSupported,
    legacyAvailable: applicationUsageSecondsSupported || applicationUsageSupported };
}

async function readApplicationIdentityUsageContext() {
  try {
    const profile = await getOrCreateProfileUuid();
    const stored = await chrome.storage.local.get(['cloud_profile_id', 'cloud_device_id']);
    const childId = typeof stored?.cloud_profile_id === 'string' ? stored.cloud_profile_id : '';
    if (!childId) return { ok: false, errorCode: 'application_identity_usage_context_changed' };
    const deviceId = typeof stored?.cloud_device_id === 'string' ? stored.cloud_device_id : '';
    const connectionGeneration = applicationConnectionGeneration;
    const contextId = await stableDigest({ connectionGeneration, profile, childId, deviceId });
    return { ok: true, contextId, childId, connectionGeneration,
      supported: applicationIdentityUsageSupported && nativePort !== null && sharedNativeV3 };
  } catch (_) { return { ok: false, errorCode: 'application_identity_usage_context_changed' }; }
}

export async function requestApplicationIdentityUsageReadContext({ recheck = false } = {}) {
  if (!await readNativeHostDeploymentMarker().catch(() => false)) {
    return { ok: false, errorCode: 'managed_marker_unavailable' };
  }
  const negotiated = await ensureApplicationIdentityUsageCapability({ recheck });
  if (!negotiated.ok) {
    // Let the existing reader serve only its explicitly labeled legacy cache/model.
    if (!recheck && !nativePort && lastApplicationReadUnit) {
      const legacy = await requestApplicationUsageReadContext({ recheck: false });
      if (legacy.ok) return { ...legacy, identitySupported: false, legacyAvailable: true };
    }
    return negotiated;
  }
  const context = await readApplicationIdentityUsageContext();
  if (!context.ok) return context;
  return { ok: true, contextId: context.contextId, identitySupported: context.supported,
    legacyAvailable: negotiated.legacyAvailable };
}

export async function requestApplicationIdentityUsage(query, { recheck = false, expectedContextId = null } = {}) {
  if (!await readNativeHostDeploymentMarker().catch(() => false)) {
    return { ok: false, errorCode: 'managed_marker_unavailable' };
  }
  try { validateApplicationIdentityUsageQuery(query); }
  catch (_) { return { ok: false, errorCode: 'application_identity_usage_query_invalid' }; }
  const negotiated = await ensureApplicationIdentityUsageCapability({ recheck });
  if (!negotiated.ok) return negotiated;
  if (!applicationIdentityUsageSupported) return { ok: false, errorCode: 'application_identity_usage_unsupported' };
  const context = await readApplicationIdentityUsageContext();
  if (!context.ok || !context.supported || expectedContextId && expectedContextId !== context.contextId) {
    return { ok: false, errorCode: 'application_identity_usage_context_changed' };
  }
  const options = { type: 'applicationIdentityRead', query, expectedContextId: context.contextId };
  if (!activeSendPromise) return startSend(options);
  if (queuedApplicationIdentityRead) return { ok: false, errorCode: 'application_identity_usage_busy' };
  return new Promise(resolve => { queuedApplicationIdentityRead = { options, resolve }; });
}

export async function requestApplicationUsageReadContext(options = {}) {
  if (!await readNativeHostDeploymentMarker().catch(() => false)) {
    return { ok: false, errorCode: 'managed_marker_unavailable' };
  }
  if (!nativePort && lastApplicationReadUnit && options.recheck !== true) return readApplicationUsageContext();
  const negotiated = await ensureApplicationUsageCapability(options);
  return negotiated.ok ? readApplicationUsageContext() : negotiated;
}

export async function requestApplicationUsage(query, { recheck = false, expectedContextId = null, expectedReadUnit = null } = {}) {
  if (!await readNativeHostDeploymentMarker().catch(() => false)) {
    return { ok: false, errorCode: 'managed_marker_unavailable' };
  }
  if (!query || Object.keys(query).some(key => !['fromDate', 'toDate', 'offset', 'expectedRevision'].includes(key))
    || !validBeijingDate(query.fromDate) || !validBeijingDate(query.toDate)
    || !Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 20_000) {
    return { ok: false, errorCode: 'application_usage_query_invalid' };
  }
  const negotiated = await ensureApplicationUsageCapability({ recheck });
  if (!negotiated.ok) return negotiated;
  const context = await readApplicationUsageContext();
  if (!context.ok) return context;
  if ((expectedContextId && expectedContextId !== context.contextId)
    || (expectedReadUnit && expectedReadUnit !== context.readUnit)
    || !isValidApplicationUsageQuery(query, context.readUnit)) {
    return { ok: false, errorCode: expectedContextId || expectedReadUnit
      ? 'application_usage_context_changed' : 'application_usage_query_invalid' };
  }
  const status = await loadPersistedStatus();
  if (safeNow() < status.nextRetryAt) return { ok: false, errorCode: status.lastErrorCode };
  const options = { type: 'applicationRead', query, expectedContextId: context.contextId, expectedReadUnit: context.readUnit };
  if (!activeSendPromise) return startSend(options);
  if (queuedApplicationRead) return { ok: false, errorCode: 'application_usage_busy' };
  return new Promise(resolve => { queuedApplicationRead = { options, resolve }; });
}

export async function requestSharedQuotaState(expected = {}) {
  if (!await readNativeHostDeploymentMarker().catch(() => false)) {
    return { ok: false, errorCode: 'managed_marker_unavailable' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expected?.date)
    || !/^\d{4}-\d{2}-\d{2}$/.test(expected?.weekStart)
    || typeof expected?.policyRevision !== 'string' || !expected.policyRevision
    || Object.keys(expected).some(key => !['date', 'weekStart', 'policyRevision'].includes(key))) {
    return { ok: false, errorCode: 'shared_quota_query_invalid' };
  }
  const negotiated = await negotiateSharedCapability('getSharedQuotaState', 'shared_quota');
  if (!negotiated.ok) return negotiated;
  const options = { type: 'sharedQuotaRead', expected };
  if (!activeSendPromise) return startSend(options);
  if (queuedSharedQuotaRead) return { ok: false, errorCode: 'shared_quota_busy' };
  return new Promise(resolve => { queuedSharedQuotaRead = { options, resolve }; });
}

export async function requestSharedWebSync(method, value = {}) {
  let payload;
  try { payload = await captureSharedWebNativeRequest(method, value); }
  catch (_) { return { ok: false, errorCode: 'shared_web_invalid_request' }; }
  if (!await readNativeHostDeploymentMarker().catch(() => false)) return { ok: false, errorCode: 'managed_marker_unavailable' };
  const negotiated = await negotiateSharedCapability(method, 'shared_web');
  if (!negotiated.ok) return negotiated;
  const options = { type: 'sharedWeb', method, payload };
  if (!activeSendPromise) return startSend(options);
  if (queuedSharedWeb) return { ok: false, errorCode: 'shared_web_busy' };
  return new Promise(resolve => { queuedSharedWeb = { options, resolve }; });
}

// No production caller enables this adapter in the shadow phase.
export function configureSharedQuotaNativeBridge({ enabled = false } = {}) {
  sharedBridgeConfig = { enabled: enabled === true };
  notifyBrowserActivityLease();
  return { ok: true };
}

export function getSharedBrowserActivityLease() {
  return sharedCapabilityAvailable('reportBrowserActivity') ? browserActivityLeaseId : null;
}
export function hasSharedReminderContinuityCapability() {
  return sharedBridgeConfig.enabled === true && nativePort !== null && sharedNativeV3
    && sharedNativeCapabilities.has('shared-reminder-continuity-v1');
}
// Opaque Port identity stays in memory; never serialize it into Native payloads or storage.
export function readSharedWebLocalConnection() {
  return { connection: sharedCapabilityAvailable('replaceSharedWebContributionV2')
      || sharedCapabilityAvailable('replaceSharedWebContribution') ? nativePort : null,
    reusableSourceSupported: sharedCapabilityAvailable('replaceSharedWebContributionV2'),
    capabilityNegotiated: sharedBridgeConfig.enabled === true && nativePort !== null && sharedNativeV3
      && sharedNativeCapabilities.has('shared-web-local-lease-v1') };
}

export function readNativeHostDiagnosticState() {
  const connected = nativePort !== null;
  const known = connected && sharedNativeV3;
  const allowed = ['application-usage-read', 'shared-quota-state-read', 'shared-web-contribution-sync-v1',
    'shared-access-policy-identity-read', 'shared-quota-execution-preparation-read-v1',
    'shared-browser-activity-v1', 'shared-reminder-lifecycle-v1', 'shared-reminder-continuity-v1',
    'shared-web-local-lease-v1', 'shared-web-source-reusable-v2',
    APPLICATION_IDENTITY_USAGE_READ_CAPABILITY];
  return { connected, protocolVersion: known ? 3 : null,
    capabilities: known ? allowed.filter(v => sharedNativeCapabilities.has(v)) : null,
    applicationUsageSupported: applicationUsageSupported && connected ? true : known ? false : null,
    applicationUsageSecondsSupported: applicationUsageSecondsSupported && connected ? true : known ? false : null,
    applicationIdentityUsageSupported: applicationIdentityUsageSupported && connected ? true : known ? false : null,
    lastResponseRejection: lastResponseRejection ? { ...lastResponseRejection } : null };
}
function notifyBrowserActivityLease() {
  try { Promise.resolve(browserActivityObserver?.(getSharedBrowserActivityLease())).catch(() => {}); } catch (_) {}
  for (const observer of sharedPolicyObservers) {
    try { Promise.resolve(observer(hasSharedAccessPolicyCapability())).catch(() => {}); } catch (_) {}
  }
}
export function hasSharedAccessPolicyCapability() {
  return nativePort !== null && sharedNativeV3 && sharedNativeCapabilities.has('shared-quota-state-read');
}
export function hasSharedAccessExecutionCapability() {
  return sharedBridgeConfig.enabled === true && nativePort !== null && sharedNativeV3
    && (sharedNativeCapabilities.has('shared-web-contribution-sync-v1') || sharedNativeCapabilities.has('shared-web-source-reusable-v2'))
    && ['shared-quota-state-read', 'shared-access-policy-identity-read',
      'shared-quota-execution-preparation-read-v1', 'shared-browser-activity-v1', 'shared-reminder-lifecycle-v1']
      .every(capability => sharedNativeCapabilities.has(capability));
}
export function observeSharedAccessPolicyCapability(observer) {
  if (typeof observer !== 'function' || sharedPolicyObservers.size >= 8) return () => {};
  sharedPolicyObservers.add(observer);
  try { Promise.resolve(observer(hasSharedAccessPolicyCapability())).catch(() => {}); } catch (_) {}
  return () => sharedPolicyObservers.delete(observer);
}
export function observeSharedBrowserActivityLease(observer) {
  browserActivityObserver = typeof observer === 'function' ? observer : null;
  notifyBrowserActivityLease();
}
export function reportSharedBrowserActivity(value) {
  const checked = validateSharedBrowserActivity(value);
  if (!checked.ok) return Promise.resolve(checked);
  if (getSharedBrowserActivityLease() !== checked.payload.leaseId) {
    return Promise.resolve({ ok: false, errorCode: 'SHARED_BROWSER_ACTIVITY_LEASE_CHANGED' });
  }
  const options = { type: 'browserActivity', payload: checked.payload };
  if (!activeSendPromise) return startSend(options);
  if (queuedBrowserActivity) queuedBrowserActivity.resolve({ ok: true, skipped: true, reason: 'activity_superseded' });
  return new Promise(resolve => { queuedBrowserActivity = { options, resolve }; });
}

function sharedCapabilityAvailable(method) {
  const token = SHARED_NATIVE_CAPABILITIES[method];
  return sharedBridgeConfig.enabled === true && nativePort !== null && sharedNativeV3
    && typeof token === 'string' && sharedNativeCapabilities.has(token);
}

async function negotiateSharedCapability(method, errorPrefix) {
  if (!sharedBridgeConfig.enabled) return { ok: false, errorCode: `${errorPrefix}_disabled` };
  if (!SHARED_NATIVE_CAPABILITIES[method]) return { ok: false, errorCode: `${errorPrefix}_unsupported` };
  if (activeSendPromise) await activeSendPromise.catch(() => {});
  if (!nativePort) {
    const health = await requestLocalGuardianHeartbeat({ trigger: 'shared_shadow_read' });
    if (!health.ok) return health;
    // Startup may have queued this heartbeat behind its first health send.
    if (activeSendPromise) await activeSendPromise.catch(() => {});
  }
  return sharedCapabilityAvailable(method) ? { ok: true }
    : { ok: false, errorCode: `${errorPrefix}_unsupported` };
}

export async function reportSharedReminderResult(result) {
  const checked = validateSharedReminderResultV1(result);
  if (!checked.ok) return checked;
  if (!await readNativeHostDeploymentMarker().catch(() => false)) {
    return { ok: false, errorCode: 'managed_marker_unavailable' };
  }
  const negotiated = await negotiateSharedCapability('reportReminderResult', 'shared_reminder');
  if (!negotiated.ok) return negotiated;
  const options = { type: 'sharedReminderReport', result: checked.result };
  if (!activeSendPromise) return startSend(options);
  if (queuedSharedReminderReport) return { ok: false, errorCode: 'shared_reminder_busy' };
  return new Promise(resolve => { queuedSharedReminderReport = { options, resolve }; });
}

export async function requestSharedReminderLifecycle(method, value) {
  const requestStartedMonotonicMs = Math.floor(performance.now());
  const executionGeneration = browserExecutionFence.capture();
  let checked;
  if (method === 'getSharedReminderState') {
    const validDate = typeof value?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date);
    const ms = validDate ? Date.parse(`${value.date}T00:00:00+08:00`) : NaN;
    if (!value || Object.keys(value).length !== 1 || !Number.isFinite(ms)
      || new Date(ms + 28_800_000).toISOString().slice(0, 10) !== value.date) {
      return { ok: false, errorCode: 'INVALID_SHARED_REMINDER_MESSAGE' };
    }
    checked = { ok: true, payload: { date: value.date } };
  } else checked = method === 'acknowledgeBrowserExecution'
    ? validateSharedBrowserExecution(value, true) : validateSharedReminderMessage(value, method);
  if (!checked.ok) return checked;
  let identityHash = null;
  try {
    if (method === 'acknowledgeBrowserExecution') identityHash = await browserExecutionIdentityHash(checked.payload);
  } catch (_) { return { ok: false, errorCode: 'browser_execution_identity_unavailable' }; }
  if (!await readNativeHostDeploymentMarker().catch(() => false)) return { ok: false, errorCode: 'managed_marker_unavailable' };
  const negotiated = await negotiateSharedCapability(method, 'shared_reminder');
  if (!negotiated.ok) return negotiated;
  const { delivery, action, ...identity } = checked.payload;
  const options = { type: 'sharedLifecycle', method, payload: checked.payload,
    requestStartedMonotonicMs, executionGeneration, identityHash,
    expected: method === 'getSharedReminderState' ? { date: value.date } : identity };
  if (!activeSendPromise) return startSend(options);
  if (queuedSharedLifecycle) return { ok: false, errorCode: 'shared_reminder_busy' };
  return new Promise(resolve => { queuedSharedLifecycle = { options, resolve }; });
}

function sharedReminderIdentityForExecution(state) {
  return Object.fromEntries(['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision']
    .map(field => [field, state[field]]));
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
  if (message?.type === APPLICATION_IDENTITY_USAGE_READ_MESSAGE) {
    if (!isTrustedRecheckSender(sender)) {
      sendResponse({ ok: false, errorCode: 'probe_sender_rejected' });
      return false;
    }
    if (message.contextOnly === true) {
      requestApplicationIdentityUsageReadContext({ recheck: message.recheck === true }).then(sendResponse,
        () => sendResponse({ ok: false, errorCode: 'application_identity_usage_unavailable' }));
      return true;
    }
    requestApplicationIdentityUsage(message.query, { recheck: message.recheck === true,
      expectedContextId: message.expectedContextId }).then(sendResponse,
      () => sendResponse({ ok: false, errorCode: 'application_identity_usage_unavailable' }));
    return true;
  }
  if (message?.type === APPLICATION_USAGE_READ_MESSAGE) {
    if (!isTrustedRecheckSender(sender)) {
      sendResponse({ ok: false, errorCode: 'probe_sender_rejected' });
      return false;
    }
    if (message.contextOnly === true) {
      requestApplicationUsageReadContext({ recheck: message.recheck === true }).then(sendResponse,
        () => sendResponse({ ok: false, errorCode: 'application_usage_unavailable' }));
      return true;
    }
    requestApplicationUsage(message.query, { recheck: message.recheck === true,
      expectedContextId: message.expectedContextId, expectedReadUnit: message.expectedReadUnit }).then(sendResponse,
      () => sendResponse({ ok: false, errorCode: 'application_usage_unavailable' }));
    return true;
  }
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

const macGuardianHealth = createMacGuardianHealthClient({
  runtime: chrome.runtime,
  alarms: chrome.alarms,
  enabled: readNativeHostDeploymentMarker,
  readContext: async () => {
    const profile = await getOrCreateProfileUuid();
    const development = await readNativeHostDevelopmentMarker();
    const managed = development ? { available: true, raw: {} }
      : await readManagedActivationPolicy().catch(() => ({ available: false, raw: {} }));
    let snapshot;
    try { snapshot = await Promise.resolve(stateProvider()); }
    catch (_) { snapshot = { bootstrapState: 'ready', healthReadFailed: true }; }
    return { profile,
      monitoringStatus: resolveLocalGuardianMonitoringStatus({ ...snapshot,
        healthReadFailed: snapshot?.healthReadFailed === true || managed?.available !== true }),
      policyHash: development ? null : await hashManagedPolicy(managed.raw || {}) };
  },
  saveStatus: status => budgetedLocalSet({ [MAC_GUARDIAN_STATUS_KEY]: status }, {
    priority: 'diagnostic', source: 'mac_guardian_health',
  }),
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
