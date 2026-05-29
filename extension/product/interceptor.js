// product/interceptor.js — 拦截逻辑 + 提醒触发

import { getConfig, hasTemporaryCompositePermission, extractDomain, isSpecialUrl, getSiteClassificationRequestRecords } from '../infra/storage.js';
import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { getTodayStatsWithCategories } from './analytics.js';
import { getTodayEffectiveRestLimit } from './quota.js';
import { getEffectiveQuotaForDate } from '../core/quota-config.js';
import { logFallbackEventBestEffort } from '../infra/client-logs.js';
import { normalizeMode } from './mode-service.js';

let modeBoundaryDrainHook = null;

// Pending success notices stored by tabId for reliable delivery after content.js
// announces that its top-frame listener is ready.
const pendingSuccessNoticesByTab = new Map();
const contentReadyByTab = new Map();
const PENDING_NOTICE_TTL_MS = 30_000;
const TRANSIENT_NOTICE_DISPLAY_MS = 4_000;
const CONTENT_READY_TTL_MS = 10 * 60_000;
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};

function buildNoticeDeliveryResult(overrides = {}) {
  return {
    ok: false,
    sent: false,
    ack: null,
    rendered: false,
    visible: false,
    error: null,
    tabId: null,
    type: null,
    payload: null,
    attempted: false,
    deferred: false,
    ...overrides,
  };
}

function evaluateModeNoticeAck(payload, ack) {
  if (ack === true) {
    return {
      ok: true,
      rendered: payload?.type !== 'AUTO_MODE_PENDING_CANCEL',
      visible: payload?.type === 'AUTO_MODE_PENDING_SUCCESS',
      error: null,
    };
  }
  if (!ack || typeof ack !== 'object') {
    return { ok: false, rendered: false, visible: false, error: 'missing_notice_ack' };
  }
  const retryableReasons = new Set([
    'document_not_visible',
    'notice_host_unavailable',
    'notice_banner_unavailable',
    'notice_not_visible',
  ]);
  if (ack.ok !== true) {
    const error = ack.reason || ack.error || 'notice_ack_failed';
    return {
      ok: false,
      rendered: ack.rendered === true,
      visible: ack.visible === true,
      error,
      retryable: payload?.type === 'AUTO_MODE_PENDING_SUCCESS' && retryableReasons.has(error),
    };
  }
  if (payload?.type === 'AUTO_MODE_PENDING_CANCEL') {
    return { ok: true, rendered: ack.rendered === true, visible: false, error: null };
  }
  if (ack.rendered !== true) {
    const error = ack.reason || 'notice_not_rendered';
    return {
      ok: false,
      rendered: false,
      visible: ack.visible === true,
      error,
      retryable: payload?.type === 'AUTO_MODE_PENDING_SUCCESS' && retryableReasons.has(error),
    };
  }
  if (payload?.type === 'AUTO_MODE_PENDING_SUCCESS' && ack.visible !== true) {
    return {
      ok: false,
      rendered: true,
      visible: false,
      error: ack.reason || 'notice_not_visible',
      retryable: true,
    };
  }
  return { ok: true, rendered: true, visible: ack.visible === true, error: null };
}

function normalizeDomainForNotice(domain) {
  if (typeof domain !== 'string') return null;
  const value = domain.trim().toLowerCase().replace(/\.+$/g, '');
  if (!value) return null;
  return value.startsWith('www.') ? value.slice(4) : value;
}

function extractDomainFromTabUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const hostname = new URL(url).hostname || '';
    return normalizeDomainForNotice(hostname);
  } catch {
    return null;
  }
}

function isStaticContentScriptNoticeUrl(url = '') {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function isMissingContentListenerError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('receiving end does not exist') ||
    message.includes('could not establish connection') ||
    message.includes('no receiving end');
}

function storePendingSuccessNotice(tabId, payload, domainSnapshot, fallbackMessage = null) {
  const now = Date.now();
  const expiresAt = Number(payload?.expiresAt) || now + PENDING_NOTICE_TTL_MS;
  pendingSuccessNoticesByTab.set(tabId, {
    payload: { ...payload, expiresAt },
    fallbackMessage,
    storedAt: now,
    expiresAt,
    domainSnapshot,
    expiryTimer: schedulePendingNoticeExpiryFallback(tabId, expiresAt),
  });
}

function isContentReadyForTab(tabId, domain = null) {
  const ready = contentReadyByTab.get(tabId);
  if (!ready) return false;
  if (Date.now() > ready.expiresAt) {
    contentReadyByTab.delete(tabId);
    return false;
  }
  const normalizedReadyDomain = normalizeDomainForNotice(ready.domain);
  const normalizedDomain = normalizeDomainForNotice(domain);
  return !!normalizedReadyDomain && !!normalizedDomain && normalizedReadyDomain === normalizedDomain;
}

function markPendingDeliveredForCurrentReady(tabId) {
  const stored = pendingSuccessNoticesByTab.get(tabId);
  const ready = contentReadyByTab.get(tabId);
  if (!stored || !ready) return;
  stored.lastDeliveredReadyAt = ready.readyAt || Date.now();
}

function schedulePendingNoticeExpiryFallback(tabId, expiresAt) {
  const delayMs = Math.max(0, Number(expiresAt) - Date.now() + 5);
  if (!Number.isFinite(delayMs)) return null;
  return setTimeout(() => {
    const stored = pendingSuccessNoticesByTab.get(tabId);
    if (!stored || Date.now() <= stored.expiresAt) return;
    pendingSuccessNoticesByTab.delete(tabId);
    if (stored.fallbackMessage) notifyRuntimeModeSwitch(stored.fallbackMessage);
    recordFallbackLog({
      level: 'warning',
      category: 'content',
      eventCode: 'page_notice_delivery_failed',
      module: 'product/interceptor',
      reason: 'content_ready_timeout',
      message: 'Page notice delivery timed out waiting for content script readiness',
      domain: stored.domainSnapshot || null,
      details: { tabId, type: stored.payload?.type || null, error: 'content_ready_timeout' },
    });
  }, delayMs);
}

function clearPendingSuccessNotice(tabId) {
  const stored = pendingSuccessNoticesByTab.get(tabId);
  if (stored?.expiryTimer) {
    clearTimeout(stored.expiryTimer);
  }
  pendingSuccessNoticesByTab.delete(tabId);
}

export function markContentScriptReady(tabId, currentDomain = null) {
  if (!Number.isInteger(tabId) || tabId < 0) return { ok: false, error: 'invalid_tab_id' };
  const normalizedDomain = normalizeDomainForNotice(currentDomain);
  if (!normalizedDomain) return { ok: false, error: 'ready_domain_missing' };
  const now = Date.now();
  contentReadyByTab.set(tabId, {
    tabId,
    domain: normalizedDomain,
    readyAt: now,
    expiresAt: now + CONTENT_READY_TTL_MS,
  });
  return { ok: true, tabId, domain: normalizedDomain };
}

export function clearModeNoticeTabState(tabId, reason = 'tab_state_changed') {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  clearPendingSuccessNotice(tabId);
  contentReadyByTab.delete(tabId);
}

export function clearModeNoticeTabNavigationState(tabId, nextDomain = null) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  clearPendingSuccessNotice(tabId);
  const ready = contentReadyByTab.get(tabId);
  if (!ready) return;
  const normalizedNextDomain = normalizeDomainForNotice(nextDomain);
  const normalizedReadyDomain = normalizeDomainForNotice(ready.domain);
  if (!normalizedNextDomain || !normalizedReadyDomain || normalizedNextDomain !== normalizedReadyDomain) {
    contentReadyByTab.delete(tabId);
  }
}

// ── Schedule check ──────────────────────────────────────────────────────────────

export function isWithinSchedule(schedule) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const dayConfig = schedule.days[dayOfWeek];

  if (!dayConfig || !dayConfig.enabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = dayConfig.start.split(':').map(Number);
  const [endH, endM] = dayConfig.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function setModeBoundaryDrainHook(fn) {
  modeBoundaryDrainHook = typeof fn === 'function' ? fn : null;
}

async function drainQueuedModeBoundary(reason) {
  if (!modeBoundaryDrainHook) return { ok: true, skipped: true, reason: 'mode_boundary_drain_hook_missing' };
  try {
    return await modeBoundaryDrainHook(reason);
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function notifyRuntimeModeSwitch(message) {
  try {
    chrome.notifications?.create?.({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'TimeOnChrome',
      message,
    });
  } catch {}
}

function formatSecondsCompact(seconds) {
  const secs = Math.max(0, Math.floor(Number(seconds) || 0));
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

async function sendTabPendingMessageDetailed(tabId, payload, fallbackMessage = null, options = {}) {
  const resultBase = buildNoticeDeliveryResult({
    tabId,
    type: payload?.type || null,
    payload: payload ? { ...payload } : null,
  });
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { ...resultBase, error: 'invalid_tab_id' };
  }
  const snapshotDomainFromPayload = normalizeDomainForNotice(payload?.domain);
  let snapshotDomain = snapshotDomainFromPayload;
  let tabUrl = null;
  if (!snapshotDomain) {
    try {
      const tab = await chrome.tabs?.get?.(tabId);
      tabUrl = tab?.url || null;
      snapshotDomain = extractDomainFromTabUrl(tab?.url);
    } catch {
      snapshotDomain = null;
    }
  } else {
    try {
      const tab = await chrome.tabs?.get?.(tabId);
      tabUrl = tab?.url || null;
    } catch {}
  }
  const isSuccessNotice = payload?.type === 'AUTO_MODE_PENDING_SUCCESS';
  const isModeNotice = payload?.type === 'AUTO_MODE_PENDING_START' ||
    payload?.type === 'AUTO_MODE_PENDING_CANCEL' ||
    payload?.type === 'AUTO_MODE_PENDING_SUCCESS';
  const sendOptions = isModeNotice ? { frameId: 0 } : undefined;
  if (isSuccessNotice && options.storePendingOnSuccess !== false) {
    storePendingSuccessNotice(tabId, payload, snapshotDomain, fallbackMessage);
  }
  if (isSuccessNotice && tabUrl && !isStaticContentScriptNoticeUrl(tabUrl)) {
    clearPendingSuccessNotice(tabId);
    if (fallbackMessage) notifyRuntimeModeSwitch(fallbackMessage);
    recordFallbackLog({
      level: 'warning',
      category: 'content',
      eventCode: 'page_notice_delivery_failed',
      module: 'product/interceptor',
      reason: 'notice_url_not_injectable',
      message: 'Page notice target URL cannot run the static content script; system notification fallback used',
      domain: snapshotDomain,
      details: { tabId, type: payload?.type || null, error: 'notice_url_not_injectable' },
    });
    return {
      ...resultBase,
      ok: false,
      sent: false,
      ack: null,
      rendered: false,
      error: 'notice_url_not_injectable',
      attempted: false,
    };
  }
  // A missing ready marker is not proof that the static content script listener
  // is unavailable. Try the message once; if the listener is genuinely missing
  // or the page is not visible, the existing pending notice path keeps it for
  // the next ready/focus retry.
  try {
    const ack = await chrome.tabs.sendMessage(tabId, payload, sendOptions);
    const ackResult = isModeNotice
      ? evaluateModeNoticeAck(payload, ack)
      : { ok: true, rendered: false, error: null };
    if (!ackResult.ok) {
      if (isSuccessNotice) {
        if (ackResult.retryable === true) {
          return {
            ...resultBase,
            ok: false,
            sent: true,
            ack: ack ?? null,
            rendered: ackResult.rendered === true,
            visible: ackResult.visible === true,
            error: ackResult.error || 'notice_not_visible',
            attempted: true,
            deferred: true,
          };
        }
        clearPendingSuccessNotice(tabId);
        if (fallbackMessage) notifyRuntimeModeSwitch(fallbackMessage);
        recordFallbackLog({
          level: 'warning',
          category: 'content',
          eventCode: 'page_notice_delivery_failed',
          module: 'product/interceptor',
          reason: ackResult.error || 'notice_ack_failed',
          message: 'Page notice delivery acknowledged without rendering; system notification fallback used',
          domain: snapshotDomain,
          details: { tabId, type: payload?.type || null, error: ackResult.error || 'notice_ack_failed' },
        });
      } else if (fallbackMessage) {
        notifyRuntimeModeSwitch(fallbackMessage);
      }
      return {
        ...resultBase,
        ok: false,
        sent: true,
        ack: ack ?? null,
        rendered: ackResult.rendered === true,
        visible: ackResult.visible === true,
        error: ackResult.error || 'notice_ack_failed',
        attempted: true,
      };
    }
    if (isSuccessNotice) {
      markPendingDeliveredForCurrentReady(tabId);
      clearPendingSuccessNotice(tabId);
    }
    return {
      ...resultBase,
      ok: true,
      sent: true,
      ack: ack ?? null,
      rendered: ackResult.rendered === true,
      visible: ackResult.visible === true,
      error: null,
      attempted: true,
    };
  } catch (err) {
    if (isSuccessNotice && options.allowDeferredRetry !== false && isMissingContentListenerError(err)) {
      contentReadyByTab.delete(tabId);
      return {
        ...resultBase,
        ok: false,
        sent: false,
        ack: null,
        rendered: false,
        visible: false,
        error: 'content_not_ready',
        attempted: true,
        deferred: true,
      };
    }
    if (isSuccessNotice) clearPendingSuccessNotice(tabId);
    if (fallbackMessage) notifyRuntimeModeSwitch(fallbackMessage);
    console.warn('[ModeNotice] page notice delivery failed:', err?.message || err);
    recordFallbackLog({
      level: 'warning',
      category: 'content',
      eventCode: 'page_notice_delivery_failed',
      module: 'product/interceptor',
      reason: err?.message || 'notice_send_failed',
      message: 'Page notice delivery failed; system notification fallback used',
      domain: snapshotDomain,
      details: { tabId, type: payload?.type || null, error: err?.message || String(err) },
    });
    return {
      ...resultBase,
      ok: false,
      sent: false,
      ack: null,
      rendered: false,
      visible: false,
      error: err?.message || 'notice_send_failed',
      attempted: true,
    };
  }
}

async function sendTabPendingMessage(tabId, payload, fallbackMessage = null) {
  return (await sendTabPendingMessageDetailed(tabId, payload, fallbackMessage)).ok;
}

/**
 * Re-send pending success notice to a tab that just became ready.
 * Returns true if a notice was found and re-sent successfully.
 */
export async function reSendPendingNoticeDetailed(tabId, currentDomain = null) {
  const resultBase = buildNoticeDeliveryResult({ tabId, type: 'AUTO_MODE_PENDING_SUCCESS' });
  if (!Number.isInteger(tabId) || tabId < 0) return { ...resultBase, error: 'invalid_tab_id' };
  const stored = pendingSuccessNoticesByTab.get(tabId);
  if (!stored) return { ...resultBase, error: 'pending_notice_missing' };
  // Check TTL
  if (Date.now() > (stored.expiresAt || stored.storedAt + PENDING_NOTICE_TTL_MS)) {
    clearPendingSuccessNotice(tabId);
    recordFallbackLog({
      level: 'warning',
      category: 'content',
      eventCode: 'pending_notice_fallback_dropped',
      module: 'product/interceptor',
      reason: 'pending_notice_expired',
      message: 'Pending page notice expired before it could be delivered',
      domain: stored.domainSnapshot || null,
      details: { tabId, type: stored.payload?.type || null },
    });
    return { ...resultBase, error: 'pending_notice_expired', payload: stored.payload || null };
  }
  const normalizedCurrentDomain = normalizeDomainForNotice(currentDomain);
  const normalizedStoredDomain = normalizeDomainForNotice(stored.domainSnapshot);
  // Tight domain guard:
  // - both missing: do not resend
  // - one missing: do not resend
  // - both present but mismatch: do not resend
  // - only both present and equal may resend
  if (!normalizedCurrentDomain || !normalizedStoredDomain) {
    clearPendingSuccessNotice(tabId);
    recordFallbackLog({
      level: 'warning',
      category: 'content',
      eventCode: 'pending_notice_fallback_dropped',
      module: 'product/interceptor',
      reason: 'pending_notice_domain_missing',
      message: 'Pending page notice dropped because the delivery domain was unavailable',
      domain: normalizedStoredDomain || normalizedCurrentDomain || null,
      details: { tabId, type: stored.payload?.type || null },
    });
    return { ...resultBase, error: 'pending_notice_domain_missing', payload: stored.payload || null };
  }
  if (normalizedCurrentDomain !== normalizedStoredDomain) {
    clearPendingSuccessNotice(tabId);
    recordFallbackLog({
      level: 'warning',
      category: 'content',
      eventCode: 'pending_notice_fallback_dropped',
      module: 'product/interceptor',
      reason: 'pending_notice_domain_mismatch',
      message: 'Pending page notice dropped because the active domain changed',
      domain: normalizedStoredDomain,
      details: { tabId, currentDomain: normalizedCurrentDomain, expectedDomain: normalizedStoredDomain, type: stored.payload?.type || null },
    });
    return { ...resultBase, error: 'pending_notice_domain_mismatch', payload: stored.payload || null };
  }
  const ready = contentReadyByTab.get(tabId);
  if (ready?.readyAt && stored.lastDeliveredReadyAt === ready.readyAt) {
    clearPendingSuccessNotice(tabId);
    return {
      ...resultBase,
      error: 'pending_notice_already_delivered_to_ready_document',
      payload: stored.payload || null,
    };
  }
  const delivery = await sendTabPendingMessageDetailed(tabId, stored.payload, null, {
    storePendingOnSuccess: false,
    allowDeferredRetry: false,
    requireReady: false,
  });
  return delivery;
}

export async function reSendPendingNotice(tabId, currentDomain = null) {
  return (await reSendPendingNoticeDetailed(tabId, currentDomain)).ok;
}

export async function deliverPendingNoticeForFocusedTab(tabId, source = 'foreground_activation') {
  const resultBase = buildNoticeDeliveryResult({ tabId, type: 'AUTO_MODE_PENDING_SUCCESS' });
  if (!Number.isInteger(tabId) || tabId < 0) return { ...resultBase, error: 'invalid_tab_id', source };
  if (!pendingSuccessNoticesByTab.has(tabId)) return { ...resultBase, error: 'pending_notice_missing', source };
  let tab = null;
  try {
    tab = await chrome.tabs?.get?.(tabId);
  } catch (err) {
    return { ...resultBase, error: err?.message || 'tab_lookup_failed', source };
  }
  const currentDomain = extractDomainFromTabUrl(tab?.url);
  const delivery = await reSendPendingNoticeDetailed(tabId, currentDomain);
  return { ...delivery, source, domain: currentDomain || null };
}

/**
 * Clear pending notice for a tab (called when transition is cancelled or completed).
 */
export function clearPendingNotice(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  clearPendingSuccessNotice(tabId);
}

function modeLabel(mode) {
  if (mode === 'composite') return '综合';
  if (mode === 'rest') return '休息';
  return '学习';
}

export async function clearTabModeNotice(tabId, reason = 'mode_changed') {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  clearPendingNotice(tabId);
  return await sendTabPendingMessage(tabId, { type: 'AUTO_MODE_PENDING_CANCEL', reason });
}

export async function sendModeSwitchSuccessNotice(tabId, targetMode, fromMode = null, options = {}) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  const normalizedTarget = normalizeMode(targetMode);
  const displayDuration = Number(options.displayDuration) || TRANSIENT_NOTICE_DISPLAY_MS;
  const now = Date.now();
  const noticeText = options.noticeText || `已切换到${modeLabel(normalizedTarget)}模式`;
  const payload = {
    type: 'AUTO_MODE_PENDING_SUCCESS',
    noticeKind: 'transient_success',
    targetMode: normalizedTarget,
    fromMode: fromMode ? normalizeMode(fromMode) : null,
    displayDuration,
    expiresAt: now + PENDING_NOTICE_TTL_MS,
    noticeText,
  };
  if (options.domain) payload.domain = options.domain;
  return await sendTabPendingMessage(tabId, payload, noticeText);
}

export async function applyModeTransitionSideEffects({
  fromMode,
  toMode,
  tabId = null,
  domain = null,
  studyNoticeText = null,
  sendStudyNotice = true,
} = {}) {
  const normalizedFrom = normalizeMode(fromMode);
  const normalizedTo = normalizeMode(toMode);
  const out = { studyNoticeSent: false };

  if (sendStudyNotice && normalizedTo === 'study' && Number.isInteger(tabId) && tabId >= 0) {
    out.studyNoticeSent = await sendModeSwitchSuccessNotice(tabId, 'study', normalizedFrom, {
      domain,
      noticeText: studyNoticeText || '你正在打开学习网站 · 即将进入学习模式 · 今日剩余 不限',
      displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
    });
  }

  return out;
}

async function computeCompositeRemainingSeconds(config) {
  const stats = await getTodayStatsWithCategories(config);
  const used = Math.max(0, Number(stats?.undeterminedSeconds) || 0);
  const limitMinutes = getEffectiveQuotaForDate(config).todayEffectiveQuota.compositeMinutes;
  if (limitMinutes === null || limitMinutes === undefined) return null;
  const limit = Math.max(0, Number(limitMinutes) * 60);
  return Math.max(0, limit - used);
}

async function computeStudyRemainingSeconds(config) {
  const quotaMinutes = getEffectiveQuotaForDate(config).todayEffectiveQuota.studyMinutes;
  if (quotaMinutes === null || quotaMinutes === undefined) return null;
  const stats = await getTodayStatsWithCategories(config);
  const used = Math.max(0, Number(stats?.studySeconds) || 0);
  return Math.max(0, Number(quotaMinutes) * 60 - used);
}

async function computeRestRemainingSeconds(config) {
  const stats = await getTodayStatsWithCategories(config);
  const used = Math.max(0, Number(stats?.restSeconds) || 0);
  const restMinutes = getTodayEffectiveRestLimit(config);
  if (restMinutes === null || restMinutes === undefined) return null;
  const limit = Math.max(0, Number(restMinutes) * 60);
  return Math.max(0, limit - used);
}

function formatStudyRemainingTime(seconds) {
  return seconds === null ? '不限' : formatSecondsCompact(seconds);
}

async function sendCompositeExhaustedToRestNotice(tabId, domain, fromMode, remainingRestSeconds) {
  const remainingRestTime = remainingRestSeconds === null ? '不限' : formatSecondsCompact(remainingRestSeconds);
  const noticeText = `你正在打开综合/待归类网站 · 当前综合时间配额已用完 · 已默认进入休息模式 · 今日休息剩余 ${remainingRestTime}`;
  return await sendTabPendingMessage(tabId, {
    type: 'AUTO_MODE_PENDING_SUCCESS',
    noticeKind: 'transient_success',
    targetMode: 'rest',
    fromMode,
    domain,
    remainingRestSeconds,
    remainingRestTime,
    displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
    noticeText,
  }, noticeText);
}

async function sendModeGraceToRestNotice(tabId, domain, fromMode) {
  const noticeText = `刚进入${modeLabel(fromMode)}时间 · 已临时回到休息时间`;
  return await sendTabPendingMessage(tabId, {
    type: 'AUTO_MODE_PENDING_SUCCESS',
    noticeKind: 'transient_success',
    targetMode: 'rest',
    fromMode,
    domain,
    displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
    noticeText,
  }, noticeText);
}

async function sendCompositeEntryNotice(tabId, domain, fromMode, config) {
  const remainingCompositeSeconds = await computeCompositeRemainingSeconds(config);
  const remainingCompositeTime = remainingCompositeSeconds === null ? '不限' : formatSecondsCompact(remainingCompositeSeconds);
  const noticeText = `你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 ${remainingCompositeTime}`;
  return await sendTabPendingMessage(tabId, {
    type: 'AUTO_MODE_PENDING_SUCCESS',
    noticeKind: 'transient_success',
    targetMode: 'composite',
    fromMode,
    domain,
    remainingCompositeSeconds,
    remainingCompositeTime,
    displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
    noticeText,
  }, noticeText);
}

async function continueCompositeExhaustedAsRest(tabId, domain, currentMode, config) {
  const remainingRestSeconds = await computeRestRemainingSeconds(config);
  await sendCompositeExhaustedToRestNotice(tabId, domain, currentMode, remainingRestSeconds);
}

export async function sendNoticeForDecision(decision, { tabId, domain, fromMode, config } = {}) {
  if (decision?.notice && typeof decision.notice === 'object') {
    const notice = decision.notice;
    const targetMode = normalizeMode(notice.targetMode || 'study');
    const noticeText = notice.text || `已切换到${modeLabel(targetMode)}模式`;
    return await sendTabPendingMessageDetailed(tabId, {
      type: 'AUTO_MODE_PENDING_SUCCESS',
      noticeKind: notice.kind || 'transient_success',
      targetMode,
      fromMode: notice.fromMode ? normalizeMode(notice.fromMode) : (fromMode ? normalizeMode(fromMode) : null),
      domain: notice.domain || domain,
      displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
      noticeText,
      remainingCompositeSeconds: notice.remainingCompositeSeconds,
      remainingCompositeTime: notice.remainingCompositeTime,
      remainingStudySeconds: notice.remainingStudySeconds,
      remainingStudyTime: notice.remainingStudyTime,
      remainingRestSeconds: notice.remainingRestSeconds,
      remainingRestTime: notice.remainingRestTime,
    }, noticeText);
  }
  if (decision.notice === 'study_to_composite' || decision.notice === 'rest_to_composite_success') {
    const remainingCompositeSeconds = await computeCompositeRemainingSeconds(config);
    const remainingCompositeTime = remainingCompositeSeconds === null ? '不限' : formatSecondsCompact(remainingCompositeSeconds);
    const noticeText = `你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 ${remainingCompositeTime}`;
    return await sendTabPendingMessageDetailed(tabId, {
      type: 'AUTO_MODE_PENDING_SUCCESS',
      noticeKind: 'transient_success',
      targetMode: 'composite',
      fromMode,
      domain,
      remainingCompositeSeconds,
      remainingCompositeTime,
      displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
      noticeText,
    }, noticeText);
  }
  if (decision.notice === 'composite_to_study' || decision.notice === 'rest_to_study_success') {
    const remainingStudySeconds = await computeStudyRemainingSeconds(config);
    const remainingStudyTime = formatStudyRemainingTime(remainingStudySeconds);
    const noticeText = `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 ${remainingStudyTime}`;
    return await sendTabPendingMessageDetailed(tabId, {
      type: 'AUTO_MODE_PENDING_SUCCESS',
      noticeKind: 'transient_success',
      targetMode: 'study',
      fromMode: fromMode ? normalizeMode(fromMode) : null,
      domain,
      displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
      remainingStudySeconds,
      remainingStudyTime,
      noticeText,
      expiresAt: Date.now() + PENDING_NOTICE_TTL_MS,
    }, noticeText);
  }
  if (decision.notice === 'composite_exhausted_to_rest') {
    const remainingRestSeconds = await computeRestRemainingSeconds(config);
    const remainingRestTime = remainingRestSeconds === null ? '不限' : formatSecondsCompact(remainingRestSeconds);
    const noticeText = `你正在打开综合/待归类网站 · 当前综合时间配额已用完 · 已默认进入休息模式 · 今日休息剩余 ${remainingRestTime}`;
    return await sendTabPendingMessageDetailed(tabId, {
      type: 'AUTO_MODE_PENDING_SUCCESS',
      noticeKind: 'transient_success',
      targetMode: 'rest',
      fromMode,
      domain,
      remainingRestSeconds,
      remainingRestTime,
      displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
      noticeText,
    }, noticeText);
  }
  if (decision.notice === 'mode_grace_to_rest') {
    const noticeText = `刚进入${modeLabel(fromMode)}时间 · 已临时回到休息时间`;
    return await sendTabPendingMessageDetailed(tabId, {
      type: 'AUTO_MODE_PENDING_SUCCESS',
      noticeKind: 'transient_success',
      targetMode: 'rest',
      fromMode,
      domain,
      displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
      noticeText,
    }, noticeText);
  }
  return buildNoticeDeliveryResult({ tabId, error: 'unknown_notice_kind' });
}

// Mode access decisions are owned by product/mode-service.js. This module only
// contains Chrome UI effects such as notices, Reminder redirects, and
// declarative unsafe rules. PiP policy is enforced by media timing.

function sanitizeReminderTargetUrl(value) {
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

export async function redirectToReminder(tabId, domain, reason, message, extraParams = null) {
  const queryParts = [
    `reason=${encodeURIComponent(reason || '')}`,
    `domain=${encodeURIComponent(domain || '')}`,
    `msg=${encodeURIComponent(message || '')}`,
  ];
  if (Number.isInteger(tabId) && tabId >= 0) {
    queryParts.push(`sourceTabId=${encodeURIComponent(String(tabId))}`);
  }
  if (extraParams && typeof extraParams === 'object') {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v === undefined || v === null || v === '') continue;
      if (k === 'targetUrl') {
        const targetUrl = sanitizeReminderTargetUrl(v);
        if (!targetUrl) continue;
        queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(targetUrl)}`);
        continue;
      }
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  const reminderUrl = `${chrome.runtime.getURL('reminder.html')}?${queryParts.join('&')}`;
  console.log('[redirectToReminder]', reason, domain);
  chrome.tabs.update(tabId, { url: reminderUrl }).catch(() => {});
}

// ── Declarative rules (unsafeList) ──────────────────────────────────────────────

export async function updateDeclarativeRules(config, monitoringEnabled) {
  const cfg = config || await getConfig();
  let monitor = monitoringEnabled;
  if (monitor === undefined || monitor === null) {
    const storage = await chrome.storage.local.get('cloud_monitoring_enabled');
    monitor = storage.cloud_monitoring_enabled ?? 1;
  }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  if (removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
  }

  if (monitor === 0) return;

  const unsafeList = (cfg.unsafeList?.length ? cfg.unsafeList : null) || cfg.blacklist || [];
  if (unsafeList.length > 0) {
    const rules = [];
    let ruleId = 1000;

    for (const domain of unsafeList) {
      if (!domain) continue;
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: `/reminder.html?reason=unsafe&domain=${encodeURIComponent(domain)}`
          }
        },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ['main_frame']
        }
      });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  }
}
