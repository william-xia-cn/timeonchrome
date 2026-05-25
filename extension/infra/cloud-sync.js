// infra/cloud-sync.js — 云同步 + 心跳
import { getStatsRange } from './storage.js';
import { DEFAULT_CONFIG } from './storage.js';
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
  markUsageSegmentsUploaded, markDailyStatsUploaded,
  markHourlyStatsUploaded,
  markTargetStatsUploaded,
  markHourlyTargetStatsUploaded,
  markUsageSegmentUploadFailed, markDailyStatsUploadFailed,
  markHourlyStatsUploadFailed,
  markTargetStatsUploadFailed,
  markHourlyTargetStatsUploadFailed,
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
} from '../runtime/media-session.js';
import {
  getPendingClientLogsForUpload,
  markClientLogUploadFailed,
  markClientLogsUploaded,
  sanitizeClientLogForUpload,
  logClientEventBestEffort,
} from './client-logs.js';

const CLOUD_CONFIG = {
  API_BASE: 'https://guardian-api.william-xia-cn.workers.dev',
  SYNC_INTERVAL_MS: 15 * 60 * 1000,
  SESSION_UPLOAD_HOUR: 8,
  MAX_RETRY_ATTEMPTS: 3,
  REQUEST_TIMEOUT_MS: 15000,
  SYNC_STALE_LOCK_MS: 2 * 60 * 1000,
  KEYS: {
    DEVICE_TOKEN: 'cloud_device_token',
    DEVICE_ID: 'cloud_device_id',
    PROFILE_ID: 'cloud_profile_id',
    CREDENTIALS: 'cloud_credentials',
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
    V1_LAST_MEDIA_SEGMENT_UPLOAD_AT: 'cloud_v1_last_media_segment_upload_at',
    V1_LAST_MEDIA_STATS_UPLOAD_AT: 'cloud_v1_last_media_stats_upload_at',
    V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT: 'cloud_v1_last_hourly_media_stats_upload_at',
    V1_LAST_SITE_REQUEST_SYNC_AT: 'cloud_v1_last_site_request_sync_at',
    V1_LAST_CLIENT_LOG_UPLOAD_AT: 'cloud_v1_last_client_log_upload_at'
  }
};

let syncState = {
  isSyncing: false,
  syncStartedAt: 0,
  lastConfigVersion: 0,
  deviceToken: null,
  deviceId: null,
  profileId: null,
  monitoringEnabled: 1,
  v1SyncEnabled: false,
};

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

async function hydrateDeviceIdFromBindIfMissing() {
  if (syncState.deviceId || !syncState.deviceToken || !syncState.profileId) {
    return false;
  }

  const storage = await chrome.storage.local.get([CLOUD_CONFIG.KEYS.CREDENTIALS]);
  const creds = safeDecodeCredentials(storage?.[CLOUD_CONFIG.KEYS.CREDENTIALS]);
  if (!creds) {
    console.warn('[Cloud] cloud_device_id missing and no valid credentials to hydrate');
    return false;
  }

  try {
    const loginResp = await fetch(`${CLOUD_CONFIG.API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    if (!loginResp.ok) {
      console.warn('[Cloud] cloud_device_id hydrate login failed:', loginResp.status);
      return false;
    }

    const loginData = await loginResp.json().catch(() => null);
    const accountToken = loginData?.token;
    if (!accountToken) {
      console.warn('[Cloud] cloud_device_id hydrate login missing token');
      return false;
    }

    const bindResp = await fetch(`${CLOUD_CONFIG.API_BASE}/device/bind`, {
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
    await chrome.storage.local.set({
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
    await chrome.storage.local.set({
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

function mergeUniqueDomains(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const domain = item.trim();
      if (!domain) continue;
      const key = domain.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(domain);
    }
  }
  return out;
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

  if (defaultStudySites) cfg.defaultStudySites = defaultStudySites;
  if (defaultCompositeSites) cfg.defaultCompositeSites = defaultCompositeSites;
  if (defaultRestrictedEntertainmentSites) cfg.defaultRestrictedEntertainmentSites = defaultRestrictedEntertainmentSites;
  if (defaultBlockedSites) cfg.defaultBlockedSites = defaultBlockedSites;

  // Preserve defaultUserCompositeSites from cloud response (initialization/recommendation only)
  const defaultUserCompositeSites = pickFirstArray(cfg, [
    'defaultUserCompositeSites',
    'defaultUserCompositeList',
    'recommendedCompositeSites',
  ]);
  if (defaultUserCompositeSites) cfg.defaultUserCompositeSites = defaultUserCompositeSites;

  // 若云端未提供 effective 列表，使用 system + custom 在本地只读缓存中补齐，不回写云端。
  // V0 不支持用户移除系统默认学习网站，因此 DEFAULT_CONFIG.studyList 始终作为基底合并。
  const defaultStudyList = DEFAULT_CONFIG.studyList || [];
  if (!Array.isArray(cfg.studyList)) {
    cfg.studyList = mergeUniqueDomains(defaultStudyList, cfg.defaultStudySites, cfg.customStudyList);
  } else {
    // Cloud may return studyList: [] which would erase default sites.
    // Ensure system defaults are always present as the base layer.
    cfg.studyList = mergeUniqueDomains(defaultStudyList, cfg.defaultStudySites, cfg.studyList, cfg.customStudyList);
  }
  if (!Array.isArray(cfg.compositeList)) {
    cfg.compositeList = mergeUniqueDomains(cfg.defaultCompositeSites, cfg.customCompositeList);
  }
  if (!Array.isArray(cfg.restrictedEntertainmentList)) {
    cfg.restrictedEntertainmentList = mergeUniqueDomains(cfg.defaultRestrictedEntertainmentSites, cfg.customRestrictedEntertainmentList);
  }
  if (!Array.isArray(cfg.unsafeList)) {
    cfg.unsafeList = mergeUniqueDomains(cfg.defaultBlockedSites, cfg.customBlockedSites);
  }

  return cfg;
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
    'systemConfiguredCompositeSites',
    'systemConfiguredCompositeList',
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
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLOUD_CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const options = {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncState.deviceToken}`
        }
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const resp = await fetch(`${CLOUD_CONFIG.API_BASE}${path}`, options);
      clearTimeout(timeoutId);

      if (resp.ok) {
        const contentType = resp.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await resp.json();
        }
        return { success: true };
      }

      if (resp.status === 401) {
        syncState.deviceToken = null;
        syncState.profileId = null;
        await chrome.storage.local.set({
          [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null,
          [CLOUD_CONFIG.KEYS.PROFILE_ID]: null
        });
        console.warn('[Cloud] Device token invalidated, cleared from storage');
        chrome.runtime.sendMessage({ type: 'DEVICE_UNBOUND' }).catch(() => {});
        throw new Error('Device token expired');
      }

      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      const message = err?.error || err?.message || `HTTP ${resp.status}`;
      const nonRetryable = resp.status >= 400 && resp.status < 500 && resp.status !== 429;
      const error = new Error(`HTTP ${resp.status}: ${message}`);
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
        throw e;
      }
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  const rootMessage = lastError?.message || 'unknown_error';
  throw new Error(`Max retries exceeded: ${rootMessage}`);
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
    await chrome.storage.local.set(syncMetadata);
    syncState.monitoringEnabled = monitoringEnabled;
    if (maybeProfileId) syncState.profileId = maybeProfileId;
    if (maybeDeviceId) syncState.deviceId = maybeDeviceId;
    const localConfig = await getConfigFn();

    if (cloudVersion > 0 && cloudVersion <= syncState.lastConfigVersion &&
      !shouldSaveDespiteVersionSkip(result.data, localConfig)) {
      console.log('[Cloud] Config up to date, skip pull (local:', syncState.lastConfigVersion, 'cloud:', cloudVersion, ')');
      await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.LAST_SYNC]: Date.now() });
      return { status: 'skipped', version: cloudVersion, error: null };
    }

    await chrome.storage.local.set({
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
    logClientEventBestEffort({
      level: 'error',
      category: 'cloud',
      eventCode: 'cloud_config_pull_failed',
      module: 'infra/cloud-sync',
      message: e?.message || 'Cloud config pull failed',
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

    await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.PENDING_STATS]: pendingStats });
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
  const options = typeof optionsOrLegacyRedirectAllTabs === 'function'
    ? (legacyOptions || {})
    : (optionsOrLegacyRedirectAllTabs || {});
  if (!syncState.deviceToken) {
    console.log('[Cloud] Sync skipped: no device token (not yet initialized or unbound)');
    return { configPulled: false, siteRequestsSynced: false, statsUploaded: false, quotaSynced: false, hadFailure: false, errors: [] };
  }

  if (syncState.isSyncing) {
    const ageMs = Date.now() - Number(syncState.syncStartedAt || 0);
    if (ageMs > CLOUD_CONFIG.SYNC_STALE_LOCK_MS) {
      console.warn('[Cloud] Stale sync lock detected, resetting:', ageMs);
      syncState.isSyncing = false;
      syncState.syncStartedAt = 0;
    } else {
    console.log('[Cloud] Sync already in progress');
    return { configPulled: false, siteRequestsSynced: false, statsUploaded: false, quotaSynced: false, hadFailure: true, errors: ['Sync already in progress'] };
    }
  }

  syncState.isSyncing = true;
  syncState.syncStartedAt = Date.now();
  const errors = [];

  try {
    await hydrateDeviceIdFromBindIfMissing();

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
          await chrome.storage.local.set({
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
      console.warn('[Cloud] Sync completed with errors:', errors);
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
    return { configPulled: false, siteRequestsSynced: false, statsUploaded: false, quotaSynced: false, hadFailure: true, errors: [e.message] };
  } finally {
    syncState.isSyncing = false;
    syncState.syncStartedAt = 0;
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
  chrome.storage.local.set({
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
      CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_SEGMENT_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_SITE_REQUEST_SYNC_AT,
      CLOUD_CONFIG.KEYS.V1_LAST_CLIENT_LOG_UPLOAD_AT,
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
    lastMediaSegmentUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_SEGMENT_UPLOAD_AT] || 0),
    lastMediaStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_STATS_UPLOAD_AT] || 0),
    lastHourlyMediaStatsUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT] || 0),
    lastSiteRequestSyncAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_SITE_REQUEST_SYNC_AT] || 0),
    lastClientLogUploadAt: Number(storage?.[CLOUD_CONFIG.KEYS.V1_LAST_CLIENT_LOG_UPLOAD_AT] || 0),
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
    const MAX_SEGMENTS_PER_BATCH = 200;
    const batchIds = pending.segments.slice(0, MAX_SEGMENTS_PER_BATCH).map(s => s.id);

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
      await chrome.storage.local.set({
        [CLOUD_CONFIG.KEYS.V1_LAST_SEGMENT_UPLOAD_AT]: Date.now(),
      });
      console.log('[Cloud-V1] Usage segments uploaded:', uploaded);
    } catch (e) {
      await markUsageSegmentUploadFailed(batchIds, e.message);
      failed = batchIds.length;
      errors.push(`segments: ${e.message}`);
      console.error('[Cloud-V1] Failed to upload segments:', e.message);
      logClientEventBestEffort({
        level: 'error',
        category: 'cloud',
        eventCode: 'cloud_usage_segment_upload_failed',
        module: 'infra/cloud-sync',
        message: e?.message || 'Usage segment upload failed',
        details: { count: batchIds.length },
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
    const dirtyDates = Object.keys(pending.stats);

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
        await markDailyStatsUploaded([date]);
        continue;
      }

      try {
        // 发送嵌套聚合形状（buildDailyStatsUploadPayload 的输出）。
        // Worker 将 byMode 对象展开为 stats_v1 的逐 channel+mode 行。
        await cloudRequest('POST', '/device/stats/v1', payload);
        await markDailyStatsUploaded([date]);
        uploaded++;
        await chrome.storage.local.set({
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
        await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_STATS_UPLOAD_AT]: Date.now() });
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
        await markTargetStatsUploaded([date]);
        continue;
      }
      try {
        await cloudRequest('POST', '/device/target-stats/v1', payload);
        await markTargetStatsUploaded([date]);
        uploaded++;
        await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.V1_LAST_TARGET_STATS_UPLOAD_AT]: Date.now() });
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
        await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_TARGET_STATS_UPLOAD_AT]: Date.now() });
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
      await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_SEGMENT_UPLOAD_AT]: Date.now() });
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
        await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.V1_LAST_MEDIA_STATS_UPLOAD_AT]: Date.now() });
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
    const pending = await getPendingHourlyMediaStats();
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
        failed: exhaustedHourKeys.length,
        skipped: false,
        dryRun: false,
        pendingCount: dirtyHourKeys.length,
        errors: exhaustedHourKeys.map((hourKey) => `hourly media stats ${hourKey}: retry exhausted (${pending.retryCounts?.[hourKey] || 0})`),
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
        await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.V1_LAST_HOURLY_MEDIA_STATS_UPLOAD_AT]: Date.now() });
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
    return { uploaded, failed, skipped: false, dryRun: false, pendingCount: dirtyHourKeys.length - uploaded, errors };
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
    const exhaustedIds = requests
      .filter((record) => Number(record.retryCount || 0) >= CLOUD_CONFIG.MAX_RETRY_ATTEMPTS)
      .map((record) => record.id);
    const candidates = forceRetryExhausted
      ? requests
      : requests.filter((record) => !exhaustedIds.includes(record.id));
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

    if (exhaustedIds.length > 0 && !forceRetryExhausted) {
      failed += exhaustedIds.length;
      errors.push(...exhaustedIds.map((id) => `site request ${id}: retry exhausted`));
    }

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
      } catch (e) {
        await markSiteClassificationRequestUploadFailed(batchIds, e.message);
        failed += batchIds.length;
        errors.push(`site requests: ${e.message}`);
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

    await chrome.storage.local.set({
      [CLOUD_CONFIG.KEYS.V1_LAST_SITE_REQUEST_SYNC_AT]: Date.now(),
    }).catch(() => {});

    return {
      uploaded,
      pulled,
      failed,
      skipped: batchIds.length === 0 && pulled === 0,
      dryRun: false,
      pendingCount: Math.max(0, Number(pending.pendingCount || 0) - uploaded),
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
      await chrome.storage.local.set({
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

  // 1. Segments 先上传（事实源）
  const segmentResult = await uploadUsageSegmentsV1({ enabled });
  if (segmentResult.failed > 0 || segmentResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...segmentResult.errors);
  }

  // 2. Stats 后上传（物化视图）
  const statsResult = await uploadDailyStatsV1({ enabled, forceRetryExhausted });
  if (statsResult.failed > 0 || statsResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...statsResult.errors);
  }

  // 3. Hourly usage stats 物化视图
  const hourlyStatsResult = await uploadHourlyStatsV1({ enabled, forceRetryExhausted });
  if (hourlyStatsResult.failed > 0 || hourlyStatsResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...hourlyStatsResult.errors);
  }

  // 4. Target usage stats 并行物化视图
  const targetStatsResult = await uploadTargetStatsV1({ enabled, forceRetryExhausted });
  if (targetStatsResult.failed > 0 || targetStatsResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...targetStatsResult.errors);
  }

  // 5. Hourly target usage stats 并行物化视图
  const hourlyTargetStatsResult = await uploadHourlyTargetStatsV1({ enabled, forceRetryExhausted });
  if (hourlyTargetStatsResult.failed > 0 || hourlyTargetStatsResult.errors.length > 0) {
    hadFailure = true;
    errors.push(...hourlyTargetStatsResult.errors);
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
    await chrome.storage.local.set({
      [CLOUD_CONFIG.KEYS.V1_LAST_SYNC_AT]: Date.now(),
      [CLOUD_CONFIG.KEYS.V1_LAST_SYNC_ERROR]: null,
    }).catch(() => {});
  } else if (dryRun) {
    console.log('[Cloud-V1] Stats Foundation sync dry-run completed',
      `(segments pending: ${segmentResult.pendingCount}, stats pending: ${statsResult.pendingCount})`);
  }

  return {
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

export async function sendHeartbeat() {
  if (!syncState.deviceToken) return;
  try {
    await cloudRequest('POST', '/device/heartbeat');
    console.log('[Cloud] Heartbeat sent');
  } catch (e) {
    console.warn('[Cloud] Heartbeat failed:', e.message);
  }
}

// ── Init cloud sync ─────────────────────────────────────────────────────────────

export async function initCloudSync(syncNowFn) {
  await hydrateCloudSyncStateFromStorage();

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
