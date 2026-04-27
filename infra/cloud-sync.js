// infra/cloud-sync.js — 云同步 + 心跳
import { getStatsRange } from './storage.js';

const CLOUD_CONFIG = {
  API_BASE: 'https://guardian-api.william-xia-cn.workers.dev',
  SYNC_INTERVAL_MS: 15 * 60 * 1000,
  SESSION_UPLOAD_HOUR: 8,
  MAX_RETRY_ATTEMPTS: 3,
  KEYS: {
    DEVICE_TOKEN: 'cloud_device_token',
    PROFILE_ID: 'cloud_profile_id',
    CREDENTIALS: 'cloud_credentials',
    LAST_SYNC: 'cloud_last_sync',
    PENDING_STATS: 'cloud_pending_stats',
    PENDING_SESSIONS: 'cloud_pending_sessions',
    LOCAL_CONFIG: 'cloud_local_config',
    CONFIG_VERSION: 'cloud_config_version',
    MONITORING_ENABLED: 'cloud_monitoring_enabled'
  }
};

let syncState = {
  isSyncing: false,
  lastConfigVersion: 0,
  deviceToken: null,
  profileId: null,
  monitoringEnabled: 1
};

export function getSyncState() {
  return { ...syncState };
}

export function getCloudConfig() {
  return { ...CLOUD_CONFIG };
}

// ── Cloud request ───────────────────────────────────────────────────────────────

async function cloudRequest(method, path, body = null, retries = 3) {
  if (!syncState.deviceToken) {
    throw new Error('No device token');
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncState.deviceToken}`
        }
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const resp = await fetch(`${CLOUD_CONFIG.API_BASE}${path}`, options);

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

      const err = await resp.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');

    } catch (e) {
      console.error(`[Cloud] Attempt ${attempt + 1} failed:`, e.message);
      if (e.message.includes('expired') || e.message.includes('Unauthorized')) {
        throw e;
      }
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error('Max retries exceeded');
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
    await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.MONITORING_ENABLED]: monitoringEnabled });
    syncState.monitoringEnabled = monitoringEnabled;

    if (cloudVersion > 0 && cloudVersion <= syncState.lastConfigVersion) {
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
    const cloudConfig = result.data;
    const localConfig = await getConfigFn();
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
    return { status: 'failed', version: null, error: e.message };
  }
}

// ── Pull quota state ────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{synced: boolean, changed: boolean, error: string|null}>}
 */
export async function pullCloudQuotaState(getConfigFn, saveConfigFn, redirectAllTabsFn, redirectQuotaViolatingTabsFn) {
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

      if (newState.onlineLocked && !localQs.onlineLocked) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: '今天的上网时间用完啦，好好休息一下吧 🌙' });
        if (redirectAllTabsFn) await redirectAllTabsFn();
      } else if (newState.restLocked && !localQs.restLocked) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: '今天的休息时间用完啦，切换到学习模式继续加油 📚' });
        if (redirectQuotaViolatingTabsFn) await redirectQuotaViolatingTabsFn(config, newState);
      } else if (newState.studyLocked && !localQs.studyLocked) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: '今天学得够多啦，劳逸结合才高效 🎉' });
        if (redirectQuotaViolatingTabsFn) await redirectQuotaViolatingTabsFn(config, newState);
      } else if (newState.undeterminedLocked && !localQs.undeterminedLocked) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: '待定网站今天的时间用完啦，明天再来探索' });
        if (redirectQuotaViolatingTabsFn) await redirectQuotaViolatingTabsFn(config, newState);
      }

      console.log('[Cloud] Quota state synced from cloud:', newState);
    }
    return { synced: true, changed: stateChanged, error: null };
  } catch (e) {
    console.error('[Cloud] Failed to pull quota state:', e.message);
    return { synced: false, changed: false, error: e.message };
  }
}

// ── Upload stats ────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{uploaded: number, failed: number, skipped: boolean}>}
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
export async function syncNow(getConfigFn, saveConfigFn, updateDeclarativeRulesFn, redirectAllTabsFn, redirectQuotaViolatingTabsFn) {
  if (!syncState.deviceToken) {
    console.log('[Cloud] Sync skipped: no device token (not yet initialized or unbound)');
    return { configPulled: false, statsUploaded: false, quotaSynced: false, hadFailure: false, errors: [] };
  }

  if (syncState.isSyncing) {
    console.log('[Cloud] Sync already in progress');
    return { configPulled: false, statsUploaded: false, quotaSynced: false, hadFailure: true, errors: ['Sync already in progress'] };
  }

  syncState.isSyncing = true;
  const errors = [];

  try {
    const configResult = await pullCloudConfig(getConfigFn, saveConfigFn, updateDeclarativeRulesFn);
    const configPulled = configResult.status === 'updated';
    if (configResult.status === 'failed') {
      errors.push('config: ' + (configResult.error || 'unknown'));
    }

    let statsUploaded = false;
    if (syncState.monitoringEnabled !== 0) {
      const statsResult = await uploadStats();
      statsUploaded = statsResult.uploaded > 0 || statsResult.skipped;
      if (statsResult.failed > 0) {
        errors.push(`stats: ${statsResult.failed} date(s) failed`);
      }
      if (statsResult.error) {
        errors.push('stats: ' + statsResult.error);
      }
    } else {
      statsUploaded = true; // monitoring disabled, intentionally skipped
    }

    let quotaSynced = false;
    if (syncState.monitoringEnabled !== 0) {
      const quotaResult = await pullCloudQuotaState(getConfigFn, saveConfigFn, redirectAllTabsFn, redirectQuotaViolatingTabsFn);
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
    } else {
      console.log('[Cloud] Sync completed successfully');
    }

    return { configPulled, statsUploaded, quotaSynced, hadFailure, errors };
  } catch (e) {
    console.error('[Cloud] Sync failed:', e.message);
    return { configPulled: false, statsUploaded: false, quotaSynced: false, hadFailure: true, errors: [e.message] };
  } finally {
    syncState.isSyncing = false;
  }
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
  const storage = await chrome.storage.local.get([
    CLOUD_CONFIG.KEYS.DEVICE_TOKEN,
    CLOUD_CONFIG.KEYS.PROFILE_ID,
    CLOUD_CONFIG.KEYS.CONFIG_VERSION,
    CLOUD_CONFIG.KEYS.MONITORING_ENABLED
  ]);

  syncState.deviceToken = storage[CLOUD_CONFIG.KEYS.DEVICE_TOKEN];
  syncState.profileId = storage[CLOUD_CONFIG.KEYS.PROFILE_ID];
  syncState.lastConfigVersion = storage[CLOUD_CONFIG.KEYS.CONFIG_VERSION] || 0;
  syncState.monitoringEnabled = storage[CLOUD_CONFIG.KEYS.MONITORING_ENABLED] ?? 1;

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
    CLOUD_CONFIG.KEYS.PROFILE_ID
  ]);
  const deviceToken = storage[CLOUD_CONFIG.KEYS.DEVICE_TOKEN];
  const profileId = storage[CLOUD_CONFIG.KEYS.PROFILE_ID];

  if (!deviceToken) {
    return { error: '未找到设备 token，请先完成绑定' };
  }

  syncState.deviceToken = deviceToken;
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
