// background-new.js — 完整 wiring 入口

import { initSignal } from './core/signal.js';
import { buildContext } from './core/context.js';
import { resolveState } from './core/state.js';
import { initSession, transitionState, heartbeat } from './runtime/session.js';
import { recover } from './runtime/recovery.js';
import { getConfig, saveConfig, resetDailyLockedDomains, cleanOldStats, cleanOldSessions, DEFAULT_CONFIG, VISIT_SESSIONS_KEY, MIN_SESSION_DURATION, SESSION_KEY, LAST_RESET_DATE_KEY, getDateKey, formatDate, extractDomain, matchDomain } from './infra/storage.js';
import { updateDeclarativeRules, checkAndRemind } from './product/interceptor.js';
import { checkAllTabsQuota, redirectAllTabs, redirectQuotaViolatingTabs, redirectLockedTabs } from './product/quota.js';
import { initCloudSync, syncNow, sendHeartbeat, getSyncState } from './infra/cloud-sync.js';
import { handleMessage } from './message-router.js';

let currentContext = null;

// ── SW 启动 → 先恢复 ──────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  await initSession();
  await recover();
  await resetDailyLockedDomains(true);
  setupAlarms();
  await initCloudSync(() => syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs));
});

// ── 安装/更新 ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  await initSession();
  await recover();
  setupAlarms();
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
        studyList: existingConfig.studyList || existingConfig.whitelist || DEFAULT_CONFIG.studyList,
        compositeList: existingConfig.compositeList || existingConfig.allowList || DEFAULT_CONFIG.compositeList,
        unsafeList: (existingConfig.unsafeList?.length ? existingConfig.unsafeList : null) || existingConfig.blacklist || DEFAULT_CONFIG.unsafeList,
        mode: existingConfig.mode === 'whitelist' ? 'study' : (existingConfig.mode === 'blacklist' ? 'rest' : (existingConfig.mode || 'study')),
        autoStudyConfig: existingConfig.autoStudyConfig || DEFAULT_CONFIG.autoStudyConfig,
        dailyOnlineQuota: existingConfig.dailyOnlineQuota ?? (existingConfig.dailyQuota > 0 ? existingConfig.dailyQuota : DEFAULT_CONFIG.dailyOnlineQuota),
        dailyStudyQuota: existingConfig.dailyStudyQuota ?? DEFAULT_CONFIG.dailyStudyQuota,
        dailyRestQuota: existingConfig.dailyRestQuota ?? DEFAULT_CONFIG.dailyRestQuota,
        dailyUndeterminedQuota: existingConfig.dailyUndeterminedQuota ?? DEFAULT_CONFIG.dailyUndeterminedQuota,
        weeklyRestQuota: existingConfig.weeklyRestQuota ?? DEFAULT_CONFIG.weeklyRestQuota,
        quotaBorrow: existingConfig.quotaBorrow ?? DEFAULT_CONFIG.quotaBorrow,
        classificationRules: existingConfig.classificationRules ?? [],
        quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false }
      };
      delete migratedConfig.allowList;
      delete migratedConfig.tempWhitelist;
      delete migratedConfig.tempWhitelistConfig;
      delete migratedConfig.tempExemptions;

      await saveConfig(migratedConfig);
    }
  }

  await initCloudSync(() => syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs));
});

// ── 信号接入 → 上下文 → 状态 → 事件日志 ────────────────────────────────────────

initSignal(async (rawEvent) => {
  currentContext = buildContext(currentContext, rawEvent);
  const state = resolveState(currentContext);
  const domain = currentContext?.domain || null;
  await transitionState(state, domain);
});

// ── webNavigation → 拦截检查 ───────────────────────────────────────────────────

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const { url, tabId } = details;
  await checkAndRemind(tabId, url, getSyncState().monitoringEnabled);
});

// ── Alarms ──────────────────────────────────────────────────────────────────────

function setupAlarms() {
  chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  chrome.alarms.create('quota_check', { periodInMinutes: 1 });
  chrome.alarms.create('daily_cleanup', { periodInMinutes: 60 });
  chrome.alarms.create('cloudSync', { periodInMinutes: 15 });
  chrome.alarms.create('cloudHeartbeat', { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'heartbeat') {
    await heartbeat();
  } else if (alarm.name === 'quota_check') {
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

// ── 自动切换学习模式 ────────────────────────────────────────────────────────────

let autoStudyDomain = null;
let autoStudyStartTime = null;

async function checkAutoStudy() {
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
