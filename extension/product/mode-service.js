// product/mode-service.js — single owner for runtime mode truth and route decisions

import {
  getConfig,
  getSession,
  saveConfig,
  saveSession,
  extractDomain,
  isSpecialUrl,
  hasTemporaryCompositePermission,
  getSiteClassificationRequestRecords,
  recordUnclassifiedSiteAccess,
} from '../infra/storage.js';
import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { enqueueModeBoundaryIntent } from '../core/mode-boundary-intents.js';
import { setCachedEffectiveMode } from '../runtime/session.js';
import { getTodayStatsWithCategories } from './analytics.js';
import { evaluateQuotaState, getTodayEffectiveRestLimit } from './quota.js';
import { getEffectiveQuotaForDate } from '../core/quota-config.js';
import { getModeWindowStatus, hasTimeWindowsDaily, reminderReasonForModeWindow } from '../core/time-windows.js';
import { logClientEventBestEffort, logFallbackEventBestEffort } from '../infra/client-logs.js';
import { createTimingAuditId } from '../core/timing-trace.js';

export const REST_EXIT_GRACE_MS = 30_000;

const VALID_MODES = new Set(['study', 'composite', 'rest', 'locked', 'paused']);
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};
const recordClientLog = typeof logClientEventBestEffort === 'function'
  ? logClientEventBestEffort
  : () => {};

function modeAuditId(event = {}) {
  if (event.auditId) return event.auditId;
  if (typeof createTimingAuditId === 'function') return createTimingAuditId('mode');
  return `mode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function logModeTransitionEvent({
  level = 'info',
  eventCode,
  auditId,
  reason,
  message,
  details = {},
} = {}) {
  recordClientLog({
    level,
    category: 'mode_transition',
    eventCode: eventCode || 'mode_transition_event',
    module: 'product/mode-service',
    reason: reason || details.reason || eventCode || null,
    message: message || eventCode || 'Mode transition event',
    details: {
      ...(details || {}),
      auditId: auditId || details.auditId || null,
      phase: details.phase || eventCode || null,
    },
  });
}

function baseDecision(overrides = {}) {
  return {
    ok: true,
    access: 'allow',
    modeChange: null,
    reminder: null,
    notice: null,
    recheckActiveTab: false,
    ...overrides,
  };
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isInternalPseudoDomain(domain) {
  return typeof domain === 'string' && domain.endsWith('.chrome-local');
}

export function normalizeMode(mode) {
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  if (VALID_MODES.has(mode)) return mode;
  return 'study';
}

function formatSecondsCompact(seconds) {
  const secs = Math.max(0, Math.floor(Number(seconds) || 0));
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

export function isWithinSchedule(schedule, at = new Date()) {
  const now = at instanceof Date ? at : new Date(at);
  const dayOfWeek = now.getDay();
  const dayConfig = schedule?.days?.[dayOfWeek];

  if (!dayConfig || !dayConfig.enabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = String(dayConfig.start || '0:0').split(':').map(Number);
  const [endH, endM] = String(dayConfig.end || '0:0').split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export async function getCurrentModeSnapshot(config = null, monitoringEnabled = 1) {
  if (monitoringEnabled === 0) {
    return {
      mode: 'paused',
      currentMode: 'paused',
      currentModeStartedAtMs: null,
      restExitGraceUntilMs: null,
      session: null,
    };
  }
  const [session, cfg] = await Promise.all([
    getSession().catch(() => null),
    config ? Promise.resolve(config) : getConfig().catch(() => null),
  ]);
  const sessionMode = normalizeMode(session?.currentMode);
  const fallbackMode = normalizeMode(cfg?.mode);
  const mode = session?.currentMode ? sessionMode : fallbackMode;
  const startedAt = finiteNumberOrNull(session?.currentModeStartedAtMs);
  const restExitGraceUntilMs = finiteNumberOrNull(session?.restExitGraceUntilMs);
  return {
    mode,
    currentMode: mode,
    currentModeStartedAtMs: startedAt,
    restExitGraceUntilMs,
    session: session || {},
  };
}

export function isRestExitGraceActive({ restExitGraceUntilMs, nowMs = Date.now() } = {}) {
  const untilMs = finiteNumberOrNull(restExitGraceUntilMs);
  if (untilMs === null) return false;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return now < untilMs;
}

function nextRestExitGraceUntilMs({
  fromMode,
  toMode,
  existingSession,
  boundaryAtMs,
  setRestExitGrace = false,
  clearRestExitGrace = false,
}) {
  const existingGraceUntilMs = finiteNumberOrNull(existingSession?.restExitGraceUntilMs);
  if (fromMode === toMode) return clearRestExitGrace ? null : existingGraceUntilMs;
  if (fromMode === 'rest' && (toMode === 'study' || toMode === 'composite')) {
    return setRestExitGrace ? boundaryAtMs + REST_EXIT_GRACE_MS : null;
  }
  if (clearRestExitGrace) return null;
  if (toMode === 'rest' || toMode === 'locked' || fromMode === 'locked' || fromMode === 'paused') {
    return null;
  }
  if (
    (fromMode === 'study' || fromMode === 'composite') &&
    (toMode === 'study' || toMode === 'composite')
  ) {
    return existingGraceUntilMs;
  }
  return existingGraceUntilMs;
}

export async function commitModeChange({
  toMode,
  reason = 'mode_change',
  source = 'mode_service',
  effectiveAtMs = Date.now(),
  persistConfigMode = false,
  setRestExitGrace = false,
  clearRestExitGrace = false,
  config = null,
  session = null,
  drainModeBoundary = null,
  auditId = null,
} = {}) {
  const normalizedTo = normalizeMode(toMode);
  if (normalizedTo === 'paused') {
    return { ok: false, changed: false, reason: 'invalid_target_mode', mode: normalizedTo };
  }

  const [cfg, existingSession] = await Promise.all([
    config ? Promise.resolve(config) : getConfig().catch(() => null),
    session ? Promise.resolve(session) : getSession().catch(() => null),
  ]);
  const fromMode = normalizeMode(existingSession?.currentMode || cfg?.mode);
  const boundaryAtMs = Number.isFinite(Number(effectiveAtMs)) ? Number(effectiveAtMs) : Date.now();

  if (fromMode === normalizedTo) {
    const existingGraceUntilMs = finiteNumberOrNull(existingSession?.restExitGraceUntilMs);
    const restExitGraceUntilMs = clearRestExitGrace === true ? null : existingGraceUntilMs;
    const shouldClearGrace = clearRestExitGrace === true && existingGraceUntilMs !== null;
    const nextSession = shouldClearGrace
      ? { ...(existingSession || {}), restExitGraceUntilMs: null }
      : (existingSession || {});
    if (shouldClearGrace) {
      await saveSession(nextSession);
    }
    return {
      ok: true,
      changed: false,
      fromMode,
      toMode: normalizedTo,
      mode: normalizedTo,
      currentMode: normalizedTo,
      currentModeStartedAtMs: finiteNumberOrNull(existingSession?.currentModeStartedAtMs),
      restExitGraceUntilMs,
      session: nextSession,
    };
  }

  const restExitGraceUntilMs = nextRestExitGraceUntilMs({
    fromMode,
    toMode: normalizedTo,
    existingSession,
    boundaryAtMs,
    setRestExitGrace: setRestExitGrace === true,
    clearRestExitGrace: clearRestExitGrace === true,
  });

  const nextSession = {
    ...(existingSession || {}),
    currentMode: normalizedTo,
    currentModeStartedAtMs: boundaryAtMs,
    modeEffectiveAtMs: boundaryAtMs,
    restExitGraceUntilMs,
  };
  await saveSession(nextSession);
  setCachedEffectiveMode(normalizedTo);

  if (persistConfigMode && cfg) {
    await saveConfig({
      ...cfg,
      mode: normalizedTo,
    });
  }

  const boundaryIntent = {
    boundaryAtMs,
    fromMode: fromMode || 'unknown',
    toMode: normalizedTo,
    reason,
    source,
  };
  if (auditId) {
    boundaryIntent.auditId = auditId;
  }
  const boundary = await enqueueModeBoundaryIntent(boundaryIntent);
  logModeTransitionEvent({
    level: boundary?.queued === false ? 'info' : 'info',
    eventCode: 'mode_boundary_queued',
    auditId,
    reason: boundary?.skipped || reason,
    message: boundary?.queued === false ? 'Mode boundary was not queued' : 'Mode boundary intent queued',
    details: {
      phase: 'mode_boundary_queued',
      fromMode,
      toMode: normalizedTo,
      source,
      boundaryAtMs,
      queued: boundary?.queued === true,
      skipped: boundary?.skipped || null,
      duplicate: boundary?.duplicate === true,
      intentId: boundary?.intent?.id || null,
    },
  });
  let drainResult = null;
  if (typeof drainModeBoundary === 'function') {
    drainResult = await drainModeBoundary(reason);
    if (drainResult?.ok === false) {
      recordFallbackLog({
        level: 'warning',
        category: 'mode_transition',
        eventCode: 'mode_boundary_failed',
        module: 'product/mode-service',
        reason: drainResult.error || 'mode_boundary_drain_failed',
        message: 'Mode boundary drain failed after mode commit',
        details: {
          auditId,
          phase: 'mode_boundary_drain',
          fromMode,
          toMode: normalizedTo,
          source,
          boundaryAtMs,
          drainResult,
        },
      });
    }
  }
  logModeTransitionEvent({
    level: 'info',
    eventCode: 'mode_transition_committed',
    auditId,
    reason,
    message: 'Mode transition committed',
    details: {
      phase: 'mode_transition_committed',
      fromMode,
      toMode: normalizedTo,
      source,
      boundaryAtMs,
      restExitGraceUntilMs,
      boundaryQueued: boundary?.queued === true,
      drainOk: drainResult ? drainResult.ok !== false : null,
    },
  });

  return {
    ok: true,
    changed: true,
    fromMode,
    toMode: normalizedTo,
    mode: normalizedTo,
    currentMode: normalizedTo,
    currentModeStartedAtMs: boundaryAtMs,
    restExitGraceUntilMs,
    boundary,
    drainResult,
    session: nextSession,
  };
}

async function computeQuotaRemainingSnapshot(config) {
  const stats = await getTodayStatsWithCategories(config);
  const quota = getEffectiveQuotaForDate(config).todayEffectiveQuota;
  const remaining = (minutes, seconds) => {
    if (minutes === null || minutes === undefined) return null;
    return Math.max(0, Math.max(0, Number(minutes) * 60) - Math.max(0, Number(seconds) || 0));
  };
  return {
    studySeconds: remaining(quota.studyMinutes, stats?.studySeconds),
    compositeSeconds: remaining(
      quota.compositeMinutes,
      stats?.undeterminedSeconds ?? stats?.compositeSeconds
    ),
    restSeconds: remaining(getTodayEffectiveRestLimit(config), stats?.restSeconds),
  };
}

function formatStudyRemainingTime(seconds) {
  return seconds === null ? '不限' : formatSecondsCompact(seconds);
}

function manualModeNoticeText(mode) {
  if (mode === 'study') return '已回到学习模式';
  if (mode === 'composite') return '已进入复合模式';
  if (mode === 'locked') return '当前配额已用完';
  return '已进入休息模式';
}

function quotaModeNoticeText(toMode, reason) {
  if (toMode === 'locked') return '当前配额已用完';
  if (reason === 'quota_rest_exhausted') return '休息时间配额已用完 · 已回到学习时间';
  if (reason === 'quota_composite_exhausted') return '待归类时间配额已用完 · 已回到学习时间';
  if (reason === 'composite_exhausted_to_rest') return '待归类时间配额已用完 · 正在借用休息配额';
  if (reason === 'quota_reset_unlock') return '配额已重置 · 已回到学习时间';
  return manualModeNoticeText(toMode);
}

function pendingRouteTargetText(pendingRecordKind) {
  if (pendingRecordKind === 'learning_request') {
    return '学习网站归类申请待家长确认 · 当前仍计入待归类时间';
  }
  if (pendingRecordKind === 'unclassified_visit') {
    return '已生成未归类网站访问记录 · 当前计入待归类时间';
  }
  if (pendingRecordKind === 'legacy') {
    return '历史网站归类记录待家长确认 · 当前计入待归类时间';
  }
  return '你正在打开复合网站';
}
function noticeForRoute(route, {
  fromMode,
  domain,
  remainingCompositeSeconds = null,
  remainingStudySeconds = null,
  remainingRestSeconds = null,
  pendingRecordKind = null,
} = {}) {
  if (!route?.notice) return null;
  if (route.notice === 'study_to_composite' || route.notice === 'rest_to_composite_success') {
    const remainingCompositeTime = remainingCompositeSeconds === null ? '不限' : formatSecondsCompact(remainingCompositeSeconds);
    return {
      kind: route.notice,
      targetMode: 'composite',
      fromMode,
      domain,
      text: `${pendingRouteTargetText(pendingRecordKind)} · 即将进入复合模式 · 今日待归类剩余 ${remainingCompositeTime}`,
      remainingCompositeSeconds,
      remainingCompositeTime,
    };
  }
  if (route.notice === 'composite_to_study' || route.notice === 'rest_to_study_success') {
    const remainingStudyTime = formatStudyRemainingTime(remainingStudySeconds);
    return {
      kind: route.notice,
      targetMode: 'study',
      fromMode,
      domain,
      text: `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 ${remainingStudyTime}`,
      remainingStudySeconds,
      remainingStudyTime,
    };
  }
  if (route.notice === 'composite_exhausted_to_rest') {
    const remainingRestTime = remainingRestSeconds === null ? '不限' : formatSecondsCompact(remainingRestSeconds);
    return {
      kind: route.notice,
      targetMode: 'rest',
      fromMode,
      domain,
      text: `${pendingRouteTargetText(pendingRecordKind)} · 当前待归类时间配额已用完 · 正在借用休息配额 · 今日休息剩余 ${remainingRestTime}`,
      remainingRestSeconds,
      remainingRestTime,
    };
  }
  if (route.notice === 'mode_grace_to_rest') {
    const label = fromMode === 'composite' ? '待归类' : '学习';
    return {
      kind: route.notice,
      targetMode: 'rest',
      fromMode,
      domain,
      text: `刚进入${label}时间 · 已临时回到休息时间`,
    };
  }
  return null;
}

function modeChangeFromRoute(route, nowMs) {
  if (route?.kind !== 'mode_change') return null;
  return {
    toMode: normalizeMode(route.toMode),
    reason: route.reason || 'auto_mode_route',
    source: route.source || 'auto_mode_route',
    effectiveAtMs: Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now(),
    persistConfigMode: false,
    setRestExitGrace: route.setRestExitGrace === true,
    clearRestExitGrace: route.clearRestExitGrace === true,
  };
}

function decisionFromRoute(route, context = {}) {
  if (route?.kind === 'reminder') {
    return baseDecision({
      access: 'reminder',
      reminder: {
        reason: route.reminderReason,
        params: route.extraParams || {},
      },
    });
  }
  if (route?.kind === 'notice_only') {
    return baseDecision({
      access: 'allow',
      notice: noticeForRoute(route, context),
    });
  }
  if (route?.kind === 'mode_change') {
    return baseDecision({
      access: 'allow',
      modeChange: modeChangeFromRoute(route, context.nowMs),
      notice: noticeForRoute(route, context),
    });
  }
  return baseDecision();
}

function scheduleBlockForMode(facts, mode) {
  if (facts.legacyScheduleAllowed === false) {
    return { kind: 'reminder', reminderReason: 'schedule' };
  }
  const key = `${mode}WindowAllowed`;
  if (facts[key] === false) {
    return { kind: 'reminder', reminderReason: reminderReasonForModeWindow(mode) };
  }
  return null;
}

export function evaluateModeRoute(facts = {}) {
  const currentMode = normalizeMode(facts.currentMode);
  const nowMs = Number.isFinite(Number(facts.nowMs)) ? Number(facts.nowMs) : Date.now();
  const restLocked = facts.quotaState?.restLocked === true;
  const isRestTarget = facts.isRestricted === true;
  const compositeExhausted = facts.remainingCompositeSeconds !== null &&
    facts.remainingCompositeSeconds !== undefined &&
    Number(facts.remainingCompositeSeconds) <= 0;

  if (facts.isUnsafe) {
    return { kind: 'reminder', reminderReason: 'unsafe' };
  }

  if (currentMode === 'locked') {
    return { kind: 'reminder', reminderReason: 'quota_locked' };
  }

  if (currentMode === 'rest') {
    if (facts.isStudyDomain && facts.foreground === true) {
      const scheduleBlock = scheduleBlockForMode(facts, 'study');
      if (scheduleBlock) return scheduleBlock;
      return {
        kind: 'mode_change',
        toMode: 'study',
        reason: 'rest_to_study',
        source: 'auto_mode_route',
        notice: 'rest_to_study_success',
        setRestExitGrace: true,
      };
    }

    if (facts.isCompositeDomain) {
      if (compositeExhausted) {
        if (restLocked) {
          return { kind: 'reminder', reminderReason: 'quota_composite_and_rest' };
        }
      }
      const scheduleBlock = scheduleBlockForMode(facts, 'composite');
      if (scheduleBlock) return scheduleBlock;
      if (compositeExhausted) {
        return {
          kind: 'notice_only',
          notice: 'composite_exhausted_to_rest',
          targetMode: 'rest',
        };
      }
      if (facts.foreground !== true) return { kind: 'allow' };
      return {
        kind: 'mode_change',
        toMode: 'composite',
        reason: 'rest_to_composite',
        source: 'auto_mode_route',
        notice: 'rest_to_composite_success',
        setRestExitGrace: true,
      };
    }

    if (isRestTarget && restLocked) {
      return { kind: 'reminder', reminderReason: 'rest_locked' };
    }
    if (isRestTarget) {
      const scheduleBlock = scheduleBlockForMode(facts, 'rest');
      if (scheduleBlock) return scheduleBlock;
    }
    return { kind: 'allow' };
  }

  if (currentMode === 'study') {
    if (facts.isStudyDomain) {
      const scheduleBlock = scheduleBlockForMode(facts, 'study');
      if (scheduleBlock) return scheduleBlock;
      return { kind: 'allow' };
    }

    if (facts.isCompositeDomain) {
      if (compositeExhausted && restLocked) {
        return { kind: 'reminder', reminderReason: 'quota_composite_and_rest' };
      }
      const scheduleBlock = scheduleBlockForMode(facts, 'composite');
      if (scheduleBlock) return scheduleBlock;
      if (!compositeExhausted) {
        return {
          kind: 'mode_change',
          toMode: 'composite',
          reason: 'study_to_composite',
          source: 'auto_mode_route',
          notice: 'study_to_composite',
        };
      }
      return {
        kind: 'mode_change',
        toMode: 'rest',
        reason: 'composite_exhausted_to_rest',
        source: 'auto_mode_route',
        notice: 'composite_exhausted_to_rest',
      };
    }

    if (isRestTarget) {
      if (restLocked) return { kind: 'reminder', reminderReason: 'rest_locked' };
      const scheduleBlock = scheduleBlockForMode(facts, 'rest');
      if (scheduleBlock) return scheduleBlock;
      if (isRestExitGraceActive({ restExitGraceUntilMs: facts.restExitGraceUntilMs, nowMs })) {
        return {
          kind: 'mode_change',
          toMode: 'rest',
          reason: 'mode_grace_to_rest',
          source: 'auto_mode_route',
          notice: 'mode_grace_to_rest',
        };
      }
      return {
        kind: 'reminder',
        reminderReason: facts.isRestricted ? 'to_rest_slide_confirm' : 'study_mode',
        extraParams: { originMode: 'study' },
      };
    }
  }

  if (currentMode === 'composite') {
    if (facts.isStudyDomain) {
      const scheduleBlock = scheduleBlockForMode(facts, 'study');
      if (scheduleBlock) return scheduleBlock;
      return {
        kind: 'mode_change',
        toMode: 'study',
        reason: 'composite_to_study',
        source: 'auto_mode_route',
        notice: 'composite_to_study',
      };
    }

    if (facts.isCompositeDomain) {
      if (compositeExhausted) {
        if (restLocked) {
          return { kind: 'reminder', reminderReason: 'quota_composite_and_rest' };
        }
      }
      const scheduleBlock = scheduleBlockForMode(facts, 'composite');
      if (scheduleBlock) return scheduleBlock;
      if (compositeExhausted) {
        return {
          kind: 'mode_change',
          toMode: 'rest',
          reason: 'composite_exhausted_to_rest',
          source: 'auto_mode_route',
          notice: 'composite_exhausted_to_rest',
        };
      }
      return { kind: 'allow' };
    }

    if (isRestTarget) {
      if (restLocked) return { kind: 'reminder', reminderReason: 'rest_locked' };
      const scheduleBlock = scheduleBlockForMode(facts, 'rest');
      if (scheduleBlock) return scheduleBlock;
      if (isRestExitGraceActive({ restExitGraceUntilMs: facts.restExitGraceUntilMs, nowMs })) {
        return {
          kind: 'mode_change',
          toMode: 'rest',
          reason: 'mode_grace_to_rest',
          source: 'auto_mode_route',
          notice: 'mode_grace_to_rest',
        };
      }
      return {
        kind: 'reminder',
        reminderReason: 'to_rest_confirm',
        extraParams: { siteType: facts.isRestricted ? 'restricted' : 'unclassified' },
      };
    }
  }

  return { kind: 'allow' };
}

async function handleAccessObserved(event = {}) {
  const monitoringEnabled = event.monitoringEnabled ?? 1;
  if (monitoringEnabled === 0) {
    return baseDecision({ access: 'ignore', reason: 'monitoring_paused' });
  }

  const url = String(event.url || '').trim();
  if (!url || isSpecialUrl(url) || url.includes('reminder.html')) {
    return baseDecision({ access: 'ignore', reason: 'ignored_url' });
  }

  const nowMs = Number.isFinite(Number(event.nowMs)) ? Number(event.nowMs) : Date.now();
  const config = await getConfig();
  if (!config.enabled) return baseDecision({ access: 'ignore', reason: 'config_disabled' });

  const domain = event.domain || extractDomain(url);
  if (!domain) return baseDecision({ access: 'ignore', reason: 'domain_unresolved' });
  if (isInternalPseudoDomain(domain)) {
    return baseDecision({ access: 'ignore', reason: 'internal_pseudo_domain', domain });
  }

  const siteClassificationRecords = await getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []);
  let siteClassificationRequestSyncNeeded = false;
  let siteClassificationRequestForSync = null;
  let siteClassification = resolveSiteAccessClassification(config, siteClassificationRecords, { url, specialSiteTargets: event.specialSiteTargets || [] });
  const tabId = Number(event.tabId);
  const normalizedInitialClassification = siteClassification.classification || 'unclassified';
  if (normalizedInitialClassification === 'unclassified' || normalizedInitialClassification === 'pending_composite') {
    try {
      const requestResult = await recordUnclassifiedSiteAccess(domain, {
        sourceTabId: Number.isInteger(tabId) ? tabId : null,
        url,
        domain,
        source: 'access_observed_auto_pending',
        observedEventSource: event.source || null,
        observedAt: nowMs,
      });
      if (requestResult?.ok) {
        const countableObservation = event.source === 'webNavigationCommitted' || event.source === 'webNavigationHistoryStateUpdated';
        siteClassificationRequestSyncNeeded = !!(requestResult.added || requestResult.promoted || (requestResult.observed && countableObservation));
        siteClassificationRequestForSync = requestResult.request || null;
        siteClassification = {
          classification: 'pending_composite',
          source: 'unclassified_site_access_record',
          request: requestResult.request || null,
        };
      }
    } catch (error) {
      recordFallbackLog({
        level: 'warn',
        eventCode: 'unclassified_site_access_record_failed',
        module: 'product/mode-service',
        reason: 'auto_pending_failed',
        message: 'Failed to record unclassified site access',
        details: { domain, error: error?.message || String(error) },
      });
    }
  }
  const isUnsafe = siteClassification.classification === 'blocked';
  const isRejected = siteClassification.classification === 'rejected';
  const isRestricted = siteClassification.classification === 'restricted' || isRejected;
  const isStudyDomain = siteClassification.classification === 'study';
  const isTemporaryCompositeDomain = !isRestricted && !isUnsafe && !isStudyDomain && (
    await hasTemporaryCompositePermission(Number.isInteger(tabId) ? tabId : null, domain) ||
    siteClassification.classification === 'pending_composite'
  );
  const isCompositeDomain = !isRestricted && !isUnsafe && (
    siteClassification.classification === 'composite' ||
    isTemporaryCompositeDomain
  );
  const quotaState = config.quotaState || {};

  if (isUnsafe) {
    return baseDecision({
      access: 'reminder',
      reminder: { reason: 'unsafe', params: {} },
      domain,
      config,
    });
  }

  if (quotaState.onlineLocked) {
    return baseDecision({
      access: 'reminder',
      reminder: { reason: 'quota_online', params: {} },
      domain,
      config,
    });
  }

  if (Array.isArray(config.lockedDomains) && config.lockedDomains.includes(domain)) {
    return baseDecision({
      access: 'reminder',
      reminder: { reason: 'quota', params: {} },
      domain,
      config,
    });
  }

  if (quotaState.studyLocked && isStudyDomain) {
    return baseDecision({
      access: 'reminder',
      reminder: { reason: 'quota_study', params: {} },
      domain,
      config,
    });
  }

  const modeSnapshot = await getCurrentModeSnapshot(config, monitoringEnabled);
  const currentMode = modeSnapshot.mode;
  const windowCheckAt = new Date(nowMs);
  const hasModeWindows = hasTimeWindowsDaily(config);
  const studyWindow = getModeWindowStatus(config, 'study', windowCheckAt);
  const compositeWindow = getModeWindowStatus(config, 'composite', windowCheckAt);
  const restWindow = getModeWindowStatus(config, 'rest', windowCheckAt);
  const legacyScheduleAllowed = hasModeWindows || !config.schedule?.enabled
    ? true
    : isWithinSchedule(config.schedule, windowCheckAt);
  const quotaRemaining = await computeQuotaRemainingSnapshot(config);
  const remainingCompositeSeconds = isCompositeDomain ? quotaRemaining.compositeSeconds : null;
  const remainingRestSeconds = quotaRemaining.restSeconds;
  const route = evaluateModeRoute({
    currentMode,
    restExitGraceUntilMs: modeSnapshot.restExitGraceUntilMs,
    nowMs,
    foreground: event.foreground === true,
    isUnsafe,
    isRestricted,
    isStudyDomain,
    isCompositeDomain,
    studyWindowAllowed: studyWindow.allowed,
    compositeWindowAllowed: compositeWindow.allowed,
    restWindowAllowed: restWindow.allowed,
    legacyScheduleAllowed,
    remainingCompositeSeconds,
    quotaState,
  });
  const remainingStudySeconds = (
    route?.notice === 'composite_to_study' ||
    route?.notice === 'rest_to_study_success'
  )
    ? quotaRemaining.studySeconds
    : null;

  const decision = decisionFromRoute(route, {
    fromMode: currentMode,
    domain,
    nowMs,
    remainingCompositeSeconds,
    remainingStudySeconds,
    remainingRestSeconds,
    pendingRecordKind: siteClassification.classification === 'pending_composite'
      ? siteClassification.request?.requestedClassification === 'study'
        ? 'learning_request'
        : siteClassification.request?.recordSource === 'legacy'
        ? 'legacy'
        : 'unclassified_visit'
      : null,
  });
  return {
    ...decision,
    domain,
    config,
    modeSnapshot,
    classification: siteClassification.classification,
    siteClassificationRequestSyncNeeded,
    siteClassificationRequest: siteClassificationRequestForSync,
  };
}

function quotaBlockedReminderForRequestedMode(requestedMode, quotaState = {}) {
  if (quotaState.onlineLocked === true) {
    return { reason: 'quota_locked', code: 'ONLINE_QUOTA_LOCKED' };
  }
  if (requestedMode === 'study' && quotaState.studyLocked === true) {
    return { reason: 'quota_study', code: 'STUDY_QUOTA_LOCKED' };
  }
  if (requestedMode === 'composite' && quotaState.undeterminedLocked === true) {
    return { reason: 'quota_undetermined', code: 'COMPOSITE_QUOTA_LOCKED' };
  }
  if (requestedMode === 'rest' && quotaState.restLocked === true) {
    return { reason: 'rest_locked', code: 'REST_QUOTA_LOCKED' };
  }
  return null;
}

function scheduleBlockedReminderForRequestedMode(requestedMode, config = {}, at = new Date()) {
  if (!hasTimeWindowsDaily(config)) {
    if (config.schedule?.enabled && !isWithinSchedule(config.schedule, at)) {
      return { reason: 'schedule', code: 'LEGACY_SCHEDULE_LOCKED' };
    }
    return null;
  }
  const status = getModeWindowStatus(config, requestedMode, at);
  if (status.allowed === false) {
    return {
      reason: reminderReasonForModeWindow(requestedMode),
      code: `${String(requestedMode || 'mode').toUpperCase()}_SCHEDULE_LOCKED`,
      status,
    };
  }
  return null;
}

async function handleRequestedModeChange(event = {}) {
  const auditId = modeAuditId(event);
  const requested = normalizeMode(event.requestedMode || event.toMode || event.mode);
  logModeTransitionEvent({
    level: 'info',
    eventCode: 'mode_transition_requested',
    auditId,
    reason: event.reason || null,
    message: 'Mode transition requested',
    details: {
      phase: 'mode_transition_requested',
      eventType: event.type || null,
      requestedMode: requested,
      source: event.source || 'runtime_message',
    },
  });
  if (requested === 'paused') {
    logModeTransitionEvent({
      level: 'warning',
      eventCode: 'mode_transition_blocked',
      auditId,
      reason: 'invalid_target_mode',
      message: 'Mode transition blocked',
      details: { requestedMode: requested, source: event.source || 'runtime_message' },
    });
    return baseDecision({
      ok: false,
      access: 'ignore',
      reason: 'invalid_target_mode',
    });
  }
  const nowMs = Number.isFinite(Number(event.nowMs ?? event.effectiveAtMs))
    ? Number(event.nowMs ?? event.effectiveAtMs)
    : Date.now();
  const source = event.source || 'runtime_message';
  const reason = event.reason || (event.type === 'REMINDER_CONFIRMED' ? 'reminder_confirm_rest' : 'manual_mode_switch');
  if (requested === 'study' || requested === 'composite' || requested === 'rest') {
    const quotaResult = await evaluateQuotaState().catch((err) => ({
      ok: false,
      error: err?.message || String(err),
    }));
    if (quotaResult?.skipped !== 'config_disabled') {
      const latestConfig = quotaResult?.config || await getConfig().catch(() => null);
      const latestQuotaState = quotaResult?.newState || latestConfig?.quotaState || {};
      const blocked = quotaBlockedReminderForRequestedMode(requested, latestQuotaState);
      if (blocked || quotaResult?.ok === false) {
        recordFallbackLog({
          level: quotaResult?.ok === false ? 'error' : 'warning',
          category: 'access',
          eventCode: 'mode_request_quota_fallback',
          module: 'product/mode-service',
          reason: blocked?.code || 'QUOTA_EVALUATION_FAILED',
          message: blocked
            ? 'Mode request blocked by latest quota state'
            : 'Mode request fell back to quota-locked reminder because quota evaluation failed',
          details: {
            requestedMode: requested,
            source,
            quotaError: quotaResult?.error || null,
            quotaSkipped: quotaResult?.skipped || null,
            blockedCode: blocked?.code || null,
            auditId,
          },
        });
        logModeTransitionEvent({
          level: quotaResult?.ok === false ? 'error' : 'warning',
          eventCode: 'mode_transition_blocked',
          auditId,
          reason: blocked?.code || 'QUOTA_EVALUATION_FAILED',
          message: 'Mode transition blocked by quota',
          details: {
            phase: 'mode_transition_blocked',
            requestedMode: requested,
            source,
            quotaError: quotaResult?.error || null,
            blockedCode: blocked?.code || null,
          },
        });
        return baseDecision({
          ok: false,
          access: 'reminder',
          reason: blocked?.code || 'QUOTA_EVALUATION_FAILED',
          reminder: { reason: blocked?.reason || 'quota_locked', params: {} },
          quota: quotaResult,
          recheckActiveTab: true,
        });
      }
      const scheduleBlocked = scheduleBlockedReminderForRequestedMode(requested, latestConfig || {}, new Date(nowMs));
      if (scheduleBlocked) {
        recordFallbackLog({
          level: 'warning',
          category: 'access',
          eventCode: 'mode_request_time_window_blocked',
          module: 'product/mode-service',
          reason: scheduleBlocked.code,
          message: 'Mode request blocked by configured time window',
          details: {
            requestedMode: requested,
            source,
            dayKey: scheduleBlocked.status?.dayKey || null,
            field: scheduleBlocked.status?.field || null,
            auditId,
          },
        });
        logModeTransitionEvent({
          level: 'warning',
          eventCode: 'mode_transition_blocked',
          auditId,
          reason: scheduleBlocked.code,
          message: 'Mode transition blocked by time window',
          details: {
            phase: 'mode_transition_blocked',
            requestedMode: requested,
            source,
            dayKey: scheduleBlocked.status?.dayKey || null,
            field: scheduleBlocked.status?.field || null,
          },
        });
        return baseDecision({
          ok: false,
          access: 'reminder',
          reason: scheduleBlocked.code,
          reminder: { reason: scheduleBlocked.reason, params: {} },
          quota: quotaResult,
          recheckActiveTab: true,
        });
      }
    }
  }
  return baseDecision({
    modeChange: {
      toMode: requested,
      reason,
      source,
      effectiveAtMs: nowMs,
      persistConfigMode: true,
      clearRestExitGrace: event.type === 'REQUEST_MODE_CHANGE',
      auditId,
    },
    notice: {
      kind: 'manual_mode_change',
      targetMode: requested,
      text: event.noticeText || manualModeNoticeText(requested),
    },
    recheckActiveTab: true,
  });
}

function isModeQuotaAllowedForSchedule(mode, quotaState = {}) {
  if (quotaState.onlineLocked === true) return false;
  if (mode === 'study') return quotaState.studyLocked !== true;
  if (mode === 'composite') return quotaState.undeterminedLocked !== true;
  if (mode === 'rest') return quotaState.restLocked !== true;
  return false;
}

function scheduleStatusAllowed(status) {
  return !status || status.allowed !== false;
}

export function evaluateScheduleModeTransition(facts = {}) {
  const currentMode = normalizeMode(facts.currentMode);
  if (!['study', 'composite', 'rest'].includes(currentMode)) {
    return { kind: 'none', reason: 'schedule_ignored_mode' };
  }
  const activeUsageWindowMode = ['study', 'composite', 'rest'].includes(facts.activeUsageWindowMode)
    ? facts.activeUsageWindowMode
    : null;
  const windowMode = activeUsageWindowMode || currentMode;
  const statusByMode = facts.windowStatusByMode || {};
  if (scheduleStatusAllowed(statusByMode[windowMode])) {
    return {
      kind: 'none',
      reason: activeUsageWindowMode
        ? 'schedule_allows_active_usage_nature'
        : 'schedule_allows_current_mode',
    };
  }

  const quotaState = facts.quotaState || {};
  const candidates = currentMode === 'rest'
    ? ['study', 'composite']
    : currentMode === 'composite'
    ? ['study', 'rest']
    : ['rest', 'composite'];
  for (const mode of candidates) {
    if (scheduleStatusAllowed(statusByMode[mode]) && isModeQuotaAllowedForSchedule(mode, quotaState)) {
      return {
        kind: 'mode_change',
        toMode: mode,
        reason: windowMode + '_schedule_expired_to_' + mode,
        source: facts.source || 'schedule_alarm',
      };
    }
  }
  return {
    kind: 'mode_change',
    toMode: 'locked',
    reason: windowMode + '_schedule_window_expired',
    source: facts.source || 'schedule_alarm',
  };
}

function scheduleModeNoticeText(mode) {
  if (mode === 'study') return '当前时间段已切换到学习模式';
  if (mode === 'composite') return '当前时间段已切换到复合模式';
  if (mode === 'rest') return '当前时间段已切换到休息模式';
  return '当前时间段未允许继续使用';
}

async function handleQuotaEvaluation(event = {}) {
  const auditId = modeAuditId(event);
  const source = event.source || 'quota_alarm';
  logModeTransitionEvent({
    level: 'info',
    eventCode: 'mode_transition_requested',
    auditId,
    reason: source,
    message: 'Quota mode evaluation requested',
    details: { phase: 'mode_transition_requested', eventType: 'EVALUATE_QUOTA_STATE', source },
  });
  const quotaResult = await evaluateQuotaState();
  if (!quotaResult?.ok || quotaResult.skipped) {
    logModeTransitionEvent({
      level: quotaResult?.ok === false ? 'error' : 'info',
      eventCode: quotaResult?.ok === false ? 'mode_transition_blocked' : 'mode_transition_decided',
      auditId,
      reason: quotaResult?.skipped || 'quota_evaluation_failed',
      message: quotaResult?.ok === false ? 'Quota mode evaluation failed' : 'Quota mode evaluation skipped',
      details: {
        phase: quotaResult?.ok === false ? 'mode_transition_blocked' : 'mode_transition_decided',
        source,
        skipped: quotaResult?.skipped || null,
        error: quotaResult?.error || null,
      },
    });
    return baseDecision({
      access: 'ignore',
      reason: quotaResult?.skipped || 'quota_evaluation_failed',
      quota: quotaResult,
    });
  }

  const config = quotaResult.config || await getConfig();
  const session = await getSession();
  const currentMode = normalizeMode(session?.currentMode || config?.mode);
  const windowCheckAt = new Date(Number.isFinite(Number(event.nowMs)) ? Number(event.nowMs) : Date.now());
  const windowStatusByMode = {
    study: getModeWindowStatus(config, 'study', windowCheckAt),
    composite: getModeWindowStatus(config, 'composite', windowCheckAt),
    rest: getModeWindowStatus(config, 'rest', windowCheckAt),
  };
  const quotaRoute = evaluateQuotaModeTransition({
    currentMode,
    quotaState: quotaResult.newState || config.quotaState || {},
    activeUsageWindowMode: event.activeUsageWindowMode || null,
    windowStatusByMode,
    source,
  });

  if (quotaRoute.kind !== 'mode_change') {
    const scheduleRoute = evaluateScheduleModeTransition({
      currentMode,
      activeUsageWindowMode: event.activeUsageWindowMode || null,
      quotaState: quotaResult.newState || config.quotaState || {},
      source,
      windowStatusByMode,
    });
    if (scheduleRoute.kind === 'mode_change') {
      logModeTransitionEvent({
        level: 'warning',
        eventCode: 'mode_transition_decided',
        auditId,
        reason: scheduleRoute.reason,
        message: 'Schedule mode evaluation requires mode change',
        details: {
          phase: 'mode_transition_decided',
          source,
          currentMode,
          routeKind: scheduleRoute.kind,
          toMode: scheduleRoute.toMode,
        },
      });
      return baseDecision({
        access: 'allow',
        modeChange: {
          toMode: normalizeMode(scheduleRoute.toMode),
          reason: scheduleRoute.reason,
          source: scheduleRoute.source || source,
          effectiveAtMs: Number.isFinite(Number(event.nowMs)) ? Number(event.nowMs) : Date.now(),
          persistConfigMode: false,
          auditId,
        },
        notice: {
          kind: scheduleRoute.reason,
          targetMode: normalizeMode(scheduleRoute.toMode),
          text: scheduleModeNoticeText(normalizeMode(scheduleRoute.toMode)),
        },
        quota: quotaResult,
        recheckActiveTab: true,
      });
    }
    logModeTransitionEvent({
      level: 'info',
      eventCode: 'mode_transition_decided',
      auditId,
      reason: quotaRoute.reason,
      message: 'Quota mode evaluation did not require mode change',
      details: {
        phase: 'mode_transition_decided',
        source,
        currentMode,
        routeKind: quotaRoute.kind,
      },
    });
    return baseDecision({
      access: 'allow',
      reason: quotaRoute.reason,
      quota: quotaResult,
      recheckActiveTab: true,
    });
  }

  return baseDecision({
    access: 'allow',
    modeChange: {
      toMode: normalizeMode(quotaRoute.toMode),
      reason: quotaRoute.reason,
      source: quotaRoute.source || source,
      effectiveAtMs: Number.isFinite(Number(event.nowMs)) ? Number(event.nowMs) : Date.now(),
      persistConfigMode: false,
      auditId,
    },
    notice: {
      kind: quotaRoute.reason,
      targetMode: normalizeMode(quotaRoute.toMode),
      text: quotaModeNoticeText(normalizeMode(quotaRoute.toMode), quotaRoute.reason),
    },
    quota: quotaResult,
    recheckActiveTab: true,
  });
}

export async function handleModeEvent(event = {}) {
  const type = event?.type;
  if (type === 'ACCESS_OBSERVED') return await handleAccessObserved(event);
  if (type === 'REQUEST_MODE_CHANGE' || type === 'REMINDER_CONFIRMED') {
    return await handleRequestedModeChange(event);
  }
  if (type === 'EVALUATE_QUOTA_STATE') return await handleQuotaEvaluation(event);
  return baseDecision({
    ok: false,
    access: 'ignore',
    reason: 'unknown_mode_event',
  });
}

export function evaluateQuotaModeTransition(facts = {}) {
  const currentMode = normalizeMode(facts.currentMode);
  const quotaState = facts.quotaState || {};

  if (currentMode === 'paused') return { kind: 'none', reason: 'monitoring_paused' };

  if (quotaState.onlineLocked === true) {
    if (currentMode === 'locked') return { kind: 'none', reason: 'already_locked' };
    return {
      kind: 'mode_change',
      toMode: 'locked',
      reason: 'quota_online_exhausted',
      source: facts.source || 'quota_alarm',
    };
  }

  if (currentMode === 'study' && quotaState.studyLocked === true) {
    return {
      kind: 'mode_change',
      toMode: 'locked',
      reason: 'quota_study_exhausted',
      source: facts.source || 'quota_alarm',
    };
  }

  if (currentMode === 'rest' && quotaState.restLocked === true) {
    if (
      facts.activeUsageWindowMode === 'composite' &&
      quotaState.undeterminedLocked === true
    ) {
      return {
        kind: 'mode_change',
        toMode: 'locked',
        reason: 'quota_composite_and_rest',
        source: facts.source || 'quota_alarm',
      };
    }
    if (quotaState.studyLocked === true) {
      return {
        kind: 'mode_change',
        toMode: 'locked',
        reason: 'quota_rest_exhausted_study_locked',
        source: facts.source || 'quota_alarm',
      };
    }
    return {
      kind: 'mode_change',
      toMode: 'study',
      reason: 'quota_rest_exhausted',
      source: facts.source || 'quota_alarm',
    };
  }

  if (currentMode === 'composite' && quotaState.undeterminedLocked === true) {
    if (
      facts.activeUsageWindowMode === 'composite' &&
      quotaState.restLocked !== true &&
      scheduleStatusAllowed(facts.windowStatusByMode?.composite)
    ) {
      return {
        kind: 'mode_change',
        toMode: 'rest',
        reason: 'composite_exhausted_to_rest',
        source: facts.source || 'quota_alarm',
      };
    }
    if (quotaState.studyLocked === true) {
      return {
        kind: 'mode_change',
        toMode: 'locked',
        reason: 'quota_composite_exhausted_study_locked',
        source: facts.source || 'quota_alarm',
      };
    }
    return {
      kind: 'mode_change',
      toMode: 'study',
      reason: 'quota_composite_exhausted',
      source: facts.source || 'quota_alarm',
    };
  }

  if (currentMode === 'locked' && !quotaState.onlineLocked && !quotaState.studyLocked) {
    return {
      kind: 'mode_change',
      toMode: 'study',
      reason: 'quota_reset_unlock',
      source: facts.source || 'quota_alarm',
    };
  }

  return { kind: 'none', reason: 'quota_allows_current_mode' };
}
