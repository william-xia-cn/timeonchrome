// background-new.js — 完整 wiring 入口

import { initSignal } from './core/signal.js';
import { dispatchTimingSignal, drainPendingModeBoundaries } from './core/timing-dispatcher.js';
import { confirmForegroundPageCheckpoint, resolveUnknownDomainForSettlement } from './core/foreground-timing.js';
import { closeMediaForTabLifecycle, handleMediaTabActivated, handleMediaTabReplaced, handleMediaWindowStateChanged, runMediaCheckpoint } from './core/media-timing.js';
import { runForegroundCheckpoint, runTimingCheckpoints } from './core/checkpoint-scheduler.js';
import { closeCurrentSession, initSession, getSession as getTimingSession } from './runtime/session.js';
import { recover } from './runtime/recovery.js';
import { getCappedElapsedMs } from './runtime/time-boundary.js';
import { getConfig, saveConfig, resetDailyLockedDomains, cleanOldStats, cleanOldSessions, DEFAULT_CONFIG, CONFIG_KEY, VISIT_SESSIONS_KEY, MIN_SESSION_DURATION, SESSION_KEY, LAST_RESET_DATE_KEY, SITE_CLASSIFICATION_REQUESTS_KEY, getDateKey, formatDate, extractDomain, getStatsRange, clearTemporaryCompositeDomainByTab, clearTemporaryCompositeDomainByTabDomainMismatch } from './infra/storage.js';
import { updateDeclarativeRules, reSendPendingNoticeDetailed, deliverPendingNoticeForFocusedTab, setModeBoundaryDrainHook, markContentScriptReady, clearModeNoticeTabState, clearModeNoticeTabNavigationState } from './product/interceptor.js';
import { handleModeEvent } from './product/mode-service.js';
import { executeModeDecision, recordModeEffectTrace } from './product/mode-effects.js';
import { hydrateCloudSyncStateFromStorage, initCloudSync, syncNow, sendHeartbeat, getSyncState } from './infra/cloud-sync.js';
import { handleMessage } from './message-router.js';
import { initFocusLedger, getFocusLedger, resetFocusLedger, exportCalibrationReport } from './debug/focus-ledger.js';
import { getEvents, clearEvents } from './core/event-log.js';
import { emitTrace, getTrace, clearTrace } from './core/timing-trace.js';
import { computeAllDomains } from './core/aggregate.js';
import { logClientEventBestEffort, logFallbackEventBestEffort } from './infra/client-logs.js';
import { resolveManagedTargetAttribution } from './core/managed-targets.js';
import { runClassificationSyncEffects } from './core/classification-effective-boundary.js';

let badgeUpdateQueue = Promise.resolve();
let lastActiveTabId = null;
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};

// ── SW 模块引导（幂等）：只保证基础状态与 alarms/listeners 可用，recovery 由 lifecycle 事件触发 ──

let bootstrapPromise = null;
let alarmsSetup = false;

async function bootstrapServiceWorker(reason) {
  try {
    await initSession();
    await hydrateCloudSyncStateFromStorage();
    setupAlarms();
    scheduleModeBoundaryDrain(`bootstrap:${reason}`);
  } catch (err) {
    console.error(`[Bootstrap] failed (${reason}):`, err);
    logClientEventBestEffort({
      level: 'error',
      category: 'runtime',
      eventCode: 'background_bootstrap_failed',
      module: 'background',
      message: err?.message || 'background bootstrap failed',
      details: { reason },
    });
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

function scheduleModeBoundaryDrain(reason = 'scheduled') {
  Promise.resolve()
    .then(() => drainPendingModeBoundaries({
      emitTrace,
      warn: (...args) => console.warn(...args),
      reason,
    }))
    .catch((err) => {
      console.warn('[ModeBoundary] drain failed:', err?.message || err);
      recordFallbackLog({
        level: 'error',
        category: 'runtime',
        eventCode: 'mode_boundary_drain_failed',
        module: 'background',
        reason: 'mode_boundary_drain_failed',
        message: err?.message || 'Mode boundary drain failed',
        details: { reason, error: err?.message || String(err) },
      });
    });
}

async function runPostClassificationSyncEffects({ source = 'cloud_sync' } = {}) {
  return runClassificationSyncEffects({
    source,
    recheckActiveTab: async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
      const tab = tabs && tabs[0] ? tabs[0] : null;
      if (!tab?.id) return { ok: true, rechecked: false, reason: 'no_active_tab' };
      await reevaluateTabById(tab.id, { source: `${source}_recheck` });
      return { ok: true, rechecked: true, tabId: tab.id };
    },
  });
}

function syncNowWithRuntimeEffects(options = {}, source = 'cloud_sync') {
  return syncNow(getConfig, saveConfig, updateDeclarativeRules, {
    ...(options || {}),
    afterClassificationSync: (payload = {}) => runPostClassificationSyncEffects({
      source: payload.source || source,
    }),
  });
}

setModeBoundaryDrainHook((reason = 'modeTransition') => drainPendingModeBoundaries({
  emitTrace,
  warn: (...args) => console.warn(...args),
  reason,
}));

async function dispatchModeEvent(event = {}, options = {}) {
  const decision = await handleModeEvent({
    ...event,
    monitoringEnabled: event.monitoringEnabled ?? getSyncState().monitoringEnabled,
  });
  const result = await executeModeDecision(decision, {
    tabId: event.tabId,
    domain: decision.domain || event.domain || extractDomain(event.url || ''),
    updateDeclarativeRules,
    event,
    drainModeBoundary: (reason = 'modeEvent') => drainPendingModeBoundaries({
      emitTrace,
      warn: (...args) => console.warn(...args),
      reason,
    }),
  });
  if (decision.recheckActiveTab && options.recheck !== false) {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    const tab = tabs && tabs[0] ? tabs[0] : null;
    if (tab?.id) {
      await reevaluateTabById(tab.id, { source: 'mode_event_recheck' }).catch((err) => {
        recordFallbackLog({
          level: 'warning',
          category: 'access',
          eventCode: 'active_tab_recheck_failed',
          module: 'background',
          reason: 'mode_event_recheck_failed',
          message: err?.message || 'Active tab recheck failed after mode event',
          domain: decision.domain || event.domain || extractDomain(event.url || ''),
          details: { tabId: tab.id, source: 'mode_event_recheck', error: err?.message || String(err) },
        });
      });
    }
  }
  return result;
}

// 模块级引导：普通 MV3 SW 唤醒只做 runtime wiring，不代表异常恢复边界。
ensureBootstrapped('module-load');

// ── Chrome 启动 lifecycle boundary → 恢复残存 open session ─────────────────────

chrome.runtime.onStartup.addListener(async () => {
  await ensureBootstrapped('onStartup');
  await recover();
  await resetDailyLockedDomains(true);
  await initCloudSync(() => syncNowWithRuntimeEffects({}, 'onStartup_cloud_sync'));
});

// ── 安装/更新 ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // 1. 安装路径：优先执行绑定流程，不受 bootstrap 失败影响
  if (details.reason === 'install') {
    const config = { ...DEFAULT_CONFIG };
    try {
      await saveConfig(config);
      await chrome.storage.local.set({ [SESSION_KEY]: { currentMode: 'study', lastActiveDate: null, studySession: { totalSeconds: 0 }, restSession: { totalSeconds: 0 } } });
    } catch (err) {
      console.error('[onInstalled] Failed to save initial config:', err);
    }
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('bind.html?welcome=1') });
    } catch (err) {
      console.error('[onInstalled] Failed to open bind page:', err);
    }
  }

  // 2. Bootstrap + 规则更新：失败不阻断安装流程
  try {
    await ensureBootstrapped('onInstalled');
    await recover();
    await updateDeclarativeRules();
  } catch (err) {
    console.error('[onInstalled] Bootstrap/rules failed:', err);
  }

  // 3. 更新路径：配置迁移（仅 update）
  if (details.reason === 'update') {
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
        dailyOnlineQuota: existingConfig.dailyOnlineQuota ?? DEFAULT_CONFIG.dailyOnlineQuota,
        dailyStudyQuota: existingConfig.dailyStudyQuota ?? DEFAULT_CONFIG.dailyStudyQuota,
        dailyRestQuota: existingConfig.dailyRestQuota ?? DEFAULT_CONFIG.dailyRestQuota,
        dailyUndeterminedQuota: existingConfig.dailyUndeterminedQuota ?? DEFAULT_CONFIG.dailyUndeterminedQuota,
        weeklyRestQuota: existingConfig.weeklyRestQuota ?? DEFAULT_CONFIG.weeklyRestQuota,
        timeQuota: existingConfig.timeQuota ?? DEFAULT_CONFIG.timeQuota,
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

  // 4. 云同步初始化
  try {
    await initCloudSync(() => syncNowWithRuntimeEffects({}, 'onInstalled_cloud_sync'));
  } catch (err) {
    console.error('[onInstalled] initCloudSync failed:', err);
  }
});

// ── 信号接入：background 只负责 wiring，业务分发由 dispatcher 完成 ─────────────

initSignal((rawEvent) => dispatchTimingSignal(rawEvent, {
  ensureBootstrapped,
  scheduleBadgeUpdate: scheduleCurrentTabBadgeUpdate,
}));

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

function normalizeMode(mode) {
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  if (mode === 'study' || mode === 'composite' || mode === 'rest' || mode === 'locked' || mode === 'paused') return mode;
  return 'study';
}

function normalizeDomainForFastStatus(domain) {
  if (typeof domain !== 'string') return null;
  const value = domain.trim().toLowerCase().replace(/^www\./, '').replace(/\.+$/g, '');
  return value || null;
}

function modeToActionIconPath(mode) {
  const normalized = mode === 'composite' || mode === 'rest' || mode === 'study'
    ? mode
    : 'locked';
  return {
    16: `icons/action-${normalized}16.png`,
    32: `icons/action-${normalized}32.png`,
    48: `icons/action-${normalized}48.png`,
  };
}

function modeToBadgeText(mode) {
  if (mode === 'paused') return '停';
  if (mode === 'locked') return '锁';
  if (mode === 'composite') return '综';
  if (mode === 'rest') return '休';
  return '学';
}

function modeToBadgeColor(mode) {
  if (mode === 'paused') return '#e2e8f0';
  if (mode === 'locked') return '#fecaca';
  if (mode === 'composite') return '#d8d2ff';
  if (mode === 'rest') return '#fde7b3';
  return '#b8f3df';
}

function modeToLabel(mode) {
  if (mode === 'paused') return '暂停';
  if (mode === 'locked') return '锁定';
  if (mode === 'composite') return '综合';
  if (mode === 'rest') return '休息';
  return '学习';
}

function normalizeActiveTabHint(tabHint = null) {
  if (!tabHint || typeof tabHint !== 'object') return null;
  const tabId = Number(tabHint.tabId ?? tabHint.id);
  const windowId = Number(tabHint.windowId);
  const lastAccessed = Number(tabHint.lastAccessed);
  const url = typeof tabHint.url === 'string' ? tabHint.url : '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch (_) {
    return null;
  }
  const domain = extractDomain(url);
  if (!domain) return null;
  return {
    tab: {
      id: Number.isInteger(tabId) ? tabId : null,
      windowId: Number.isInteger(windowId) ? windowId : null,
      url,
      lastAccessed: Number.isFinite(lastAccessed) && lastAccessed > 0 ? lastAccessed : null,
    },
    domain,
  };
}

async function getCurrentActiveDomain(tabHint = null) {
  const hinted = normalizeActiveTabHint(tabHint);
  if (hinted) return hinted;
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  const domain = extractDomain(tab?.url || '');
  return { tab, domain };
}

function resolvePopupLiveSessionSeconds(timingSession, domain, tab = null) {
  const activeDomain = normalizeDomainForFastStatus(domain);
  if (timingSession?.state === 'ACTIVE' && timingSession?.startTime) {
    const sessionDomain = normalizeDomainForFastStatus(timingSession.domain);
    if (!activeDomain || !sessionDomain || activeDomain === sessionDomain) {
      return Math.max(0, Math.floor(getCappedElapsedMs(timingSession, Date.now()) / 1000));
    }
  }

  const lastAccessed = Number(tab?.lastAccessed);
  if (!activeDomain || !Number.isFinite(lastAccessed) || lastAccessed <= 0) return 0;
  return Math.max(0, Math.floor((Date.now() - lastAccessed) / 1000));
}

async function getPopupFastStatus(tabHint = null) {
  const [{ tab, domain }, timingSession, modeData] = await Promise.all([
    getCurrentActiveDomain(tabHint).catch(() => ({ tab: null, domain: null })),
    getTimingSession().catch(() => null),
    chrome.storage.local.get(SESSION_KEY).catch(() => ({})),
  ]);
  const mode = normalizeMode(modeData?.[SESSION_KEY]?.currentMode || 'study');
  const currentSessionDurationSeconds = resolvePopupLiveSessionSeconds(timingSession, domain, tab);
  return {
    mode,
    currentDomain: domain || null,
    currentSessionDurationSeconds,
    tabId: Number.isInteger(tab?.id) ? tab.id : null,
    url: tab?.url || null,
  };
}

function addPopupModeSeconds(target, source = {}) {
  target.studySeconds += Math.max(0, Number(source.study) || 0);
  target.restSeconds += Math.max(0, Number(source.rest) || 0);
  target.compositeSeconds += Math.max(0, Number(source.composite) || 0);
}

function buildPopupSettledModeStatsFromDay(dayStats) {
  const summary = {
    studySeconds: 0,
    restSeconds: 0,
    compositeSeconds: 0,
    onlineSeconds: 0,
    backgroundMediaSeconds: 0,
    pipSeconds: 0,
  };
  if (dayStats?.targets && typeof dayStats.targets === 'object') {
    for (const ts of Object.values(dayStats.targets)) {
      if (!ts) continue;
      const quota = ts.activeByQuotaBucket || {};
      summary.studySeconds += Math.max(0, Number(quota.study) || 0);
      summary.restSeconds += Math.max(0, Number(quota.rest) || 0);
      summary.compositeSeconds += Math.max(0, Number(quota.composite) || 0);
      summary.onlineSeconds += Math.max(0, Number(ts.activeSeconds) || 0) + Math.max(0, Number(ts.pipSeconds) || 0);
      summary.backgroundMediaSeconds += Math.max(0, Number(ts.backgroundMediaSeconds) || 0);
      summary.pipSeconds += Math.max(0, Number(ts.pipSeconds) || 0);
    }
    return summary;
  }
  if (!dayStats?.domains) return summary;
  for (const ds of Object.values(dayStats.domains)) {
    if (!ds) continue;
    addPopupModeSeconds(summary, ds.activeByMode || {});
    summary.onlineSeconds += Math.max(0, Number(ds.activeSeconds) || 0) + Math.max(0, Number(ds.pipSeconds) || 0);
    summary.backgroundMediaSeconds += Math.max(0, Number(ds.backgroundMediaSeconds) || 0);
    summary.pipSeconds += Math.max(0, Number(ds.pipSeconds) || 0);
  }
  return summary;
}

function pickPopupConfig(rawConfig, siteClassificationRequests = []) {
  const config = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };
  return {
    studyList: config.studyList || DEFAULT_CONFIG.studyList,
    compositeList: config.compositeList || DEFAULT_CONFIG.compositeList,
    restrictedEntertainmentList: config.restrictedEntertainmentList || DEFAULT_CONFIG.restrictedEntertainmentList,
    entertainmentList: config.entertainmentList || DEFAULT_CONFIG.entertainmentList,
    unsafeList: config.unsafeList || DEFAULT_CONFIG.unsafeList,
    siteClassificationRulesV1: Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [],
    managedTargetsV1: Array.isArray(config.managedTargetsV1) ? config.managedTargetsV1 : [],
    siteClassificationRequestsV1: Array.isArray(siteClassificationRequests) ? siteClassificationRequests : [],
    dailyOnlineQuota: config.dailyOnlineQuota ?? DEFAULT_CONFIG.dailyOnlineQuota,
    dailyStudyQuota: config.dailyStudyQuota ?? DEFAULT_CONFIG.dailyStudyQuota,
    dailyRestQuota: config.dailyRestQuota ?? DEFAULT_CONFIG.dailyRestQuota,
    dailyUndeterminedQuota: config.dailyUndeterminedQuota ?? DEFAULT_CONFIG.dailyUndeterminedQuota,
    weeklyRestQuota: config.weeklyRestQuota ?? DEFAULT_CONFIG.weeklyRestQuota,
    timeQuota: config.timeQuota ?? DEFAULT_CONFIG.timeQuota,
    quotaBorrow: config.quotaBorrow ?? DEFAULT_CONFIG.quotaBorrow,
    quotaState: config.quotaState || DEFAULT_CONFIG.quotaState,
  };
}

function buildPopupCloudStatus(storage = {}) {
  const isBound = !!storage.cloud_device_token;
  return {
    isBound,
    localMode: !isBound,
    syncEnabled: isBound,
    reason: isBound ? null : 'no_device_token',
    deviceId: storage.cloud_device_id || null,
    profileId: storage.cloud_profile_id || null,
    v1SyncEnabled: storage.statsFoundationV1SyncEnabled ?? true,
  };
}

async function getPopupLocalSnapshot(tabHint = null) {
  const startedAt = Date.now();
  const timings = {};
  const mark = (key, from) => { timings[key] = Date.now() - from; };
  const activeStartedAt = Date.now();
  const activePromise = getCurrentActiveDomain(tabHint)
    .catch(() => ({ tab: null, domain: null }))
    .then((value) => {
      mark('activeTabMs', activeStartedAt);
      return value;
    });
  const sessionStartedAt = Date.now();
  const timingSessionPromise = getTimingSession()
    .catch(() => null)
    .then((value) => {
      mark('sessionMs', sessionStartedAt);
      return value;
    });
  const storageStartedAt = Date.now();
  const storagePromise = chrome.storage.local.get([
    CONFIG_KEY,
    SESSION_KEY,
    'daily_usage_stats_v1',
    SITE_CLASSIFICATION_REQUESTS_KEY,
    'cloud_profile_name',
    'cloud_device_token',
    'cloud_device_id',
    'cloud_profile_id',
    'statsFoundationV1SyncEnabled',
  ]).catch(() => ({})).then((value) => {
    mark('storageMs', storageStartedAt);
    return value;
  });

  const [{ tab, domain }, timingSession, storage] = await Promise.all([
    activePromise,
    timingSessionPromise,
    storagePromise,
  ]);
  const mode = normalizeMode(storage?.[SESSION_KEY]?.currentMode || 'study');
  const currentSessionDurationSeconds = resolvePopupLiveSessionSeconds(timingSession, domain, tab);
  const todayStats = storage?.daily_usage_stats_v1?.[getDateKey()] || null;
  const popupConfig = pickPopupConfig(storage?.[CONFIG_KEY], storage?.[SITE_CLASSIFICATION_REQUESTS_KEY]);
  const currentTarget = resolveManagedTargetAttribution(
    popupConfig,
    popupConfig.siteClassificationRequestsV1,
    tab?.url || domain || ''
  );
  const snapshot = {
    ok: true,
    mode,
    currentDomain: domain || null,
    currentSessionDurationSeconds,
    tabId: Number.isInteger(tab?.id) ? tab.id : null,
    url: tab?.url || null,
    currentManagedTarget: currentTarget?.fallback ? null : currentTarget,
    config: popupConfig,
    stats: buildPopupSettledModeStatsFromDay(todayStats),
    cloudStatus: buildPopupCloudStatus(storage || {}),
    childName: storage?.cloud_profile_name || null,
    timings,
  };
  const totalMs = Date.now() - startedAt;
  snapshot.timings.totalMs = totalMs;
  if (totalMs > 300) {
    console.warn('[PopupSnapshot] slow local snapshot', snapshot.timings);
    logClientEventBestEffort({
      level: 'warning',
      category: 'popup',
      eventCode: 'popup_local_snapshot_slow',
      module: 'background',
      message: 'Popup local snapshot exceeded target latency',
      details: snapshot.timings,
    });
  }
  return snapshot;
}

async function updateCurrentTabBadge() {
  if (!chrome.action?.setBadgeText) return;

  try {
    const monitoringEnabled = getSyncState().monitoringEnabled;
    const rawSession = await chrome.storage.local.get(SESSION_KEY);
    const runtimeMode = monitoringEnabled === 0
      ? 'paused'
      : normalizeMode(rawSession?.[SESSION_KEY]?.currentMode || 'study');

    const { domain } = await getCurrentActiveDomain();
    await chrome.action.setIcon?.({ path: modeToActionIconPath(runtimeMode) }).catch(() => {});
    const modeText = modeToBadgeText(runtimeMode);
    await chrome.action.setBadgeText({ text: modeText });
    await chrome.action.setBadgeBackgroundColor({ color: modeToBadgeColor(runtimeMode) });

    if (!domain) {
      await chrome.action.setTitle({ title: `TimeOnChrome\n模式 ${modeToLabel(runtimeMode)}` });
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
    await chrome.action.setTitle({
      title: `TimeOnChrome\n模式 ${modeToLabel(runtimeMode)}\n${domain}\n今日 ${text}`,
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
    const controlledEvent = {
      ...event,
      ...(event.url == null && typeof event.domain === 'string' && event.domain.trim()
        ? { url: `https://${event.domain.trim().replace(/\.+$/g, '')}/` }
        : {}),
      _reason: event._reason || 'controlledTimingSignal',
    };
    return await dispatchTimingSignal({
      ...controlledEvent,
    }, {
      ensureBootstrapped,
      scheduleBadgeUpdate: scheduleCurrentTabBadgeUpdate,
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
  let tab = null;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {}
  const foreground = await isForegroundTab(tab);
  await dispatchModeEvent({
    type: 'ACCESS_OBSERVED',
    source: 'webNavigationCommitted',
    tabId,
    url: url || tab?.url || '',
    incognito: tab?.incognito === true,
    foreground,
  }, { recheck: false });
  scheduleModeBoundaryDrain('webNavigationCommitted');
});

chrome.webNavigation.onHistoryStateUpdated?.addListener?.(async (details) => {
  if (details.frameId !== 0) return;
  const { url, tabId } = details;
  if (!url || url.includes('reminder.html')) return;
  let tab = null;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {}
  if (!tab?.active) return;
  const foreground = await isForegroundTab(tab);
  await dispatchModeEvent({
    type: 'ACCESS_OBSERVED',
    source: 'webNavigationHistoryStateUpdated',
    tabId,
    url: url || tab?.url || '',
    incognito: tab?.incognito === true,
    foreground,
  }, { recheck: false });
  scheduleModeBoundaryDrain('webNavigationHistoryStateUpdated');
});


chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const previousTabId = Number.isInteger(lastActiveTabId) ? lastActiveTabId : null;
  lastActiveTabId = activeInfo.tabId;
  await handleMediaTabActivated(previousTabId, activeInfo.tabId).catch(() => {});
  await reevaluateTabById(activeInfo.tabId, { source: 'tabActivated' });
  await deliverPendingModeNoticeForTabWithDelayedRetry(activeInfo.tabId, 'tabActivated');
});

chrome.tabs.onReplaced?.addListener?.(async (addedTabId, removedTabId) => {
  clearModeNoticeTabState(removedTabId, 'tab_replaced');
  clearModeNoticeTabState(addedTabId, 'tab_replaced');
  await handleMediaTabReplaced(addedTabId, removedTabId).catch(() => {});
  if (Number.isInteger(lastActiveTabId) && lastActiveTabId === removedTabId) {
    lastActiveTabId = addedTabId;
    await reevaluateTabById(addedTabId, { source: 'tabReplaced' });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  clearModeNoticeTabState(tabId, 'tab_removed');
  await clearTemporaryCompositeDomainByTab(tabId);
  await closeMediaForTabLifecycle(tabId, 'tab_close').catch(() => {});
  // 如果被关闭的标签页是当前跟踪的活跃标签页，结算当前的 timing session
  if (Number.isInteger(lastActiveTabId) && lastActiveTabId === tabId) {
    try {
      await closeCurrentSession('tab_close', { resolveUnknownDomainForSettlement });
    } catch (_) { /* 尽力而为 */ }
    lastActiveTabId = null;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (Object.prototype.hasOwnProperty.call(changeInfo, 'url') || changeInfo.status === 'loading') {
    await closeMediaForTabLifecycle(tabId, 'navigation').catch(() => {});
  }
  const hasUrlChange = Object.prototype.hasOwnProperty.call(changeInfo, 'url');
  const hasUrlFact = hasUrlChange || changeInfo.status === 'complete';
  if (hasUrlChange) {
    const domain = extractDomain(changeInfo.url || tab?.url || '');
    clearModeNoticeTabNavigationState(tabId, domain);
    await clearTemporaryCompositeDomainByTabDomainMismatch(tabId, domain);
  }
  if (hasUrlFact && tab?.active) {
    await reevaluateTabById(tabId, {
      source: hasUrlChange ? 'tabUpdatedUrl' : 'tabUpdatedComplete',
    });
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  await reevaluateFocusedWindowActiveTab(windowId);
});

chrome.windows.onBoundsChanged?.addListener?.(async (win) => {
  await handleMediaWindowStateChanged(win?.id, win?.state || null).catch(() => {});
});

function isMonitoringEnabled() {
  return getSyncState().monitoringEnabled !== 0;
}


async function isForegroundTab(tab) {
  if (!tab?.active) return false;
  try {
    const win = await chrome.windows.get(tab.windowId);
    return win?.focused === true && win?.state !== 'minimized';
  } catch {
    return tab.active === true;
  }
}

async function reevaluateTabById(tabId, options = {}) {
  if (!tabId) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab?.url) return;

  // Avoid periodic self-redirect loops while user is interacting with reminder UI.
  if (tab.url.includes('reminder.html')) {
    return;
  }

  let targetUrl = tab.url;

  const foreground = await isForegroundTab(tab);
  const result = await dispatchModeEvent({
    type: 'ACCESS_OBSERVED',
    source: options.source || 'tabReevaluate',
    tabId,
    url: targetUrl,
    incognito: tab?.incognito === true,
    foreground,
  }, { recheck: false });
  scheduleModeBoundaryDrain('reevaluateTab');
  if (!result.blocked && targetUrl !== tab.url) {
    await chrome.tabs.update(tabId, { url: targetUrl }).catch(() => {});
  }
}

async function reevaluateFocusedWindowActiveTab(windowId) {
  if (!windowId || windowId === chrome.windows.WINDOW_ID_NONE) return;
  const tabs = await chrome.tabs.query({ active: true, windowId });
  const tab = tabs && tabs[0];
  if (!tab?.id) return;
  lastActiveTabId = tab.id;
  await reevaluateTabById(tab.id, { source: 'windowFocusChanged' });
  await deliverPendingModeNoticeForTabWithDelayedRetry(tab.id, 'windowFocusChanged');
}

async function deliverPendingModeNoticeForTabWithDelayedRetry(tabId, source) {
  await deliverPendingModeNoticeForTab(tabId, source);
  setTimeout(() => {
    deliverPendingModeNoticeForTab(tabId, `${source}_delayed`).catch(() => {});
  }, 250);
}

async function deliverPendingModeNoticeForTab(tabId, source) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  let delivery = null;
  try {
    delivery = await deliverPendingNoticeForFocusedTab(tabId, source);
  } catch (err) {
    delivery = {
      ok: false,
      error: err?.message || String(err),
      tabId,
      source,
    };
  }
  if (!delivery || delivery.error === 'pending_notice_missing') return;
  if (delivery.attempted !== true && delivery.sent !== true && !delivery.ack && delivery.deferred !== true && !delivery.error) return;
  await recordModeEffectTrace({
    event: {
      type: 'PENDING_NOTICE_DELIVERY',
      source,
      tabId,
      domain: delivery.domain || null,
      foreground: true,
    },
    domain: delivery.domain || null,
    decision: {
      ok: true,
      access: 'allow',
      notice: delivery?.payload || null,
    },
    result: {
      ok: delivery.ok === true,
      noticeAttempted: delivery.attempted === true,
      noticeTargetTabId: tabId,
      noticeSent: delivery.sent === true,
      noticeAck: delivery.ack ?? null,
      noticeRendered: delivery.rendered === true,
      noticeVisible: delivery.visible === true,
      noticeError: delivery.ok === true || delivery.deferred === true ? null : (delivery.error || 'pending_notice_delivery_failed'),
      noticeDelivery: delivery || null,
    },
  });
}

// ── Alarms ──────────────────────────────────────────────────────────────────────

function setupAlarms() {
  if (alarmsSetup) return;
  alarmsSetup = true;
  chrome.alarms.create('periodicCheckpoint', { periodInMinutes: 3 });
  chrome.alarms.create('quota_check', { periodInMinutes: 1 });
  chrome.alarms.create('daily_cleanup', { periodInMinutes: 60 });
  chrome.alarms.create('cloudSync', { periodInMinutes: 3 });
  chrome.alarms.create('cloudHeartbeat', { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodicCheckpoint') {
    if (!isMonitoringEnabled()) return;
    await drainPendingModeBoundaries({
      emitTrace,
      warn: (...args) => console.warn(...args),
      reason: 'periodicCheckpoint',
    });
    await runTimingCheckpoints({
      isMonitoringEnabled,
      confirmForegroundPage: confirmForegroundPageCheckpoint,
      resolveUnknownDomainForSettlement,
      emitTrace,
      warn: (...args) => console.warn(...args),
    });
  } else if (alarm.name === 'quota_check') {
    if (!isMonitoringEnabled()) return;
    const result = await handleMessage({
      type: 'EVALUATE_QUOTA_STATE',
      source: 'quota_alarm',
    }, { id: chrome.runtime.id });
    if (result?.modeChange?.changed) {
      scheduleModeBoundaryDrain('quotaCheckModeSwitch');
    }
  } else if (alarm.name === 'daily_cleanup') {
    await cleanOldStats();
    await cleanOldSessions();
    await resetDailyLockedDomains();
    const result = await handleMessage({
      type: 'EVALUATE_QUOTA_STATE',
      source: 'daily_cleanup',
    }, { id: chrome.runtime.id });
    if (result?.modeChange?.changed) {
      scheduleModeBoundaryDrain('dailyCleanupModeSwitch');
    }
  } else if (alarm.name === 'cloudSync') {
    const wasEnabled = isMonitoringEnabled();
    await syncNowWithRuntimeEffects({}, 'cloudSync_alarm');
    // 监控被远程关闭时，结算当前的 timing session
    if (wasEnabled && !isMonitoringEnabled()) {
      try {
        await closeCurrentSession('monitoring_off', { resolveUnknownDomainForSettlement });
      } catch (_) { /* 尽力而为 */ }
    }
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
    scheduleModeBoundaryDrain('debugSetRestModeGlobal');
    return { success: true, session };
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
};

globalThis.debugSendModeSwitchMessage = async (msg = {}) => {
  try {
    const type = msg?.type;
    if (!['SWITCH_TO_STUDY', 'SWITCH_TO_REST', 'SWITCH_TO_COMPOSITE'].includes(type)) {
      return { success: false, error: 'unsupported_mode_switch_type' };
    }
    const response = await handleMessage({
      type,
      noticeTabId: msg?.noticeTabId ?? null,
    }, {
      id: chrome.runtime.id,
      url: chrome.runtime.getURL('debug-mode-switch'),
    });
    scheduleModeBoundaryDrain('debugSendModeSwitchMessage');
    return { success: true, response };
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

globalThis.debugRunPeriodicCheckpoint = async (now = Date.now()) => {
  try {
    return await runForegroundCheckpoint(now, { confirmForegroundPage: async () => ({ ok: true, reason: 'debug_confirmed' }) });
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
};

globalThis.debugRunMediaPeriodicCheckpoint = async (now = Date.now()) => {
  try {
    return await runMediaCheckpoint(now);
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
};

globalThis.debugTriggerAutoTransition = async (options = {}) => {
  try {
    let tab = null;
    if (Number.isInteger(options.tabId) && options.tabId > 0) {
      try {
        tab = await chrome.tabs.get(options.tabId);
      } catch {
        tab = null;
      }
    }
    if (!tab?.id || !tab?.url) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = tabs && tabs[0];
    }
    if (!tab?.id || !tab?.url) {
      return { success: false, error: 'no_target_tab' };
    }
    const startMs = Number(options.nowStartMs ?? 0);
    const endMs = Number(options.nowEndMs ?? 0);
    const startResult = await dispatchModeEvent({
      type: 'ACCESS_OBSERVED',
      source: 'debug_auto_transition_start',
      tabId: tab.id,
      url: tab.url,
      incognito: tab?.incognito === true,
      nowMs: startMs,
      foreground: true,
    }, { recheck: false });
    const endResult = await dispatchModeEvent({
      type: 'ACCESS_OBSERVED',
      source: 'debug_auto_transition_end',
      tabId: tab.id,
      url: tab.url,
      incognito: tab?.incognito === true,
      nowMs: endMs,
      foreground: true,
    }, { recheck: false });
    const sessionData = await chrome.storage.local.get(SESSION_KEY);
    return {
      success: true,
      blockedStart: startResult.blocked,
      blockedEnd: endResult.blocked,
      mode: sessionData?.[SESSION_KEY]?.currentMode || null,
      tabId: tab.id,
      tabUrl: tab.url,
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const isInternalTestSender = () => {
    if (sender?.id !== chrome.runtime.id) return false;
    if (!sender?.url) return true;
    return sender.url.startsWith(chrome.runtime.getURL(''));
  };

  // Content script ready: re-send any pending auto-mode notice for this tab.
  // This handles the case where the background sent AUTO_MODE_PENDING_SUCCESS
  // before the content script's listener was registered (e.g., after page reload).
  if (msg.type === 'CONTENT_SCRIPT_READY') {
    const tabId = sender?.tab?.id;
    const frameId = Number.isInteger(sender?.frameId) ? sender.frameId : null;
    if (frameId !== null && frameId !== 0) {
      sendResponse({ ok: true, skipped: true, reason: 'non_top_frame' });
      return true;
    }
    if (Number.isInteger(tabId) && tabId > 0) {
      (async () => {
        const currentDomain = extractDomain(sender?.tab?.url || '');
        markContentScriptReady(tabId, currentDomain);
        const delivery = await reSendPendingNoticeDetailed(tabId, currentDomain);
        if (delivery?.attempted === true || delivery?.sent === true || delivery?.ack || delivery?.deferred === true) {
          await recordModeEffectTrace({
            event: {
              type: 'CONTENT_SCRIPT_READY',
              source: 'content_script_ready',
              tabId,
              domain: currentDomain || null,
              frameId: frameId ?? 0,
              hasPending: !!delivery?.payload,
              readyReason: typeof msg.readyReason === 'string' ? msg.readyReason : null,
              foreground: sender?.tab?.active === true,
            },
            domain: currentDomain || null,
            decision: {
              ok: true,
              access: 'allow',
              notice: delivery?.payload || null,
            },
            result: {
              ok: delivery?.ok === true,
              noticeAttempted: delivery?.attempted === true,
              noticeTargetTabId: tabId,
              noticeSent: delivery?.sent === true,
              noticeAck: delivery?.ack ?? null,
              noticeRendered: delivery?.rendered === true,
              noticeVisible: delivery?.visible === true,
              noticeError: delivery?.ok === true || delivery?.deferred === true ? null : (delivery?.error || 'pending_notice_resend_failed'),
              noticeDelivery: delivery || null,
            },
          });
        }
      })();
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'GET_POPUP_FAST_STATUS') {
    (async () => {
      try {
        sendResponse(await getPopupFastStatus(msg?.activeTabHint || msg?.activeTab || null));
      } catch (err) {
        sendResponse({
          mode: 'study',
          currentDomain: null,
          currentSessionDurationSeconds: 0,
          error: err?.message || String(err),
        });
      }
    })();
    return true;
  }

  if (msg.type === 'GET_POPUP_LOCAL_SNAPSHOT') {
    (async () => {
      try {
        sendResponse(await getPopupLocalSnapshot(msg?.activeTabHint || msg?.activeTab || null));
      } catch (err) {
        sendResponse({
          ok: false,
          mode: 'study',
          currentDomain: null,
          currentSessionDurationSeconds: 0,
          config: pickPopupConfig(null),
          stats: buildPopupSettledModeStatsFromDay(null),
          cloudStatus: { isBound: false, localMode: true, syncEnabled: false, reason: 'snapshot_failed' },
          childName: null,
          error: err?.message || String(err),
        });
      }
    })();
    return true;
  }

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
        scheduleModeBoundaryDrain('debugSetRestMode');
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

  if (msg.type === 'DEBUG_TEST_TRIGGER_AUTO_TRANSITION') {
    (async () => {
      try {
        if (!isInternalTestSender()) {
          sendResponse({ success: false, error: 'unauthorized_test_sender' });
          return;
        }
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const tab = tabs && tabs[0];
        if (!tab?.id || !tab?.url) {
          sendResponse({ success: false, error: 'no_active_tab' });
          return;
        }
        const startMs = Number(msg.nowStartMs ?? 0);
        const endMs = Number(msg.nowEndMs ?? 0);
        const startResult = await dispatchModeEvent({
          type: 'ACCESS_OBSERVED',
          source: 'debug_auto_transition_start',
          tabId: tab.id,
          url: tab.url,
          incognito: tab?.incognito === true,
          nowMs: startMs,
          foreground: true,
        }, { recheck: false });
        const endResult = await dispatchModeEvent({
          type: 'ACCESS_OBSERVED',
          source: 'debug_auto_transition_end',
          tabId: tab.id,
          url: tab.url,
          incognito: tab?.incognito === true,
          nowMs: endMs,
          foreground: true,
        }, { recheck: false });
        const sessionData = await chrome.storage.local.get(SESSION_KEY);
        sendResponse({
          success: true,
          blockedStart: startResult.blocked,
          blockedEnd: endResult.blocked,
          mode: sessionData?.[SESSION_KEY]?.currentMode || null,
          tabId: tab.id,
          tabUrl: tab.url,
        });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  ensureBootstrapped('runtimeMessage')
    .then(() => handleMessage(msg, sender))
    .then((response) => {
      sendResponse(response);
      if (msg?.type === 'SWITCH_TO_STUDY' ||
          msg?.type === 'SWITCH_TO_REST' ||
          msg?.type === 'SWITCH_TO_COMPOSITE' ||
          msg?.type === 'REQUEST_MODE_CHANGE' ||
          msg?.type === 'EVALUATE_QUOTA_STATE') {
        scheduleModeBoundaryDrain('runtimeMessageModeSwitch');
      }
    }).catch(err => {
      logClientEventBestEffort({
        level: 'error',
        category: 'runtime',
        eventCode: 'runtime_message_failed',
        module: 'background',
        message: err?.message || 'runtime message failed',
        details: { type: msg?.type || null },
      });
      sendResponse({ error: err.message });
    });
  return true;
});
