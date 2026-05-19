// message-router.js — 命令路由

import { getConfig, saveConfig, getTodayStats, getStatsRange, getSession, getVisitSessions, getChangelog, getDateKey, formatDate, matchDomain, extractDomain, addTemporaryCompositeDomain, clearTemporaryCompositeDomains, hasTemporaryCompositePermission, getTemporaryCompositePermissionRecords } from './infra/storage.js';
import { getEvents } from './core/event-log.js';
import { updateDeclarativeRules, checkAndRemind, redirectToReminder, clearTabModeNotice, sendModeSwitchSuccessNotice, applyModeTransitionSideEffects } from './product/interceptor.js';
import { checkAllTabsQuota, redirectAllTabs, redirectQuotaViolatingTabs, redirectLockedTabs, getWeekRestSeconds } from './product/quota.js';
import { getSyncState, getCloudConfig, syncNow, sendHeartbeat, cloudBind, initCloudSync, getStatsFoundationV1SyncStatus } from './infra/cloud-sync.js';
import { getTodayStatsWithCategories } from './product/analytics.js';
import { flushOpenSessionToStats, getSession as getTimingSession } from './runtime/session.js';
import { getMediaSegments } from './runtime/media-session.js';
import { getCappedElapsedMs } from './runtime/time-boundary.js';
import { getAllUsageSegments, getDailyUsageStats, markSuspectUsageSegments } from './core/usage-segments.js';

const BORROW_ALLOWED_PATHS = new Set([
  '/reminder.html',
]);

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

function getSegmentDate(segment) {
  if (segment?.date) return segment.date;
  const startMs = Number(segment?.startMs);
  if (Number.isFinite(startMs)) return formatDate(new Date(startMs));
  return null;
}

function normalizeSettlementAnalysisSegment(segment) {
  const startMs = Number(segment?.startMs);
  const endMs = Number(segment?.endMs);
  const durationSeconds = Number(segment?.durationSeconds);
  return {
    id: segment?.id || null,
    date: getSegmentDate(segment),
    domain: segment?.domain || null,
    channel: segment?.channel || null,
    framework: segment?.framework || null,
    sourceState: segment?.sourceState || null,
    mode: segment?.mode || null,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
    settlementReason: segment?.settlementReason || null,
    description: segment?.description || null,
    suspect: !!segment?.suspect,
    suspectReason: segment?.suspectReason || null,
    uploaded: !!segment?.uploadedAt,
    createdAt: Number.isFinite(Number(segment?.createdAt)) ? Number(segment.createdAt) : null,
    updatedAt: Number.isFinite(Number(segment?.updatedAt)) ? Number(segment.updatedAt) : null,
  };
}

function getMediaSegmentDate(segment) {
  if (segment?.date) return segment.date;
  const startMs = Number(segment?.startMs);
  if (Number.isFinite(startMs)) return formatDate(new Date(startMs));
  return null;
}

function mediaEndpointOperation(description, side) {
  const endpoint = description?.[side];
  return endpoint?.reason || endpoint?.operation || null;
}

function normalizeMediaAnalysisSegment(segment) {
  const startMs = Number(segment?.startMs);
  const endMs = Number(segment?.endMs);
  const durationSeconds = Number(segment?.durationSeconds);
  const description = segment?.description || null;
  return {
    id: segment?.id || null,
    date: getMediaSegmentDate(segment),
    domain: segment?.domain || null,
    tabId: segment?.tabId ?? null,
    windowId: Number.isInteger(segment?.windowId) ? segment.windowId : null,
    mediaClass: segment?.mediaClass || null,
    mediaKind: segment?.mediaKind || null,
    visibility: segment?.visibility || null,
    mode: segment?.mode || null,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
    settlementReason: segment?.settlementReason || segment?.reason || null,
    reason: segment?.reason || segment?.settlementReason || null,
    description,
    openOperation: mediaEndpointOperation(description, 'start'),
    closeOperation: mediaEndpointOperation(description, 'end'),
    uploaded: false,
    createdAt: Number.isFinite(Number(segment?.createdAt)) ? Number(segment.createdAt) : null,
    updatedAt: Number.isFinite(Number(segment?.updatedAt)) ? Number(segment.updatedAt) : null,
  };
}

function getSettlementRangeBounds(range = 'today') {
  const today = new Date();
  if (range === 'all') return { from: null, to: null, label: '全部' };
  if (range === 'yesterday') {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const key = formatDate(d);
    return { from: key, to: key, label: '昨日' };
  }
  if (range === 'week') {
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
    return { from: formatDate(start), to: formatDate(today), label: '本周' };
  }
  const key = getDateKey();
  return { from: key, to: key, label: '今日' };
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

function isDateInSettlementRange(date, range) {
  if (!date) return false;
  if (!range?.from && !range?.to) return true;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function buildMediaSettlementSummary(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row?.durationSeconds) || 0);
    const classKey = `${row?.mediaClass || 'unknown'}Seconds`;
    summary.rowCount++;
    summary.totalSeconds += seconds;
    if (!Object.prototype.hasOwnProperty.call(summary, classKey)) {
      summary[classKey] = 0;
    }
    summary[classKey] += seconds;
    return summary;
  }, {
    rowCount: 0,
    totalSeconds: 0,
    foregroundAudioSeconds: 0,
    backgroundAudioSeconds: 0,
    foregroundVideoSeconds: 0,
    backgroundVideoSeconds: 0,
    pipSeconds: 0,
  });
}

async function getMediaSettlementAnalysisRange(options = {}) {
  const range = getSettlementRangeBounds(options.range || 'today');
  const allSegments = await getMediaSegments();
  const rows = Object.values(allSegments || {})
    .filter(segment => isDateInSettlementRange(getMediaSegmentDate(segment), range))
    .map(normalizeMediaAnalysisSegment)
    .sort((a, b) => {
      const aStart = Number.isFinite(a.startMs) ? a.startMs : Number.MIN_SAFE_INTEGER;
      const bStart = Number.isFinite(b.startMs) ? b.startMs : Number.MIN_SAFE_INTEGER;
      return bStart - aStart;
    });
  return {
    ok: true,
    range: options.range || 'today',
    label: range.label,
    from: range.from,
    to: range.to,
    date: range.from === range.to ? range.from : null,
    rows,
    summary: buildMediaSettlementSummary(rows),
  };
}

async function getSettlementAnalysisRange(options = {}) {
  const range = getSettlementRangeBounds(options.range || 'today');
  const allSegments = await getAllUsageSegments();
  const allDailyStats = await getDailyUsageStats();
  const segments = Object.values(allSegments || {})
    .filter(segment => isDateInSettlementRange(getSegmentDate(segment), range))
    .map(normalizeSettlementAnalysisSegment)
    .sort((a, b) => {
      const aStart = Number.isFinite(a.startMs) ? a.startMs : Number.MAX_SAFE_INTEGER;
      const bStart = Number.isFinite(b.startMs) ? b.startMs : Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    });
  const rangeStats = {};
  for (const [date, dayStats] of Object.entries(allDailyStats || {})) {
    if (isDateInSettlementRange(date, range)) rangeStats[date] = dayStats;
  }
  return {
    ok: true,
    range: options.range || 'today',
    label: range.label,
    from: range.from,
    to: range.to,
    date: range.from === range.to ? range.from : null,
    segments,
    reconciliation: buildLocalSettlementReconciliation(rangeStats, segments),
  };
}

async function getTodaySettlementAnalysis() {
  return await getSettlementAnalysisRange({ range: 'today' });
}

function reconciliationStatus(statsSeconds, segmentSeconds) {
  if (statsSeconds === segmentSeconds) return 'match';
  if (statsSeconds <= 0 && segmentSeconds > 0) return 'stats_missing';
  if (statsSeconds > 0 && segmentSeconds <= 0) return 'segments_missing';
  return 'mismatch';
}

function addReconciliationSeconds(map, keyParts, field, seconds) {
  const [date, domain, channel, mode] = keyParts;
  const key = `${date}\t${domain}\t${channel}\t${mode}`;
  const row = map.get(key) || { date, domain, channel, mode, statsSeconds: 0, segmentSeconds: 0 };
  row[field] += Math.max(0, Number(seconds) || 0);
  map.set(key, row);
}

function buildLocalSettlementReconciliation(dayStatsByDate, segments) {
  const rowsByKey = new Map();
  for (const [date, dayStats] of Object.entries(dayStatsByDate || {})) {
    for (const [domain, ds] of Object.entries(dayStats?.domains || {})) {
      const activeByMode = ds?.activeByMode || {};
      const backgroundMediaByMode = ds?.backgroundMediaByMode || {};
      const pipByMode = ds?.pipByMode || {};
      for (const [mode, seconds] of Object.entries(activeByMode)) {
        addReconciliationSeconds(rowsByKey, [date, domain, 'active', mode], 'statsSeconds', seconds);
      }
      for (const [mode, seconds] of Object.entries(backgroundMediaByMode)) {
        addReconciliationSeconds(rowsByKey, [date, domain, 'backgroundMedia', mode], 'statsSeconds', seconds);
      }
      for (const [mode, seconds] of Object.entries(pipByMode)) {
        addReconciliationSeconds(rowsByKey, [date, domain, 'pip', mode], 'statsSeconds', seconds);
      }
    }
  }
  for (const segment of segments || []) {
    addReconciliationSeconds(
      rowsByKey,
      [segment.date || getDateKey(), segment.domain, segment.channel, segment.mode || 'unknown'],
      'segmentSeconds',
      segment.durationSeconds
    );
  }

  const rows = [...rowsByKey.values()].map((row) => ({
    ...row,
    deltaSeconds: row.segmentSeconds - row.statsSeconds,
    status: reconciliationStatus(row.statsSeconds, row.segmentSeconds),
  })).sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'match') return 1;
      if (b.status === 'match') return -1;
    }
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
    if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
    return a.mode < b.mode ? -1 : (a.mode > b.mode ? 1 : 0);
  });

  const summary = rows.reduce((acc, row) => {
    acc.statsSeconds += row.statsSeconds;
    acc.segmentSeconds += row.segmentSeconds;
    acc.deltaSeconds += row.deltaSeconds;
    if (row.status !== 'match') acc.mismatchCount++;
    acc.statusCounts[row.status] = (acc.statusCounts[row.status] || 0) + 1;
    return acc;
  }, { rowCount: rows.length, statsSeconds: 0, segmentSeconds: 0, deltaSeconds: 0, mismatchCount: 0, statusCounts: {} });

  return { rows, summary };
}

function normalizeMode(mode) {
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  if (mode === 'study' || mode === 'composite' || mode === 'rest' || mode === 'paused') return mode;
  return 'study';
}

const STATS_META_KEYS = new Set([
  'audioSeconds',
  'backgroundMediaByDomain',
  'pipSeconds',
  'pipByDomain',
  'onlineSeconds',
  'compositeSeconds',
  'undeterminedSeconds',
]);

function readCompositeSeconds(stats = {}, config = {}) {
  const explicitComposite = Number(stats?.compositeSeconds);
  if (Number.isFinite(explicitComposite)) return Math.max(0, explicitComposite);

  const legacyUndetermined = Number(stats?.undeterminedSeconds);
  if (Number.isFinite(legacyUndetermined)) return Math.max(0, legacyUndetermined);

  const compositeList = config?.compositeList || [];
  let compositeSeconds = 0;
  for (const [domain, value] of Object.entries(stats || {})) {
    if (STATS_META_KEYS.has(domain)) continue;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    if (compositeList.some((pattern) => matchDomain(domain, pattern))) {
      compositeSeconds += seconds;
    }
  }
  return compositeSeconds;
}

function withUsageSummary(stats = {}, config = {}) {
  let onlineSeconds = 0;
  for (const [key, value] of Object.entries(stats || {})) {
    if (STATS_META_KEYS.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      onlineSeconds += value;
    }
  }
  const compositeSeconds = readCompositeSeconds(stats, config);
  return { ...stats, onlineSeconds, compositeSeconds, undeterminedSeconds: compositeSeconds };
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
      const [config, stats] = await Promise.all([getConfig(), getTodayStats()]);
      return withUsageSummary(stats, config);
    }

    case 'GET_STATS_RANGE': {
      await flushStatsForRead();
      const [config, range] = await Promise.all([getConfig(), getStatsRange(msg.days || 7)]);
      const out = {};
      for (const [date, stats] of Object.entries(range || {})) {
        out[date] = withUsageSummary(stats || {}, config);
      }
      return out;
    }

    case 'UPDATE_CONFIG': {
      const newConfig = msg.config;
      const nextMode = newConfig?.mode === 'whitelist' ? 'study' : (newConfig?.mode === 'blacklist' ? 'rest' : newConfig?.mode);
      if (nextMode && nextMode !== 'study') {
        await clearTemporaryCompositeDomains();
      }
      await saveConfig(newConfig);
      await updateDeclarativeRules(newConfig);
      return { ok: true };
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

    case 'GET_VISIT_SESSIONS':
      return await getVisitSessions(msg.days || 14);

    case 'GET_TIMELINE_SEGMENTS': {
      await flushStatsForRead();
      const events = await getEvents();
      return buildTodayTimelineSegmentsFromEventLog(events, new Date());
    }

    case 'GET_TODAY_SETTLEMENT_ANALYSIS':
      return await getTodaySettlementAnalysis();

    case 'GET_SETTLEMENT_ANALYSIS_RANGE':
      return await getSettlementAnalysisRange({ range: msg.range || 'today' });

    case 'GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE':
      return await getMediaSettlementAnalysisRange({ range: msg.range || 'today' });

    case 'GET_CHANGELOG':
      return await getChangelog(msg.limit || 20);

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

    case 'SWITCH_TO_STUDY':
      return await switchToStudy(msg);

    case 'SWITCH_TO_REST':
      return await switchToRest(msg);

    case 'SWITCH_TO_COMPOSITE':
      return await switchToComposite(msg);

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
      const bindResult = await cloudBind(() => syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs));
      return bindResult;
    }

    case 'CLOUD_LOGIN': {
      const { email, password } = msg;
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
        redirectAllTabs,
        redirectQuotaViolatingTabs,
        { forceRetryExhausted: true }
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

    case 'CHECK_AND_REMIND': {
      return await checkAndRemind(msg.tabId, msg.url, getSyncState().monitoringEnabled);
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Mode switching ──────────────────────────────────────────────────────────────


async function reevaluateActiveTabAfterModeSwitch() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id || !tab.url) return null;

  let targetUrl = tab.url;
  if (tab.url.includes('reminder.html')) {
    try {
      const u = new URL(tab.url);
      const domain = u.searchParams.get('domain');
      if (!domain || domain === 'all') return tab;
      targetUrl = `https://${domain}`;
    } catch {
      return tab;
    }
  }

  const blocked = await checkAndRemind(tab.id, targetUrl, getSyncState().monitoringEnabled);
  if (!blocked && targetUrl !== tab.url) {
    await chrome.tabs.update(tab.id, { url: targetUrl }).catch(() => {});
  }
  return tab;
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

async function switchToStudy(msg = {}) {
  const config = await getConfig();
  const session = await getSession();
  const fromMode = normalizeMode(session?.currentMode || config?.mode);
  const activeTab = await getActiveTabForModeNotice(msg?.noticeTabId ?? null);
  if (activeTab?.id) {
    await clearTabModeNotice(activeTab.id, 'mode_changed');
  }
  await clearTemporaryCompositeDomains();
  config.mode = 'study';
  await saveConfig(config);
  await updateDeclarativeRules(config);
  await applyModeTransitionSideEffects({
    fromMode,
    toMode: 'study',
    tabId: activeTab?.id ?? null,
    sendStudyNotice: false,
  });
  session.currentMode = 'study';
  await chrome.storage.local.set({ guardian_session: session });
  const reevaluatedTab = await reevaluateActiveTabAfterModeSwitch();
  const noticeTabId = activeTab?.id || reevaluatedTab?.id;
  if (noticeTabId) {
    await sendModeSwitchSuccessNotice(noticeTabId, 'study', fromMode, {
      noticeText: '已回到学习模式',
      displayDuration: 4000,
    });
  }
  return session;
}

async function switchToComposite(msg = {}) {
  const config = await getConfig();
  const session = await getSession();
  const fromMode = normalizeMode(session?.currentMode || config?.mode);
  const activeTab = await getActiveTabForModeNotice(msg?.noticeTabId ?? null);
  if (activeTab?.id) {
    await clearTabModeNotice(activeTab.id, 'mode_changed');
  }
  await clearTemporaryCompositeDomains();
  config.mode = 'composite';
  await saveConfig(config);
  await updateDeclarativeRules(config);
  await applyModeTransitionSideEffects({
    fromMode,
    toMode: 'composite',
    tabId: activeTab?.id ?? null,
  });
  session.currentMode = 'composite';
  await chrome.storage.local.set({ guardian_session: session });
  const reevaluatedTab = await reevaluateActiveTabAfterModeSwitch();
  const noticeTabId = activeTab?.id || reevaluatedTab?.id;
  if (noticeTabId) {
    await sendModeSwitchSuccessNotice(noticeTabId, 'composite', fromMode, {
      noticeText: '已进入综合模式',
      displayDuration: 4000,
    });
  }
  return session;
}

async function switchToRest(msg = {}) {
  const config = await getConfig();
  const session = await getSession();
  const fromMode = normalizeMode(session?.currentMode || config?.mode);
  const activeTab = await getActiveTabForModeNotice(msg?.noticeTabId ?? null);
  if (activeTab?.id) {
    await clearTabModeNotice(activeTab.id, 'mode_changed');
  }
  await clearTemporaryCompositeDomains();
  config.mode = 'rest';
  await saveConfig(config);
  await updateDeclarativeRules(config);
  session.currentMode = 'rest';
  await chrome.storage.local.set({ guardian_session: session });
  const reevaluatedTab = await reevaluateActiveTabAfterModeSwitch();
  const noticeTabId = activeTab?.id || reevaluatedTab?.id;
  if (noticeTabId) {
    await sendModeSwitchSuccessNotice(noticeTabId, 'rest', fromMode, {
      noticeText: '已进入休息模式',
      displayDuration: 4000,
    });
  }
  return session;
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
    const compositeUsedSeconds = Math.max(0, Number(statsWithCategories?.compositeSeconds ?? statsWithCategories?.undeterminedSeconds) || 0);
    const compositeLimitSeconds = Math.max(0, (config.dailyUndeterminedQuota ?? 60) * 60);
    compositeRemainingSeconds = Math.max(0, compositeLimitSeconds - compositeUsedSeconds);

    const effectiveRestLimitMinutes = (() => {
      const baseLimit = config.dailyRestQuota ?? 120;
      const borrow = config.quotaBorrow;
      if (!borrow || borrow.repaid) return baseLimit;
      const today = getDateKey();
      if (today === borrow.borrowedFrom) return baseLimit + borrow.amount;
      const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
      repayD.setDate(repayD.getDate() + 1);
      const repayStr = formatDate(repayD);
      if (today === repayStr) return Math.max(0, baseLimit - borrow.amount);
      return baseLimit;
    })();
    const restLimitSeconds = Math.max(0, effectiveRestLimitMinutes * 60);
    const restUsedSeconds = Math.max(0, Number(statsWithCategories?.restSeconds) || 0);
    restRemainingSeconds = Math.max(0, restLimitSeconds - restUsedSeconds);
  }

  return {
    mode,
    currentDomain: currentDomain || null,
    currentSessionDurationSeconds,
    compositeRemainingSeconds,
    restRemainingSeconds,
  };
}
