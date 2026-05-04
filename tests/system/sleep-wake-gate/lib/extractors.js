// lib/extractors.js — Service Worker 数据提取包装器

/**
 * 提取完整校准快照（trace + event-log + session + stats + focus ledger）
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function extractCalibration(sw) {
  return sw.evaluate(async () => {
    if (typeof globalThis.debugExportTimingCalibration !== 'function') {
      return { success: false, error: 'debugExportTimingCalibration not available' };
    }
    return globalThis.debugExportTimingCalibration();
  });
}

/**
 * 提取今日统计
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function extractTodayStats(sw) {
  return sw.evaluate(async () => {
    if (typeof globalThis.debugGetTodayStats !== 'function') {
      return { success: false, error: 'debugGetTodayStats not available' };
    }
    return globalThis.debugGetTodayStats();
  });
}

/**
 * 提取 timing trace
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function extractTimingTrace(sw) {
  return sw.evaluate(async () => {
    if (typeof globalThis.debugGetTimingTrace !== 'function') {
      return { success: false, error: 'debugGetTimingTrace not available' };
    }
    return globalThis.debugGetTimingTrace();
  });
}

/**
 * 提取事件日志
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Array>}
 */
async function extractEventLog(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get('event_log_v1', result => {
        resolve(result['event_log_v1'] || []);
      });
    });
  });
}

/**
 * 提取 session 状态
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function extractSession(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.session.get('session_v1', result => {
        resolve(result['session_v1'] || null);
      });
    });
  });
}

/**
 * 提取 focus ledger
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function extractFocusLedger(sw) {
  return sw.evaluate(async () => {
    if (typeof globalThis.debugGetFocusLedger !== 'function') {
      return { success: false, error: 'debugGetFocusLedger not available' };
    }
    return globalThis.debugGetFocusLedger();
  });
}

/**
 * 提取扩展配置和 guardian_session
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function extractProfile(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get(['guardian_config', 'guardian_session'], result => {
        resolve({
          config: result['guardian_config'] || null,
          session: result['guardian_session'] || null,
        });
      });
    });
  });
}

/**
 * 重置校准数据
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function resetCalibrationData(sw) {
  return sw.evaluate(async () => {
    if (typeof globalThis.debugResetTimingCalibration !== 'function') {
      return { success: false, error: 'debugResetTimingCalibration not available' };
    }
    return globalThis.debugResetTimingCalibration();
  });
}

/**
 * 注入受控 timing signal
 * @param {Object} sw — Playwright ServiceWorker
 * @param {Object} event — 信号事件
 * @returns {Promise<Object>}
 */
async function applyControlledSignal(sw, event) {
  return sw.evaluate(async (evt) => {
    if (typeof globalThis.debugApplyControlledTimingSignal !== 'function') {
      return { success: false, error: 'debugApplyControlledTimingSignal not available' };
    }
    return globalThis.debugApplyControlledTimingSignal(evt);
  }, event);
}

/**
 * 将扩展设置为 rest mode（避免学习模式拦截）
 * @param {Object} sw — Playwright ServiceWorker
 */
async function initializeRestMode(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get(['guardian_config', 'guardian_session'], result => {
        const config = result['guardian_config'] || {};
        const session = result['guardian_session'] || {};
        chrome.storage.local.set({
          guardian_config: { ...config, mode: 'rest' },
          guardian_session: { ...session, currentMode: 'rest' },
        }, () => resolve());
      });
    });
  });
}

/**
 * 提取扩展绑定状态（device_token / profile_id / config）
 * @param {Object} sw — Playwright ServiceWorker
 * @returns {Promise<Object>}
 */
async function extractBindingStatus(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get(
        ['cloud_device_token', 'cloud_profile_id', 'guardian_config', 'guardian_session'],
        result => {
          const config = result['guardian_config'] || null;
          const session = result['guardian_session'] || null;
          const deviceToken = result['cloud_device_token'] || '';
          const profileId = result['cloud_profile_id'] || '';

          const deviceTokenPresent = typeof deviceToken === 'string' && deviceToken.length > 0;
          const profileIdPresent = typeof profileId === 'string' && profileId.length > 0;
          const configAvailable = config !== null && typeof config === 'object';
          const monitoringEnabled = configAvailable ? !!config.monitoring_enabled : false;

          resolve({
            bound: deviceTokenPresent && profileIdPresent,
            deviceTokenPresent,
            profileIdPresent,
            configAvailable,
            monitoringEnabled,
            mode: session?.currentMode || config?.mode || null,
            isInitialized: configAvailable ? !!config.isInitialized : false,
            blockers: [
              ...(deviceTokenPresent ? [] : ['missing cloud_device_token']),
              ...(profileIdPresent ? [] : ['missing cloud_profile_id']),
              ...(configAvailable ? [] : ['missing guardian_config']),
            ],
            action: deviceTokenPresent && profileIdPresent
              ? 'bound profile is available'
              : 'run tests/system/sleep-wake-gate/scripts/setup-bound-profile.js with TIMEONCHROME_TEST_EMAIL/TIMEONCHROME_TEST_PASSWORD and --allow-cloud-mutation, then pass --user-data-dir to the gate runner',
          });
        }
      );
    });
  });
}

module.exports = {
  extractCalibration,
  extractTodayStats,
  extractTimingTrace,
  extractEventLog,
  extractSession,
  extractFocusLedger,
  extractProfile,
  extractBindingStatus,
  resetCalibrationData,
  applyControlledSignal,
  initializeRestMode,
};
