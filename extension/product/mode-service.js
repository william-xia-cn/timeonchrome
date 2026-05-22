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
} from '../infra/storage.js';
import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { enqueueModeBoundaryIntent } from '../core/mode-boundary-intents.js';
import { setCachedEffectiveMode } from '../runtime/session.js';
import { getTodayStatsWithCategories } from './analytics.js';
import { evaluateQuotaState, getTodayEffectiveRestLimit } from './quota.js';

export const REST_EXIT_GRACE_MS = 30_000;

const VALID_MODES = new Set(['study', 'composite', 'rest', 'locked', 'paused']);

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

export function isWithinSchedule(schedule) {
  const now = new Date();
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
  const boundary = await enqueueModeBoundaryIntent(boundaryIntent);
  let drainResult = null;
  if (typeof drainModeBoundary === 'function') {
    drainResult = await drainModeBoundary(reason);
  }

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

async function computeCompositeRemainingSeconds(config) {
  const stats = await getTodayStatsWithCategories(config);
  const used = Math.max(0, Number(stats?.undeterminedSeconds ?? stats?.compositeSeconds) || 0);
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

function manualModeNoticeText(mode) {
  if (mode === 'study') return '已回到学习模式';
  if (mode === 'composite') return '已进入综合模式';
  if (mode === 'locked') return '当前配额已用完';
  return '已进入休息模式';
}

function quotaModeNoticeText(toMode, reason) {
  if (toMode === 'locked') return '当前配额已用完';
  if (reason === 'quota_rest_exhausted') return '休息时间配额已用完 · 已回到学习时间';
  if (reason === 'quota_composite_exhausted') return '综合时间配额已用完 · 已回到学习时间';
  if (reason === 'quota_reset_unlock') return '配额已重置 · 已回到学习时间';
  return manualModeNoticeText(toMode);
}

function noticeForRoute(route, {
  fromMode,
  domain,
  remainingCompositeSeconds = null,
  remainingStudySeconds = null,
  remainingRestSeconds = null,
} = {}) {
  if (!route?.notice) return null;
  if (route.notice === 'study_to_composite' || route.notice === 'rest_to_composite_success') {
    const remainingCompositeTime = formatSecondsCompact(remainingCompositeSeconds);
    return {
      kind: route.notice,
      targetMode: 'composite',
      fromMode,
      domain,
      text: `你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 ${remainingCompositeTime}`,
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
    const remainingRestTime = formatSecondsCompact(remainingRestSeconds);
    return {
      kind: route.notice,
      targetMode: 'rest',
      fromMode,
      domain,
      text: `你正在打开综合/待归类网站 · 当前综合时间配额已用完 · 已默认进入休息模式 · 今日休息剩余 ${remainingRestTime}`,
      remainingRestSeconds,
      remainingRestTime,
    };
  }
  if (route.notice === 'mode_grace_to_rest') {
    const label = fromMode === 'composite' ? '综合' : '学习';
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

export function evaluateModeRoute(facts = {}) {
  const currentMode = normalizeMode(facts.currentMode);
  const nowMs = Number.isFinite(Number(facts.nowMs)) ? Number(facts.nowMs) : Date.now();
  const restLocked = facts.quotaState?.restLocked === true;
  const isRestTarget = !facts.isStudyDomain && !facts.isCompositeDomain;

  if (facts.isUnsafe) {
    return { kind: 'reminder', reminderReason: 'unsafe' };
  }

  if (currentMode === 'locked') {
    return { kind: 'reminder', reminderReason: 'quota_locked' };
  }

  if (currentMode === 'rest') {
    if (facts.isStudyDomain && facts.foreground === true) {
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
      if (Number(facts.remainingCompositeSeconds) <= 0) {
        if (restLocked) {
          return { kind: 'reminder', reminderReason: 'quota_composite_and_rest' };
        }
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
    return { kind: 'allow' };
  }

  if (currentMode === 'study') {
    if (facts.isStudyDomain) return { kind: 'allow' };

    if (facts.isCompositeDomain) {
      if (Number(facts.remainingCompositeSeconds) > 0) {
        return {
          kind: 'mode_change',
          toMode: 'composite',
          reason: 'study_to_composite',
          source: 'auto_mode_route',
          notice: 'study_to_composite',
        };
      }
      if (restLocked) {
        return { kind: 'reminder', reminderReason: 'quota_composite_and_rest' };
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
      return {
        kind: 'mode_change',
        toMode: 'study',
        reason: 'composite_to_study',
        source: 'auto_mode_route',
        notice: 'composite_to_study',
      };
    }

    if (facts.isCompositeDomain) {
      if (Number(facts.remainingCompositeSeconds) <= 0) {
        if (restLocked) {
          return { kind: 'reminder', reminderReason: 'quota_composite_and_rest' };
        }
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

  const siteClassificationRecords = await getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []);
  const siteClassification = resolveSiteAccessClassification(config, siteClassificationRecords, url);
  const isUnsafe = siteClassification.classification === 'blocked';
  const isRestricted = siteClassification.classification === 'restricted';
  const isStudyDomain = siteClassification.classification === 'study';
  const tabId = Number(event.tabId);
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

  if (config.schedule?.enabled && !isWithinSchedule(config.schedule)) {
    return baseDecision({
      access: 'reminder',
      reminder: { reason: 'schedule', params: {} },
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
  const remainingCompositeSeconds = isCompositeDomain
    ? await computeCompositeRemainingSeconds(config)
    : null;
  const remainingRestSeconds = await computeRestRemainingSeconds(config);
  const route = evaluateModeRoute({
    currentMode,
    restExitGraceUntilMs: modeSnapshot.restExitGraceUntilMs,
    nowMs,
    foreground: event.foreground === true,
    isUnsafe,
    isRestricted,
    isStudyDomain,
    isCompositeDomain,
    remainingCompositeSeconds,
    quotaState,
  });
  const remainingStudySeconds = (
    route?.notice === 'composite_to_study' ||
    route?.notice === 'rest_to_study_success'
  )
    ? await computeStudyRemainingSeconds(config)
    : null;

  const decision = decisionFromRoute(route, {
    fromMode: currentMode,
    domain,
    nowMs,
    remainingCompositeSeconds,
    remainingStudySeconds,
    remainingRestSeconds,
  });
  return {
    ...decision,
    domain,
    config,
    modeSnapshot,
    classification: siteClassification.classification,
  };
}

function handleRequestedModeChange(event = {}) {
  const requested = normalizeMode(event.requestedMode || event.toMode || event.mode);
  if (requested === 'paused') {
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
  return baseDecision({
    modeChange: {
      toMode: requested,
      reason,
      source,
      effectiveAtMs: nowMs,
      persistConfigMode: true,
      clearRestExitGrace: event.type === 'REQUEST_MODE_CHANGE',
    },
    notice: {
      kind: 'manual_mode_change',
      targetMode: requested,
      text: event.noticeText || manualModeNoticeText(requested),
    },
    recheckActiveTab: true,
  });
}

async function handleQuotaEvaluation(event = {}) {
  const source = event.source || 'quota_alarm';
  const quotaResult = await evaluateQuotaState();
  if (!quotaResult?.ok || quotaResult.skipped) {
    return baseDecision({
      access: 'ignore',
      reason: quotaResult?.skipped || 'quota_evaluation_failed',
      quota: quotaResult,
    });
  }

  const config = quotaResult.config || await getConfig();
  const session = await getSession();
  const currentMode = normalizeMode(session?.currentMode || config?.mode);
  const quotaRoute = evaluateQuotaModeTransition({
    currentMode,
    quotaState: quotaResult.newState || config.quotaState || {},
    source,
  });

  if (quotaRoute.kind !== 'mode_change') {
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
    return handleRequestedModeChange(event);
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
