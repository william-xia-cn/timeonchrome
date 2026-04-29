// background-new.js — 完整 wiring 入口

import { initSignal } from './core/signal.js';
import { buildContext } from './core/context.js';
import { resolveState } from './core/state.js';
import { initSession, transitionState, heartbeat, getSession as getTimingSession } from './runtime/session.js';
import { recover } from './runtime/recovery.js';
import { getCappedElapsedMs } from './runtime/time-boundary.js';
import { getConfig, saveConfig, resetDailyLockedDomains, cleanOldStats, cleanOldSessions, DEFAULT_CONFIG, VISIT_SESSIONS_KEY, MIN_SESSION_DURATION, SESSION_KEY, LAST_RESET_DATE_KEY, getDateKey, formatDate, extractDomain, matchDomain, getStatsRange } from './infra/storage.js';
import { updateDeclarativeRules, checkAndRemind } from './product/interceptor.js';
import { checkAllTabsQuota, redirectAllTabs, redirectQuotaViolatingTabs, redirectLockedTabs } from './product/quota.js';
import { initCloudSync, syncNow, sendHeartbeat, getSyncState } from './infra/cloud-sync.js';
import { handleMessage } from './message-router.js';
import { initFocusLedger, getFocusLedger, resetFocusLedger, exportCalibrationReport } from './debug/focus-ledger.js';
import { getEvents, clearEvents } from './core/event-log.js';
import { emitTrace, getTrace, clearTrace } from './core/timing-trace.js';
import { computeAllDomains } from './core/aggregate.js';

let currentContext = null;
let badgeUpdateQueue = Promise.resolve();

// ── SW 启动引导（幂等，覆盖 MV3 隐式重启场景）────────────────────────────────────

let bootstrapPromise = null;

async function bootstrapServiceWorker(reason) {
  try {
    await initSession();
    await recover();
    setupAlarms();
  } catch (err) {
    console.error(`[Bootstrap] failed (${reason}):`, err);
    bootstrapPromise = null;
    throw err;
  }
}

function ensureBootstrapped(reason) {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapServiceWorker(reason);
  }
  return bootstrapPromise;
}

// 模块级引导：SW 每次加载时立即执行（覆盖 onStartup/onInstalled 不触发的隐式重启）
ensureBootstrapped('module-load');

// ── SW 启动 → 先恢复 ──────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  await ensureBootstrapped('onStartup');
  await resetDailyLockedDomains(true);
  await initCloudSync(() => syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs));
});

// ── 安装/更新 ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureBootstrapped('onInstalled');
  await updateDeclarativeRules();

  if (details.reason === 'install') {
    const config = { ...DEFAULT_CONFIG };
    await saveConfig(config);
    await chrome.storage.local.set({ [SESSION_KEY]: { currentMode: 'study', lastActiveDate: null, studySession: { totalSeconds: 0 }, restSession: { totalSeconds: 0 } } });
    chrome.tabs.create({ url: chrome.runtime.getURL('bind.html?welcome=1') });
  } else if (details.reason === 'update') {
    const stored = await new Promise(resolve => {
      chrome.storage.local.get(['guardian_config', 'guardian_hash'], resolve);
    });

    if (stored['guardian_config']) {
      const existingConfig = stored['guardian_config'];
      const migratedConfig = {
        ...DEFAULT_CONFIG,
        ...existingConfig,
        version: DEFAULT_CONFIG.version,
        adminPasswordHash: existingConfig.adminPasswordHash || '',
        isInitialized: existingConfig.isInitialized || false,
        restConfig: existingConfig.restConfig || DEFAULT_CONFIG.restConfig,
        studyList: existingConfig.studyList || DEFAULT_CONFIG.studyList,
        compositeList: existingConfig.compositeList || DEFAULT_CONFIG.compositeList,
        unsafeList: existingConfig.unsafeList || DEFAULT_CONFIG.unsafeList,
        mode: existingConfig.mode || 'study',
        autoStudyConfig: existingConfig.autoStudyConfig || DEFAULT_CONFIG.autoStudyConfig,
        dailyOnlineQuota: existingConfig.dailyOnlineQuota ?? DEFAULT_CONFIG.dailyOnlineQuota,
        dailyStudyQuota: existingConfig.dailyStudyQuota ?? DEFAULT_CONFIG.dailyStudyQuota,
        dailyRestQuota: existingConfig.dailyRestQuota ?? DEFAULT_CONFIG.dailyRestQuota,
        dailyUndeterminedQuota: existingConfig.dailyUndeterminedQuota ?? DEFAULT_CONFIG.dailyUndeterminedQuota,
        weeklyRestQuota: existingConfig.weeklyRestQuota ?? DEFAULT_CONFIG.weeklyRestQuota,
        quotaBorrow: existingConfig.quotaBorrow ?? DEFAULT_CONFIG.quotaBorrow,
        classificationRules: existingConfig.classificationRules ?? [],
        quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false }
      };
      delete migratedConfig.tempWhitelist;
      delete migratedConfig.tempWhitelistConfig;
      delete migratedConfig.tempExemptions;

      await saveConfig(migratedConfig);
    }
  }

  await initCloudSync(() => syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs));
});

// ── 信号接入 → 上下文 → 状态 → 事件日志 ────────────────────────────────────────

async function processTimingSignal(rawEvent) {
  await ensureBootstrapped('signal');
  await emitTrace('signal_received', {
    source: 'signal',
    reason: rawEvent._reason || 'unknown',
    tabId: rawEvent.tabId ?? null,
    windowId: rawEvent.windowId ?? null,
    domain: rawEvent.domain ?? null,
    payload: { event: rawEvent },
  });

  currentContext = buildContext(currentContext, rawEvent);
  await emitTrace('snapshot_created', {
    source: 'context',
    reason: rawEvent._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain: currentContext?.domain ?? null,
    payload: {
      isFocused: currentContext?.isFocused,
      isIdle: currentContext?.isIdle,
      isAudible: currentContext?.isAudible,
      isPiP: currentContext?.isPiP,
      mediaSourceDomain: currentContext?.mediaSourceDomain,
    },
  });

  const state = resolveState(currentContext);
  const domain = (state === 'BACKGROUND_ACTIVE' || state === 'PIP_ACTIVE')
    ? (currentContext?.mediaSourceDomain || currentContext?.domain || null)
    : (currentContext?.domain || null);
  await emitTrace('state_resolved', {
    source: 'state',
    reason: rawEvent._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain,
    nextState: state,
    payload: { context: currentContext },
  });

  await emitTrace('transition_begin', {
    source: 'session',
    reason: rawEvent._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain,
    previousState: state,
    nextState: state,
    payload: { state, domain },
  });

  await transitionState(state, domain);
  scheduleCurrentTabBadgeUpdate();

  await emitTrace('transition_end', {
    source: 'session',
    reason: rawEvent._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain,
    previousState: state,
    nextState: state,
    payload: { state, domain },
  });

  return { state, domain, context: currentContext };
}

initSignal(processTimingSignal);

// ── Action badge: current active tab's today duration ─────────────────────────

function formatBadgeDuration(seconds) {
  const secs = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

async function getCurrentActiveDomain() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  const domain = extractDomain(tab?.url || '');
  return { tab, domain };
}

async function updateCurrentTabBadge() {
  if (!chrome.action?.setBadgeText) return;

  try {
    const { domain } = await getCurrentActiveDomain();
    if (!domain) {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'TimeOnChrome' });
      return;
    }

    const events = await getEvents();
    const stats = computeAllDomains(events, getDateKey());
    const session = await getTimingSession();
    let seconds = stats[domain] || 0;

    if (session?.state === 'ACTIVE' && session.domain === domain && session.startTime) {
      seconds += Math.max(0, Math.floor(getCappedElapsedMs(session, Date.now()) / 1000));
    }

    const text = formatBadgeDuration(seconds);
    await chrome.action.setBadgeBackgroundColor({ color: '#00b894' });
    await chrome.action.setBadgeText({ text });
    await chrome.action.setTitle({
      title: `TimeOnChrome\n${domain}\n今日 ${text}`,
    });
  } catch (err) {
    await chrome.action.setBadgeText({ text: '' }).catch(() => {});
    await chrome.action.setTitle({ title: 'TimeOnChrome' }).catch(() => {});
  }
}

function scheduleCurrentTabBadgeUpdate() {
  badgeUpdateQueue = badgeUpdateQueue
    .then(updateCurrentTabBadge, updateCurrentTabBadge)
    .catch(() => {});
}

const badgeTimer = setInterval(scheduleCurrentTabBadgeUpdate, 1000);
badgeTimer?.unref?.();
scheduleCurrentTabBadgeUpdate();

async function processDebugControlledTimingSignal(rawEvent = {}) {
  const { _debugNow, ...event } = rawEvent;
  const originalNow = Date.now;
  if (typeof _debugNow === 'number' && Number.isFinite(_debugNow)) {
    Date.now = () => _debugNow;
  }

  try {
    return await processTimingSignal({
      ...event,
      _reason: event._reason || 'controlledTimingSignal',
    });
  } finally {
    Date.now = originalNow;
  }
}

// ── Focus Ledger 双重校准（诊断用，不影响业务逻辑）──────────────────────────────

initFocusLedger(extractDomain);

// ── webNavigation → 拦截检查 ───────────────────────────────────────────────────

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const { url, tabId } = details;
  await checkAndRemind(tabId, url, getSyncState().monitoringEnabled);
});


chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await reevaluateTabById(activeInfo.tabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await reevaluateFocusedWindowActiveTab(windowId);
});

function isMonitoringEnabled() {
  return getSyncState().monitoringEnabled !== 0;
}


async function reevaluateTabById(tabId) {
  if (!tabId) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab?.url) return;

  let targetUrl = tab.url;
  if (tab.url.includes('reminder.html')) {
    try {
      const u = new URL(tab.url);
      const domain = u.searchParams.get('domain');
      if (!domain || domain === 'all') return;
      targetUrl = `https://${domain}`;
    } catch {
      return;
    }
  }

  const blocked = await checkAndRemind(tabId, targetUrl, getSyncState().monitoringEnabled);
  if (!blocked && targetUrl !== tab.url) {
    await chrome.tabs.update(tabId, { url: targetUrl }).catch(() => {});
  }
}

async function reevaluateFocusedWindowActiveTab(windowId) {
  if (!windowId || windowId === chrome.windows.WINDOW_ID_NONE) return;
  const tabs = await chrome.tabs.query({ active: true, windowId });
  const tab = tabs && tabs[0];
  if (!tab?.id) return;
  await reevaluateTabById(tab.id);
}

// ── Alarms ──────────────────────────────────────────────────────────────────────

function setupAlarms() {
  chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  chrome.alarms.create('quota_check', { periodInMinutes: 1 });
  chrome.alarms.create('daily_cleanup', { periodInMinutes: 60 });
  chrome.alarms.create('cloudSync', { periodInMinutes: 3 });
  chrome.alarms.create('cloudHeartbeat', { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'heartbeat') {
    if (!isMonitoringEnabled()) return;
    await heartbeat();
  } else if (alarm.name === 'quota_check') {
    if (!isMonitoringEnabled()) return;
    await checkAllTabsQuota(checkAndRemind, redirectAllTabs, redirectQuotaViolatingTabs, redirectLockedTabs);
  } else if (alarm.name === 'daily_cleanup') {
    await cleanOldStats();
    await cleanOldSessions();
    await resetDailyLockedDomains();
  } else if (alarm.name === 'cloudSync') {
    await syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs);
  } else if (alarm.name === 'cloudHeartbeat') {
    await sendHeartbeat();
  }
});

// ── 消息路由 ────────────────────────────────────────────────────────────────────

// Expose debug functions on globalThis for Playwright SW evaluate calls
// (dynamic import() is disallowed in ServiceWorkerGlobalScope)
globalThis.debugExportCalibration = async ({ targetDomain, expectedSeconds, thresholdSeconds, since }) => {
  try {
    const ledger = await getFocusLedger();
    const events = await getEvents();
    const sessionData = await chrome.storage.session.get('session_v1');
    const session = sessionData['session_v1'] || null;
    const report = exportCalibrationReport(
      ledger, events, session,
      thresholdSeconds || 10,
      since || 0,
      targetDomain || null,
      expectedSeconds || 0
    );
    return { success: true, ...report };
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
};

globalThis.debugResetFocusLedger = async () => {
  try {
    await resetFocusLedger();
    return { success: true, resetAt: Date.now() };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

globalThis.debugGetFocusLedger = async () => {
  try {
    const ledger = await getFocusLedger();
    return { success: true, ledger, count: ledger.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

globalThis.debugGetTimingTrace = async () => {
  try {
    const trace = await getTrace();
    return { success: true, trace, count: trace.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

globalThis.debugGetTodayStats = async () => {
  try {
    const stats = await handleMessage({ type: 'GET_STATS' }, { id: 'debug' });
    return { success: true, stats };
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
};

async function debugGetTimingCalibrationSnapshot() {
  const trace = await getTrace();
  const events = await getEvents();
  const sessionData = await chrome.storage.session.get('session_v1');
  const session = sessionData['session_v1'] || null;
  const ledger = await getFocusLedger();
  const stats = await handleMessage({ type: 'GET_STATS' }, { id: 'debug' });
  const statsRange = await getStatsRange(2);
  const profile = await chrome.storage.local.get(['guardian_config', 'guardian_session']);

  return {
    success: true,
    capturedAt: Date.now(),
    trace,
    traceCount: trace.length,
    eventLog: events,
    eventLogCount: events.length,
    session,
    stats,
    statsRange,
    focusLedger: ledger,
    focusLedgerCount: ledger.length,
    mode: profile['guardian_config']?.mode || null,
    currentMode: profile['guardian_session']?.currentMode || null,
  };
}

async function debugResetTimingCalibrationData() {
  await clearTrace();
  await resetFocusLedger();
  await clearEvents();
  await chrome.storage.session.set({
    session_v1: {
      state: null,
      domain: null,
      startTime: null,
      lastHeartbeat: Date.now(),
    },
  });
  await chrome.storage.local.set({
    session_v1_persistent: {
      state: null,
      domain: null,
      startTime: null,
      lastHeartbeat: Date.now(),
    },
  });

  const allLocal = await chrome.storage.local.get(null);
  const statsKeys = Object.keys(allLocal).filter(key =>
    key === 'event_log_last_compact' ||
    key.startsWith('stats_') ||
    key.startsWith('undetermined_stats_')
  );
  if (statsKeys.length > 0) {
    await chrome.storage.local.remove(statsKeys);
  }

  return { success: true, resetAt: Date.now(), clearedStatsKeys: statsKeys };
}

globalThis.debugExportTimingCalibration = async () => {
  try {
    return await debugGetTimingCalibrationSnapshot();
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
};

globalThis.debugResetTimingCalibration = async () => {
  try {
    return await debugResetTimingCalibrationData();
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
};

globalThis.debugSetRestMode = async () => {
  try {
    const session = await handleMessage({ type: 'SWITCH_TO_REST' }, { id: 'debug' });
    return { success: true, session };
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
};

globalThis.debugApplyControlledTimingSignal = async (rawEvent = {}) => {
  try {
    const result = await processDebugControlledTimingSignal(rawEvent);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
};

globalThis.debugClearTimingTrace = async () => {
  try {
    await clearTrace();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Debug/test-only message handlers (do not affect business logic)
  if (msg.type === 'DEBUG_EXPORT_CALIBRATION') {
    (async () => {
      try {
        const ledger = await getFocusLedger();
        const events = await getEvents();
        const sessionData = await chrome.storage.session.get('session_v1');
        const session = sessionData['session_v1'] || null;
        const report = exportCalibrationReport(
          ledger, events, session,
          msg.thresholdSeconds || 10,
          msg.since || 0,
          msg.targetDomain || null,
          msg.expectedSeconds || 0
        );
        sendResponse({ success: true, ...report });
      } catch (err) {
        sendResponse({ success: false, error: err.message, stack: err.stack });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_FOCUS_LEDGER_RESET') {
    (async () => {
      try {
        await resetFocusLedger();
        sendResponse({ success: true, resetAt: Date.now() });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_GET_FOCUS_LEDGER') {
    (async () => {
      try {
        const ledger = await getFocusLedger();
        sendResponse({ success: true, ledger, count: ledger.length });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_GET_TIMING_TRACE') {
    (async () => {
      try {
        const trace = await getTrace();
        sendResponse({ success: true, trace, count: trace.length });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_GET_TODAY_STATS') {
    (async () => {
      try {
        const stats = await handleMessage({ type: 'GET_STATS' }, sender);
        sendResponse({ success: true, stats });
      } catch (err) {
        sendResponse({ success: false, error: err.message, stack: err.stack });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_EXPORT_TIMING_CALIBRATION') {
    (async () => {
      try {
        sendResponse(await debugGetTimingCalibrationSnapshot());
      } catch (err) {
        sendResponse({ success: false, error: err.message, stack: err.stack });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_RESET_TIMING_CALIBRATION') {
    (async () => {
      try {
        sendResponse(await debugResetTimingCalibrationData());
      } catch (err) {
        sendResponse({ success: false, error: err.message, stack: err.stack });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_SET_REST_MODE') {
    (async () => {
      try {
        const session = await handleMessage({ type: 'SWITCH_TO_REST' }, sender);
        sendResponse({ success: true, session });
      } catch (err) {
        sendResponse({ success: false, error: err.message, stack: err.stack });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_APPLY_CONTROLLED_TIMING_SIGNAL') {
    (async () => {
      try {
        const result = await processDebugControlledTimingSignal(msg.event || {});
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message, stack: err.stack });
      }
    })();
    return true;
  }

  if (msg.type === 'DEBUG_CLEAR_TIMING_TRACE') {
    (async () => {
      try {
        await clearTrace();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  handleMessage(msg, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

// ── 自动切换学习模式 ────────────────────────────────────────────────────────────

let autoStudyDomain = null;
let autoStudyStartTime = null;

async function checkAutoStudy() {
  if (!isMonitoringEnabled()) return;

  const session = await chrome.storage.local.get(SESSION_KEY);
  const sess = session[SESSION_KEY];
  if (!sess || sess.currentMode !== 'rest') {
    autoStudyDomain = null;
    autoStudyStartTime = null;
    return;
  }

  const config = await getConfig();
  if (!config?.autoStudyConfig?.enabled) return;

  const activeTabDomain = currentContext?.domain;
  const isOnStudySite = activeTabDomain && (config.studyList || []).some(w => matchDomain(activeTabDomain, w));
  const isActive = currentContext?.isFocused && !currentContext?.isIdle;

  if (isOnStudySite && isActive) {
    if (autoStudyDomain !== activeTabDomain) {
      autoStudyDomain = activeTabDomain;
      autoStudyStartTime = Date.now();
    } else {
      const elapsed = Math.floor((Date.now() - autoStudyStartTime) / 1000);
      const required = config.autoStudyConfig.requiredSeconds || 60;
      if (elapsed >= required) {
        autoStudyDomain = null;
        autoStudyStartTime = null;
        config.mode = 'study';
        await saveConfig(config);
        await updateDeclarativeRules(config);
        sess.currentMode = 'study';
        await chrome.storage.local.set({ [SESSION_KEY]: sess });
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'TimeOnChrome',
          message: '检测到你在学习，已自动切换到学习模式 📚'
        });
      }
    }
  } else {
    autoStudyDomain = null;
    autoStudyStartTime = null;
  }
}

// Run auto study check every minute
setInterval(checkAutoStudy, 60000);
