// product/interceptor.js — 拦截逻辑 + 提醒触发

import { getConfig, hasTemporaryCompositePermission, extractDomain, isSpecialUrl, getSiteClassificationRequestRecords } from '../infra/storage.js';
import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { getTodayStatsWithCategories } from './analytics.js';
import { getTodayEffectiveRestLimit } from './quota.js';
import { closeForbiddenPictureInPicture, shouldEnforcePictureInPicturePolicy } from '../core/pip-policy.js';
import { logClientEventBestEffort } from '../infra/client-logs.js';
import { normalizeMode } from './mode-service.js';

let modeBoundaryDrainHook = null;

// Pending success notices stored by tabId for reliable delivery after reload.
// TTL: 30 seconds — covers content script re-injection after page reload.
const pendingSuccessNoticesByTab = new Map();
const PENDING_NOTICE_TTL_MS = 30_000;
const TRANSIENT_NOTICE_DISPLAY_MS = 4_000;
const SUCCESS_NOTICE_SEND_RETRIES = 20;
const SUCCESS_NOTICE_RETRY_DELAY_MS = 100;
const SUCCESS_NOTICE_DEFERRED_RETRY_MS = 300;

function buildNoticeDeliveryResult(overrides = {}) {
  return {
    ok: false,
    sent: false,
    ack: null,
    rendered: false,
    error: null,
    tabId: null,
    type: null,
    payload: null,
    attempted: false,
    ...overrides,
  };
}

function evaluateModeNoticeAck(payload, ack) {
  if (ack === true) {
    return {
      ok: true,
      rendered: payload?.type !== 'AUTO_MODE_PENDING_CANCEL',
      error: null,
    };
  }
  if (!ack || typeof ack !== 'object') {
    return { ok: false, rendered: false, error: 'missing_notice_ack' };
  }
  if (ack.ok !== true) {
    return {
      ok: false,
      rendered: ack.rendered === true,
      error: ack.reason || ack.error || 'notice_ack_failed',
    };
  }
  if (payload?.type === 'AUTO_MODE_PENDING_CANCEL') {
    return { ok: true, rendered: ack.rendered === true, error: null };
  }
  if (ack.rendered !== true) {
    return {
      ok: false,
      rendered: false,
      error: ack.reason || 'notice_not_rendered',
    };
  }
  return { ok: true, rendered: true, error: null };
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

function isProgrammaticNoticeInjectionAllowed(url = '') {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function shouldAttemptContentScriptInjection(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('receiving end does not exist') ||
    message.includes('could not establish connection') ||
    message.includes('no receiving end');
}

async function ensureNoticeContentScript(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { ok: false, injected: false, error: 'invalid_tab_id' };
  }
  if (!chrome.scripting?.executeScript) {
    return { ok: false, injected: false, error: 'scripting_api_unavailable' };
  }
  let tab = null;
  try {
    tab = await chrome.tabs?.get?.(tabId);
  } catch (err) {
    return { ok: false, injected: false, error: err?.message || String(err) };
  }
  if (!isProgrammaticNoticeInjectionAllowed(tab?.url || '')) {
    return { ok: false, injected: false, error: 'notice_url_not_injectable' };
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
    return { ok: true, injected: true };
  } catch (err) {
    return { ok: false, injected: false, error: err?.message || String(err) };
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
  if (!snapshotDomain) {
    try {
      const tab = await chrome.tabs?.get?.(tabId);
      snapshotDomain = extractDomainFromTabUrl(tab?.url);
    } catch {
      snapshotDomain = null;
    }
  }
  const isSuccessNotice = payload?.type === 'AUTO_MODE_PENDING_SUCCESS';
  const isModeNotice = payload?.type === 'AUTO_MODE_PENDING_START' ||
    payload?.type === 'AUTO_MODE_PENDING_CANCEL' ||
    payload?.type === 'AUTO_MODE_PENDING_SUCCESS';
  const sendOptions = isModeNotice ? { frameId: 0 } : undefined;
  const maxAttempts = isSuccessNotice ? SUCCESS_NOTICE_SEND_RETRIES : 1;
  let lastError = null;
  let lastAck = null;
  let lastRendered = false;
  let messageWasSent = false;
  let injectionAttempted = false;
  let injectionResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const ack = await chrome.tabs.sendMessage(tabId, payload, sendOptions);
      messageWasSent = true;
      lastAck = ack ?? null;
      const ackResult = isModeNotice
        ? evaluateModeNoticeAck(payload, ack)
        : { ok: true, rendered: false, error: null };
      lastRendered = ackResult.rendered === true;
      if (!ackResult.ok) {
        lastError = new Error(ackResult.error || 'notice_ack_failed');
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, SUCCESS_NOTICE_RETRY_DELAY_MS));
          continue;
        }
        break;
      }
      // Store pending success notice for reliable re-delivery after reload
      if (isSuccessNotice && options.storePendingOnSuccess !== false) {
        const now = Date.now();
        pendingSuccessNoticesByTab.set(tabId, {
          payload: { ...payload },
          storedAt: now,
          expiresAt: Number(payload.expiresAt) || now + PENDING_NOTICE_TTL_MS,
          domainSnapshot: snapshotDomain,
        });
      }
      return {
        ...resultBase,
        ok: true,
        sent: true,
        ack: lastAck,
        rendered: lastRendered,
        error: null,
        attempted: true,
        injectionAttempted,
        injectionResult,
      };
    } catch (err) {
      lastError = err;
      if (!injectionAttempted && shouldAttemptContentScriptInjection(err)) {
        injectionAttempted = true;
        injectionResult = await ensureNoticeContentScript(tabId);
        if (injectionResult.ok === true && attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, SUCCESS_NOTICE_RETRY_DELAY_MS));
          continue;
        }
      }
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, SUCCESS_NOTICE_RETRY_DELAY_MS));
      }
    }
  }

  // Store pending notice after delivery failure so CONTENT_SCRIPT_READY can retry.
  if (isSuccessNotice && options.allowDeferredRetry !== false) {
    const now = Date.now();
    pendingSuccessNoticesByTab.set(tabId, {
      payload: { ...payload },
      storedAt: now,
      expiresAt: Number(payload.expiresAt) || now + PENDING_NOTICE_TTL_MS,
      domainSnapshot: snapshotDomain,
    });
    await new Promise(resolve => setTimeout(resolve, SUCCESS_NOTICE_DEFERRED_RETRY_MS));
    const resent = await reSendPendingNoticeDetailed(tabId, snapshotDomain);
    if (resent.ok) return resent;
    if (resent.attempted) {
      lastAck = resent.ack;
      lastRendered = resent.rendered;
      messageWasSent = messageWasSent || resent.sent;
      injectionAttempted = injectionAttempted || resent.injectionAttempted === true;
      injectionResult = resent.injectionResult || injectionResult;
      lastError = new Error(resent.error || 'notice_resend_failed');
    }
  }
  if (fallbackMessage) notifyRuntimeModeSwitch(fallbackMessage);
  if (lastError) {
    console.warn('[ModeNotice] page notice delivery failed:', lastError?.message || lastError);
    logClientEventBestEffort({
      level: 'warning',
      category: 'content',
      eventCode: 'page_notice_delivery_failed',
      module: 'product/interceptor',
      message: 'Page notice delivery failed; system notification fallback used',
      domain: snapshotDomain,
      details: { tabId, type: payload?.type || null, error: lastError?.message || String(lastError) },
    });
  }
  return {
    ...resultBase,
    ok: false,
    sent: messageWasSent,
    ack: lastAck,
    rendered: lastRendered,
    error: lastError?.message || 'notice_send_failed',
    attempted: true,
    injectionAttempted,
    injectionResult,
  };
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
    pendingSuccessNoticesByTab.delete(tabId);
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
    pendingSuccessNoticesByTab.delete(tabId);
    return { ...resultBase, error: 'pending_notice_domain_missing', payload: stored.payload || null };
  }
  if (normalizedCurrentDomain !== normalizedStoredDomain) {
    pendingSuccessNoticesByTab.delete(tabId);
    return { ...resultBase, error: 'pending_notice_domain_mismatch', payload: stored.payload || null };
  }
  const delivery = await sendTabPendingMessageDetailed(tabId, stored.payload, null, {
    storePendingOnSuccess: false,
    allowDeferredRetry: false,
  });
  if (delivery.ok) {
    pendingSuccessNoticesByTab.delete(tabId);
  }
  return delivery;
}

export async function reSendPendingNotice(tabId, currentDomain = null) {
  return (await reSendPendingNoticeDetailed(tabId, currentDomain)).ok;
}

/**
 * Clear pending notice for a tab (called when transition is cancelled or completed).
 */
export function clearPendingNotice(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  pendingSuccessNoticesByTab.delete(tabId);
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
  const out = { pipCloseAttempted: false, pipCloseSent: false, studyNoticeSent: false };
  const shouldClosePip = typeof shouldEnforcePictureInPicturePolicy === 'function'
    ? shouldEnforcePictureInPicturePolicy()
    : true;

  if (shouldClosePip) {
    out.pipCloseAttempted = true;
    const cleanup = typeof closeForbiddenPictureInPicture === 'function'
      ? await closeForbiddenPictureInPicture({
        preferredTabId: Number.isInteger(tabId) ? tabId : null,
        reason: 'mode_transition_pip_policy',
      })
      : { ok: false, handled: false, attempted: false };
    out.pipCloseSent = cleanup.ok === true || cleanup.handled === true;
    out.pipCloseResult = cleanup;
  }

  if (sendStudyNotice && normalizedTo === 'study' && Number.isInteger(tabId) && tabId >= 0) {
    if (shouldClosePip) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
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
  const limit = Math.max(0, Number(config?.dailyUndeterminedQuota ?? 60) * 60);
  return Math.max(0, limit - used);
}

async function computeStudyRemainingSeconds(config) {
  const quotaMinutes = Number(config?.dailyStudyQuota ?? 0);
  if (!Number.isFinite(quotaMinutes) || quotaMinutes <= 0) return null;
  const stats = await getTodayStatsWithCategories(config);
  const used = Math.max(0, Number(stats?.studySeconds) || 0);
  return Math.max(0, quotaMinutes * 60 - used);
}

async function computeRestRemainingSeconds(config) {
  const stats = await getTodayStatsWithCategories(config);
  const used = Math.max(0, Number(stats?.restSeconds) || 0);
  const limit = Math.max(0, getTodayEffectiveRestLimit(config) * 60);
  return Math.max(0, limit - used);
}

function formatStudyRemainingTime(seconds) {
  return seconds === null ? '不限' : formatSecondsCompact(seconds);
}

async function sendCompositeExhaustedToRestNotice(tabId, domain, fromMode, remainingRestSeconds) {
  const remainingRestTime = formatSecondsCompact(remainingRestSeconds);
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
  const remainingCompositeTime = formatSecondsCompact(remainingCompositeSeconds);
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
    const remainingCompositeTime = formatSecondsCompact(remainingCompositeSeconds);
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
    const remainingRestTime = formatSecondsCompact(remainingRestSeconds);
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
// contains Chrome UI effects such as notices, Reminder redirects, PiP cleanup,
// and declarative unsafe rules.

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
