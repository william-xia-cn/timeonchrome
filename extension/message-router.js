// message-router.js — 命令路由

import { getConfig, saveConfig, getSession, getVisitSessions, getChangelog, getDateKey, formatDate, matchDomain, extractDomain, addTemporaryCompositeDomain, clearTemporaryCompositeDomains, hasTemporaryCompositePermission, getTemporaryCompositePermissionRecords, submitSiteClassificationRequest, getSiteClassificationRequestRecords } from './infra/storage.js';
import { normalizeSiteClassificationTarget } from './core/site-classification.js';
import { getEvents } from './core/event-log.js';
import { updateDeclarativeRules } from './product/interceptor.js';
import { getWeekRestSeconds } from './product/quota.js';
import { getSyncState, getCloudConfig, syncNow, sendHeartbeat, cloudBind, initCloudSync, getStatsFoundationV1SyncStatus } from './infra/cloud-sync.js';
import { getTodayStatsWithCategories } from './product/analytics.js';
import { flushOpenSessionToStats, getSession as getTimingSession } from './runtime/session.js';
import { getCappedElapsedMs } from './runtime/time-boundary.js';
import { markSuspectUsageSegments } from './core/usage-segments.js';
import { clearClientLogs, getClientLogConfig, getClientLogs, getClientLogStatus, logClientEventBestEffort, logFallbackEventBestEffort, updateClientLogConfig } from './infra/client-logs.js';
import { handleModeEvent, normalizeMode } from './product/mode-service.js';
import { executeModeDecision, getModeEffectTrace } from './product/mode-effects.js';
import { getHourlyMediaStatsRangeView, getHourlyUsageStatsRangeView, getMediaSettlementAnalysisView, getPopupModeStatsView, getSettlementAnalysisView, getTodayUsageView, getUsageRangeView } from './stats/managed-statistics.js';
import { getEffectiveQuotaForDate } from './core/quota-config.js';
import { runClassificationSyncEffects } from './core/classification-effective-boundary.js';

const BORROW_ALLOWED_PATHS = new Set([
  '/reminder.html',
]);
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};

function isAuthorizedBorrowSender(sender) {
  if (!sender?.id || sender.id !== chrome.runtime.id) return false;
  if (!sender?.url) return false;

  try {
    const senderUrl = new URL(sender.url);
    const extensionOrigin = new URL(chrome.runtime.getURL('/')).origin;
    if (senderUrl.origin !== extensionOrigin) return false;
    return BORROW_ALLOWED_PATHS.has(senderUrl.pathname);
  } catch {
    return false;
  }
}

function getLocalDayRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  return { start, end };
}

function buildTodayTimelineSegmentsFromEventLog(events, now = new Date()) {
  const { start, end } = getLocalDayRange(now);
  const segments = [];
  let openStart = null;
  for (const evt of events) {
    if (!evt || typeof evt.time !== 'number' || Number.isNaN(evt.time)) continue;
    if (evt.type === 'START') {
      openStart = evt;
      continue;
    }
    if (evt.type !== 'END' || !openStart) continue;
    if (openStart.state !== 'ACTIVE') {
      openStart = null;
      continue;
    }
    if (typeof openStart.domain !== 'string' || !openStart.domain.trim()) {
      openStart = null;
      continue;
    }

    const segmentStart = Math.max(openStart.time, start);
    const segmentEnd = Math.min(evt.time, end);
    const duration = Math.floor((segmentEnd - segmentStart) / 1000);
    if (duration > 0) {
      segments.push({
        startAt: segmentStart,
        duration,
        state: openStart.state || null,
        domain: openStart.domain || null,
      });
    }
    openStart = null;
  }
  return segments;
}

function isAuthorizedReminderSender(sender) {
  return isAuthorizedBorrowSender(sender);
}

function resolveCompositeSourceTabId(msg, sender) {
  const senderTabId = sender?.tab?.id;
  if (Number.isInteger(senderTabId) && senderTabId >= 0) return senderTabId;
  if (!isAuthorizedReminderSender(sender)) return null;
  const sourceTabId = Number(msg?.sourceTabId);
  return Number.isInteger(sourceTabId) && sourceTabId >= 0 ? sourceTabId : null;
}

async function resolveSiteClassificationSourceContext(msg = {}, sender = {}) {
  const senderTab = sender?.tab;
  if (senderTab?.id && senderTab?.url) {
    return {
      tabId: senderTab.id,
      sourceTabId: senderTab.id,
      url: senderTab.url,
      domain: extractDomain(senderTab.url),
    };
  }

  const sourceTabId = Number(msg?.sourceTabId);
  if (Number.isInteger(sourceTabId) && sourceTabId >= 0) {
    try {
      const tab = await chrome.tabs.get(sourceTabId);
      return {
        tabId: tab?.id ?? sourceTabId,
        sourceTabId,
        url: tab?.url || null,
        domain: extractDomain(tab?.url || ''),
      };
    } catch (_) {
      return { tabId: sourceTabId, sourceTabId, url: null, domain: null };
    }
  }

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs && tabs[0] ? tabs[0] : null;
  return {
    tabId: Number.isInteger(tab?.id) ? tab.id : null,
    sourceTabId: Number.isInteger(tab?.id) ? tab.id : null,
    url: tab?.url || null,
    domain: extractDomain(tab?.url || ''),
  };
}

function siteClassificationTargetUrl(target) {
  if (!target?.ok) return null;
  if (target.targetType === 'url') return target.normalizedValue;
  if (target.targetType === 'host') return `https://${target.normalizedValue}`;
  return null;
}

function normalizeHttpTargetUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function getReminderOriginalTarget(tabUrl = '') {
  if (!tabUrl || typeof tabUrl !== 'string' || !tabUrl.includes('reminder.html')) {
    return { url: tabUrl || null, domain: extractDomain(tabUrl || '') };
  }
  try {
    const parsed = new URL(tabUrl);
    const targetUrl = normalizeHttpTargetUrl(parsed.searchParams.get('targetUrl') || '');
    if (targetUrl) {
      return { url: targetUrl, domain: extractDomain(targetUrl) };
    }
    const domain = String(parsed.searchParams.get('domain') || '').trim().replace(/\.+$/g, '');
    if (domain && domain !== 'all') {
      return { url: `https://${domain}/`, domain };
    }
  } catch {}
  return { url: tabUrl || null, domain: extractDomain(tabUrl || '') };
}

async function flushStatsForRead(source = null) {
  try {
    if (source === 'popup') {
      return await flushOpenSessionToStats('popup_open', { allowForeground: true });
    }
    return await flushOpenSessionToStats('ui_flush');
  } catch (e) {
    console.error('[Stats] flush before stats read failed:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function handleMessage(msg, sender) {
  switch (msg.type) {
    case 'GET_CONFIG':
      return await getConfig();

    case 'GET_STATS': {
      await flushStatsForRead(msg.source || null);
      const config = await getConfig();
      const view = await getTodayUsageView({ config });
      return view.statsWithSummary;
    }

    case 'GET_SETTLED_TODAY_STATS': {
      const config = await getConfig();
      const view = await getTodayUsageView({ config });
      return view.statsWithSummary;
    }

    case 'GET_POPUP_SETTLED_MODE_STATS':
      return (await getPopupModeStatsView()).summary;

    case 'GET_STATS_RANGE': {
      await flushStatsForRead();
      const config = await getConfig();
      const view = await getUsageRangeView(msg.days || 7, { config });
      return view.statsWithSummaryByDate;
    }

    case 'UPDATE_CONFIG': {
      const newConfig = msg.config;
      const nextMode = newConfig?.mode === 'whitelist' ? 'study' : (newConfig?.mode === 'blacklist' ? 'rest' : newConfig?.mode);
      if (nextMode && nextMode !== 'study') {
        await clearTemporaryCompositeDomains();
      }
      await saveConfig(newConfig);
      await updateDeclarativeRules(newConfig);
      const classificationEffects = await runRouterClassificationSyncEffects('config_update');
      return { ok: true, classificationEffects };
    }

    case 'FLUSH_TIME':
      return await flushOpenSessionToStats('ui_flush');

    case 'GET_SUSPECT_SEGMENT_SUMMARY':
      try {
        return await markSuspectUsageSegments({ dryRun: true });
      } catch (e) {
        return { ok: false, dryRun: true, error: e?.message || String(e) };
      }

    case 'MARK_SUSPECT_SEGMENTS':
      try {
        return await markSuspectUsageSegments({ dryRun: msg.dryRun !== false });
      } catch (e) {
        return { ok: false, dryRun: msg.dryRun !== false, error: e?.message || String(e) };
      }

    case 'GET_STATUS':
      return { ok: true };

    case 'GET_SESSION':
      return await getSession();

    case 'GET_RUNTIME_MODE_STATUS':
      return await getRuntimeModeStatus(msg);

    case 'REQUEST_MODE_CHANGE':
      return await handleModeChangeRequest(msg);

    case 'EVALUATE_QUOTA_STATE':
      return await handleEvaluateQuotaState(msg);

    case 'GET_VISIT_SESSIONS':
      return await getVisitSessions(msg.days || 14);

    case 'GET_TIMELINE_SEGMENTS': {
      await flushStatsForRead();
      const events = await getEvents();
      return buildTodayTimelineSegmentsFromEventLog(events, new Date());
    }

    case 'GET_TODAY_SETTLEMENT_ANALYSIS':
      return await getSettlementAnalysisView('today');

    case 'GET_SETTLEMENT_ANALYSIS_RANGE':
      return await getSettlementAnalysisView(msg.range || 'today');

    case 'GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE':
      return await getMediaSettlementAnalysisView(msg.range || 'today');

    case 'GET_HOURLY_USAGE_STATS_RANGE':
      return await getHourlyUsageStatsRangeView(msg.range || 'today');

    case 'GET_HOURLY_MEDIA_STATS_RANGE':
      return await getHourlyMediaStatsRangeView(msg.range || 'today');

    case 'GET_CHANGELOG':
      return await getChangelog(msg.limit || 20);

    case 'GET_CLIENT_LOGS':
      return await getClientLogs(msg.filter || {});

    case 'GET_CLIENT_LOG_STATUS':
      return await getClientLogStatus();

    case 'CLEAR_CLIENT_LOGS':
      return await clearClientLogs(msg.filter || null);

    case 'GET_CLIENT_LOG_CONFIG':
      return await getClientLogConfig();

    case 'UPDATE_CLIENT_LOG_CONFIG':
      return await updateClientLogConfig(msg.config || msg.patch || {});

    case 'GET_MODE_EFFECT_TRACE':
      return {
        ok: true,
        rows: await getModeEffectTrace(msg.limit || 50),
      };

    case 'GET_TEMPORARY_COMPOSITE_DOMAINS': {
      const records = await getTemporaryCompositePermissionRecords();
      return {
        ok: true,
        records: records
          .map((record) => ({
            tabId: record.tabId,
            domain: record.domain,
            createdAt: record.createdAt,
          }))
          .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)),
      };
    }

    case 'GET_SITE_CLASSIFICATION_REQUESTS': {
      const records = await getSiteClassificationRequestRecords({
        status: msg.status || null,
        includeAll: msg.status === 'all' || !msg.status,
      });
      return { ok: true, records };
    }

    case 'SUBMIT_SITE_CLASSIFICATION_REQUEST': {
      try {
        const context = await resolveSiteClassificationSourceContext(msg, sender);
        const target = normalizeSiteClassificationTarget(msg.input || msg.url || context.url || context.domain || '');
        if (!target.ok) {
          return { ok: false, code: target.code || 'INVALID_TARGET', error: target.error || 'invalid target' };
        }
        const requestContext = {
          ...context,
          sourceTabId: Number.isInteger(context.sourceTabId) ? context.sourceTabId : context.tabId,
          url: target.targetType === 'url' ? target.normalizedValue : context.url,
          domain: target.host || context.domain,
        };
        const result = await submitSiteClassificationRequest(msg.input || msg.url || target.normalizedValue, requestContext);
        if (result?.ok) {
          const targetUrl = siteClassificationTargetUrl(target);
          const syncStateRef = getSyncState();
          if (syncStateRef.deviceToken) {
            syncNow(getConfig, saveConfig, updateDeclarativeRules, {
              afterClassificationSync: () => runRouterClassificationSyncEffects('site_request_submit_sync'),
            })
              .catch(() => {});
          }
          return {
            ...result,
            targetUrl,
            sourceTabId: requestContext.sourceTabId,
            target: {
              targetType: target.targetType,
              normalizedValue: target.normalizedValue,
              displayValue: target.displayValue,
            },
          };
        }
        return result || { ok: false, code: 'SITE_CLASSIFICATION_REQUEST_FAILED', error: 'request failed' };
      } catch (error) {
        return {
          ok: false,
          code: 'SITE_CLASSIFICATION_REQUEST_FAILED',
          error: error?.message || String(error) || 'request failed',
        };
      }
    }

    case 'SWITCH_TO_STUDY':
      return await handleModeChangeRequest({ ...msg, toMode: 'study', legacyType: msg.type });

    case 'SWITCH_TO_REST':
      return await handleModeChangeRequest({ ...msg, toMode: 'rest', legacyType: msg.type });

    case 'SWITCH_TO_COMPOSITE':
      return await handleModeChangeRequest({ ...msg, toMode: 'composite', legacyType: msg.type });

    case 'ADD_TO_COMPOSITE_LIST':
      return await addToCompositeList(msg.domain, resolveCompositeSourceTabId(msg, sender));

    case 'SEND_CLOUD_EVENT': {
      const { eventType, domain: evtDomain = '' } = msg;
      const syncStateRef = getSyncState();
      if (syncStateRef.monitoringEnabled === 0) {
        return { ok: true, skipped: 'monitoring_disabled' };
      }
      const CLOUD_CONFIG = getCloudConfig();
      if (syncStateRef.deviceToken) {
        fetch(`${CLOUD_CONFIG.API_BASE}/device/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${syncStateRef.deviceToken}`
          },
          body: JSON.stringify({ type: eventType, domain: evtDomain })
        }).catch(() => {});
      }
      return { ok: true };
    }

    case 'CLOUD_BIND': {
      const bindResult = await cloudBind(() => syncNow(getConfig, saveConfig, updateDeclarativeRules, {
        afterClassificationSync: () => runRouterClassificationSyncEffects('cloud_bind_sync'),
      }));
      return bindResult;
    }

    case 'CLOUD_LOGIN': {
      const email = String(msg.email || '').trim().toLowerCase();
      const { password } = msg;
      try {
        const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
        const resp = await fetch(`${CLOUD_CONFIG.API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || 'Login failed');
        }

        const result = await resp.json();
        const encrypted = btoa(`${email}:${password}`);
        await chrome.storage.local.set({
          [CLOUD_CONFIG.KEYS.CREDENTIALS]: encrypted,
          account_token: result.token
        });

        return { success: true, token: result.token };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'CLOUD_LOGOUT': {
      const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
      await chrome.storage.local.set({
        [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null,
        [CLOUD_CONFIG.KEYS.PROFILE_ID]: null,
        [CLOUD_CONFIG.KEYS.CREDENTIALS]: null,
        account_token: null
      });
      return { success: true };
    }

    case 'GET_CLOUD_STATUS': {
      const storage = await chrome.storage.local.get([
        'cloud_device_token',
        'cloud_device_id',
        'cloud_profile_id',
        'cloud_last_sync',
        'cloud_config_version',
        'cloud_credentials',
        'cloud_monitoring_enabled'
      ]);

      const v1Sync = await getStatsFoundationV1SyncStatus().catch(() => null);
      const isBound = !!storage['cloud_device_token'];
      return {
        isBound,
        localMode: !isBound,
        syncEnabled: isBound,
        reason: isBound ? null : 'no_device_token',
        deviceId: storage['cloud_device_id'] || null,
        profileId: storage['cloud_profile_id'] || null,
        hasCredentials: !!storage['cloud_credentials'],
        lastSync: storage['cloud_last_sync'] || 0,
        configVersion: storage['cloud_config_version'] || 0,
        monitoringEnabled: storage['cloud_monitoring_enabled'] ?? 1,
        v1Sync,
      };
    }

    case 'CLOUD_FORCE_SYNC': {
      const syncResult = await syncNow(
        getConfig,
        saveConfig,
        updateDeclarativeRules,
        {
          forceRetryExhausted: true,
          afterClassificationSync: () => runRouterClassificationSyncEffects('cloud_force_sync'),
        }
      );
      return syncResult;
    }

    case 'GET_WEEK_REST_SECONDS': {
      return { weekRestSeconds: await getWeekRestSeconds() };
    }

    case 'BORROW_REST_QUOTA': {
      return { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' };
    }

    case 'GET_WEEKLY_SESSIONS': {
      const today = new Date();
      const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek);
      const weekStartStr = weekStart.toISOString().slice(0, 10);
      try {
        const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
        const syncStateRef = getSyncState();
        const resp = await fetch(`${CLOUD_CONFIG.API_BASE}/device/weekly-sessions?week_start=${weekStartStr}`, {
          headers: { 'Authorization': `Bearer ${syncStateRef.deviceToken}` }
        });
        const data = await resp.json();
        return { sessions: data.sessions || [] };
      } catch (e) {
        return { sessions: [], error: e.message };
      }
    }

    case 'SUBMIT_APPEAL': {
      const { sessionId, reason } = msg;
      try {
        const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
        const syncStateRef = getSyncState();
        const resp = await fetch(`${CLOUD_CONFIG.API_BASE}/device/appeal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${syncStateRef.deviceToken}`
          },
          body: JSON.stringify({ session_id: sessionId, reason: reason || '' })
        });
        const data = await resp.json();
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    default:
      logClientEventBestEffort({
        level: 'warning',
        category: 'runtime',
        eventCode: 'message_unknown_type',
        module: 'message-router',
        message: 'Unknown runtime message type',
        details: { type: msg?.type || null },
      });
      return { error: 'Unknown message type' };
  }
}

async function dispatchModeEventFromRouter(event = {}, context = {}) {
  const decision = await handleModeEvent({
    ...event,
    monitoringEnabled: event.monitoringEnabled ?? getSyncState().monitoringEnabled,
  });
  return await executeModeDecision(decision, {
    tabId: event.tabId ?? context.tabId ?? null,
    domain: decision.domain || event.domain || extractDomain(event.url || ''),
    updateDeclarativeRules,
    event,
  });
}

// ── Mode switching ──────────────────────────────────────────────────────────────


async function reevaluateActiveTabAfterModeSwitch(options = {}) {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id || !tab.url) return null;

  let targetUrl = tab.url;
  if (tab.url.includes('reminder.html')) {
    try {
      const u = new URL(tab.url);
      const originalTargetUrl = normalizeHttpTargetUrl(u.searchParams.get('targetUrl') || '');
      if (originalTargetUrl) {
        targetUrl = originalTargetUrl;
      } else {
        const domain = u.searchParams.get('domain');
        if (!domain || domain === 'all') return tab;
        targetUrl = `https://${domain}`;
      }
    } catch {
      return tab;
    }
  }

  const result = await dispatchModeEventFromRouter({
    type: 'ACCESS_OBSERVED',
    source: options.source || 'mode_switch_recheck',
    tabId: tab.id,
    url: targetUrl,
    foreground: options.foreground === true,
    nowMs: options.nowMs,
  });
  if (!result.blocked && targetUrl !== tab.url) {
    await chrome.tabs.update(tab.id, { url: targetUrl }).catch(() => {});
  }
  return tab;
}

async function runRouterClassificationSyncEffects(source = 'classification_sync') {
  return runClassificationSyncEffects({
    source,
    recheckActiveTab: async () => {
      const tab = await reevaluateActiveTabAfterModeSwitch({
        foreground: true,
        source: `${source}_recheck`,
      });
      return tab?.id
        ? { ok: true, rechecked: true, tabId: tab.id }
        : { ok: true, rechecked: false, reason: 'no_active_tab' };
    },
  });
}

function isInjectableNoticeUrl(url = '') {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

async function getActiveTabForModeNotice(preferredTabId = null) {
  if (Number.isInteger(preferredTabId) && preferredTabId > 0) {
    try {
      const preferredTab = await chrome.tabs.get(preferredTabId);
      if (preferredTab?.id && isInjectableNoticeUrl(preferredTab.url || '')) {
        return preferredTab;
      }
    } catch {}
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = tabs && tabs[0] ? tabs[0] : null;
  if (activeTab?.id && isInjectableNoticeUrl(activeTab.url || '')) {
    return activeTab;
  }
  const windowTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const fallback = (windowTabs || [])
    .filter((tab) => tab?.id && isInjectableNoticeUrl(tab.url || ''))
    .sort((a, b) => Number(b?.lastAccessed || 0) - Number(a?.lastAccessed || 0))[0];
  return fallback || activeTab || null;
}

function manualModeNoticeText(mode) {
  if (mode === 'study') return '已回到学习模式';
  if (mode === 'composite') return '已进入综合模式';
  if (mode === 'locked') return '当前配额已用完';
  return '已进入休息模式';
}

async function handleModeChangeRequest(msg = {}) {
  const toMode = normalizeMode(msg.toMode || msg.mode);
  if (toMode === 'paused') {
    return { ok: false, error: 'invalid_target_mode' };
  }
  const activeTab = await getActiveTabForModeNotice(msg?.noticeTabId ?? null);
  const originalTarget = getReminderOriginalTarget(activeTab?.url || '');
  const modeEvent = {
    type: msg.type === 'REMINDER_CONFIRMED' ? 'REMINDER_CONFIRMED' : 'REQUEST_MODE_CHANGE',
    requestedMode: toMode,
    source: msg.source || 'runtime_message',
    reason: msg.reason || 'manual_mode_switch',
    nowMs: Date.now(),
    tabId: activeTab?.id ?? null,
    url: originalTarget.url || activeTab?.url || null,
    domain: originalTarget.domain || extractDomain(activeTab?.url || ''),
  };
  const decision = await handleModeEvent(modeEvent);
  const executed = await executeModeDecision(decision, {
    tabId: activeTab?.id ?? null,
    domain: originalTarget.domain || extractDomain(activeTab?.url || ''),
    updateDeclarativeRules,
    event: modeEvent,
  });
  let reevaluatedTab = null;
  if (decision.recheckActiveTab) {
    try {
      reevaluatedTab = await reevaluateActiveTabAfterModeSwitch({
        foreground: true,
        source: 'mode_request_recheck',
      });
    } catch (err) {
      recordFallbackLog({
        level: 'warning',
        category: 'access',
        eventCode: 'active_tab_recheck_failed',
        module: 'message-router',
        reason: 'mode_request_recheck_failed',
        message: err?.message || 'Active tab recheck failed after mode request',
        domain: modeEvent.domain || null,
        details: { toMode, source: modeEvent.source, error: err?.message || String(err) },
      });
      reevaluatedTab = null;
    }
  }
  const fallbackSession = await getSession().catch((err) => {
    recordFallbackLog({
      level: 'warning',
      category: 'runtime',
      eventCode: 'mode_response_session_fallback_failed',
      module: 'message-router',
      reason: 'mode_response_session_lookup_failed',
      message: err?.message || 'Mode response could not read fallback session',
      details: { toMode, source: modeEvent.source, error: err?.message || String(err) },
    });
    return null;
  });
  const sessionResult = executed.modeChange?.session || fallbackSession || {};
  const effectiveMode = sessionResult.currentMode || normalizeMode((await getConfig().catch((err) => {
    recordFallbackLog({
      level: 'warning',
      category: 'runtime',
      eventCode: 'mode_response_config_fallback_failed',
      module: 'message-router',
      reason: 'mode_response_config_lookup_failed',
      message: err?.message || 'Mode response could not read fallback config',
      details: { toMode, source: modeEvent.source, error: err?.message || String(err) },
    });
    return null;
  }))?.mode);
  return {
    ok: executed.ok !== false && executed.blocked !== true,
    ...sessionResult,
    mode: effectiveMode,
    currentMode: effectiveMode,
    blocked: executed.blocked === true,
    reason: executed.decision?.reason || null,
    reminder: executed.decision?.reminder || null,
    recheckedTabId: reevaluatedTab?.id ?? null,
    modeDecision: decision,
    modeEffect: executed,
    noticeAttempted: executed.noticeAttempted,
    noticeTargetTabId: executed.noticeTargetTabId,
    noticeSent: executed.noticeSent,
    noticeAck: executed.noticeAck,
    noticeRendered: executed.noticeRendered,
    noticeError: executed.noticeError,
    noticeInjectionAttempted: executed.noticeDelivery?.injectionAttempted === true,
    noticeInjectionResult: executed.noticeDelivery?.injectionResult || null,
  };
}

async function handleEvaluateQuotaState(msg = {}) {
  const source = msg.source || 'quota_alarm';
  const modeEvent = {
    type: 'EVALUATE_QUOTA_STATE',
    source,
    nowMs: Date.now(),
  };
  const decision = await handleModeEvent(modeEvent);
  const activeTab = decision.notice ? await getActiveTabForModeNotice(null) : null;
  const executed = await executeModeDecision(decision, {
    tabId: activeTab?.id ?? null,
    domain: extractDomain(activeTab?.url || ''),
    updateDeclarativeRules,
    event: {
      ...modeEvent,
      tabId: activeTab?.id ?? null,
      url: activeTab?.url || null,
      domain: extractDomain(activeTab?.url || ''),
    },
  });
  const recheckedTab = decision.recheckActiveTab
    ? await reevaluateActiveTabAfterModeSwitch({
      foreground: true,
      source: 'quota_state_change',
    })
    : null;

  return {
    ok: true,
    source,
    quota: decision.quota || null,
    modeDecision: decision,
    modeEffect: executed,
    modeChange: executed.modeChange,
    noticeAttempted: executed.noticeAttempted,
    noticeTargetTabId: executed.noticeTargetTabId,
    noticeSent: executed.noticeSent,
    noticeAck: executed.noticeAck,
    noticeRendered: executed.noticeRendered,
    noticeError: executed.noticeError,
    noticeInjectionAttempted: executed.noticeDelivery?.injectionAttempted === true,
    noticeInjectionResult: executed.noticeDelivery?.injectionResult || null,
    recheckedTabId: recheckedTab?.id ?? null,
  };
}

// ── Add to composite list ───────────────────────────────────────────────────────

async function addToCompositeList(domain, tabId) {
  const config = await getConfig();
  const list = config.compositeList || [];
  const restrictedList = config.restrictedEntertainmentList || [];
  const unsafeList = (config.unsafeList?.length ? config.unsafeList : null) || config.blacklist || [];
  const currentMode = config.mode === 'whitelist' ? 'study' : (config.mode === 'blacklist' ? 'rest' : config.mode);
  const quotaState = config.quotaState || {};
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { domain, added: false, error: 'invalid_tab_context', code: 'INVALID_TAB_CONTEXT' };
  }

  const alreadyInComposite = list.some(d => matchDomain(domain, d));
  const alreadyInTemporaryComposite = await hasTemporaryCompositePermission(tabId, domain);
  const alreadyInStudy = (config.studyList || []).some(d => matchDomain(domain, d));
  const isRestricted = restrictedList.some(d => matchDomain(domain, d));
  const isUnsafe = unsafeList.some(d => matchDomain(domain, d));

  if (currentMode !== 'study') {
    return { domain, added: false, error: 'not_in_study_mode', code: 'NOT_IN_STUDY_MODE' };
  }
  if (quotaState.onlineLocked) {
    return { domain, added: false, error: 'online_quota_locked', code: 'ONLINE_QUOTA_LOCKED' };
  }
  if (quotaState.undeterminedLocked) {
    return { domain, added: false, error: 'undetermined_quota_locked', code: 'UNDETERMINED_QUOTA_LOCKED' };
  }
  if (isRestricted) {
    return { domain, added: false, error: 'domain_in_restricted_list', code: 'DOMAIN_IN_RESTRICTED_LIST' };
  }
  if (isUnsafe) {
    return { domain, added: false, error: 'domain_in_unsafe_list', code: 'DOMAIN_IN_UNSAFE_LIST' };
  }
  if (alreadyInComposite || alreadyInStudy || alreadyInTemporaryComposite) {
    return { domain, alreadyPresent: true };
  }

  const addResult = await addTemporaryCompositeDomain(tabId, domain);
  if (!addResult.added) {
    return { domain, alreadyPresent: true };
  }
  return { domain, added: true };
}

async function getRuntimeModeStatus(options = {}) {
  const includeUsageSummary = options?.includeUsageSummary !== false;
  const config = await getConfig();
  const [session, statsWithCategories] = await Promise.all([
    getSession(),
    includeUsageSummary ? getTodayStatsWithCategories(config) : Promise.resolve(null),
  ]);
  const monitoringEnabled = getSyncState().monitoringEnabled;
  const mode = monitoringEnabled === 0 ? 'paused' : normalizeMode(session?.currentMode || config?.mode);

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = tabs && tabs[0];
  const currentDomain = extractDomain(activeTab?.url || '');

  let currentSessionDurationSeconds = null;
  try {
    const timingSession = await getTimingSession();
    if (timingSession?.state === 'ACTIVE' && timingSession?.startTime) {
      currentSessionDurationSeconds = Math.max(0, Math.floor(getCappedElapsedMs(timingSession, Date.now()) / 1000));
    }
  } catch {}

  let compositeRemainingSeconds = null;
  let restRemainingSeconds = null;
  if (includeUsageSummary) {
    const effectiveQuota = getEffectiveQuotaForDate(config).todayEffectiveQuota;
    const compositeUsedSeconds = Math.max(0, Number(statsWithCategories?.compositeSeconds ?? statsWithCategories?.undeterminedSeconds) || 0);
    const compositeLimitSeconds = effectiveQuota.compositeMinutes === null || effectiveQuota.compositeMinutes === undefined
      ? null
      : Math.max(0, Number(effectiveQuota.compositeMinutes) * 60);
    compositeRemainingSeconds = compositeLimitSeconds === null ? null : Math.max(0, compositeLimitSeconds - compositeUsedSeconds);

    const restLimitSeconds = effectiveQuota.restMinutes === null || effectiveQuota.restMinutes === undefined
      ? null
      : Math.max(0, Number(effectiveQuota.restMinutes) * 60);
    const restUsedSeconds = Math.max(0, Number(statsWithCategories?.restSeconds) || 0);
    restRemainingSeconds = restLimitSeconds === null ? null : Math.max(0, restLimitSeconds - restUsedSeconds);
  }

  return {
    mode,
    currentMode: mode,
    currentModeStartedAtMs: Number.isFinite(Number(session?.currentModeStartedAtMs))
      ? Number(session.currentModeStartedAtMs)
      : null,
    restExitGraceUntilMs: Number.isFinite(Number(session?.restExitGraceUntilMs))
      ? Number(session.restExitGraceUntilMs)
      : null,
    currentDomain: currentDomain || null,
    currentSessionDurationSeconds,
    compositeRemainingSeconds,
    restRemainingSeconds,
  };
}
