// infra/cloud-sync.js — 云同步 + 心跳

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

export async function pullCloudConfig(getConfigFn, saveConfigFn, updateDeclarativeRulesFn) {
  try {
    const result = await cloudRequest('GET', '/device/config');

    if (result.data) {
      const cloudVersion = result.version || 0;
      const monitoringEnabled = result.monitoring_enabled ?? 1;
      await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.MONITORING_ENABLED]: monitoringEnabled });
      syncState.monitoringEnabled = monitoringEnabled;

      if (cloudVersion > 0 && cloudVersion <= syncState.lastConfigVersion) {
        console.log('[Cloud] Config up to date, skip pull (local:', syncState.lastConfigVersion, 'cloud:', cloudVersion, ')');
        await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.LAST_SYNC]: Date.now() });
        return false;
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
      return true;
    }
  } catch (e) {
    console.error('[Cloud] Failed to pull config:', e.message);
  }
  return false;
}

// ── Pull quota state ────────────────────────────────────────────────────────────

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
  } catch (e) {
    console.error('[Cloud] Failed to pull quota state:', e.message);
  }
}

// ── Upload stats ────────────────────────────────────────────────────────────────

export async function uploadStats() {
  try {
    // Import getStatsRange dynamically to avoid circular dependency
    const { getStatsRange } = await import('./storage.js');
    const statsRange = await getStatsRange(7);

    const storage = await chrome.storage.local.get(CLOUD_CONFIG.KEYS.PENDING_STATS);
    let pendingStats = storage[CLOUD_CONFIG.KEYS.PENDING_STATS] || {};

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const dayData = statsRange[dateStr] || {};
      const stats = Object.entries(dayData)
        .filter(([domain, sec]) => domain !== 'audioSeconds' && typeof sec === 'number' && sec > 0)
        .map(([domain, sec]) => ({ domain, active_sec: sec, passive_sec: 0 }));

      if (stats.length > 0) {
        pendingStats[dateStr] = { stats, timestamp: Date.now() };
      }
    }

    const dates = Object.keys(pendingStats);
    if (dates.length === 0) {
      console.log('[Cloud] No stats to upload');
      return;
    }

    for (const date of dates) {
      const { stats } = pendingStats[date];
      try {
        await cloudRequest('POST', '/device/stats', { date, stats });
        delete pendingStats[date];
        console.log('[Cloud] Stats uploaded:', date, `(${stats.length} domains)`);
      } catch (e) {
        console.error('[Cloud] Failed to upload stats for', date, e.message);
      }
    }

    await chrome.storage.local.set({ [CLOUD_CONFIG.KEYS.PENDING_STATS]: pendingStats });
  } catch (e) {
    console.error('[Cloud] Failed to upload stats:', e.message);
  }
}

// ── Sync now ────────────────────────────────────────────────────────────────────

export async function syncNow(getConfigFn, saveConfigFn, updateDeclarativeRulesFn, redirectAllTabsFn, redirectQuotaViolatingTabsFn) {
  if (syncState.isSyncing) {
    console.log('[Cloud] Sync already in progress');
    return;
  }

  syncState.isSyncing = true;

  try {
    await pullCloudConfig(getConfigFn, saveConfigFn, updateDeclarativeRulesFn);

    if (syncState.monitoringEnabled !== 0) {
      await uploadStats();
    }

    if (syncState.monitoringEnabled !== 0) {
      await pullCloudQuotaState(getConfigFn, saveConfigFn, redirectAllTabsFn, redirectQuotaViolatingTabsFn);
    }

    console.log('[Cloud] Sync completed');
  } catch (e) {
    console.error('[Cloud] Sync failed:', e.message);
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

  if (syncNowFn) await syncNowFn();
  return { success: true, device_token: deviceToken };
}

export { CLOUD_CONFIG };
