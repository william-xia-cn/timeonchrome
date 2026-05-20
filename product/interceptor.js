// product/interceptor.js — 拦截逻辑 + 提醒触发

import { getConfig, getSession, saveSession, hasTemporaryCompositePermission, extractDomain, isSpecialUrl, getSiteClassificationRequestRecords } from '../infra/storage.js';
import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { getTodayStatsWithCategories } from './analytics.js';
import { enqueueModeBoundaryIntent } from '../core/mode-boundary-intents.js';
import { closeForbiddenPictureInPicture, shouldEnforcePictureInPicturePolicy } from '../core/pip-policy.js';
import { setCachedEffectiveMode } from '../runtime/session.js';

const AUTO_TRANSITION_GATES = {
  rest_to_composite: 30_000,
  rest_to_study: 45_000,
};

const autoTransitionCandidates = new Map();
const autoModePendingByTab = new Map();
const STUDY_PENDING_RULES = new Set(['rest_to_study']);
let modeBoundaryDrainHook = null;

// Pending success notices stored by tabId for reliable delivery after reload.
// TTL: 30 seconds — covers content script re-injection after page reload.
const pendingSuccessNoticesByTab = new Map();
const PENDING_NOTICE_TTL_MS = 30_000;
const TRANSIENT_NOTICE_DISPLAY_MS = 4_000;
const SUCCESS_NOTICE_SEND_RETRIES = 20;
const SUCCESS_NOTICE_RETRY_DELAY_MS = 100;
const SUCCESS_NOTICE_DEFERRED_RETRY_MS = 300;

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

function normalizeMode(mode) {
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  if (mode === 'study' || mode === 'composite' || mode === 'rest' || mode === 'paused') return mode;
  return 'study';
}

async function getEffectiveRuntimeMode(config, monitoringEnabled) {
  if (monitoringEnabled === 0) return 'paused';
  const session = await getSession();
  const sessionMode = normalizeMode(session?.currentMode);
  if (sessionMode && sessionMode !== 'paused') return sessionMode;
  return normalizeMode(config?.mode);
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

async function setRuntimeMode(nextMode, options = {}) {
  const normalized = normalizeMode(nextMode);
  if (normalized === 'paused') return;
  const session = await getSession();
  const fromMode = normalizeMode(session?.currentMode);
  if (fromMode === normalized) return;
  await saveSession({
    ...(session || {}),
    currentMode: normalized,
    ...(Number.isFinite(options.effectiveAtMs) ? { modeEffectiveAtMs: options.effectiveAtMs } : {}),
  });
  setCachedEffectiveMode(normalized);
  if (Number.isFinite(options.effectiveAtMs)) {
    const boundaryReason = options.reason || 'auto_mode_effective_boundary';
    await enqueueModeBoundaryIntent({
      boundaryAtMs: options.effectiveAtMs,
      fromMode: fromMode || 'unknown',
      toMode: normalized,
      reason: boundaryReason,
      source: 'auto_mode_transition',
    });
    await drainQueuedModeBoundary(boundaryReason);
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

function clearAutoTransitionCandidate(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  autoTransitionCandidates.delete(tabId);
}

function formatSecondsCompact(seconds) {
  const secs = Math.max(0, Math.floor(Number(seconds) || 0));
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

async function sendTabPendingMessage(tabId, payload, fallbackMessage = null) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
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
  const isAutoModeNotice = payload?.type === 'AUTO_MODE_PENDING_START' ||
    payload?.type === 'AUTO_MODE_PENDING_CANCEL' ||
    payload?.type === 'AUTO_MODE_PENDING_SUCCESS';
  const sendOptions = isAutoModeNotice ? { frameId: 0 } : undefined;
  const maxAttempts = isSuccessNotice ? SUCCESS_NOTICE_SEND_RETRIES : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, payload, sendOptions);
      // Store pending success notice for reliable re-delivery after reload
      if (isSuccessNotice) {
        const now = Date.now();
        pendingSuccessNoticesByTab.set(tabId, {
          payload: { ...payload },
          storedAt: now,
          expiresAt: Number(payload.expiresAt) || now + PENDING_NOTICE_TTL_MS,
          domainSnapshot: snapshotDomain,
        });
      }
      return true;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, SUCCESS_NOTICE_RETRY_DELAY_MS));
      }
    }
  }

  // Store pending notice after delivery failure so CONTENT_SCRIPT_READY can retry.
  if (isSuccessNotice) {
    const now = Date.now();
    pendingSuccessNoticesByTab.set(tabId, {
      payload: { ...payload },
      storedAt: now,
      expiresAt: Number(payload.expiresAt) || now + PENDING_NOTICE_TTL_MS,
      domainSnapshot: snapshotDomain,
    });
    await new Promise(resolve => setTimeout(resolve, SUCCESS_NOTICE_DEFERRED_RETRY_MS));
    const resent = await reSendPendingNotice(tabId, snapshotDomain);
    if (resent) return true;
  }
  if (fallbackMessage) notifyRuntimeModeSwitch(fallbackMessage);
  if (lastError) console.warn('[ModeNotice] page notice delivery failed:', lastError?.message || lastError);
  return false;
}

/**
 * Re-send pending success notice to a tab that just became ready.
 * Returns true if a notice was found and re-sent successfully.
 */
export async function reSendPendingNotice(tabId, currentDomain = null) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  const stored = pendingSuccessNoticesByTab.get(tabId);
  if (!stored) return false;
  // Check TTL
  if (Date.now() > (stored.expiresAt || stored.storedAt + PENDING_NOTICE_TTL_MS)) {
    pendingSuccessNoticesByTab.delete(tabId);
    return false;
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
    return false;
  }
  if (normalizedCurrentDomain !== normalizedStoredDomain) {
    pendingSuccessNoticesByTab.delete(tabId);
    return false;
  }
  try {
    await chrome.tabs.sendMessage(tabId, stored.payload, { frameId: 0 });
    pendingSuccessNoticesByTab.delete(tabId);
    return true;
  } catch {
    return false;
  }
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
  clearAutoTransitionCandidate(tabId);
  autoModePendingByTab.delete(tabId);
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
      noticeText: studyNoticeText || '已进入学习时间',
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

export function getAutoModePendingStatus(tabId, nowMs = Date.now()) {
  if (!Number.isInteger(tabId) || tabId < 0) return null;
  const pending = autoModePendingByTab.get(tabId);
  if (!pending) return null;
  const remainingSeconds = Math.max(0, Math.ceil((pending.deadlineAt - nowMs) / 1000));
  return { ...pending, remainingSeconds };
}

async function clearAutoModePending(tabId, reason = 'cancel') {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  if (!autoModePendingByTab.has(tabId)) return;
  autoModePendingByTab.delete(tabId);
  clearPendingNotice(tabId);
  await sendTabPendingMessage(tabId, { type: 'AUTO_MODE_PENDING_CANCEL', reason });
}

function isStudyPendingRule(rule) {
  return STUDY_PENDING_RULES.has(rule);
}

export async function cancelAutoModePendingForTab(tabId, reason = 'cancel') {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  clearAutoTransitionCandidate(tabId);
  await clearAutoModePending(tabId, reason);
}

export async function cancelAllAutoModePending(reason = 'cancel') {
  const tabIds = new Set([
    ...autoTransitionCandidates.keys(),
    ...autoModePendingByTab.keys(),
  ]);
  for (const tabId of tabIds) {
    await cancelAutoModePendingForTab(tabId, reason);
  }
}

async function checkAutoModeTransitionGate(tabId, candidate, nowMs) {
  if (!candidate || !Number.isInteger(tabId) || tabId < 0) return { passed: false };
  const gateMs = AUTO_TRANSITION_GATES[candidate.rule];
  if (!gateMs) return { passed: false };

  const existing = autoTransitionCandidates.get(tabId);
  if (
    !existing ||
    existing.rule !== candidate.rule ||
    existing.fromMode !== candidate.fromMode ||
    existing.toMode !== candidate.toMode ||
    existing.domain !== candidate.domain
  ) {
    const deadlineAt = nowMs + gateMs;
    autoTransitionCandidates.set(tabId, {
      ...candidate,
      startAt: nowMs,
      deadlineAt,
      lastSeenAt: nowMs,
      lastUserActiveAt: nowMs,
    });
    if (candidate.rule === 'rest_to_composite' || candidate.rule === 'rest_to_study') {
      const targetMode = candidate.toMode;
      const fromMode = candidate.fromMode;
      const remainingCompositeSeconds = (candidate.rule === 'rest_to_composite')
        ? await computeCompositeRemainingSeconds(candidate.config)
        : 0;
      const remainingCompositeTime = (candidate.rule === 'rest_to_composite')
        ? formatSecondsCompact(remainingCompositeSeconds)
        : '';
      const pendingPayload = {
        type: 'AUTO_MODE_PENDING_START',
        domain: candidate.domain,
        deadlineAt,
        targetMode,
        fromMode,
        remainingCompositeSeconds,
        remainingCompositeTime,
      };
      autoModePendingByTab.set(tabId, {
        tabId,
        domain: candidate.domain,
        deadlineAt,
        targetMode,
        fromMode,
        remainingCompositeSeconds,
        remainingCompositeTime,
      });
      const fallbackMessage = targetMode === 'composite'
        ? '正在使用综合网站，保持使用后将进入综合时间'
        : '正在使用学习网站，保持使用后将进入学习时间';
      await sendTabPendingMessage(tabId, pendingPayload, fallbackMessage);
    }
    return { passed: false };
  }

  existing.lastSeenAt = nowMs;
  existing.lastUserActiveAt = nowMs;
  if ((nowMs - existing.startAt) >= gateMs) {
    autoTransitionCandidates.delete(tabId);
    // Do not send AUTO_MODE_PENDING_CANCEL on completion. The caller sends a
    // success notice immediately, and a late cancel can clear that final banner.
    autoModePendingByTab.delete(tabId);
    clearPendingNotice(tabId);
    return { passed: true, startAt: existing.startAt, deadlineAt: existing.deadlineAt };
  }
  if ((candidate.rule === 'rest_to_composite' || candidate.rule === 'rest_to_study') && existing.deadlineAt) {
    const remainingCompositeSeconds = (candidate.rule === 'rest_to_composite')
      ? await computeCompositeRemainingSeconds(candidate.config)
      : 0;
    const remainingCompositeTime = (candidate.rule === 'rest_to_composite')
      ? formatSecondsCompact(remainingCompositeSeconds)
      : '';
    autoModePendingByTab.set(tabId, {
      tabId,
      domain: candidate.domain,
      deadlineAt: existing.deadlineAt,
      targetMode: candidate.toMode,
      fromMode: candidate.fromMode,
      remainingCompositeSeconds,
      remainingCompositeTime,
    });
    await sendTabPendingMessage(tabId, {
      type: 'AUTO_MODE_PENDING_START',
      domain: candidate.domain,
      deadlineAt: existing.deadlineAt,
      targetMode: candidate.toMode,
      fromMode: candidate.fromMode,
      remainingCompositeSeconds,
      remainingCompositeTime,
    });
  }
  autoTransitionCandidates.set(tabId, existing);
  return { passed: false };
}

// ── Check and remind ────────────────────────────────────────────────────────────

export async function checkAndRemind(tabId, url, monitoringEnabled, options = {}) {
  if (isSpecialUrl(url)) return false;
  if (url.includes('reminder.html')) return false;
  if (monitoringEnabled === 0) {
    clearAutoTransitionCandidate(tabId);
    await clearAutoModePending(tabId, 'monitoring_off');
    return false;
  }

  const nowMs = Number.isFinite(options?.nowMs) ? options.nowMs : Date.now();

  const config = await getConfig();
  if (!config.enabled) return false;

  const domain = extractDomain(url);
  if (!domain) return false;
  const siteClassificationRecords = await getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []);
  const siteClassification = resolveSiteAccessClassification(config, siteClassificationRecords, url);
  const isUnsafe = siteClassification.classification === 'blocked';
  const isRestricted = siteClassification.classification === 'restricted';
  const isStudyDomain = siteClassification.classification === 'study';
  const isTemporaryCompositeDomain = !isRestricted && !isUnsafe && !isStudyDomain && (
    await hasTemporaryCompositePermission(tabId, domain) ||
    siteClassification.classification === 'pending_composite'
  );
  const isCompositeDomain = !isRestricted && !isUnsafe && (
    siteClassification.classification === 'composite' ||
    isTemporaryCompositeDomain
  );
  const qs = config.quotaState || {};

  // 1. 不安全网站检查（唯一的硬拦截）
  if (isUnsafe) {
    await redirectToReminder(tabId, domain, 'unsafe', config.blockMessage);
    return true;
  }

  // 2. 时间段检查
  if (config.schedule.enabled && !isWithinSchedule(config.schedule)) {
    await redirectToReminder(tabId, domain, 'schedule', config.blockMessage);
    return true;
  }

  // 3. 运行时模式切换/拦截（study/composite/rest）
  const currentMode = await getEffectiveRuntimeMode(config, monitoringEnabled);
  let pendingAutoCandidate = null;
  const isForeground = options?.foreground === true;

  // MF-4: Rest → Composite quota exhausted — block immediately, do not start gate
  if (currentMode === 'rest' && isCompositeDomain && isForeground) {
    const remainingCompositeSeconds = await computeCompositeRemainingSeconds(config);
    if (remainingCompositeSeconds <= 0) {
      const exhaustedReason = qs.restLocked ? 'quota_composite_and_rest' : 'quota_composite';
      await redirectToReminder(tabId, domain, exhaustedReason, config.blockMessage);
      return true;
    }
    pendingAutoCandidate = { rule: 'rest_to_composite', fromMode: 'rest', toMode: 'composite', domain, config };
  } else if (currentMode === 'rest' && isStudyDomain && isForeground) {
    pendingAutoCandidate = { rule: 'rest_to_study', fromMode: 'rest', toMode: 'study', domain, config };
  } else if (currentMode === 'composite' && isStudyDomain && isForeground) {
    clearAutoTransitionCandidate(tabId);
    await clearAutoModePending(tabId, 'mode_changed');
    await setRuntimeMode('study', {
      effectiveAtMs: nowMs,
      reason: 'composite_to_study',
    });
    await applyModeTransitionSideEffects({
      fromMode: 'composite',
      toMode: 'study',
      tabId,
      domain,
      sendStudyNotice: false,
    });
    await sendModeSwitchSuccessNotice(tabId, 'study', 'composite', {
      domain,
      noticeText: '已进入学习时间',
      displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
    });
  }

  if (pendingAutoCandidate) {
    const gate = await checkAutoModeTransitionGate(tabId, pendingAutoCandidate, nowMs);
    if (gate.passed) {
      await setRuntimeMode(pendingAutoCandidate.toMode, {
        effectiveAtMs: gate.startAt,
        reason: pendingAutoCandidate.rule,
      });
      if (pendingAutoCandidate.rule === 'rest_to_composite') {
        await applyModeTransitionSideEffects({
          fromMode: pendingAutoCandidate.fromMode,
          toMode: pendingAutoCandidate.toMode,
          tabId,
          domain,
        });
        const remainingCompositeSeconds = await computeCompositeRemainingSeconds(config);
        await sendTabPendingMessage(tabId, {
          type: 'AUTO_MODE_PENDING_SUCCESS',
          noticeKind: 'transient_success',
          targetMode: 'composite',
          fromMode: 'rest',
          domain,
          remainingCompositeSeconds,
          remainingCompositeTime: formatSecondsCompact(remainingCompositeSeconds),
          displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
        }, `已进入综合时间 · 今日综合剩余 ${formatSecondsCompact(remainingCompositeSeconds)}`);
      } else if (pendingAutoCandidate.rule === 'rest_to_study') {
        await applyModeTransitionSideEffects({
          fromMode: pendingAutoCandidate.fromMode,
          toMode: pendingAutoCandidate.toMode,
          tabId,
          domain,
          sendStudyNotice: false,
        });
        await sendModeSwitchSuccessNotice(tabId, 'study', pendingAutoCandidate.fromMode, {
          domain,
          noticeText: '已进入学习时间',
          displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
        });
      }
    }
  } else {
    const existing = autoTransitionCandidates.get(tabId);
    const cancelReason = existing && isStudyPendingRule(existing.rule) && !isForeground
      ? 'foreground_lost'
      : 'candidate_changed';
    clearAutoTransitionCandidate(tabId);
    await clearAutoModePending(tabId, cancelReason);
  }

  if (currentMode === 'study') {
    if (isStudyDomain) {
      return false;
    }
    if (isCompositeDomain) {
      const remainingCompositeSeconds = await computeCompositeRemainingSeconds(config);
      if (remainingCompositeSeconds > 0) {
        await setRuntimeMode('composite');
        const remainingCompositeTime = formatSecondsCompact(remainingCompositeSeconds);
        const noticeText = `你正在打开综合网站 · 即将离开学习时间进入综合时间 · 今日剩余 ${remainingCompositeTime}`;
        await sendTabPendingMessage(tabId, {
          type: 'AUTO_MODE_PENDING_SUCCESS',
          noticeKind: 'transient_success',
          targetMode: 'composite',
          fromMode: 'study',
          domain,
          remainingCompositeSeconds,
          remainingCompositeTime,
          displayDuration: TRANSIENT_NOTICE_DISPLAY_MS,
          noticeText,
        }, noticeText);
        return false;
      }
      // Composite exhausted → dedicated Composite exhausted page
      const exhaustedReason = qs.restLocked ? 'quota_composite_and_rest' : 'quota_composite';
      await redirectToReminder(tabId, domain, exhaustedReason, config.blockMessage);
      return true;
    }
    // Study→Unclassified: use study_mode reason (dual-path: rest + composite apply)
    if (!isStudyDomain && !isCompositeDomain) {
      // Restricted domains use slide confirm; other unclassified use study_mode
      if (isRestricted) {
        await redirectToReminder(tabId, domain, 'to_rest_slide_confirm', config.blockMessage, {
          originMode: 'study',
          restLocked: qs.restLocked ? '1' : null,
        });
        return true;
      }
      await redirectToReminder(tabId, domain, 'study_mode', config.blockMessage, {
        originMode: 'study',
        restLocked: qs.restLocked ? '1' : null,
      });
      return true;
    }
  }

  if (currentMode === 'composite') {
    if (isCompositeDomain && !isStudyDomain) {
      // Check composite quota exhaustion
      const remainingCompositeSeconds = await computeCompositeRemainingSeconds(config);
      if (remainingCompositeSeconds <= 0) {
        const exhaustedReason = qs.restLocked ? 'quota_composite_and_rest' : 'quota_composite';
        await redirectToReminder(tabId, domain, exhaustedReason, config.blockMessage);
        return true;
      }
      return false;
    }
    if (!isStudyDomain && !isCompositeDomain) {
      await redirectToReminder(tabId, domain, 'to_rest_confirm', config.blockMessage, {
        restLocked: qs.restLocked ? '1' : null,
        siteType: isRestricted ? 'restricted' : 'unclassified',
      });
      return true;
    }
  }

  if (currentMode === 'rest') {
    // Rest mode + Unclassified/Restricted: check Rest exhaustion for borrow semantics
    if (!isStudyDomain && !isCompositeDomain && qs.restLocked) {
      if (isRestricted) {
        await redirectToReminder(tabId, domain, 'to_rest_slide_confirm', config.blockMessage, {
          restLocked: '1',
        });
        return true;
      }
      // Unclassified + Rest exhausted: preserve Composite application + borrow
      await redirectToReminder(tabId, domain, 'study_mode', config.blockMessage, {
        restLocked: '1',
      });
      return true;
    }
  }

  // 4. 配额锁定检查
  if (qs.onlineLocked) {
    await redirectToReminder(tabId, domain, 'quota_online', config.blockMessage);
    return true;
  }
  if (qs.restLocked && !isStudyDomain && !isCompositeDomain) {
    await redirectToReminder(tabId, domain, 'quota_rest', config.blockMessage);
    return true;
  }
  if (qs.studyLocked && isStudyDomain) {
    await redirectToReminder(tabId, domain, 'quota_study', config.blockMessage);
    return true;
  }
  if (qs.undeterminedLocked && isCompositeDomain && !isStudyDomain) {
    await redirectToReminder(tabId, domain, 'quota_undetermined', config.blockMessage);
    return true;
  }
  if (config.lockedDomains && config.lockedDomains.includes(domain)) {
    await redirectToReminder(tabId, domain, 'quota', config.blockMessage);
    return true;
  }

  return false;
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
