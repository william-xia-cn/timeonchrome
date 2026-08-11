// infra/cloud-sync.js — 云同步 + 心跳
import { getStatsRange, getDateKey } from './storage.js';
import { DEFAULT_CONFIG } from './storage.js';
import { normalizeRuntimeSiteAccessConfig } from '../core/site-access-config-normalizer.js';
import {
  buildSiteClassificationRequestsUploadPayload,
  getPendingSiteClassificationRequestUploads,
  markSiteClassificationRequestUploadFailed,
  markSiteClassificationRequestsUploaded,
  mergeCloudSiteClassificationRequests,
} from './storage.js';
import {
  getPendingUsageSegments, getPendingDailyStats,
  getPendingHourlyStats,
  getPendingTargetStats,
  getPendingHourlyTargetStats,
  buildUsageSegmentsUploadPayload, buildDailyStatsUploadPayload,
  buildHourlyStatsUploadPayload,
  buildTargetStatsUploadPayload,
  buildHourlyTargetStatsUploadPayload,
  getAllUsageSegments,
  getDailyUsageStats,
  getHourlyUsageStats,
  getUsageSegmentsByDate,
  markUsageSegmentsUploaded, markDailyStatsUploaded,
  markHourlyStatsUploaded,
  markTargetStatsUploaded,
  markHourlyTargetStatsUploaded,
  markUsageSegmentUploadFailed, markDailyStatsUploadFailed,
  markHourlyStatsUploadFailed,
  markTargetStatsUploadFailed,
  markHourlyTargetStatsUploadFailed,
  normalizeUploadErrorCode,
} from '../core/usage-segments.js';
import {
  getPendingMediaSegments, getPendingDailyMediaStats,
  getPendingHourlyMediaStats,
  buildMediaSegmentsUploadPayload, buildDailyMediaStatsUploadPayload,
  buildHourlyMediaStatsUploadPayload,
  markMediaSegmentsUploaded, markDailyMediaStatsUploaded,
  markHourlyMediaStatsUploaded,
  markMediaSegmentUploadFailed, markDailyMediaStatsUploadFailed,
  markHourlyMediaStatsUploadFailed,
  reconcileHourlyMediaStatsOutbox,
} from '../runtime/media-session.js';
import {
  getPendingClientLogsForUpload,
  markClientLogUploadFailed,
  markClientLogsUploaded,
  sanitizeClientLogForUpload,
  logClientEventBestEffort,
} from './client-logs.js';
import { resolveActivationState } from '../core/activation-gate.js';
import { runV1StorageMaintenance } from './storage-maintenance.js';
import { drainUsageSettlementJournal, reconcileUsageLedger } from '../core/usage-segments.js';
import { budgetedLocalSet } from './storage-budget.js';
import { isSyncRetryCandidate } from './sync-retry-policy.js';

const cloudStorageSet = (items) => typeof budgetedLocalSet === 'function'
  ? budgetedLocalSet(items, { priority: 'sync', source: 'cloud_sync' })
  : chrome.storage.local.set(items);

const CLOUD_CONFIG = {
  API_BASE: 'https://guardian-api.william-xia-cn.workers.dev',
  SYNC_INTERVAL_MS: 15 * 60 * 1000,
  SESSION_UPLOAD_HOUR: 8,
  MAX_RETRY_ATTEMPTS: 3,
  REQUEST_TIMEOUT_MS: 15000,
  SYNC_STALE_LOCK_MS: 2 * 60 * 1000,
  MAX_HISTORY_USAGE_DATES_PER_SYNC: 7,
  KEYS: {
    DEVICE_TOKEN: 'cloud_device_token',
    DEVICE_ID: 'cloud_device_id',
    PROFILE_ID: 'cloud_profile_id',
    CREDENTIALS: 'cloud_credentials',
    ACCOUNT_TOKEN: 'account_token',
    ACCOUNT_REFRESH_TOKEN: 'account_refresh_token',
    ACCOUNT_EMAIL: 'cloud_account_email',
    CONNECTION_STATE: 'cloud_connection_state_v1',
    CHROME_IDENTITY_STATUS: 'cloud_chrome_identity_status_v1',
    IDENTITY_LINK_LAST_AT: 'cloud_identity_link_last_at',
    RECOVERY_REQUEST_ID: 'cloud_device_recovery_request_id',
    RECOVERY_POLL_TOKEN: 'cloud_device_recovery_poll_token',
    RECOVERY_STATE: 'cloud_device_recovery_state_v1',
    LAST_SYNC: 'cloud_last_sync',
    PENDING_STATS: 'cloud_pending_stats',
    PENDING_SESSIONS: 'cloud_pending_sessions',
    LOCAL_CONFIG: 'cloud_local_config',
    CONFIG_VERSION: 'cloud_config_version',
    MONITORING_ENABLED: 'cloud_monitoring_enabled',
    V1_SYNC_ENABLED: 'statsFoundationV1SyncEnabled',
    V1_LAST_SYNC_AT: 'cloud_v1_last_sync_at',
    V1_LAST_SYNC_ERROR: 'cloud_v1_last_sync_error',
    V1_LAST_SEGMENT_UPLOAD_AT: 'cloud_v1_last_segment_upload_at',
    V1_LAST_STATS_UPLOAD_AT: 'cloud_v1_last_stats_upload_at',
    V1_LAST_HOURLY_STATS_UPLOAD_AT: 'cloud_v1_last_hourly_stats_upload_at',
    V1_LAST_TARGET_STATS_UPLOAD_AT: 'cloud_v1_last_target_stats_upload_at',
    V1_LAST_HOURLY_TARGET_STATS_UPLOAD_AT: 'cloud_v1_last_hourly_target_stats_upload_at',
    USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE: 'usage_stats_history_synced_through_date_v1',
    USAGE_STATS_TODAY_LAST_UPLOAD_AT: 'usage_stats_today_last_upload_at_v1',
    USAGE_STATS_TODAY_LAST_ERROR: 'usage_stats_today_last_error_v1',
    USAGE_STATS_HISTORY_LAST_UPLOAD_AT: 'usage_stats_history_last_upload_at_v1',
    USAGE_STATS_HISTORY_LAST_ERROR: 'usage_stats_history_last_error_v1',
    V1_LAST_MEDIA_SEGMENT_UPLOAD_AT: 'cloud_v1_last_media_segment_upload_at',
    V1_LAST_MEDIA_STATS_UPLOAD_AT: 'cloud_v1_last_media_stats_upload_at',
    V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT: 'cloud_v1_last_hourly_media_stats_upload_at',
    V1_LAST_SITE_REQUEST_SYNC_AT: 'cloud_v1_last_site_request_sync_at',
    V1_LAST_CLIENT_LOG_UPLOAD_AT: 'cloud_v1_last_client_log_upload_at',
    USAGE_UPLOAD_BACKOFF: 'cloud_usage_upload_backoff_v1'
  }
};

const DEVICE_RECOVERY_RETRY_MS = 5 * 60 * 1000;
const MAX_USAGE_SEGMENTS_PER_BATCH = 200;
const USAGE_UPLOAD_BACKOFF_STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];
const DEVICE_IDENTITY_LINK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let syncState = {
  isSyncing: false,
  syncStartedAt: 0,
  lastConfigVersion: 0,
  deviceToken: null,
  deviceId: null,
  profileId: null,
  monitoringEnabled: 1,
  v1SyncEnabled: false,
  currentRequestId: null,
  followUpSyncRequested: false,
  followUpForceRetryExhausted: false,
  apiBase: CLOUD_CONFIG.API_BASE,
};

function createCloudRequestId(scope = 'cloud') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${scope}-${Date.now().toString(36)}-${random}`;
}

function getCloudClientVersion() {
  try {
    return chrome.runtime.getManifest()?.version || null;
  } catch (_) {
    return null;
  }
}

function getClientPlatform() {
  const uaPlatform = (globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || '').toString().toLowerCase();
  if (/mac/.test(uaPlatform)) return 'macos';
  if (/win/.test(uaPlatform)) return 'windows';
  if (/cros|chromeos/.test(uaPlatform)) return 'chromeos';
  if (/linux/.test(uaPlatform)) return 'linux';
  return uaPlatform || 'unknown';
}

function getClientBrowserName() {
  return 'Chrome';
}

async function getRuntimeActivationStateSafe() {
  try {
    return await resolveActivationState();
  } catch (error) {
    return {
      activated: false,
      activationMode: 'disabled',
      reason: 'runtime_activation_check_failed',
      privacyConsentRequired: false,
      error: error?.message || String(error),
    };
  }
}

function applyActivationCloudEndpoint(activation) {
  syncState.apiBase = activation?.managedPolicy?.cloudEndpoint || CLOUD_CONFIG.API_BASE;
}

function getCloudApiBase() {
  return syncState.apiBase || CLOUD_CONFIG.API_BASE;
}

async function requireRuntimeActivation() {
  const activation = await getRuntimeActivationStateSafe();
  applyActivationCloudEndpoint(activation);
  if (activation.activated === true) return { ok: true, activation };
  return {
    ok: false,
    activation,
    reason: activation.reason || 'runtime_activation_required',
    privacyConsentRequired: activation.privacyConsentRequired === true,
  };
}

async function requireIdentityRecoveryActivation() {
  const runtime = await requireRuntimeActivation();
  if (!runtime.ok) return runtime;
  if (runtime.activation?.activationMode === 'managed_policy' && runtime.activation?.managedPolicy?.allowIdentityRecovery === false) {
    return { ok: false, activation: runtime.activation, reason: 'identity_recovery_disabled_by_policy' };
  }
  return runtime;
}

async function getChromeProfileIdentity() {
  try {
    const activation = await requireIdentityRecoveryActivation();
    if (!activation.ok) {
      return { ok: false, reason: activation.reason || 'runtime_activation_required' };
    }
    if (!chrome.identity?.getProfileUserInfo) {
      return { ok: false, reason: 'identity_api_unavailable' };
    }
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    const id = typeof info?.id === 'string' ? info.id.trim() : '';
    const email = typeof info?.email === 'string' ? info.email.trim().toLowerCase() : '';
    if (!id) return { ok: false, reason: 'identity_empty', email: email || null };
    return { ok: true, id, email: email || null };
  } catch (error) {
    return { ok: false, reason: 'identity_read_failed', error: error?.message || String(error) };
  }
}

async function writeChromeIdentityStatus(status = {}) {
  await cloudStorageSet({
    [CLOUD_CONFIG.KEYS.CHROME_IDENTITY_STATUS]: {
      ...status,
      platform: getClientPlatform(),
      updatedAt: Date.now(),
    },
  }).catch(() => {});
}

function buildDeviceIdentityPayload(identity) {
  return {
    chromeIdentityId: identity?.id || null,
    platform: getClientPlatform(),
    browser: getClientBrowserName(),
    extensionVersion: getCloudClientVersion(),
    deviceNameHint: `${getClientPlatform()} Chrome`,
  };
}

function buildManagedRecoveryPayload(managedPolicy) {
  return {
    tenantId: managedPolicy?.tenantId || null,
    devicePolicyId: managedPolicy?.devicePolicyId || null,
    platform: getClientPlatform(),
    browser: getClientBrowserName(),
    extensionVersion: getCloudClientVersion(),
    deviceNameHint: `${getClientPlatform()} Chrome`,
  };
}
async function tryManagedDeviceTokenBootstrap(activation, reason = 'sync') {
  const managedPolicy = activation?.managedPolicy;
  const managedDeviceToken = typeof managedPolicy?.managedDeviceToken === 'string'
    ? managedPolicy.managedDeviceToken.trim()
    : '';
  if (activation?.activationMode !== 'managed_policy' || !managedDeviceToken) {
    return { ok: false, skipped: true, reason: 'managed_device_token_unavailable' };
  }

  logDeviceRecoveryEvent('info', 'managed_device_token_adoption_started', 'Managed device token adoption started', {
    reason,
    hasManagedDeviceToken: true,
  });

  syncState.deviceToken = managedDeviceToken;
  await cloudStorageSet({
    [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: managedDeviceToken,
  });

  try {
    const result = await cloudRequest('GET', '/device/config', null, 1);
    const profileId = typeof result?.profile_id === 'string' && result.profile_id.trim() ? result.profile_id.trim() : null;
    const deviceId = typeof result?.device_id === 'string' && result.device_id.trim() ? result.device_id.trim() : null;
    if (!profileId || !deviceId) {
      throw new Error('Managed device token config response missing profile_id or device_id');
    }
    await persistRecoveredBinding({
      device_token: managedDeviceToken,
      device_id: deviceId,
      profile_id: profileId,
      profile_name: result?.profile_name || result?.profileName || null,
      account_email: result?.account_email || result?.accountEmail || null,
    }, 'managed_device_token');
    await saveRecoveryState({
      status: 'managed_device_token_adopted',
      source: 'managed_device_token',
      lastError: null,
      lastRecoveredAt: Date.now(),
    });
    logDeviceRecoveryEvent('info', 'managed_device_token_adopted', 'Managed device token adopted successfully', {
      hasDeviceId: true,
      hasProfileId: true,
    });
    return { ok: true, recovered: true, source: 'managed_device_token' };
  } catch (error) {
    if (error?.code === 'DEVICE_UNBOUND') {
      return { ok: false, terminal: true, reason: 'device_unbound' };
    }
    syncState.deviceToken = null;
    await cloudStorageSet({ [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null }).catch(() => {});
    await saveRecoveryState({
      status: 'managed_device_token_failed',
      source: 'managed_device_token',
      lastError: error?.message || String(error),
      lastAttemptAt: Date.now(),
    });
    logDeviceRecoveryEvent('error', 'managed_device_token_failed', 'Managed device token adoption failed', {
      error: error?.message || String(error),
      status: error?.status || null,
      code: error?.code || null,
    });
    return { ok: false, reason: 'managed_device_token_failed', error: error?.message || String(error) };
  }
}

async function tryManagedPolicyRecovery(activation, reason = 'sync') {
  const managedPolicy = activation?.managedPolicy;
  if (activation?.activationMode !== 'managed_policy') {
    return { ok: false, skipped: true, reason: 'managed_policy_recovery_unavailable' };
  }

  const tokenResult = await tryManagedDeviceTokenBootstrap(activation, reason);
  if (tokenResult?.recovered || tokenResult?.terminal) return tokenResult;
  if (managedPolicy?.managedDeviceToken) return tokenResult;

  if (!managedPolicy?.tenantId || !managedPolicy?.devicePolicyId) {
    return { ok: false, skipped: true, reason: 'legacy_managed_policy_recovery_unavailable' };
  }
  logDeviceRecoveryEvent('info', 'managed_device_recovery_attempt_started', 'Legacy managed policy device recovery attempt started', {
    reason,
  });
  const result = await cloudAnonymousRequest('POST', '/device/managed-recover/bootstrap', buildManagedRecoveryPayload(managedPolicy));
  logDeviceRecoveryEvent(result?.status === 'RECOVERED' ? 'info' : 'warning', 'managed_device_recovery_bootstrap_result', 'Legacy managed policy device recovery returned a result', {
    status: result?.status || result?.code || 'unknown',
  });
  if (result?.status === 'RECOVERED') {
    await persistRecoveredBinding(result, 'legacy_managed_policy_recovery');
    return { ok: true, recovered: true, source: 'legacy_managed_policy' };
  }
  if (result?.status === 'DEVICE_UNBOUND' || result?.code === 'DEVICE_UNBOUND') {
    await clearCloudBindingState('managed_recovery_unbound');
    return { ok: false, terminal: true, reason: 'device_unbound' };
  }
  const status = result?.status || result?.code || 'not_recovered';
  await saveRecoveryState({ status, lastError: status, reason: 'legacy_managed_policy_recovery' });
  return { ok: false, recovered: false, reason: status, status };
}

function logDeviceRecoveryEvent(level, eventCode, message, details = {}) {
  logClientEventBestEffort({
    level,
    category: 'cloud',
    eventCode,
    module: 'infra/cloud-sync',
    message,
    details: {
      platform: getClientPlatform(),
      deviceId: syncState.deviceId || null,
      profileId: syncState.profileId || null,
      ...details,
    },
  });
}

function normalizeConnectionError(error, endpoint) {
  const status = Number(error?.status || 0) || null;
  const code = error?.code || error?.response?.code || null;
  const message = error?.name === 'AbortError'
    ? `request timeout after ${CLOUD_CONFIG.REQUEST_TIMEOUT_MS}ms`
    : (error?.message || String(error || 'unknown_error'));
  return {
    endpoint,
    status,
    code,
    message,
    response: error?.response || null,
    at: Date.now(),
  };
}

async function updateCloudConnectionState(patch) {
  try {
    const storage = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.CONNECTION_STATE);
    const previous = storage?.[CLOUD_CONFIG.KEYS.CONNECTION_STATE] || {};
    await cloudStorageSet({
      [CLOUD_CONFIG.KEYS.CONNECTION_STATE]: {
        ...previous,
        ...patch,
        updatedAt: Date.now(),
      },
    });
  } catch (_) {
    // Connection diagnostics must never affect sync.
  }
}

async function markCloudConnectionAttempt(endpoint) {
  await updateCloudConnectionState({
    lastAttemptAt: Date.now(),
    lastEndpoint: endpoint,
    deviceId: syncState.deviceId || null,
    profileId: syncState.profileId || null,
    hasDeviceToken: !!syncState.deviceToken,
  });
}

async function markCloudConnectionSuccess(endpoint, status = 200) {
  await updateCloudConnectionState({
    lastSuccessAt: Date.now(),
    lastEndpoint: endpoint,
    lastStatus: status,
    lastError: null,
    consecutiveFailures: 0,
    deviceId: syncState.deviceId || null,
    profileId: syncState.profileId || null,
    hasDeviceToken: !!syncState.deviceToken,
  });
}

async function markCloudConnectionFailure(endpoint, error) {
  try {
    const storage = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.CONNECTION_STATE);
    const previous = storage?.[CLOUD_CONFIG.KEYS.CONNECTION_STATE] || {};
    await updateCloudConnectionState({
      lastFailureAt: Date.now(),
      lastEndpoint: endpoint,
      lastError: normalizeConnectionError(error, endpoint),
      consecutiveFailures: Number(previous.consecutiveFailures || 0) + 1,
      deviceId: syncState.deviceId || null,
      profileId: syncState.profileId || null,
      hasDeviceToken: !!syncState.deviceToken,
    });
  } catch (_) {
    // Connection diagnostics must never affect sync.
  }
}

function isDeviceUnboundPayload(payload) {
  return payload?.code === 'DEVICE_UNBOUND' || (payload?.bound === false && payload?.reason === 'unbound');
}

async function clearCloudBindingState(reason = 'device_unbound') {
  syncState.deviceToken = null;
  syncState.deviceId = null;
  syncState.profileId = null;
  await cloudStorageSet({
    [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null,
    [CLOUD_CONFIG.KEYS.DEVICE_ID]: null,
    [CLOUD_CONFIG.KEYS.PROFILE_ID]: null,
  });
  console.warn('[Cloud] Device explicitly unbound by cloud, cleared binding state:', reason);
  chrome.runtime.sendMessage({ type: 'DEVICE_UNBOUND', reason }).catch(() => {});
}

function makeDeviceUnboundError(message = 'Device unbound') {
  const error = new Error(message);
  error.code = 'DEVICE_UNBOUND';
  error.nonRetryable = true;
  return error;
}

async function usageSegmentCountForDate(date) {
  try {
    const segments = await getUsageSegmentsByDate(date);
    return Array.isArray(segments) ? segments.length : 0;
  } catch (error) {
    logClientEventBestEffort({
      level: 'error',
      category: 'storage',
      eventCode: 'cloud_stats_segment_check_failed',
      module: 'infra/cloud-sync',
      message: error?.message || 'Failed to check usage segments before stats upload',
      details: { date },
    });
    return null;
  }
}

function safeDecodeCredentials(encoded) {
  if (typeof encoded !== 'string' || !encoded) return null;
  try {
    const raw = atob(encoded);
    const idx = raw.indexOf(':');
    if (idx <= 0) return null;
    const email = raw.slice(0, idx).trim();
    const password = raw.slice(idx + 1);
    if (!email || !password) return null;
    return { email, password };
  } catch (_) {
    return null;
  }
}

async function saveAccountSession({ token, refreshToken, email }) {
  const updates = {};
  if (token) updates[CLOUD_CONFIG.KEYS.ACCOUNT_TOKEN] = token;
  if (refreshToken) updates[CLOUD_CONFIG.KEYS.ACCOUNT_REFRESH_TOKEN] = refreshToken;
  if (email) updates[CLOUD_CONFIG.KEYS.ACCOUNT_EMAIL] = String(email).trim().toLowerCase();
  updates[CLOUD_CONFIG.KEYS.CREDENTIALS] = null;
  await cloudStorageSet(updates);
  return token || null;
}

async function refreshAccountSession(refreshToken) {
  if (!refreshToken) return null;
  const resp = await fetch(`${getCloudApiBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  if (!data?.token) return null;
  await saveAccountSession({
    token: data.token,
    refreshToken: data.refreshToken || refreshToken,
  });
  return data.token;
}

async function loginWithLegacyCredentials(encodedCredentials) {
  const creds = safeDecodeCredentials(encodedCredentials);
  if (!creds) return null;
  const resp = await fetch(`${getCloudApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  if (!data?.token) return null;
  await saveAccountSession({
    token: data.token,
    refreshToken: data.refreshToken || null,
    email: creds.email,
  });
  return data.token;
}

function isAccountTokenLikelyExpired(token) {
  try {
    const body = String(token || '').split('.')[1];
    if (!body) return false;
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return Number(json?.exp || 0) > 0 && Number(json.exp) <= Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

export async function getAccountTokenForCloudAccount() {
  const storage = await chrome.storage.local.get([
    CLOUD_CONFIG.KEYS.ACCOUNT_TOKEN,
    CLOUD_CONFIG.KEYS.ACCOUNT_REFRESH_TOKEN,
    CLOUD_CONFIG.KEYS.CREDENTIALS,
  ]);
  const storedToken = storage[CLOUD_CONFIG.KEYS.ACCOUNT_TOKEN] || null;
  if (storedToken && !isAccountTokenLikelyExpired(storedToken)) return storedToken;

  const refreshed = await refreshAccountSession(storage[CLOUD_CONFIG.KEYS.ACCOUNT_REFRESH_TOKEN]);
  if (refreshed) return refreshed;

  const migrated = await loginWithLegacyCredentials(storage[CLOUD_CONFIG.KEYS.CREDENTIALS]);
  if (migrated) return migrated;
  return null;
}

async function hydrateDeviceIdFromBindIfMissing() {
  if (syncState.deviceId || !syncState.deviceToken || !syncState.profileId) {
    return false;
  }

  try {
    const accountToken = await getAccountTokenForCloudAccount();
    if (!accountToken) {
      console.warn('[Cloud] cloud_device_id missing and no account session available to hydrate');
      return false;
    }

    const bindResp = await fetch(`${getCloudApiBase()}/device/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accountToken}`
      },
      body: JSON.stringify({
        profile_id: syncState.profileId,
        device_name: 'Chrome Extension',
        device_token: syncState.deviceToken,
      }),
    });
    if (!bindResp.ok) {
      const bindError = await bindResp.json().catch(() => null);
      if (isDeviceUnboundPayload(bindError)) {
        await clearCloudBindingState('hydrate_bind_unbound');
        throw makeDeviceUnboundError(bindError?.error || 'Device unbound');
      }
      console.warn('[Cloud] cloud_device_id hydrate bind failed:', bindResp.status);
      return false;
    }

    const bindData = await bindResp.json().catch(() => null);
    const maybeDeviceId = typeof bindData?.device_id === 'string' && bindData.device_id.trim()
      ? bindData.device_id.trim()
      : null;
    if (!maybeDeviceId) {
      console.warn('[Cloud] cloud_device_id hydrate succeeded but response has no device_id');
      return false;
    }

    syncState.deviceId = maybeDeviceId;
    await cloudStorageSet({
      [CLOUD_CONFIG.KEYS.DEVICE_ID]: maybeDeviceId,
    });
    console.log('[Cloud] Hydrated cloud_device_id via bind fallback');
    return true;
  } catch (e) {
    console.warn('[Cloud] cloud_device_id hydrate failed:', e?.message || e);
    return false;
  }
}

export function getSyncState() {
  return { ...syncState };
}

export function getCloudConfig() {
  return { ...CLOUD_CONFIG };
}

export async function hydrateCloudSyncStateFromStorage() {
  const storage = await chrome.storage.local.get([
    CLOUD_CONFIG.KEYS.DEVICE_TOKEN,
    CLOUD_CONFIG.KEYS.DEVICE_ID,
    CLOUD_CONFIG.KEYS.PROFILE_ID,
    CLOUD_CONFIG.KEYS.CONFIG_VERSION,
    CLOUD_CONFIG.KEYS.MONITORING_ENABLED,
    CLOUD_CONFIG.KEYS.V1_SYNC_ENABLED,
  ]);

  syncState.deviceToken = storage[CLOUD_CONFIG.KEYS.DEVICE_TOKEN] || null;
  syncState.deviceId = storage[CLOUD_CONFIG.KEYS.DEVICE_ID] || null;
  syncState.profileId = storage[CLOUD_CONFIG.KEYS.PROFILE_ID] || null;
  syncState.lastConfigVersion = storage[CLOUD_CONFIG.KEYS.CONFIG_VERSION] || 0;
  syncState.monitoringEnabled = storage[CLOUD_CONFIG.KEYS.MONITORING_ENABLED] ?? 1;

  const v1Stored = storage[CLOUD_CONFIG.KEYS.V1_SYNC_ENABLED];
  statsFoundationV1SyncEnabled = typeof v1Stored === 'boolean' ? v1Stored : true;
  syncState.v1SyncEnabled = statsFoundationV1SyncEnabled;
  if (typeof v1Stored !== 'boolean') {
    await cloudStorageSet({
      [CLOUD_CONFIG.KEYS.V1_SYNC_ENABLED]: statsFoundationV1SyncEnabled,
    }).catch(() => {});
  }

  return getSyncState();
}

function pickFirstArray(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function normalizeCloudRulesConfig(cloudConfig) {
  const cfg = { ...(cloudConfig || {}) };

  const defaultStudySites = pickFirstArray(cfg, [
    'defaultStudySites',
    'defaultStudyList',
    'systemConfiguredStudySites',
    'systemConfiguredStudyList',
  ]);
  const defaultCompositeSites = pickFirstArray(cfg, [
    'defaultCompositeSites',
    'defaultCompositeList',
    'systemConfiguredCompositeSites',
    'systemConfiguredCompositeList',
  ]);
  const defaultRestrictedEntertainmentSites = pickFirstArray(cfg, [
    'defaultRestrictedEntertainmentSites',
    'defaultRestrictedEntertainmentList',
    'systemConfiguredRestrictedEntertainmentSites',
    'systemConfiguredRestrictedEntertainmentList',
  ]);
  const defaultBlockedSites = pickFirstArray(cfg, [
    'defaultBlockedSites',
    'defaultBlockedList',
    'defaultUnsafeSites',
    'defaultUnsafeList',
    'systemConfiguredBlockedSites',
    'systemConfiguredBlockedList',
    'systemConfiguredUnsafeSites',
    'systemConfiguredUnsafeList',
  ]);
  const defaultUserCompositeSites = pickFirstArray(cfg, [
    'defaultUserCompositeSites',
    'defaultUserCompositeList',
    'recommendedCompositeSites',
  ]);

  if (defaultStudySites) cfg.defaultStudySites = defaultStudySites;
  if (defaultCompositeSites) cfg.defaultCompositeSites = defaultCompositeSites;
  if (defaultRestrictedEntertainmentSites) cfg.defaultRestrictedEntertainmentSites = defaultRestrictedEntertainmentSites;
  if (defaultBlockedSites) cfg.defaultBlockedSites = defaultBlockedSites;
  if (defaultUserCompositeSites) cfg.defaultUserCompositeSites = defaultUserCompositeSites;

  return normalizeRuntimeSiteAccessConfig(cfg, { fallbackConfig: DEFAULT_CONFIG }).config;
}

const DEFAULT_SITE_LIST_FIELD_GROUPS = {
  study: [
    'defaultStudySites',
    'defaultStudyList',
    'systemConfiguredStudySites',
    'systemConfiguredStudyList',
  ],
  composite: [
    'defaultCompositeSites',
    'defaultCompositeList',
    'defaultUserCompositeSites',
    'defaultUserCompositeList',
    'recommendedCompositeSites',
    'systemConfiguredCompositeSites',
    'systemConfiguredCompositeList',
    'systemConfiguredUserCompositeSites',
    'systemConfiguredUserCompositeList',
  ],
  restricted: [
    'defaultRestrictedEntertainmentSites',
    'defaultRestrictedEntertainmentList',
    'systemConfiguredRestrictedEntertainmentSites',
    'systemConfiguredRestrictedEntertainmentList',
  ],
  blocked: [
    'defaultBlockedSites',
    'defaultBlockedList',
    'defaultUnsafeSites',
    'defaultUnsafeList',
    'systemConfiguredBlockedSites',
    'systemConfiguredBlockedList',
    'systemConfiguredUnsafeSites',
    'systemConfiguredUnsafeList',
  ],
};

function localConfigMissingCloudDefaultLists(localConfig) {
  return Object.values(DEFAULT_SITE_LIST_FIELD_GROUPS).some((keys) => !pickFirstArray(localConfig, keys));
}

function responseHasCloudDefaultLists(remoteConfig) {
  return Object.values(DEFAULT_SITE_LIST_FIELD_GROUPS).some((keys) => !!pickFirstArray(remoteConfig, keys));
}

function shouldSaveDespiteVersionSkip(remoteConfig, localConfig) {
  if (!responseHasCloudDefaultLists(remoteConfig)) return false;
  if (!localConfigMissingCloudDefaultLists(localConfig)) return false;
  for (const keys of Object.values(DEFAULT_SITE_LIST_FIELD_GROUPS)) {
    const localList = pickFirstArray(localConfig, keys);
    const remoteList = pickFirstArray(remoteConfig, keys);
    if (!localList && Array.isArray(remoteList)) return true;
  }
  return false;
}

// ── Cloud request ───────────────────────────────────────────────────────────────

async function cloudRequest(method, path, body = null, retries = 3) {
  if (!syncState.deviceToken) {
    throw new Error('No device token');
  }

  let lastError = null;
  await markCloudConnectionAttempt(path);
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLOUD_CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncState.deviceToken}`,
      };
      const clientVersion = getCloudClientVersion();
      const requestId = syncState.currentRequestId || createCloudRequestId('request');
      if (clientVersion) headers['X-TimeOnChrome-Version'] = clientVersion;
      if (syncState.deviceId) headers['X-TimeOnChrome-Device-Id'] = syncState.deviceId;
      if (requestId) headers['X-TimeOnChrome-Request-Id'] = requestId;
      const options = {
        method,
        signal: controller.signal,
        headers,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const resp = await fetch(`${getCloudApiBase()}${path}`, options);
      clearTimeout(timeoutId);

      if (resp.ok) {
        const contentType = resp.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const payload = await resp.json();
          if (isDeviceUnboundPayload(payload)) {
            await clearCloudBindingState('cloud_response_unbound');
            throw makeDeviceUnboundError(payload?.error || 'Device unbound');
          }
          await markCloudConnectionSuccess(path, resp.status);
          return payload;
        }
        await markCloudConnectionSuccess(path, resp.status);
        return { success: true };
      }

      const responseText = await resp.text().catch(() => '');
      let err = { error: `HTTP ${resp.status}` };
      if (responseText) {
        try {
          err = JSON.parse(responseText);
        } catch {
          err = { error: responseText.slice(0, 300) };
        }
      }
      if (isDeviceUnboundPayload(err)) {
        await clearCloudBindingState('cloud_error_unbound');
        throw makeDeviceUnboundError(err?.error || 'Device unbound');
      }
      const message = err?.error || err?.message || `HTTP ${resp.status}`;
      const nonRetryable = resp.status >= 400 && resp.status < 500 && resp.status !== 429;
      const error = new Error(`HTTP ${resp.status}: ${message}`);
      error.status = resp.status;
      error.code = err?.code || null;
      error.response = err;
      error.endpoint = path;
      if (nonRetryable) {
        error.nonRetryable = true;
      }
      throw error;

    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e;
      const errorMessage = e?.name === 'AbortError'
        ? `request timeout after ${CLOUD_CONFIG.REQUEST_TIMEOUT_MS}ms`
        : e.message;
      console.error(`[Cloud] Attempt ${attempt + 1} failed:`, errorMessage);
      if (e.message.includes('expired') || e.message.includes('Unauthorized') || e.nonRetryable) {
        if (e?.code !== 'DEVICE_UNBOUND') {
          await markCloudConnectionFailure(path, e);
        }
        throw e;
      }
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  const rootMessage = lastError?.message || 'unknown_error';
  const error = new Error(`Max retries exceeded: ${rootMessage}`);
  error.endpoint = path;
  error.cause = lastError;
  if (lastError?.status) error.status = lastError.status;
  if (lastError?.code) error.code = lastError.code;
  if (lastError?.response) error.response = lastError.response;
  await markCloudConnectionFailure(path, error);
  throw error;
}

async function cloudAnonymousRequest(method, path, body = null) {
  await markCloudConnectionAttempt(path);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUD_CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    const clientVersion = getCloudClientVersion();
    const requestId = syncState.currentRequestId || createCloudRequestId('recover');
    if (clientVersion) headers['X-TimeOnChrome-Version'] = clientVersion;
    if (requestId) headers['X-TimeOnChrome-Request-Id'] = requestId;
    const resp = await fetch(`${getCloudApiBase()}${path}`, {
      method,
      signal: controller.signal,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    clearTimeout(timeoutId);
    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
      const error = new Error(payload?.error || payload?.message || `HTTP ${resp.status}`);
      error.status = resp.status;
      error.code = payload?.code || null;
      error.response = payload;
      error.endpoint = path;
      await markCloudConnectionFailure(path, error);
      throw error;
    }
    await markCloudConnectionSuccess(path, resp.status);
    return payload || { success: true };
  } catch (error) {
    clearTimeout(timeoutId);
    await markCloudConnectionFailure(path, error);
    throw error;
  }
}

async function linkChromeIdentityIfPossible({ force = false } = {}) {
  const activation = await requireIdentityRecoveryActivation();
  if (!activation.ok) return { ok: false, skipped: true, reason: activation.reason || 'runtime_activation_required' };
  if (!syncState.deviceToken) return { ok: false, skipped: true, reason: 'no_device_token' };
  const storage = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.IDENTITY_LINK_LAST_AT).catch(() => ({}));
  const lastAt = Number(storage?.[CLOUD_CONFIG.KEYS.IDENTITY_LINK_LAST_AT] || 0);
  if (!force && lastAt > 0 && Date.now() - lastAt < DEVICE_IDENTITY_LINK_INTERVAL_MS) {
    return { ok: true, skipped: true, reason: 'recently_linked' };
  }
  const identity = await getChromeProfileIdentity();
  if (!identity.ok) {
    await writeChromeIdentityStatus({ available: false, reason: identity.reason, error: identity.error || null });
    logClientEventBestEffort({
      level: 'warning',
      category: 'cloud',
      eventCode: 'chrome_identity_unavailable',
      module: 'infra/cloud-sync',
      message: 'Chrome profile identity is unavailable for device recovery',
      details: { reason: identity.reason, platform: getClientPlatform() },
    });
    return { ok: false, skipped: true, reason: identity.reason };
  }
  const result = await cloudRequest('POST', '/device/identity-link', buildDeviceIdentityPayload(identity), 1);
  await cloudStorageSet({ [CLOUD_CONFIG.KEYS.IDENTITY_LINK_LAST_AT]: Date.now() }).catch(() => {});
  await writeChromeIdentityStatus({ available: true, linked: result?.identityLinked !== false, reason: null });
  logDeviceRecoveryEvent('info', 'device_recovery_identity_linked', 'Chrome profile identity linked for device recovery', {
    linked: result?.identityLinked !== false,
  });
  return { ok: true, linked: result?.identityLinked !== false };
}

async function saveRecoveryState(patch = {}) {
  const storage = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.RECOVERY_STATE).catch(() => ({}));
  const previous = storage?.[CLOUD_CONFIG.KEYS.RECOVERY_STATE] || {};
  await cloudStorageSet({
    [CLOUD_CONFIG.KEYS.RECOVERY_STATE]: {
      ...previous,
      ...patch,
      updatedAt: Date.now(),
    },
  }).catch(() => {});
}

async function persistRecoveredBinding(payload, source = 'device_recovery') {
  const updates = {
    [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: payload.device_token || payload.deviceToken || null,
    [CLOUD_CONFIG.KEYS.DEVICE_ID]: payload.device_id || payload.deviceId || null,
    [CLOUD_CONFIG.KEYS.PROFILE_ID]: payload.profile_id || payload.profileId || null,
    [CLOUD_CONFIG.KEYS.RECOVERY_REQUEST_ID]: null,
    [CLOUD_CONFIG.KEYS.RECOVERY_POLL_TOKEN]: null,
  };
  if (!updates[CLOUD_CONFIG.KEYS.DEVICE_TOKEN] || !updates[CLOUD_CONFIG.KEYS.PROFILE_ID]) {
    throw new Error('Recovered binding is missing device token or profile id');
  }
  if (payload.profile_name || payload.profileName) updates.cloud_profile_name = payload.profile_name || payload.profileName;
  if (payload.account_email || payload.accountEmail) {
    updates[CLOUD_CONFIG.KEYS.ACCOUNT_EMAIL] = String(payload.account_email || payload.accountEmail).trim().toLowerCase();
  }
  await cloudStorageSet(updates);
  syncState.deviceToken = updates[CLOUD_CONFIG.KEYS.DEVICE_TOKEN];
  syncState.deviceId = updates[CLOUD_CONFIG.KEYS.DEVICE_ID];
  syncState.profileId = updates[CLOUD_CONFIG.KEYS.PROFILE_ID];
  await saveRecoveryState({ status: 'recovered', source, lastRecoveredAt: Date.now(), lastError: null });
  logClientEventBestEffort({
    level: 'warning',
    category: 'cloud',
    eventCode: 'device_binding_recovered',
    module: 'infra/cloud-sync',
    message: 'Device binding recovered by cloud',
    details: {
      source,
      deviceId: syncState.deviceId || null,
      profileId: syncState.profileId || null,
      platform: getClientPlatform(),
    },
  });
}

function isTerminalDeviceRecoveryStatus(status) {
  const value = String(status || '').toUpperCase();
  return new Set([
    'IGNORED',
    'EXPIRED',
    'FAILED',
    'RECOVERY_REQUEST_NOT_FOUND',
    'DEVICE_UNBOUND',
  ]).has(value);
}

async function clearPendingDeviceRecoveryState(status, message = null) {
  await cloudStorageSet({
    [CLOUD_CONFIG.KEYS.RECOVERY_REQUEST_ID]: null,
    [CLOUD_CONFIG.KEYS.RECOVERY_POLL_TOKEN]: null,
  }).catch(() => {});
  await saveRecoveryState({
    status: String(status || 'not_recovered').toLowerCase(),
    lastAttemptAt: Date.now(),
    lastPollAt: Date.now(),
    lastError: message || status || 'recovery_request_closed',
  });
}

async function pollPendingDeviceRecovery() {
  const storage = await chrome.storage.local.get([
    CLOUD_CONFIG.KEYS.RECOVERY_REQUEST_ID,
    CLOUD_CONFIG.KEYS.RECOVERY_POLL_TOKEN,
  ]).catch(() => ({}));
  const requestId = storage?.[CLOUD_CONFIG.KEYS.RECOVERY_REQUEST_ID];
  const pollToken = storage?.[CLOUD_CONFIG.KEYS.RECOVERY_POLL_TOKEN];
  if (!requestId || !pollToken) return { ok: false, skipped: true, reason: 'no_pending_recovery' };
  let result = null;
  try {
    result = await cloudAnonymousRequest('GET', `/device/recover/status?requestId=${encodeURIComponent(requestId)}&pollToken=${encodeURIComponent(pollToken)}`);
  } catch (error) {
    await saveRecoveryState({ status: 'pending_cloud_confirmation', lastPollAt: Date.now(), lastError: error?.message || String(error) });
    throw error;
  }
  if (result?.status === 'RECOVERED') {
    await persistRecoveredBinding(result, 'cloud_approved_recovery');
    logDeviceRecoveryEvent('info', 'device_recovery_poll_result', 'Device recovery polling completed with recovered binding', {
      status: 'RECOVERED',
      recoveryRequestId: requestId,
    });
    return { ok: true, recovered: true };
  }
  const status = result?.status || result?.code || 'pending';
  if (isTerminalDeviceRecoveryStatus(status)) {
    await clearPendingDeviceRecoveryState(status, result?.message || result?.error || null);
    logDeviceRecoveryEvent('warning', 'device_recovery_poll_result', 'Device recovery polling reached a terminal state', {
      status,
      recoveryRequestId: requestId,
    });
    return { ok: true, recovered: false, terminal: true, status };
  }
  await saveRecoveryState({ status: result?.status || 'pending', lastPollAt: Date.now(), lastError: result?.message || null });
  logDeviceRecoveryEvent('info', 'device_recovery_poll_result', 'Device recovery polling did not return a binding yet', {
    status,
    recoveryRequestId: requestId,
  });
  return { ok: true, recovered: false, pending: true, status };
}

async function tryRecoverCloudBindingIfMissing(reason = 'sync') {
  const activation = await requireRuntimeActivation();
  if (!activation.ok) {
    await saveRecoveryState({ status: activation.reason || 'runtime_activation_required', lastError: activation.reason || 'runtime_activation_required' });
    return { ok: false, skipped: true, reason: activation.reason || 'runtime_activation_required' };
  }
  if (syncState.deviceToken) return { ok: true, skipped: true, reason: 'has_device_token' };
  const storage = await chrome.storage.local.get([
    CLOUD_CONFIG.KEYS.RECOVERY_STATE,
    CLOUD_CONFIG.KEYS.RECOVERY_REQUEST_ID,
    CLOUD_CONFIG.KEYS.RECOVERY_POLL_TOKEN,
  ]).catch(() => ({}));
  const previous = storage?.[CLOUD_CONFIG.KEYS.RECOVERY_STATE] || {};
  const lastAttemptAt = Number(previous.lastAttemptAt || 0);
  const hasPendingRecoveryRequest = !!(storage?.[CLOUD_CONFIG.KEYS.RECOVERY_REQUEST_ID] && storage?.[CLOUD_CONFIG.KEYS.RECOVERY_POLL_TOKEN]);
  if (hasPendingRecoveryRequest) {
    const pending = await pollPendingDeviceRecovery().catch((error) => ({ ok: false, pending: true, reason: 'recovery_poll_failed', error: error?.message || String(error) }));
    if (pending?.recovered || pending?.pending || pending?.terminal) return pending;
    return { ok: false, skipped: true, reason: pending?.reason || 'recovery_poll_failed' };
  }
  if (lastAttemptAt > 0 && Date.now() - lastAttemptAt < DEVICE_RECOVERY_RETRY_MS) {
    return { ok: false, skipped: true, reason: 'retry_backoff' };
  }

  await saveRecoveryState({ status: 'attempting', reason, lastAttemptAt: Date.now(), platform: getClientPlatform() });
  logDeviceRecoveryEvent('info', 'device_recovery_attempt_started', 'Device binding recovery attempt started', { reason });

  if (activation.activation?.activationMode === 'managed_policy') {
    const managedResult = await tryManagedPolicyRecovery(activation.activation, reason).catch((error) => {
      logDeviceRecoveryEvent('error', 'managed_device_recovery_failed', 'Managed policy device recovery request failed', {
        error: error?.message || String(error),
      });
      return { ok: false, reason: 'managed_policy_recovery_failed', error: error?.message || String(error) };
    });
    if (managedResult?.recovered || managedResult?.terminal) return managedResult;
    if (activation.activation?.managedPolicy?.allowIdentityRecovery === false) {
      return managedResult || { ok: false, reason: 'identity_recovery_disabled_by_policy' };
    }
  }

  const identity = await getChromeProfileIdentity();
  if (!identity.ok) {
    await writeChromeIdentityStatus({ available: false, reason: identity.reason, error: identity.error || null });
    await saveRecoveryState({ status: 'identity_unavailable', lastError: identity.reason });
    logDeviceRecoveryEvent('warning', 'device_recovery_identity_unavailable', 'Chrome profile identity unavailable during device recovery', {
      reason: identity.reason,
      error: identity.error || null,
    });
    return { ok: false, reason: identity.reason };
  }
  await writeChromeIdentityStatus({ available: true, reason: null });

  try {
    const result = await cloudAnonymousRequest('POST', '/device/recover/bootstrap', buildDeviceIdentityPayload(identity));
    logDeviceRecoveryEvent(result?.status === 'RECOVERED' ? 'info' : 'warning', 'device_recovery_bootstrap_result', 'Device recovery bootstrap returned a result', {
      status: result?.status || result?.code || 'unknown',
      recoveryRequestId: result?.recoveryRequestId || null,
    });
    if (result?.status === 'RECOVERED') {
      await persistRecoveredBinding(result, 'auto_recovery');
      return { ok: true, recovered: true };
    }
    if (result?.status === 'PENDING_CLOUD_CONFIRMATION') {
      await cloudStorageSet({
        [CLOUD_CONFIG.KEYS.RECOVERY_REQUEST_ID]: result.recoveryRequestId || null,
        [CLOUD_CONFIG.KEYS.RECOVERY_POLL_TOKEN]: result.recoveryPollToken || null,
      }).catch(() => {});
      await saveRecoveryState({ status: 'pending_cloud_confirmation', recoveryRequestId: result.recoveryRequestId || null, lastError: 'waiting_cloud_confirmation' });
      logDeviceRecoveryEvent('warning', 'device_recovery_pending_cloud_confirmation', 'Device recovery is waiting for cloud confirmation', {
        recoveryRequestId: result.recoveryRequestId || null,
      });
      return { ok: true, recovered: false, status: 'pending_cloud_confirmation' };
    }
    if (result?.status === 'DEVICE_UNBOUND' || result?.code === 'DEVICE_UNBOUND') {
      await clearCloudBindingState('recovery_unbound');
      return { ok: false, reason: 'device_unbound' };
    }
    await saveRecoveryState({ status: result?.status || result?.code || 'not_recovered', lastError: result?.code || null });
    return { ok: false, reason: result?.code || result?.status || 'not_recovered' };
  } catch (error) {
    await saveRecoveryState({ status: 'failed', lastError: error?.message || String(error) });
    logDeviceRecoveryEvent('error', 'device_recovery_failed', 'Device recovery request failed', {
      error: error?.message || String(error),
    });
    return { ok: false, reason: 'recovery_failed', error: error?.message || String(error) };
  }
}

function summarizeDailyStatsPayload(date, payload) {
  const domains = Array.isArray(payload?.domains) ? payload.domains : [];
  const modeCounts = {};
  const channelCounts = { active: 0, backgroundMedia: 0, pip: 0 };
  let invalidRows = 0;
  let nonPositiveRows = 0;
  let missingRequiredRows = 0;
  let totalRows = 0;

  for (const item of domains) {
    const domain = typeof item?.domain === 'string' ? item.domain.trim() : '';
    if (!domain || !payload?.date) {
      missingRequiredRows++;
      continue;
    }

    const rows = [
      { channel: 'active', byMode: item?.activeByMode },
      { channel: 'backgroundMedia', byMode: item?.backgroundMediaByMode },
      { channel: 'pip', byMode: item?.pipByMode },
    ];

    for (const row of rows) {
      const byMode = row.byMode && typeof row.byMode === 'object' ? row.byMode : {};
      const entries = Object.entries(byMode);
      if (entries.length === 0) continue;
      for (const [mode, value] of entries) {
        totalRows++;
        const seconds = Number(value);
        if (!Number.isFinite(seconds)) {
          invalidRows++;
          continue;
        }
        if (seconds <= 0) {
          nonPositiveRows++;
          continue;
        }
        if (channelCounts[row.channel] !== undefined) {
          channelCounts[row.channel]++;
        }
        modeCounts[mode] = (modeCounts[mode] || 0) + 1;
      }
    }
  }

  return {
    date,
    domainCount: domains.length,
    totalExpandedRows: totalRows,
    invalidRows,
    nonPositiveRows,
    missingRequiredRows,
    channelCounts,
    modeCounts,
  };
}

function isCloudSchemaIncompatibilityError(error) {
  const text = [
    error?.message,
    error?.code,
    error?.response?.message,
    error?.response?.error,
  ].filter(Boolean).join(' ');
  return /no such column|no such table|schema/i.test(text);
}

function logCloudSchemaIncompatibility(endpoint, error) {
  if (!isCloudSchemaIncompatibilityError(error)) return;
  logClientEventBestEffort({
    level: 'error',
    category: 'cloud',
    eventCode: 'cloud_schema_incompatibility_detected',
    module: 'infra/cloud-sync',
    message: error?.message || 'Cloud schema incompatibility detected',
    details: { endpoint, status: error?.status || null, code: error?.code || null, response: error?.response || null },
  });
}

// ── Pull config ─────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{status: 'updated'|'skipped'|'failed', version: number|null, error: string|null}>}
 */
export async function pullCloudConfig(getConfigFn, saveConfigFn, updateDeclarativeRulesFn) {
  try {
    const result = await cloudRequest('GET', '/device/config');

    if (!result || typeof result !== 'object') {
      console.warn('[Cloud] Pull config: API returned invalid response structure');
      return { status: 'failed', version: null, error: 'Invalid API response' };
    }

    if (!result.data) {
      console.warn('[Cloud] Pull config: response missing "data" field, skipping');
      return { status: 'failed', version: result.version || null, error: 'No config data in response' };
    }

    const cloudVersion = result.version || 0;
    if (typeof cloudVersion !== 'number' || cloudVersion < 0) {
      console.warn('[Cloud] Pull config: invalid version number', cloudVersion);
      return { status: 'failed', version: cloudVersion, error: 'Invalid config version' };
    }

    const monitoringEnabled = result.monitoring_enabled ?? 1;
    const maybeProfileId = typeof result.profile_id === 'string' && result.profile_id.trim() ? result.profile_id.trim() : null;
    const maybeDeviceId = typeof result.device_id === 'string' && result.device_id.trim() ? result.device_id.trim() : null;
    const syncMetadata = { [CLOUD_CONFIG.KEYS.MONITORING_ENABLED]: monitoringEnabled };
    if (maybeProfileId) syncMetadata[CLOUD_CONFIG.KEYS.PROFILE_ID] = maybeProfileId;
    if (maybeDeviceId) syncMetadata[CLOUD_CONFIG.KEYS.DEVICE_ID] = maybeDeviceId;
    if (result.profile_name || result.profileName) syncMetadata.cloud_profile_name = result.profile_name || result.profileName;
    if (result.account_email || result.accountEmail) {
      syncMetadata[CLOUD_CONFIG.KEYS.ACCOUNT_EMAIL] = String(result.account_email || result.accountEmail).trim().toLowerCase();
    }
    await cloudStorageSet(syncMetadata);
    syncState.monitoringEnabled = monitoringEnabled;
    if (maybeProfileId) syncState.profileId = maybeProfileId;
    if (maybeDeviceId) syncState.deviceId = maybeDeviceId;
    const localConfig = await getConfigFn();

    if (cloudVersion > 0 && cloudVersion <= syncState.lastConfigVersion &&
      !shouldSaveDespiteVersionSkip(result.data, localConfig)) {
      const localRuntime = normalizeRuntimeSiteAccessConfig(localConfig, { fallbackConfig: DEFAULT_CONFIG });
      if (localRuntime.changed) {
        await saveConfigFn(localRuntime.config);
        if (updateDeclarativeRulesFn) await updateDeclarativeRulesFn(localRuntime.config);
      }
      console.log('[Cloud] Config up to date, skip pull (local:', syncState.lastConfigVersion, 'cloud:', cloudVersion, ')');
      await cloudStorageSet({ [CLOUD_CONFIG.KEYS.LAST_SYNC]: Date.now() });
      return { status: 'skipped', version: cloudVersion, error: null };
    }

    await cloudStorageSet({
      [CLOUD_CONFIG.KEYS.LOCAL_CONFIG]: result.data,
      [CLOUD_CONFIG.KEYS.CONFIG_VERSION]: cloudVersion,
      [CLOUD_CONFIG.KEYS.LAST_SYNC]: Date.now()
    });

    // 云端配置为唯一来源，不再与本地 DEFAULT_CONFIG merge
    // 仅保留终端专属字段（不通过云端同步）
    const cloudConfig = normalizeCloudRulesConfig(result.data);
    const mergedConfig = {
      ...cloudConfig,
      // 终端专属字段：不通过云端同步，始终使用本地值
      adminPasswordHash: localConfig.adminPasswordHash,
      isInitialized: localConfig.isInitialized,
      lockedDomains: localConfig.lockedDomains,
    };
    // quotaState 由 pullCloudQuotaState 单独同步，此处不覆盖
    if (localConfig.quotaState) {
      mergedConfig.quotaState = localConfig.quotaState;
    }
    await saveConfigFn(mergedConfig);
    if (updateDeclarativeRulesFn) await updateDeclarativeRulesFn(mergedConfig);

    syncState.lastConfigVersion = cloudVersion;
    console.log('[Cloud] Config updated, version:', cloudVersion);
    return { status: 'updated', version: cloudVersion, error: null };
  } catch (e) {
    console.error('[Cloud] Failed to pull config:', e.message);
    logCloudSchemaIncompatibility('/device/config', e);
    logClientEventBestEffort({
      level: 'error',
      category: 'cloud',
      eventCode: 'cloud_config_pull_failed',
      module: 'infra/cloud-sync',
      message: e?.message || 'Cloud config pull failed',
      details: { endpoint: '/device/config', status: e?.status || null, code: e?.code || null, response: e?.response || null },
    });
    return { status: 'failed', version: null, error: e.message };
  }
}

// ── Pull quota state ────────────────────────────────────────────────────────────

/**
 * Cloud quota state is a fact input only. It must not trigger mode changes,
 * notifications, Reminder redirects, or all-tab scans.
 * @returns {Promise<{synced: boolean, changed: boolean, oldState: object|null, newState: object|null, error: string|null}>}
 */
export async function pullCloudQuotaState(getConfigFn, saveConfigFn) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await cloudRequest('GET', `/device/quota-state?date=${today}`);

    const config = await getConfigFn();
    const localQs = config.quotaState || {};

    const newState = {
      onlineLocked: localQs.onlineLocked || result.onlineLocked,
      studyLocked: localQs.studyLocked || result.studyLocked,
      restLocked: localQs.restLocked || result.restLocked,
      undeterminedLocked: localQs.undeterminedLocked || result.undeterminedLocked,
      weeklyRestLocked: localQs.weeklyRestLocked || result.weeklyRestLocked,
    };

    const stateChanged = newState.onlineLocked !== localQs.onlineLocked ||
      newState.studyLocked !== localQs.studyLocked ||
      newState.restLocked !== localQs.restLocked ||
      newState.undeterminedLocked !== localQs.undeterminedLocked ||
      newState.weeklyRestLocked !== localQs.weeklyRestLocked;

    if (stateChanged) {
      config.quotaState = newState;
      await saveConfigFn(config);
      console.log('[Cloud] Quota state fact synced from cloud:', newState);
    }
    return { synced: true, changed: stateChanged, oldState: localQs, newState, error: null };
  } catch (e) {
    console.error('[Cloud] Failed to pull quota state:', e.message);
    return { synced: false, changed: false, oldState: null, newState: null, error: e.message };
  }
}

// ── Upload stats ────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{uploaded: number, failed: number, skipped: boolean}>}
 */
// ── Legacy stats upload (V0 compatibility path) ─────────────────────────────────

/**
 * 旧版 stats 上传 — 仅上传 active aggregate（无 backgroundMedia、无 PiP、无 segments）。
 * 使用 getStatsRange() 读取 daily_usage_stats_v1（Phase 1C 迁移）。
 * 不是 Stats Foundation segment upload 路径。
 * V1 替换项：`uploadDailyStatsV1()` + `uploadUsageSegmentsV1()`。
 */
export async function uploadStats() {
  try {
    const statsRange = await getStatsRange(7);

    const storage = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.PENDING_STATS);
    let pendingStats = storage[CLOUD_CONFIG.KEYS.PENDING_STATS] || {};

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const dayData = statsRange[dateStr] || {};
      const stats = Object.entries(dayData)
        .filter(([domain, sec]) => domain !== 'audioSeconds' && domain !== 'backgroundMediaByDomain' && domain !== 'pipSeconds' && domain !== 'pipByDomain' && typeof sec === 'number' && sec > 0)
        .map(([domain, sec]) => ({ domain, active_sec: sec, passive_sec: 0 }));

      if (stats.length > 0) {
        pendingStats[dateStr] = { stats, timestamp: Date.now() };
      }
    }

    const dates = Object.keys(pendingStats);
    if (dates.length === 0) {
      console.log('[Cloud] No stats to upload');
      return { uploaded: 0, failed: 0, skipped: true };
    }

    let uploaded = 0;
    let failed = 0;
    for (const date of dates) {
      const { stats } = pendingStats[date];
      try {
        await cloudRequest('POST', '/device/stats', { date, stats });
        delete pendingStats[date];
        console.log('[Cloud] Stats uploaded:', date, `(${stats.length} domains)`);
        uploaded++;
      } catch (e) {
        console.error('[Cloud] Failed to upload stats for', date, e.message);
        failed++;
      }
    }

    await cloudStorageSet({ [CLOUD_CONFIG.KEYS.PENDING_STATS]: pendingStats });
    return { uploaded, failed, skipped: false };
  } catch (e) {
    console.error('[Cloud] Failed to upload stats:', e.message);
    return { uploaded: 0, failed: 0, skipped: false, error: e.message };
  }
}

// ── Sync now ────────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{configPulled: boolean, statsUploaded: boolean, quotaSynced: boolean, hadFailure: boolean, errors: string[]}>}
 */
export async function syncNow(getConfigFn, saveConfigFn, updateDeclarativeRulesFn, optionsOrLegacyRedirectAllTabs = {}, _legacyRedirectQuotaViolatingTabs = null, legacyOptions = {}) {
  const activation = await requireRuntimeActivation();
  if (!activation.ok) {
    console.log('[Cloud] Sync skipped: runtime activation required');
    return {
      configPulled: false,
      siteRequestsSynced: false,
      statsUploaded: false,
      quotaSynced: false,
      hadFailure: false,
      skipped: true,
      reason: activation.reason || 'runtime_activation_required',
      errors: [],
    };
  }
  const options = typeof optionsOrLegacyRedirectAllTabs === 'function'
    ? (legacyOptions || {})
    : (optionsOrLegacyRedirectAllTabs || {});
  await hydrateCloudSyncStateFromStorage();
  if (!syncState.deviceToken) {
    await tryRecoverCloudBindingIfMissing('sync_now');
  }
  if (!syncState.deviceToken) {
    console.log('[Cloud] Sync skipped: no device token (not yet initialized or unbound)');
    return { configPulled: false, siteRequestsSynced: false, statsUploaded: false, quotaSynced: false, hadFailure: true, errors: ['device recovery pending or unavailable'] };
  }

  if (syncState.isSyncing) {
    const ageMs = Date.now() - Number(syncState.syncStartedAt || 0);
    if (ageMs > CLOUD_CONFIG.SYNC_STALE_LOCK_MS) {
      console.warn('[Cloud] Stale sync lock detected, resetting:', ageMs);
      syncState.isSyncing = false;
      syncState.syncStartedAt = 0;
    } else {
      console.log('[Cloud] Sync already in progress; scheduling follow-up sync');
      syncState.followUpSyncRequested = true;
      syncState.followUpForceRetryExhausted = syncState.followUpForceRetryExhausted || !!options.forceRetryExhausted;
      return {
        configPulled: false,
        siteRequestsSynced: false,
        statsUploaded: false,
        quotaSynced: false,
        hadFailure: false,
        skipped: true,
        reason: 'sync_already_in_progress',
        followUpScheduled: true,
        errors: [],
      };
    }
  }

  syncState.isSyncing = true;
  syncState.syncStartedAt = Date.now();
  const previousRequestId = syncState.currentRequestId;
  syncState.currentRequestId = createCloudRequestId('sync');
  const errors = [];

  try {
    try {
      await runV1StorageMaintenance({ reason: 'cloud_sync_preflight' });
      await reconcileUsageLedger();
      await drainUsageSettlementJournal();
    } catch (maintenanceError) {
      console.warn('[Cloud] Storage maintenance preflight failed:', maintenanceError?.message || maintenanceError);
    }
    await hydrateDeviceIdFromBindIfMissing();
    await linkChromeIdentityIfPossible().catch((error) => {
      console.warn('[Cloud] Chrome identity link failed:', error?.message || error);
    });

    const configResult = await pullCloudConfig(getConfigFn, saveConfigFn, updateDeclarativeRulesFn);
    const configPulled = configResult.status === 'updated';
    if (configResult.status === 'failed') {
      errors.push('config: ' + (configResult.error || 'unknown'));
    }

    const siteRequestResult = await syncSiteClassificationRequestsV1({
      enabled: true,
      forceRetryExhausted: !!options.forceRetryExhausted,
    });
    const siteRequestsSynced = siteRequestResult.failed === 0 && (siteRequestResult.errors || []).length === 0;
    if (!siteRequestsSynced) {
      errors.push(...(siteRequestResult.errors || ['site requests: unknown failure']).map((e) => `site_requests: ${e}`));
    }

    let classificationSyncEffects = null;
    const shouldRunClassificationEffects = !!(
      configPulled ||
      Number(siteRequestResult.uploaded || 0) > 0 ||
      Number(siteRequestResult.pulled || 0) > 0
    );
    if (shouldRunClassificationEffects && typeof options.afterClassificationSync === 'function') {
      try {
        classificationSyncEffects = await options.afterClassificationSync({
          source: 'cloud_sync',
          configPulled,
          siteRequestResult,
        });
      } catch (e) {
        const message = e?.message || String(e);
        errors.push(`classification_effects: ${message}`);
        logClientEventBestEffort({
          level: 'warning',
          category: 'access',
          eventCode: 'classification_sync_effects_failed',
          module: 'infra/cloud-sync',
          message,
          details: { configPulled, siteRequestsPulled: siteRequestResult.pulled || 0 },
        });
      }
    }

    const clientLogResult = await uploadClientLogsV1({ enabled: true });

    let statsUploaded = false;
    if (syncState.monitoringEnabled !== 0) {
      if (statsFoundationV1SyncEnabled) {
        const v1Result = await syncStatsFoundationV1({
          enabled: true,
          forceRetryExhausted: !!options.forceRetryExhausted,
        });
        statsUploaded = !v1Result.hadFailure;
        if (v1Result.hadFailure) {
          await cloudStorageSet({
            [CLOUD_CONFIG.KEYS.V1_LAST_SYNC_ERROR]: (v1Result.errors || []).join('; ') || 'v1 sync failed',
          }).catch(() => {});
          errors.push(...(v1Result.errors || ['stats_v1: unknown failure']).map((e) => `stats_v1: ${e}`));
        }
      } else {
        const statsResult = await uploadStats();
        statsUploaded = statsResult.uploaded > 0 || statsResult.skipped;
        if (statsResult.failed > 0) {
          errors.push(`stats: ${statsResult.failed} date(s) failed`);
        }
        if (statsResult.error) {
          errors.push('stats: ' + statsResult.error);
        }
      }
    } else {
      statsUploaded = true; // monitoring disabled, intentionally skipped
    }

    let quotaSynced = false;
    if (syncState.monitoringEnabled !== 0) {
      const quotaResult = await pullCloudQuotaState(getConfigFn, saveConfigFn);
      quotaSynced = quotaResult.synced;
      if (quotaResult.error) {
        errors.push('quota: ' + quotaResult.error);
      }
    } else {
      quotaSynced = true; // monitoring disabled, intentionally skipped
    }

    const hadFailure = errors.length > 0;
    if (hadFailure) {
      console.warn('[Cloud] Sync completed with errors:', errors.join('; '), errors);
      logClientEventBestEffort({
        level: 'warning',
        category: 'cloud',
        eventCode: 'cloud_sync_completed_with_errors',
        module: 'infra/cloud-sync',
        message: 'Cloud sync completed with errors',
        details: { errors },
      });
    } else {
      console.log('[Cloud] Sync completed successfully');
    }

    return {
      configPulled,
      siteRequestsSynced,
      classificationSyncEffects,
      statsUploaded,
      quotaSynced,
      clientLogsUploaded: clientLogResult.uploaded || 0,
      hadFailure,
      errors,
    };
  } catch (e) {
    console.error('[Cloud] Sync failed:', e.message);
    logClientEventBestEffort({
      level: 'error',
      category: 'cloud',
      eventCode: 'cloud_sync_failed',
      module: 'infra/cloud-sync',
      message: e?.message || 'Cloud sync failed',
    });
    const code = e?.code ? `${e.code}: ` : '';
    return { configPulled: false, siteRequestsSynced: false, statsUploaded: false, quotaSynced: false, hadFailure: true, errors: [`${code}${e.message}`] };
  } finally {
    const shouldRunFollowUpSync = syncState.followUpSyncRequested;
    const followUpForceRetryExhausted = syncState.followUpForceRetryExhausted;
    syncState.followUpSyncRequested = false;
    syncState.followUpForceRetryExhausted = false;
    syncState.currentRequestId = previousRequestId;
    syncState.isSyncing = false;
    syncState.syncStartedAt = 0;
    if (shouldRunFollowUpSync) {
      await syncNow(getConfigFn, saveConfigFn, updateDeclarativeRulesFn, {
        ...options,
        forceRetryExhausted: !!options.forceRetryExhausted || !!followUpForceRetryExhausted,
        queuedAfterInProgress: true,
      });
    }
  }
}

// ── V1 Stats Foundation sync orchestration ──────────────────────────────────────

// Feature gate：stats_foundation_v1_sync — 设置为 true 以启用新的 v1 上传路径。
// 在云端 v1 端点实现并由 Product Owner 批准之前，保持 false。
let statsFoundationV1SyncEnabled = true;

/**
 * 启用/禁用 Stats Foundation v1 同步路径。
 * 仅在托管环境中公开（例如 Playwright 测试），不在产品 UI 中公开。
 */
export function setStatsFoundationV1SyncEnabled(enabled) {
  statsFoundationV1SyncEnabled = !!enabled;
  syncState.v1SyncEnabled = statsFoundationV1SyncEnabled;
  cloudStorageSet({
    [CLOUD_CONFIG.KEYS.V1_SYNC_ENABLED]: statsFoundationV1SyncEnabled,
  }).catch(() => {});
}

export function isStatsFoundationV1SyncEnabled() {
  return statsFoundationV1SyncEnabled;
}

export async function getStatsFoundationV1SyncStatus() {
  const [segPending, statsPending, hourlyStatsPending, targetStatsPending, hourlyTargetStatsPending, mediaSegPending, mediaStatsPending, hourlyMediaStatsPending, siteRequestPending, clientLogPending, storage] = await Promise.all([
    getPendingUsageSegments().catch(() => ({ pendingCount: 0 })),
    getPendingDailyStats().catch(() => ({ pendingCount: 0 })),
    getPendingHourlyStats().catch(() => ({ pendingCount: 0 })),
    getPendingTargetStats().catch(() => ({ pendingCount: 0 })),
    getPendingHourlyTargetStats().catch(() => ({ pendingCount: 0 })),
    getPendingMediaSegments().catch(() => ({ pendingCount: 0 })),
    getPendingDailyMediaStats().catch(() => ({ pendingCount: 0 })),
    getPendingHourlyMediaStats().catch(() => ({ pendingCount: 0 })),
    getPendingSiteClassificationRequestUploads().catch(() => ({ pendingCount: 0 })),
    getPendingClientLogsForUpload().catch(() => ({ pendingCount: 0 })),
    chrome.storage.local.get([
      CLOUD_CONFIG.KEYS.V1_SYNC_ENABLED,
      CLOUD_CONFIG.KEYS.V1_LAST_SYNC_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_SYNC_ERROR,
      CLOUD_CONFIG.KEYS.V1_LAST_SEGMENT_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_TARGET_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_TARGET_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE,
      CLOUD_CONFIG.KEYS.USAGE_STATS_TODAY_LAST_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.USAGE_STATS_TODAY_LAST_ERROR,
      CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_ERROR,
      CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_SEGMENT_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_SITE_REQUEST_SYNC_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_CLIENT_LOG_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.CONNECTION_STATE,
    ]).catch(() => ({})),
  ]);
  return {
    enabled: !!(storage?.[CLOUD_CONFIG.KEYS.V1_SYNC_ENABLED] ?? statsFoundationV1SyncEnabled),
    pendingSegments: Number(segPending?.pendingCount || 0),
    pendingStatsDates: Number(statsPending?.pendingCount || 0),
    pendingHourlyStats: Number(hourlyStatsPending?.pendingCount || 0),
    pendingTargetStatsDates: Number(targetStatsPending?.pendingCount || 0),
    pendingHourlyTargetStats: Number(hourlyTargetStatsPending?.pendingCount || 0),
    pendingMediaSegments: Number(mediaSegPending?.pendingCount || 0),
    pendingMediaStatsDates: Number(mediaStatsPending?.pendingCount || 0),
    pendingHourlyMediaStats: Number(hourlyMediaStatsPending?.pendingCount || 0),
    pendingSiteClassificationRequests: Number(siteRequestPending?.pendingCount || 0),
    pendingClientLogs: Number(clientLogPending?.pendingCount || 0),
    lastSyncAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_SYNC_AT] || 0),
    lastError: storage?.[CLOUD_CONFIG.KEYS.V1_LAST_SYNC_ERROR] || null,
    lastSegmentUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_SEGMENT_UPLOAD_AT] || 0),
    lastStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_STATS_UPLOAD_AT] || 0),
    lastHourlyStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_STATS_UPLOAD_AT] || 0),
    lastTargetStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_TARGET_STATS_UPLOAD_AT] || 0),
    lastHourlyTargetStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_TARGET_STATS_UPLOAD_AT] || 0),
    usageStatsHistorySyncedThroughDate: storage?.[CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE] || null,
    usageStatsTodayLastUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.USAGE_STATS_TODAY_LAST_UPLOAD_AT] || 0),
    usageStatsTodayLastError: storage?.[CLOUD_CONFIG.KEYS.USAGE_STATS_TODAY_LAST_ERROR] || null,
    usageStatsHistoryLastUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_UPLOAD_AT] || 0),
    usageStatsHistoryLastError: storage?.[CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_ERROR] || null,
    lastMediaSegmentUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_SEGMENT_UPLOAD_AT] || 0),
    lastMediaStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_STATS_UPLOAD_AT] || 0),
    lastHourlyMediaStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT] || 0),
    lastSiteRequestSyncAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_SITE_REQUEST_SYNC_AT] || 0),
    lastClientLogUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_CLIENT_LOG_UPLOAD_AT] || 0),
    connectionState: storage?.[CLOUD_CONFIG.KEYS.CONNECTION_STATE] || null,
  };
}

/**
 * 上传 pending usage segments 到云端。
 * 当 disabled（默认）时：返回 dry-run 结果，不发送网络请求，不清除 dirty outbox。
 * 当 enabled 时：构建载荷、发送到 POST /device/usage-segments/v1、标记已上传。
 *
 * @param {{ enabled?: boolean }} options
 * @returns {Promise<{uploaded: number, failed: number, skipped: boolean, dryRun: boolean, pendingCount: number, payloadSample?: object, errors: string[]}>}
 */
export async function uploadUsageSegmentsV1({ enabled = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;

  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }

  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }

  try {
    const pending = await getPendingUsageSegments();
    if (pending.pendingCount === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }

    // 在启用之前限制每个批次的 segment 数量（硬限制：每批 200 个 segments）
    const batchIds = pending.segments.slice(0, MAX_USAGE_SEGMENTS_PER_BATCH).map(s => s.id);

    if (!effectiveEnabled) {
      // Dry-run：报告待处理状态但不发送任何内容
      const payload = await buildUsageSegmentsUploadPayload(batchIds.slice(0, 5));
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: pending.pendingCount,
        batchSize: batchIds.length,
        payloadSample: {
          schemaVersion: payload.schemaVersion,
          segmentCount: payload.segments.length,
          firstDomain: payload.segments[0]?.domain || null,
        },
        skippedReason: 'stats_foundation_v1_sync is disabled',
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }

    // Enabled 路径：构建载荷并发送到云端
    let uploaded = 0;
    let failed = 0;
    const errors = [];
    const payload = await buildUsageSegmentsUploadPayload(batchIds);

    if (payload.segments.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: false, pendingCount: pending.pendingCount, errors: [] };
    }

    try {
      await cloudRequest('POST', '/device/usage-segments/v1', { segments: payload.segments });
      await markUsageSegmentsUploaded(batchIds);
      uploaded = batchIds.length;
      await cloudStorageSet({
        [CLOUD_CONFIG.KEYS.V1_LAST_SEGMENT_UPLOAD_AT]: Date.now(),
      });
      console.log('[Cloud-V1] Usage segments uploaded:', uploaded);
    } catch (e) {
      await markUsageSegmentUploadFailed(batchIds, e.message);
      failed = batchIds.length;
      errors.push(`segments: ${e.message}`);
      console.error('[Cloud-V1] Failed to upload segments:', e.message);
      logCloudSchemaIncompatibility('/device/usage-segments/v1', e);
      logClientEventBestEffort({
        level: 'error',
        category: 'cloud',
        eventCode: 'cloud_usage_segment_upload_failed',
        module: 'infra/cloud-sync',
        message: e?.message || 'Usage segment upload failed',
        details: { endpoint: '/device/usage-segments/v1', count: batchIds.length, status: e?.status || null, code: e?.code || null, response: e?.response || null },
      });
    }

    return {
      uploaded,
      failed,
      skipped: false,
      dryRun: false,
      pendingCount: pending.pendingCount - uploaded,
      errors,
    };
  } catch (e) {
    console.error('[Cloud-V1] Segment upload orchestration failed:', e.message);
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

/**
 * 上传 pending daily stats v1 到云端。
 * 当 disabled（默认）时：返回 dry-run 结果，不发送网络请求，不清除 dirty outbox。
 * 当 enabled 时：构建载荷、发送到 POST /device/stats/v1、标记已上传。
 *
 * @param {{ enabled?: boolean }} options
 * @returns {Promise<{uploaded: number, failed: number, skipped: boolean, dryRun: boolean, pendingCount: number, payloadSample?: object, errors: string[]}>}
 */
export async function uploadDailyStatsV1({ enabled = false, forceRetryExhausted = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;

  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }

  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }

  try {
    const pending = await getPendingDailyStats();
    const dirtyDates = pending.dirtyDates || Object.keys(pending.stats || {});

    if (dirtyDates.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }

    // 每个批次限制日期数量
    const MAX_DATES_PER_BATCH = 7;
    const exhaustedDates = dirtyDates.filter((date) =>
      Number(pending.retryCounts?.[date] || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS
    );
    const candidateDates = forceRetryExhausted
      ? dirtyDates
      : dirtyDates.filter((date) => !exhaustedDates.includes(date));
    const batchDates = candidateDates.slice(0, MAX_DATES_PER_BATCH);

    if (!effectiveEnabled) {
      // Dry-run
      const samplePayload = batchDates.length > 0
        ? await buildDailyStatsUploadPayload(batchDates[0])
        : null;
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: dirtyDates.length,
        batchSize: batchDates.length,
        payloadSample: samplePayload ? {
          schemaVersion: samplePayload.schemaVersion,
          date: samplePayload.date,
          domainCount: samplePayload.domains.length,
        } : null,
        skippedReason: 'stats_foundation_v1_sync is disabled',
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }

    if (batchDates.length === 0 && exhaustedDates.length > 0) {
      return {
        uploaded: 0,
        failed: exhaustedDates.length,
        skipped: false,
        dryRun: false,
        pendingCount: dirtyDates.length,
        errors: exhaustedDates.map((date) => `stats ${date}: retry exhausted (${pending.retryCounts?.[date] || 0})`),
      };
    }

    let uploaded = 0;
    let failed = 0;
    const errors = [];

    for (const date of batchDates) {
      const payload = await buildDailyStatsUploadPayload(date);
      if (!payload || payload.domains.length === 0) {
        const segmentCount = await usageSegmentCountForDate(date);
        if (segmentCount === 0) {
          await markDailyStatsUploaded([date]);
        } else {
          const message = segmentCount === null
            ? 'Daily stats payload empty and usage segment check failed'
            : 'Daily stats payload empty while usage segments exist';
          await markDailyStatsUploadFailed([date], message);
          failed++;
          errors.push(`stats ${date}: ${message}`);
          logClientEventBestEffort({
            level: 'error',
            category: 'cloud',
            eventCode: 'cloud_daily_stats_payload_inconsistent',
            module: 'infra/cloud-sync',
            message,
            details: { date, segmentCount },
          });
        }
        continue;
      }

      try {
        // 发送嵌套聚合形状（buildDailyStatsUploadPayload 的输出）。
        // Worker 将 byMode 对象展开为 stats_v1 的逐 channel+mode 行。
        await cloudRequest('POST', '/device/stats/v1', payload);
        await markDailyStatsUploaded([date]);
        uploaded++;
        await cloudStorageSet({
          [CLOUD_CONFIG.KEYS.V1_LAST_STATS_UPLOAD_AT]: Date.now(),
        });
        console.log('[Cloud-V1] Daily stats uploaded:', date, `(${payload.domains.length} domains)`);
      } catch (e) {
        await markDailyStatsUploadFailed([date], e.message);
        failed++;
        errors.push(`stats ${date}: ${e.message}`);
        console.error('[Cloud-V1] Failed to upload daily stats for', date, e.message, summarizeDailyStatsPayload(date, payload));
        logClientEventBestEffort({
          level: 'error',
          category: 'cloud',
          eventCode: 'cloud_daily_stats_upload_failed',
          module: 'infra/cloud-sync',
          message: e?.message || 'Daily stats upload failed',
          details: { date },
        });
      }
    }

    return {
      uploaded,
      failed,
      skipped: false,
      dryRun: false,
      pendingCount: dirtyDates.length - uploaded,
      errors,
    };
  } catch (e) {
    console.error('[Cloud-V1] Stats upload orchestration failed:', e.message);
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

function isDateKeyString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysToDateKey(dateKey, days) {
  if (!isDateKeyString(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function compareDateKeys(a, b) {
  if (a === b) return 0;
  return String(a) < String(b) ? -1 : 1;
}

function sumObjectSeconds(value) {
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value).reduce((sum, seconds) => {
    const n = Number(seconds || 0);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

function sumStatsDomainsSeconds(domains) {
  return (Array.isArray(domains) ? domains : []).reduce((sum, domainStats) => {
    const byModeSeconds =
      sumObjectSeconds(domainStats?.activeByMode) +
      sumObjectSeconds(domainStats?.backgroundMediaByMode) +
      sumObjectSeconds(domainStats?.pipByMode);
    if (byModeSeconds > 0) return sum + byModeSeconds;
    return sum +
      Number(domainStats?.activeSeconds || 0) +
      Number(domainStats?.backgroundMediaSeconds || 0) +
      Number(domainStats?.pipSeconds || 0);
  }, 0);
}

function sumTargetPayloadSeconds(targets) {
  return (Array.isArray(targets) ? targets : []).reduce((sum, targetStats) => {
    if (Array.isArray(targetStats?.rows) && targetStats.rows.length > 0) {
      return sum + targetStats.rows.reduce((rowSum, row) => rowSum + Number(row?.durationSeconds || 0), 0);
    }
    const byModeSeconds =
      sumObjectSeconds(targetStats?.activeByMode) +
      sumObjectSeconds(targetStats?.backgroundMediaByMode) +
      sumObjectSeconds(targetStats?.pipByMode);
    if (byModeSeconds > 0) return sum + byModeSeconds;
    return sum +
      Number(targetStats?.activeSeconds || 0) +
      Number(targetStats?.backgroundMediaSeconds || 0) +
      Number(targetStats?.pipSeconds || 0);
  }, 0);
}

function sumSegmentSeconds(segments) {
  return (Array.isArray(segments) ? segments : []).reduce((sum, segment) => {
    const seconds = Number(segment?.durationSeconds || 0);
    return sum + (Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
  }, 0);
}

async function getHourKeysForDate(date) {
  const allHourlyStats = await getHourlyUsageStats();
  return Object.entries(allHourlyStats || {})
    .filter(([hourKey, stats]) => stats?.date === date || String(hourKey).startsWith(`${date}T`))
    .map(([hourKey]) => hourKey)
    .sort();
}

async function getEarliestLocalUsageDate(today) {
  const dates = new Set();
  const [segmentsById, dailyStats, hourlyStats] = await Promise.all([
    getAllUsageSegments().catch(() => ({})),
    getDailyUsageStats().catch(() => ({})),
    getHourlyUsageStats().catch(() => ({})),
  ]);

  for (const segment of Object.values(segmentsById || {})) {
    if (isDateKeyString(segment?.date) && compareDateKeys(segment.date, today) < 0) {
      dates.add(segment.date);
    }
  }
  for (const date of Object.keys(dailyStats || {})) {
    if (isDateKeyString(date) && compareDateKeys(date, today) < 0) dates.add(date);
  }
  for (const [hourKey, stat] of Object.entries(hourlyStats || {})) {
    const date = isDateKeyString(stat?.date) ? stat.date : String(hourKey).slice(0, 10);
    if (isDateKeyString(date) && compareDateKeys(date, today) < 0) dates.add(date);
  }

  return [...dates].sort()[0] || null;
}

function isRetryableUsageErrorCode(error) {
  const code = normalizeUploadErrorCode(error);
  return code === 'http_503' || code === 'http_429' || code === 'fetch_failed'
    || code === 'request_aborted' || code === 'request_timeout';
}

async function getUsageUploadBackoff() {
  const data = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.USAGE_UPLOAD_BACKOFF).catch(() => ({}));
  return data?.[CLOUD_CONFIG.KEYS.USAGE_UPLOAD_BACKOFF] || { attempt: 0, nextRetryAt: 0, lastError: null };
}

async function recordUsageUploadBackoff(error) {
  const code = normalizeUploadErrorCode(error);
  if (!isRetryableUsageErrorCode(code)) return null;
  const previous = await getUsageUploadBackoff();
  const attempt = Math.min(USAGE_UPLOAD_BACKOFF_STEPS_MS.length, Math.max(0, Number(previous.attempt || 0)) + 1);
  const delayMs = USAGE_UPLOAD_BACKOFF_STEPS_MS[attempt - 1];
  const value = { attempt, nextRetryAt: Date.now() + delayMs, lastError: code };
  await cloudStorageSet({ [CLOUD_CONFIG.KEYS.USAGE_UPLOAD_BACKOFF]: value }).catch(() => {});
  return value;
}

async function clearUsageUploadBackoff() {
  await cloudStorageSet({
    [CLOUD_CONFIG.KEYS.USAGE_UPLOAD_BACKOFF]: { attempt: 0, nextRetryAt: 0, lastError: null },
  }).catch(() => {});
}
async function buildUsageDateUploadPackage(date) {
  const segments = await getUsageSegmentsByDate(date).catch((error) => {
    logClientEventBestEffort({
      level: 'error',
      category: 'storage',
      eventCode: 'cloud_usage_date_segments_read_failed',
      module: 'infra/cloud-sync',
      message: error?.message || 'Failed to read usage segments for date upload',
      details: { date },
    });
    return [];
  });
  const segmentIds = (segments || []).map((segment) => segment?.id).filter(Boolean);
  const pendingSegmentIds = (segments || [])
    .filter((segment) => !Number(segment?.uploadedAt || 0))
    .map((segment) => segment?.id)
    .filter(Boolean);
  const segmentSeconds = sumSegmentSeconds(segments);
  const dailyPayload = await buildDailyStatsUploadPayload(date);
  const targetPayload = await buildTargetStatsUploadPayload(date);
  const hourKeys = await getHourKeysForDate(date);
  const hourlyPayloads = [];
  const hourlyTargetPayloads = [];

  for (const hourKey of hourKeys) {
    hourlyPayloads.push(await buildHourlyStatsUploadPayload(hourKey));
    hourlyTargetPayloads.push(await buildHourlyTargetStatsUploadPayload(hourKey));
  }

  const dailySeconds = sumStatsDomainsSeconds(dailyPayload?.domains);
  const targetSeconds = sumTargetPayloadSeconds(targetPayload?.targets);
  const hourlySeconds = hourlyPayloads.reduce((sum, payload) => sum + sumStatsDomainsSeconds(payload?.domains), 0);
  const hourlyTargetSeconds = hourlyTargetPayloads.reduce((sum, payload) => sum + sumTargetPayloadSeconds(payload?.targets), 0);
  const errors = [];

  if (segmentSeconds > 0 && dailySeconds <= 0) errors.push({ part: 'stats', message: 'Daily stats payload empty while usage segments exist' });
  if (segmentSeconds > 0 && targetSeconds <= 0) errors.push({ part: 'targetStats', message: 'Target stats payload empty while usage segments exist' });
  if (segmentSeconds > 0 && hourlySeconds <= 0) errors.push({ part: 'hourlyStats', message: 'Hourly stats payload empty while usage segments exist' });
  if (segmentSeconds > 0 && hourlyTargetSeconds <= 0) errors.push({ part: 'hourlyTargetStats', message: 'Hourly target stats payload empty while usage segments exist' });

  return {
    date,
    segments,
    segmentIds,
    pendingSegmentIds,
    dailyPayload,
    targetPayload,
    hourKeys,
    hourlyPayloads,
    hourlyTargetPayloads,
    errors,
    summary: {
      usageSegments: { count: segmentIds.length, seconds: segmentSeconds },
      dailyStats: { count: Array.isArray(dailyPayload?.domains) ? dailyPayload.domains.length : 0, seconds: dailySeconds },
      targetStats: { count: Array.isArray(targetPayload?.targets) ? targetPayload.targets.length : 0, seconds: targetSeconds },
      hourlyStats: { count: hourlyPayloads.reduce((sum, payload) => sum + (Array.isArray(payload?.domains) ? payload.domains.length : 0), 0), seconds: hourlySeconds },
      hourlyTargetStats: { count: hourlyTargetPayloads.reduce((sum, payload) => sum + (Array.isArray(payload?.targets) ? payload.targets.length : 0), 0), seconds: hourlyTargetSeconds },
    },
  };
}

function makeUploadPartResult({ dryRun = false, skipped = false } = {}) {
  return { uploaded: 0, failed: 0, skipped, dryRun, pendingCount: 0, errors: [] };
}

function addUploadError(result, part, message) {
  result.failed++;
  result.errors.push(`${part}: ${message}`);
}

function mergeUsageDatePartResults(target, source) {
  for (const part of ['segments', 'stats', 'hourlyStats', 'targetStats', 'hourlyTargetStats']) {
    target[part].uploaded += source[part].uploaded;
    target[part].failed += source[part].failed;
    target[part].pendingCount += source[part].pendingCount;
    target[part].errors.push(...source[part].errors);
    target[part].dryRun = target[part].dryRun && source[part].dryRun;
    target[part].skipped = target[part].skipped && source[part].skipped;
  }
  target.errors.push(...source.errors);
  target.failed += source.failed;
  target.uploaded += source.uploaded;
  return target;
}

function makeUsageDateSyncResult({ dryRun = false } = {}) {
  return {
    uploaded: 0,
    failed: 0,
    skipped: false,
    dryRun,
    pendingCount: 0,
    errors: [],
    segments: makeUploadPartResult({ dryRun }),
    stats: makeUploadPartResult({ dryRun }),
    hourlyStats: makeUploadPartResult({ dryRun }),
    targetStats: makeUploadPartResult({ dryRun }),
    hourlyTargetStats: makeUploadPartResult({ dryRun }),
  };
}

function metricComplete(metric, expectedSeconds, expectedCount, requireRows = false) {
  const cloudSeconds = Math.round(Number(metric?.seconds || 0));
  const localSeconds = Math.round(Number(expectedSeconds || 0));
  const cloudCount = Number(metric?.count || 0);
  if (localSeconds <= 0 && Number(expectedCount || 0) <= 0) {
    return cloudSeconds === 0 && cloudCount === 0;
  }
  if (cloudSeconds !== localSeconds) return false;
  if (requireRows && cloudCount <= 0) return false;
  return true;
}

function isCloudIntegrityCompleteForPackage(integrity, pkg) {
  if (!integrity || typeof integrity !== 'object') return false;
  const localHasData =
    pkg.summary.usageSegments.seconds > 0 ||
    pkg.summary.dailyStats.seconds > 0 ||
    pkg.summary.targetStats.seconds > 0 ||
    pkg.summary.hourlyStats.seconds > 0 ||
    pkg.summary.hourlyTargetStats.seconds > 0;
  if (localHasData && integrity.complete === false) return false;
  const segmentSeconds = pkg.summary.usageSegments.seconds;
  const segmentCount = pkg.summary.usageSegments.count;
  const expectedDailySeconds = pkg.summary.dailyStats.seconds > 0 ? pkg.summary.dailyStats.seconds : segmentSeconds;
  const expectedTargetSeconds = pkg.summary.targetStats.seconds > 0 ? pkg.summary.targetStats.seconds : segmentSeconds;
  const expectedHourlySeconds = pkg.summary.hourlyStats.seconds > 0 ? pkg.summary.hourlyStats.seconds : segmentSeconds;
  const expectedHourlyTargetSeconds = pkg.summary.hourlyTargetStats.seconds > 0 ? pkg.summary.hourlyTargetStats.seconds : segmentSeconds;
  return metricComplete(integrity.usageSegments, segmentSeconds, segmentCount) &&
    metricComplete(integrity.dailyStats, expectedDailySeconds, pkg.summary.dailyStats.count, expectedDailySeconds > 0) &&
    metricComplete(integrity.targetStats, expectedTargetSeconds, pkg.summary.targetStats.count, expectedTargetSeconds > 0) &&
    metricComplete(integrity.hourlyStats, expectedHourlySeconds, pkg.summary.hourlyStats.count, expectedHourlySeconds > 0) &&
    metricComplete(integrity.hourlyTargetStats, expectedHourlyTargetSeconds, pkg.summary.hourlyTargetStats.count, expectedHourlyTargetSeconds > 0);
}

async function getRemoteUsageDateIntegrity(date) {
  return cloudRequest('GET', `/device/stats-integrity/v1?date=${encodeURIComponent(date)}`, null, 2);
}

async function markUsageDatePackageUploaded(pkg, uploadedAt = Date.now()) {
  await Promise.all([
    pkg.segmentIds.length ? markUsageSegmentsUploaded(pkg.segmentIds, uploadedAt) : Promise.resolve(),
    markDailyStatsUploaded([pkg.date], uploadedAt),
    pkg.hourKeys.length ? markHourlyStatsUploaded(pkg.hourKeys, uploadedAt) : Promise.resolve(),
    markTargetStatsUploaded([pkg.date], uploadedAt),
    pkg.hourKeys.length ? markHourlyTargetStatsUploaded(pkg.hourKeys, uploadedAt) : Promise.resolve(),
  ]);
}

export async function uploadHourlyStatsV1({ enabled = false, forceRetryExhausted = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;

  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }

  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }

  try {
    const pending = await getPendingHourlyStats();
    const dirtyHourKeys = Object.keys(pending.stats || {});
    if (dirtyHourKeys.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }

    const exhaustedHourKeys = dirtyHourKeys.filter((hourKey) =>
      Number(pending.retryCounts?.[hourKey] || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS
    );
    const candidateHourKeys = forceRetryExhausted
      ? dirtyHourKeys
      : dirtyHourKeys.filter((hourKey) => !exhaustedHourKeys.includes(hourKey));
    const batchHourKeys = candidateHourKeys.slice(0, 24);

    if (!effectiveEnabled) {
      const samplePayload = batchHourKeys.length > 0 ? await buildHourlyStatsUploadPayload(batchHourKeys[0]) : null;
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: dirtyHourKeys.length,
        batchSize: batchHourKeys.length,
        payloadSample: samplePayload ? {
          schemaVersion: samplePayload.schemaVersion,
          hourKey: samplePayload.hourKey,
          domainCount: samplePayload.domains.length,
        } : null,
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }

    if (batchHourKeys.length === 0 && exhaustedHourKeys.length > 0) {
      return {
        uploaded: 0,
        failed: exhaustedHourKeys.length,
        skipped: false,
        dryRun: false,
        pendingCount: dirtyHourKeys.length,
        errors: exhaustedHourKeys.map((hourKey) => `hourly stats ${hourKey}: retry exhausted (${pending.retryCounts?.[hourKey] || 0})`),
      };
    }

    let uploaded = 0;
    let failed = 0;
    const errors = [];
    for (const hourKey of batchHourKeys) {
      const payload = await buildHourlyStatsUploadPayload(hourKey);
      if (!payload || payload.domains.length === 0) {
        await markHourlyStatsUploaded([hourKey]);
        continue;
      }
      try {
        await cloudRequest('POST', '/device/hourly-stats/v1', payload);
        await markHourlyStatsUploaded([hourKey]);
        uploaded++;
        await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_STATS_UPLOAD_AT]: Date.now() });
      } catch (e) {
        await markHourlyStatsUploadFailed([hourKey], e.message);
        failed++;
        errors.push(`hourly stats ${hourKey}: ${e.message}`);
        logClientEventBestEffort({
          level: 'error',
          category: 'cloud',
          eventCode: 'cloud_hourly_stats_upload_failed',
          module: 'infra/cloud-sync',
          message: e?.message || 'Hourly stats upload failed',
          details: { hourKey },
        });
      }
    }
    return { uploaded, failed, skipped: false, dryRun: false, pendingCount: dirtyHourKeys.length - uploaded, errors };
  } catch (e) {
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

export async function uploadTargetStatsV1({ enabled = false, forceRetryExhausted = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;

  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }

  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }

  try {
    const pending = await getPendingTargetStats();
    const dirtyDates = pending.dirtyDates || Object.keys(pending.stats || {});
    if (dirtyDates.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }

    const exhaustedDates = dirtyDates.filter((date) =>
      Number(pending.retryCounts?.[date] || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS
    );
    const candidateDates = forceRetryExhausted ? dirtyDates : dirtyDates.filter((date) => !exhaustedDates.includes(date));
    const batchDates = candidateDates.slice(0, 7);

    if (!effectiveEnabled) {
      const samplePayload = batchDates.length > 0 ? await buildTargetStatsUploadPayload(batchDates[0]) : null;
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: dirtyDates.length,
        batchSize: batchDates.length,
        payloadSample: samplePayload ? {
          schemaVersion: samplePayload.schemaVersion,
          date: samplePayload.date,
          targetCount: samplePayload.targets.length,
        } : null,
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }

    if (batchDates.length === 0 && exhaustedDates.length > 0) {
      return {
        uploaded: 0,
        failed: exhaustedDates.length,
        skipped: false,
        dryRun: false,
        pendingCount: dirtyDates.length,
        errors: exhaustedDates.map((date) => `target stats ${date}: retry exhausted (${pending.retryCounts?.[date] || 0})`),
      };
    }

    let uploaded = 0;
    let failed = 0;
    const errors = [];

    for (const date of batchDates) {
      const payload = await buildTargetStatsUploadPayload(date);
      if (!payload || payload.targets.length === 0) {
        const segmentCount = await usageSegmentCountForDate(date);
        if (segmentCount === 0) {
          await markTargetStatsUploaded([date]);
        } else {
          const message = segmentCount === null
            ? 'Target stats payload empty and usage segment check failed'
            : 'Target stats payload empty while usage segments exist';
          await markTargetStatsUploadFailed([date], message);
          failed++;
          errors.push(`target stats ${date}: ${message}`);
          logClientEventBestEffort({
            level: 'error',
            category: 'cloud',
            eventCode: 'cloud_target_stats_payload_inconsistent',
            module: 'infra/cloud-sync',
            message,
            details: { date, segmentCount },
          });
        }
        continue;
      }
      try {
        await cloudRequest('POST', '/device/target-stats/v1', payload);
        await markTargetStatsUploaded([date]);
        uploaded++;
        await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_TARGET_STATS_UPLOAD_AT]: Date.now() });
      } catch (e) {
        await markTargetStatsUploadFailed([date], e.message);
        failed++;
        errors.push(`target stats ${date}: ${e.message}`);
        logClientEventBestEffort({
          level: 'error',
          category: 'cloud',
          eventCode: 'cloud_target_stats_upload_failed',
          module: 'infra/cloud-sync',
          message: e?.message || 'Target stats upload failed',
          details: { date },
        });
      }
    }

    return { uploaded, failed, skipped: false, dryRun: false, pendingCount: dirtyDates.length - uploaded, errors };
  } catch (e) {
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

export async function uploadHourlyTargetStatsV1({ enabled = false, forceRetryExhausted = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;

  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }

  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }

  try {
    const pending = await getPendingHourlyTargetStats();
    const dirtyHourKeys = Object.keys(pending.stats || {});
    if (dirtyHourKeys.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }

    const exhaustedHourKeys = dirtyHourKeys.filter((hourKey) =>
      Number(pending.retryCounts?.[hourKey] || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS
    );
    const candidateHourKeys = forceRetryExhausted
      ? dirtyHourKeys
      : dirtyHourKeys.filter((hourKey) => !exhaustedHourKeys.includes(hourKey));
    const batchHourKeys = candidateHourKeys.slice(0, 24);

    if (!effectiveEnabled) {
      const samplePayload = batchHourKeys.length > 0 ? await buildHourlyTargetStatsUploadPayload(batchHourKeys[0]) : null;
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: dirtyHourKeys.length,
        batchSize: batchHourKeys.length,
        payloadSample: samplePayload ? {
          schemaVersion: samplePayload.schemaVersion,
          hourKey: samplePayload.hourKey,
          targetCount: samplePayload.targets.length,
        } : null,
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }

    if (batchHourKeys.length === 0 && exhaustedHourKeys.length > 0) {
      return {
        uploaded: 0,
        failed: exhaustedHourKeys.length,
        skipped: false,
        dryRun: false,
        pendingCount: dirtyHourKeys.length,
        errors: exhaustedHourKeys.map((hourKey) => `hourly target stats ${hourKey}: retry exhausted (${pending.retryCounts?.[hourKey] || 0})`),
      };
    }

    let uploaded = 0;
    let failed = 0;
    const errors = [];
    for (const hourKey of batchHourKeys) {
      const payload = await buildHourlyTargetStatsUploadPayload(hourKey);
      if (!payload || payload.targets.length === 0) {
        await markHourlyTargetStatsUploaded([hourKey]);
        continue;
      }
      try {
        await cloudRequest('POST', '/device/hourly-target-stats/v1', payload);
        await markHourlyTargetStatsUploaded([hourKey]);
        uploaded++;
        await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_TARGET_STATS_UPLOAD_AT]: Date.now() });
      } catch (e) {
        await markHourlyTargetStatsUploadFailed([hourKey], e.message);
        failed++;
        errors.push(`hourly target stats ${hourKey}: ${e.message}`);
        logClientEventBestEffort({
          level: 'error',
          category: 'cloud',
          eventCode: 'cloud_hourly_target_stats_upload_failed',
          module: 'infra/cloud-sync',
          message: e?.message || 'Hourly target stats upload failed',
          details: { hourKey },
        });
      }
    }
    return { uploaded, failed, skipped: false, dryRun: false, pendingCount: dirtyHourKeys.length - uploaded, errors };
  } catch (e) {
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

async function markUsageDateMaterializationError(pkg, part, message) {
  if (part === 'stats') {
    await markDailyStatsUploadFailed([pkg.date], message);
  } else if (part === 'targetStats') {
    await markTargetStatsUploadFailed([pkg.date], message);
  } else if (part === 'hourlyStats' && pkg.hourKeys.length > 0) {
    await markHourlyStatsUploadFailed(pkg.hourKeys, message);
  } else if (part === 'hourlyTargetStats' && pkg.hourKeys.length > 0) {
    await markHourlyTargetStatsUploadFailed(pkg.hourKeys, message);
  }
  logClientEventBestEffort({
    level: 'error',
    category: 'cloud',
    eventCode: 'cloud_usage_date_payload_inconsistent',
    module: 'infra/cloud-sync',
    message,
    details: {
      date: pkg.date,
      part,
      segmentCount: pkg.summary.usageSegments.count,
      segmentSeconds: pkg.summary.usageSegments.seconds,
    },
  });
}

async function uploadUsageDatePackageParts(pkg, { enabled = false, fullSegmentRepair = false } = {}) {
  const result = makeUsageDateSyncResult({ dryRun: !enabled });
  const partErrors = new Map((pkg.errors || []).map((item) => [item.part, item.message]));
  const segmentIds = fullSegmentRepair ? pkg.segmentIds : (pkg.pendingSegmentIds || pkg.segmentIds);

  if (!enabled) {
    result.skipped = true;
    result.pendingCount = segmentIds.length + pkg.hourKeys.length;
    for (const part of ['segments', 'stats', 'hourlyStats', 'targetStats', 'hourlyTargetStats']) {
      result[part].skipped = true;
      result[part].pendingCount = part === 'segments'
        ? segmentIds.length
        : (part === 'stats' || part === 'targetStats' ? 1 : pkg.hourKeys.length);
    }
    return result;
  }

  if (
    pkg.summary.usageSegments.seconds <= 0 &&
    pkg.summary.dailyStats.seconds <= 0 &&
    pkg.summary.targetStats.seconds <= 0 &&
    pkg.summary.hourlyStats.seconds <= 0 &&
    pkg.summary.hourlyTargetStats.seconds <= 0
  ) {
    result.skipped = true;
    for (const part of ['segments', 'stats', 'hourlyStats', 'targetStats', 'hourlyTargetStats']) {
      result[part].skipped = true;
    }
    return result;
  }

  if (segmentIds.length > 0) {
    for (let offset = 0; offset < segmentIds.length; offset += MAX_USAGE_SEGMENTS_PER_BATCH) {
      const batchIds = segmentIds.slice(offset, offset + MAX_USAGE_SEGMENTS_PER_BATCH);
      try {
        const payload = await buildUsageSegmentsUploadPayload(batchIds);
        if (payload.segments.length === 0) continue;
        await cloudRequest('POST', '/device/usage-segments/v1', { segments: payload.segments });
        await markUsageSegmentsUploaded(batchIds);
        result.segments.uploaded += batchIds.length;
        result.uploaded += batchIds.length;
      } catch (error) {
        const errorCode = normalizeUploadErrorCode(error);
        await markUsageSegmentUploadFailed(batchIds, errorCode);
        result.segments.failed += batchIds.length;
        result.segments.pendingCount += segmentIds.length - offset;
        result.segments.errors.push('segments ' + pkg.date + ': ' + errorCode);
        result.failed += batchIds.length;
        result.errors.push('segments ' + pkg.date + ': ' + errorCode);
        logClientEventBestEffort({
          level: 'error',
          category: 'cloud',
          eventCode: 'cloud_usage_segment_upload_failed',
          module: 'infra/cloud-sync',
          message: 'Usage segment upload failed: ' + errorCode,
          details: { date: pkg.date, count: batchIds.length, remaining: segmentIds.length - offset },
        });
        break;
      }
    }
    if (result.segments.uploaded > 0) {
      await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_SEGMENT_UPLOAD_AT]: Date.now() });
    }
  } else {
    result.segments.skipped = true;
  }
  if (result.segments.failed > 0) return result;
  if (partErrors.has('stats')) {
    const message = partErrors.get('stats');
    await markUsageDateMaterializationError(pkg, 'stats', message);
    addUploadError(result.stats, `stats ${pkg.date}`, message);
    result.failed++;
    result.errors.push(`stats ${pkg.date}: ${message}`);
  } else if (pkg.summary.dailyStats.count > 0) {
    try {
      await cloudRequest('POST', '/device/stats/v1', pkg.dailyPayload);
      await markDailyStatsUploaded([pkg.date]);
      result.stats.uploaded++;
      result.uploaded++;
      await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_STATS_UPLOAD_AT]: Date.now() });
    } catch (error) {
      await markDailyStatsUploadFailed([pkg.date], error.message);
      addUploadError(result.stats, `stats ${pkg.date}`, error.message);
      result.failed++;
      result.errors.push(`stats ${pkg.date}: ${error.message}`);
    }
  } else {
    result.stats.skipped = true;
  }

  if (partErrors.has('targetStats')) {
    const message = partErrors.get('targetStats');
    await markUsageDateMaterializationError(pkg, 'targetStats', message);
    addUploadError(result.targetStats, `target stats ${pkg.date}`, message);
    result.failed++;
    result.errors.push(`target stats ${pkg.date}: ${message}`);
  } else if (pkg.summary.targetStats.count > 0) {
    try {
      await cloudRequest('POST', '/device/target-stats/v1', pkg.targetPayload);
      await markTargetStatsUploaded([pkg.date]);
      result.targetStats.uploaded++;
      result.uploaded++;
      await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_TARGET_STATS_UPLOAD_AT]: Date.now() });
    } catch (error) {
      await markTargetStatsUploadFailed([pkg.date], error.message);
      addUploadError(result.targetStats, `target stats ${pkg.date}`, error.message);
      result.failed++;
      result.errors.push(`target stats ${pkg.date}: ${error.message}`);
    }
  } else {
    result.targetStats.skipped = true;
  }

  if (partErrors.has('hourlyStats')) {
    const message = partErrors.get('hourlyStats');
    await markUsageDateMaterializationError(pkg, 'hourlyStats', message);
    addUploadError(result.hourlyStats, `hourly stats ${pkg.date}`, message);
    result.failed++;
    result.errors.push(`hourly stats ${pkg.date}: ${message}`);
  } else {
    let uploadedHours = 0;
    for (const payload of pkg.hourlyPayloads) {
      if (!payload || !Array.isArray(payload.domains) || payload.domains.length === 0) continue;
      try {
        await cloudRequest('POST', '/device/hourly-stats/v1', payload);
        await markHourlyStatsUploaded([payload.hourKey]);
        uploadedHours++;
      } catch (error) {
        await markHourlyStatsUploadFailed([payload.hourKey], error.message);
        result.hourlyStats.failed++;
        result.hourlyStats.errors.push(`hourly stats ${payload.hourKey}: ${error.message}`);
        result.failed++;
        result.errors.push(`hourly stats ${payload.hourKey}: ${error.message}`);
      }
    }
    if (uploadedHours > 0) {
      result.hourlyStats.uploaded += uploadedHours;
      result.uploaded += uploadedHours;
      await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_STATS_UPLOAD_AT]: Date.now() });
    } else if (result.hourlyStats.failed === 0) {
      result.hourlyStats.skipped = true;
    }
  }

  if (partErrors.has('hourlyTargetStats')) {
    const message = partErrors.get('hourlyTargetStats');
    await markUsageDateMaterializationError(pkg, 'hourlyTargetStats', message);
    addUploadError(result.hourlyTargetStats, `hourly target stats ${pkg.date}`, message);
    result.failed++;
    result.errors.push(`hourly target stats ${pkg.date}: ${message}`);
  } else {
    let uploadedHours = 0;
    for (const payload of pkg.hourlyTargetPayloads) {
      if (!payload || !Array.isArray(payload.targets) || payload.targets.length === 0) continue;
      try {
        await cloudRequest('POST', '/device/hourly-target-stats/v1', payload);
        await markHourlyTargetStatsUploaded([payload.hourKey]);
        uploadedHours++;
      } catch (error) {
        await markHourlyTargetStatsUploadFailed([payload.hourKey], error.message);
        result.hourlyTargetStats.failed++;
        result.hourlyTargetStats.errors.push(`hourly target stats ${payload.hourKey}: ${error.message}`);
        result.failed++;
        result.errors.push(`hourly target stats ${payload.hourKey}: ${error.message}`);
      }
    }
    if (uploadedHours > 0) {
      result.hourlyTargetStats.uploaded += uploadedHours;
      result.uploaded += uploadedHours;
      await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_TARGET_STATS_UPLOAD_AT]: Date.now() });
    } else if (result.hourlyTargetStats.failed === 0) {
      result.hourlyTargetStats.skipped = true;
    }
  }

  return result;
}

async function uploadTodayUsageStatsSnapshotV1({ enabled = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;
  if (!syncState.deviceToken) {
    return { ...makeUsageDateSyncResult({ dryRun: true }), skipped: true, errors: ['No device token'] };
  }
  if (syncState.monitoringEnabled === 0) {
    return { ...makeUsageDateSyncResult({ dryRun: true }), skipped: true, errors: [] };
  }

  const date = getDateKey();
  const pkg = await buildUsageDateUploadPackage(date);
  const result = await uploadUsageDatePackageParts(pkg, { enabled: effectiveEnabled });
  result.date = date;

  if (effectiveEnabled) {
    if (result.failed > 0 || result.errors.length > 0) {
      await cloudStorageSet({
        [CLOUD_CONFIG.KEYS.USAGE_STATS_TODAY_LAST_ERROR]: result.errors.join('; ') || 'today usage stats upload failed',
      }).catch(() => {});
    } else if (!result.skipped) {
      await cloudStorageSet({
        [CLOUD_CONFIG.KEYS.USAGE_STATS_TODAY_LAST_UPLOAD_AT]: Date.now(),
        [CLOUD_CONFIG.KEYS.USAGE_STATS_TODAY_LAST_ERROR]: null,
      }).catch(() => {});
    }
  }
  return result;
}

async function getUsageHistoryWatermark(today) {
  const yesterday = addDaysToDateKey(today, -1);
  const storage = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE);
  const stored = storage?.[CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE];
  if (isDateKeyString(stored)) {
    return compareDateKeys(stored, yesterday) >= 0 ? yesterday : stored;
  }
  const earliest = await getEarliestLocalUsageDate(today);
  return earliest ? addDaysToDateKey(earliest, -1) : yesterday;
}

async function uploadHistoricalUsageStatsByWatermarkV1({ enabled = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;
  if (!syncState.deviceToken) {
    return { ...makeUsageDateSyncResult({ dryRun: true }), skipped: true, errors: ['No device token'] };
  }
  if (syncState.monitoringEnabled === 0) {
    return { ...makeUsageDateSyncResult({ dryRun: true }), skipped: true, errors: [] };
  }

  const today = getDateKey();
  const yesterday = addDaysToDateKey(today, -1);
  let waterline = await getUsageHistoryWatermark(today);
  const start = addDaysToDateKey(waterline, 1);
  const result = makeUsageDateSyncResult({ dryRun: !effectiveEnabled });
  result.waterlineBefore = waterline;
  result.dates = [];

  if (!start || compareDateKeys(start, yesterday) > 0) {
    result.skipped = true;
    result.waterlineAfter = waterline;
    return result;
  }

  let date = start;
  while (
    compareDateKeys(date, yesterday) <= 0 &&
    result.dates.length < CLOUD_CONFIG.MAX_HISTORY_USAGE_DATES_PER_SYNC
  ) {
    result.dates.push(date);
    if (!effectiveEnabled) {
      date = addDaysToDateKey(date, 1);
      continue;
    }

    const pkg = await buildUsageDateUploadPackage(date);
    let cloudComplete = false;
    try {
      const integrity = await getRemoteUsageDateIntegrity(date);
      cloudComplete = isCloudIntegrityCompleteForPackage(integrity, pkg);
    } catch (error) {
      logClientEventBestEffort({
        level: 'warning',
        category: 'cloud',
        eventCode: 'cloud_usage_history_integrity_check_failed',
        module: 'infra/cloud-sync',
        message: error?.message || 'Usage history integrity check failed',
        details: { date },
      });
    }

    if (cloudComplete) {
      await markUsageDatePackageUploaded(pkg);
      waterline = date;
      await cloudStorageSet({
        [CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE]: waterline,
        [CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_UPLOAD_AT]: Date.now(),
        [CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_ERROR]: null,
      }).catch(() => {});
      date = addDaysToDateKey(date, 1);
      continue;
    }

    const dateResult = await uploadUsageDatePackageParts(pkg, { enabled: true, fullSegmentRepair: true });
    mergeUsageDatePartResults(result, dateResult);
    if (dateResult.failed > 0 || dateResult.errors.length > 0) {
      await cloudStorageSet({
        [CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_ERROR]: dateResult.errors.join('; ') || `history usage stats upload failed: ${date}`,
      }).catch(() => {});
      break;
    }

    waterline = date;
    await cloudStorageSet({
      [CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE]: waterline,
      [CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_UPLOAD_AT]: Date.now(),
      [CLOUD_CONFIG.KEYS.USAGE_STATS_HISTORY_LAST_ERROR]: null,
    }).catch(() => {});
    date = addDaysToDateKey(date, 1);
  }

  result.waterlineAfter = waterline;
  if (!effectiveEnabled) result.skipped = true;
  return result;
}

export async function syncUsageStatsByDateWatermarkV1({ enabled = false } = {}) {
  if (enabled) {
    const backoff = await getUsageUploadBackoff();
    if (Number(backoff.nextRetryAt || 0) > Date.now()) {
      const result = makeUsageDateSyncResult({ dryRun: false });
      result.skipped = true;
      result.reason = 'retry_backoff';
      result.nextRetryAt = backoff.nextRetryAt;
      result.errors = [];
      result.backoffError = backoff.lastError || null;
      return result;
    }
  }

  const today = await uploadTodayUsageStatsSnapshotV1({ enabled });
  const todayRetryable = (today.errors || []).find((error) => isRetryableUsageErrorCode(error));
  const history = todayRetryable
    ? { ...makeUsageDateSyncResult({ dryRun: !enabled }), skipped: true, reason: 'previous_batch_failed' }
    : await uploadHistoricalUsageStatsByWatermarkV1({ enabled });
  const result = makeUsageDateSyncResult({ dryRun: today.dryRun && history.dryRun });
  mergeUsageDatePartResults(result, today);
  mergeUsageDatePartResults(result, history);
  result.today = today;
  result.history = history;
  result.skipped = today.skipped && history.skipped;
  result.dryRun = today.dryRun && history.dryRun;
  result.errors = [...today.errors, ...history.errors];
  result.failed = today.failed + history.failed;
  result.uploaded = today.uploaded + history.uploaded;

  if (enabled) {
    const retryableError = result.errors.find((error) => isRetryableUsageErrorCode(error));
    if (retryableError) result.backoff = await recordUsageUploadBackoff(retryableError);
    else if (result.failed === 0) await clearUsageUploadBackoff();
  }
  return result;
}
export async function uploadMediaSegmentsV1({ enabled = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;
  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }
  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }
  try {
    const pending = await getPendingMediaSegments();
    if (pending.pendingCount === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }
    const MAX_SEGMENTS_PER_BATCH = 200;
    const batchIds = pending.segments.slice(0, MAX_SEGMENTS_PER_BATCH).map((s) => s.id);
    if (!effectiveEnabled) {
      const payload = await buildMediaSegmentsUploadPayload(batchIds.slice(0, 5));
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: pending.pendingCount,
        batchSize: batchIds.length,
        payloadSample: {
          schemaVersion: payload.schemaVersion,
          segmentCount: payload.segments.length,
          firstDomain: payload.segments[0]?.domain || null,
          firstMediaClass: payload.segments[0]?.mediaClass || null,
        },
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }
    const payload = await buildMediaSegmentsUploadPayload(batchIds);
    if (payload.segments.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: false, pendingCount: pending.pendingCount, errors: [] };
    }
    try {
      await cloudRequest('POST', '/device/media-segments/v1', { segments: payload.segments });
      await markMediaSegmentsUploaded(batchIds);
      await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_SEGMENT_UPLOAD_AT]: Date.now() });
      return { uploaded: batchIds.length, failed: 0, skipped: false, dryRun: false, pendingCount: pending.pendingCount - batchIds.length, errors: [] };
    } catch (e) {
      await markMediaSegmentUploadFailed(batchIds, e.message);
      logClientEventBestEffort({
        level: 'error',
        category: 'cloud',
        eventCode: 'cloud_media_segment_upload_failed',
        module: 'infra/cloud-sync',
        message: e?.message || 'Media segment upload failed',
        details: { count: batchIds.length },
      });
      return { uploaded: 0, failed: batchIds.length, skipped: false, dryRun: false, pendingCount: pending.pendingCount, errors: [`media segments: ${e.message}`] };
    }
  } catch (e) {
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

export async function uploadDailyMediaStatsV1({ enabled = false, forceRetryExhausted = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;
  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }
  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }
  try {
    const pending = await getPendingDailyMediaStats();
    const dirtyDates = Object.keys(pending.stats || {});
    if (dirtyDates.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }
    const exhaustedDates = dirtyDates.filter((date) =>
      Number(pending.retryCounts?.[date] || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS
    );
    const candidateDates = forceRetryExhausted ? dirtyDates : dirtyDates.filter((date) => !exhaustedDates.includes(date));
    const batchDates = candidateDates.slice(0, 7);
    if (!effectiveEnabled) {
      const samplePayload = batchDates.length > 0 ? await buildDailyMediaStatsUploadPayload(batchDates[0]) : null;
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: dirtyDates.length,
        batchSize: batchDates.length,
        payloadSample: samplePayload ? {
          schemaVersion: samplePayload.schemaVersion,
          date: samplePayload.date,
          domainCount: samplePayload.domains.length,
        } : null,
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }
    if (batchDates.length === 0 && exhaustedDates.length > 0) {
      return {
        uploaded: 0,
        failed: exhaustedDates.length,
        skipped: false,
        dryRun: false,
        pendingCount: dirtyDates.length,
        errors: exhaustedDates.map((date) => `media stats ${date}: retry exhausted (${pending.retryCounts?.[date] || 0})`),
      };
    }
    let uploaded = 0;
    let failed = 0;
    const errors = [];
    for (const date of batchDates) {
      const payload = await buildDailyMediaStatsUploadPayload(date);
      if (!payload || payload.domains.length === 0) {
        await markDailyMediaStatsUploaded([date]);
        continue;
      }
      try {
        await cloudRequest('POST', '/device/media-stats/v1', payload);
        await markDailyMediaStatsUploaded([date]);
        uploaded++;
        await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_STATS_UPLOAD_AT]: Date.now() });
      } catch (e) {
        await markDailyMediaStatsUploadFailed([date], e.message);
        failed++;
        errors.push(`media stats ${date}: ${e.message}`);
        logClientEventBestEffort({
          level: 'error',
          category: 'cloud',
          eventCode: 'cloud_daily_media_stats_upload_failed',
          module: 'infra/cloud-sync',
          message: e?.message || 'Daily media stats upload failed',
          details: { date },
        });
      }
    }
    return { uploaded, failed, skipped: false, dryRun: false, pendingCount: dirtyDates.length - uploaded, errors };
  } catch (e) {
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

export async function uploadHourlyMediaStatsV1({ enabled = false, forceRetryExhausted = false } = {}) {
  const effectiveEnabled = enabled !== undefined ? enabled : statsFoundationV1SyncEnabled;
  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }
  if (syncState.monitoringEnabled === 0) {
    return { uploaded: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: [] };
  }
  try {
    await reconcileHourlyMediaStatsOutbox();
    const pending = await getPendingHourlyMediaStats();
    const dirtyHourKeys = Object.keys(pending.stats || {});
    if (dirtyHourKeys.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, dryRun: !effectiveEnabled, pendingCount: 0, errors: [] };
    }
    const now = Date.now();
    const exhaustedHourKeys = dirtyHourKeys.filter((hourKey) =>
      Number(pending.retryCounts?.[hourKey] || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS
    );
    const candidateHourKeys = dirtyHourKeys.filter((hourKey) => isSyncRetryCandidate({
      retryCount: pending.retryCounts?.[hourKey],
      lastAttemptAt: pending.lastAttemptAt?.[hourKey],
      force: forceRetryExhausted,
      now,
      maxAttempts: CLOUD_CONFIG.MAX_RETRY_ATTEMPTS,
    }));
    const deferredExhaustedCount = exhaustedHourKeys.filter((hourKey) => !candidateHourKeys.includes(hourKey)).length;
    const batchHourKeys = candidateHourKeys.slice(0, 24);
    if (!effectiveEnabled) {
      const samplePayload = batchHourKeys.length > 0 ? await buildHourlyMediaStatsUploadPayload(batchHourKeys[0]) : null;
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: dirtyHourKeys.length,
        batchSize: batchHourKeys.length,
        payloadSample: samplePayload ? {
          schemaVersion: samplePayload.schemaVersion,
          hourKey: samplePayload.hourKey,
          domainCount: samplePayload.domains.length,
        } : null,
        retryCounts: pending.retryCounts,
        errors: [],
      };
    }
    if (batchHourKeys.length === 0 && exhaustedHourKeys.length > 0) {
      return {
        uploaded: 0,
        failed: 0,
        skipped: true,
        dryRun: false,
        pendingCount: dirtyHourKeys.length,
        deferredExhaustedCount,
        errors: [],
      };
    }
    let uploaded = 0;
    let failed = 0;
    const errors = [];
    for (const hourKey of batchHourKeys) {
      const payload = await buildHourlyMediaStatsUploadPayload(hourKey);
      if (!payload || payload.domains.length === 0) {
        await markHourlyMediaStatsUploaded([hourKey]);
        continue;
      }
      try {
        await cloudRequest('POST', '/device/hourly-media-stats/v1', payload);
        await markHourlyMediaStatsUploaded([hourKey]);
        uploaded++;
        await cloudStorageSet({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT]: Date.now() });
      } catch (e) {
        await markHourlyMediaStatsUploadFailed([hourKey], e.message);
        failed++;
        errors.push(`hourly media stats ${hourKey}: ${e.message}`);
        logClientEventBestEffort({
          level: 'error',
          category: 'cloud',
          eventCode: 'cloud_hourly_media_stats_upload_failed',
          module: 'infra/cloud-sync',
          message: e?.message || 'Hourly media stats upload failed',
          details: { hourKey },
        });
      }
    }
    return { uploaded, failed, skipped: false, dryRun: false, pendingCount: dirtyHourKeys.length - uploaded, deferredExhaustedCount, errors };
  } catch (e) {
    return { uploaded: 0, failed: 0, skipped: false, dryRun: !effectiveEnabled, pendingCount: 0, errors: [e.message] };
  }
}

export async function syncSiteClassificationRequestsV1({ enabled = true, forceRetryExhausted = false } = {}) {
  if (!syncState.deviceToken) {
    return { uploaded: 0, pulled: 0, failed: 0, skipped: true, dryRun: true, pendingCount: 0, errors: ['No device token'] };
  }

  try {
    const pending = await getPendingSiteClassificationRequestUploads();
    const requests = Array.isArray(pending.requests) ? pending.requests : [];
    const now = Date.now();
    const exhaustedIds = requests
      .filter((record) => Number(record.retryCount || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS)
      .map((record) => record.id);
    const candidates = requests.filter((record) => isSyncRetryCandidate({
      retryCount: record.retryCount,
      lastAttemptAt: record.lastSyncAttemptAt,
      force: forceRetryExhausted,
      now,
      maxAttempts: CLOUD_CONFIG.MAX_RETRY_ATTEMPTS,
    }));
    const deferredExhaustedCount = exhaustedIds.filter((id) => !candidates.some((record) => record.id === id)).length;
    const batchIds = candidates.slice(0, 50).map((record) => record.id);

    if (!enabled) {
      const samplePayload = batchIds.length > 0
        ? await buildSiteClassificationRequestsUploadPayload(batchIds.slice(0, 3))
        : null;
      return {
        uploaded: 0,
        pulled: 0,
        failed: 0,
        skipped: true,
        dryRun: true,
        pendingCount: pending.pendingCount,
        batchSize: batchIds.length,
        payloadSample: samplePayload ? {
          schemaVersion: samplePayload.schemaVersion,
          requestCount: samplePayload.requests.length,
          firstTarget: samplePayload.requests[0]?.requestedNormalizedValue || null,
        } : null,
        errors: [],
      };
    }

    let uploaded = 0;
    let failed = 0;
    const errors = [];

    if (batchIds.length > 0) {
      const payload = await buildSiteClassificationRequestsUploadPayload(batchIds);
      try {
        const result = await cloudRequest('POST', '/device/site-classification-requests/v1', {
          requests: payload.requests,
        });
        const savedRequests = Array.isArray(result?.requests) ? result.requests : [];
        const savedLocalIds = savedRequests
          .map((record) => record.clientRequestId || record.id)
          .filter((id) => batchIds.includes(id));
        if (savedLocalIds.length > 0) {
          await markSiteClassificationRequestsUploaded(savedLocalIds, savedRequests);
          uploaded += savedLocalIds.length;
        }
        const failedErrors = Array.isArray(result?.errors) ? result.errors : [];
        const failedIds = failedErrors
          .map((item) => item?.id)
          .filter((id) => batchIds.includes(id) && !savedLocalIds.includes(id));
        if (failedIds.length > 0) {
          const message = failedErrors.map((item) => item?.code || 'upload_failed').join('; ') || 'upload_failed';
          await markSiteClassificationRequestUploadFailed(failedIds, message);
          failed += failedIds.length;
          errors.push(...failedIds.map((id) => `site request ${id}: ${message}`));
        }
        const acknowledgedIds = new Set([...savedLocalIds, ...failedIds]);
        const unacknowledgedIds = batchIds.filter((id) => !acknowledgedIds.has(id));
        if (unacknowledgedIds.length > 0) {
          await markSiteClassificationRequestUploadFailed(unacknowledgedIds, 'upload_missing_ack');
          failed += unacknowledgedIds.length;
          errors.push(`site requests: ${unacknowledgedIds.length} missing acknowledgements`);
        }
      } catch (e) {
        await markSiteClassificationRequestUploadFailed(batchIds, e.message);
        failed += batchIds.length;
        errors.push(`site requests: ${e.message}`);
        logClientEventBestEffort({
          level: 'warning',
          category: 'cloud',
          eventCode: 'site_classification_retry_failed',
          module: 'infra/cloud-sync',
          message: e?.message || 'Site classification upload retry failed',
          details: { count: batchIds.length, exhaustedRetry: batchIds.some((id) => exhaustedIds.includes(id)) },
        });
      }
    }

    let pulled = 0;
    try {
      const remote = await cloudRequest('GET', '/device/site-classification-requests/v1');
      const remoteRequests = Array.isArray(remote?.requests) ? remote.requests : [];
      pulled = remoteRequests.length;
      await mergeCloudSiteClassificationRequests(remoteRequests);
    } catch (e) {
      errors.push(`site requests pull: ${e.message}`);
    }

    await cloudStorageSet({
      [CLOUD_CONFIG.KEYS.V1_LAST_SITE_REQUEST_SYNC_AT]: Date.now(),
    }).catch(() => {});

    return {
      uploaded,
      pulled,
      failed,
      skipped: batchIds.length === 0 && pulled === 0,
      dryRun: false,
      pendingCount: Math.max(0, Number(pending.pendingCount || 0) - uploaded),
      deferredExhaustedCount,
      errors,
    };
  } catch (e) {
    return { uploaded: 0, pulled: 0, failed: 0, skipped: false, dryRun: false, pendingCount: 0, errors: [e.message] };
  }
}

export async function uploadClientLogsV1({ enabled = true } = {}) {
  if (!syncState.deviceToken) {
    return { uploaded: 0, failed: 0, skipped: true, pendingCount: 0, errors: ['No device token'] };
  }
  if (!enabled) {
    return { uploaded: 0, failed: 0, skipped: true, pendingCount: 0, errors: [] };
  }
  try {
    const pending = await getPendingClientLogsForUpload({ limit: 200 });
    const logs = Array.isArray(pending.logs) ? pending.logs : [];
    if (logs.length === 0) {
      return { uploaded: 0, failed: 0, skipped: true, pendingCount: 0, errors: [] };
    }
    const ids = logs.map((log) => log.id).filter(Boolean);
    const payload = {
      logs: logs.map((log) => sanitizeClientLogForUpload(log)),
    };
    try {
      await cloudRequest('POST', '/device/client-logs/v1', payload);
      await markClientLogsUploaded(ids);
      await cloudStorageSet({
        [CLOUD_CONFIG.KEYS.V1_LAST_CLIENT_LOG_UPLOAD_AT]: Date.now(),
      }).catch(() => {});
      return { uploaded: ids.length, failed: 0, skipped: false, pendingCount: Math.max(0, Number(pending.pendingCount || 0) - ids.length), errors: [] };
    } catch (e) {
      await markClientLogUploadFailed(ids, e.message);
      logClientEventBestEffort({
        level: 'warning',
        category: 'cloud',
        eventCode: 'client_log_upload_failed',
        module: 'infra/cloud-sync',
        message: e?.message || 'Client log upload failed',
        details: { count: ids.length },
      });
      return { uploaded: 0, failed: ids.length, skipped: false, pendingCount: Number(pending.pendingCount || ids.length), errors: [`client logs: ${e.message}`] };
    }
  } catch (e) {
    return { uploaded: 0, failed: 0, skipped: false, pendingCount: 0, errors: [e.message] };
  }
}

/**
 * 编排完整的 Stats Foundation v1 同步。
 * 顺序：先上传 segments，再上传 stats（云端可以从 segments 重建 stats）。
 * 当 disabled（默认）时：两个上传路径都返回 dry-run 结果。
 *
 * @param {{ enabled?: boolean }} options
 * @returns {Promise<{segments: object, stats: object, hadFailure: boolean, dryRun: boolean, errors: string[]}>}
 */
export async function syncStatsFoundationV1({ enabled = false, forceRetryExhausted = false } = {}) {
  const errors = [];
  let hadFailure = false;

  // 普通 usage 统计主路径：今天覆盖上传，历史按连续日期水位补齐。
  const usageStatsResult = await syncUsageStatsByDateWatermarkV1({ enabled });
  const segmentResult = usageStatsResult.segments;
  const statsResult = usageStatsResult.stats;
  const hourlyStatsResult = usageStatsResult.hourlyStats;
  const targetStatsResult = usageStatsResult.targetStats;
  const hourlyTargetStatsResult = usageStatsResult.hourlyTargetStats;
  if (usageStatsResult.failed > 0 || usageStatsResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...usageStatsResult.errors);
  }

  // 6. Media segments 独立事实源
  const mediaSegmentResult = await uploadMediaSegmentsV1({ enabled });
  if (mediaSegmentResult.failed > 0 || mediaSegmentResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...mediaSegmentResult.errors);
  }

  // 7. Daily media stats 独立物化视图
  const mediaStatsResult = await uploadDailyMediaStatsV1({ enabled, forceRetryExhausted });
  if (mediaStatsResult.failed > 0 || mediaStatsResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...mediaStatsResult.errors);
  }

  // 8. Hourly media stats 独立物化视图
  const hourlyMediaStatsResult = await uploadHourlyMediaStatsV1({ enabled, forceRetryExhausted });
  if (hourlyMediaStatsResult.failed > 0 || hourlyMediaStatsResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...hourlyMediaStatsResult.errors);
  }

  const dryRun = segmentResult.dryRun && statsResult.dryRun && hourlyStatsResult.dryRun &&
    targetStatsResult.dryRun && hourlyTargetStatsResult.dryRun &&
    mediaSegmentResult.dryRun && mediaStatsResult.dryRun && hourlyMediaStatsResult.dryRun;

  if (!dryRun && !hadFailure) {
    console.log('[Cloud-V1] Stats Foundation sync completed successfully');
    await cloudStorageSet({
      [CLOUD_CONFIG.KEYS.V1_LAST_SYNC_AT]: Date.now(),
      [CLOUD_CONFIG.KEYS.V1_LAST_SYNC_ERROR]: null,
    }).catch(() => {});
  } else if (dryRun) {
    console.log('[Cloud-V1] Stats Foundation sync dry-run completed',
      `(segments pending: ${segmentResult.pendingCount}, stats pending: ${statsResult.pendingCount})`);
  }

  return {
    usageStats: usageStatsResult,
    segments: segmentResult,
    stats: statsResult,
    hourlyStats: hourlyStatsResult,
    targetStats: targetStatsResult,
    hourlyTargetStats: hourlyTargetStatsResult,
    mediaSegments: mediaSegmentResult,
    mediaStats: mediaStatsResult,
    hourlyMediaStats: hourlyMediaStatsResult,
    hadFailure,
    dryRun,
    errors,
  };
}

// ── Heartbeat ───────────────────────────────────────────────────────────────────

export async function sendHeartbeat(afterRecoveredSync = null) {
  const activation = await requireRuntimeActivation();
  if (!activation.ok) {
    console.log('[Cloud] Heartbeat skipped: runtime activation required');
    return { skipped: true, reason: activation.reason || 'runtime_activation_required' };
  }
  await hydrateCloudSyncStateFromStorage();
  let recoveredByHeartbeat = false;
  if (!syncState.deviceToken) {
    const recoveryResult = await tryRecoverCloudBindingIfMissing('heartbeat');
    recoveredByHeartbeat = !!(recoveryResult?.recovered && syncState.deviceToken);
  }
  if (recoveredByHeartbeat && typeof afterRecoveredSync === 'function') {
    try {
      await afterRecoveredSync();
    } catch (e) {
      console.warn('[Cloud] Follow-up sync after device recovery failed:', e?.message || e);
      logClientEventBestEffort({
        level: 'warning',
        category: 'cloud',
        eventCode: 'device_recovery_followup_sync_failed',
        module: 'infra/cloud-sync',
        message: 'Full cloud sync after device recovery failed',
        details: { source: 'heartbeat', error: e?.message || String(e) },
      });
    }
  }
  if (!syncState.deviceToken) return;
  const previousRequestId = syncState.currentRequestId;
  syncState.currentRequestId = createCloudRequestId('heartbeat');
  try {
    await cloudRequest('POST', '/device/heartbeat');
    console.log('[Cloud] Heartbeat sent');
  } catch (e) {
    console.warn('[Cloud] Heartbeat failed:', e.message);
  } finally {
    syncState.currentRequestId = previousRequestId;
  }
}

// ── Init cloud sync ─────────────────────────────────────────────────────────────

export async function initCloudSync(syncNowFn) {
  const activation = await requireRuntimeActivation();
  if (!activation.ok) {
    console.log('[Cloud] Init skipped: runtime activation required');
    return { skipped: true, reason: activation.reason || 'runtime_activation_required' };
  }
  await hydrateCloudSyncStateFromStorage();

  if (!syncState.deviceToken) {
    await tryRecoverCloudBindingIfMissing('init_cloud_sync');
  }

  if (syncState.deviceToken) {
    console.log('[Cloud] Device token found, starting sync...');
    if (syncNowFn) await syncNowFn();
  } else {
    console.log('[Cloud] No device token, waiting for binding');
  }
}

// ── Cloud bind ──────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{success: boolean, device_token?: string, syncOk?: boolean, syncErrors?: string[], error?: string}>}
 */
export async function cloudBind(syncNowFn) {
  const activation = await requireRuntimeActivation();
  if (!activation.ok) {
    return { success: false, error: activation.reason || 'runtime_activation_required', privacyConsentRequired: activation.privacyConsentRequired === true, activationRequired: true };
  }
  const storage = await chrome.storage.local.get([
    CLOUD_CONFIG.KEYS.DEVICE_TOKEN,
    CLOUD_CONFIG.KEYS.DEVICE_ID,
    CLOUD_CONFIG.KEYS.PROFILE_ID
  ]);
  const deviceToken = storage[CLOUD_CONFIG.KEYS.DEVICE_TOKEN];
  const profileId = storage[CLOUD_CONFIG.KEYS.PROFILE_ID];

  if (!deviceToken) {
    return { error: '未找到设备 token，请先完成绑定' };
  }

  syncState.deviceToken = deviceToken;
  syncState.deviceId = storage[CLOUD_CONFIG.KEYS.DEVICE_ID] || null;
  syncState.profileId = profileId;

  if (syncNowFn) {
    const syncResult = await syncNowFn();
    if (syncResult && syncResult.hadFailure) {
      return {
        success: true,
        device_token: deviceToken,
        syncOk: false,
        syncErrors: syncResult.errors || ['Unknown sync error'],
      };
    }
  }
  return { success: true, device_token: deviceToken, syncOk: true };
}

export { CLOUD_CONFIG };
