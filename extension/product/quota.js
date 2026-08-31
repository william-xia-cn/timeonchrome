// product/quota.js — 配额事实计算 + 借用逻辑

import { getConfig, saveConfig } from '../infra/storage.js';
import { getQuotaUsageView } from '../stats/managed-statistics.js';
import { getEffectiveQuotaForDate } from '../core/quota-config.js';
import { logFallbackEventBestEffort } from '../infra/client-logs.js';
import {
  CLOUD_QUOTA_STATE_FACT_KEY,
  combineQuotaStates,
  getQuotaCalendarContext,
  isCloudQuotaStateFactCurrent,
} from '../core/quota-state-facts.js';

let borrowInProgress = false;
let lastLegacyQuotaFallbackLogAt = 0;
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};

// ── Week rest calculation ───────────────────────────────────────────────────────

export async function getWeekRestSeconds() {
  const config = await getConfig();
  const view = await getQuotaUsageView(getQuotaCalendarContext().date, { config });
  return view.weekRestSeconds;
}

export function getTodayEffectiveRestLimit(config) {
  return getEffectiveQuotaForDate(config, getQuotaCalendarContext().date).todayEffectiveQuota.restMinutes;
}

// ── Quota check ─────────────────────────────────────────────────────────────────

export function buildQuotaStateFromUsage(config = {}, usage = {}, dateKey = getQuotaCalendarContext().date) {
  const totalMinutes = Math.max(0, Number(usage.totalMinutes) || 0);
  const studyMinutes = Math.max(0, Number(usage.studyMinutes) || 0);
  const restMinutes = Math.max(0, Number(usage.restMinutes) || 0);
  const undeterminedMinutes = Math.max(0, Number(usage.undeterminedMinutes ?? usage.compositeMinutes) || 0);
  const weekRestMinutes = Math.max(0, Number(usage.weekRestMinutes) || 0);

  const quota = getEffectiveQuotaForDate(config, dateKey).todayEffectiveQuota;
  const isLimited = (minutes) => minutes !== null && minutes !== undefined && Number.isFinite(Number(minutes));

  const restLockedByDay = isLimited(quota.restMinutes) && restMinutes >= Number(quota.restMinutes);
  const restLockedByWeek = isLimited(quota.weeklyRestMinutes) && weekRestMinutes >= Number(quota.weeklyRestMinutes);

  return {
    onlineLocked: isLimited(quota.onlineMinutes) && totalMinutes >= Number(quota.onlineMinutes),
    studyLocked: isLimited(quota.studyMinutes) && studyMinutes >= Number(quota.studyMinutes),
    restLocked: restLockedByDay || restLockedByWeek,
    undeterminedLocked: isLimited(quota.compositeMinutes) && undeterminedMinutes >= Number(quota.compositeMinutes),
    dailyRestLocked: restLockedByDay,
    weeklyRestLocked: restLockedByWeek,
  };
}

function quotaStateChanged(a = {}, b = {}) {
  return a.onlineLocked !== b.onlineLocked ||
    a.studyLocked !== b.studyLocked ||
    a.restLocked !== b.restLocked ||
    a.undeterminedLocked !== b.undeterminedLocked ||
    a.dailyRestLocked !== b.dailyRestLocked ||
    a.weeklyRestLocked !== b.weeklyRestLocked;
}

export async function evaluateQuotaState() {
  const config = await getConfig();
  if (!config.enabled) {
    return { ok: true, skipped: 'config_disabled', stateChanged: false, config };
  }

  const calendar = getQuotaCalendarContext();
  const effectiveQuota = getEffectiveQuotaForDate(config, calendar.date);
  const daySources = effectiveQuota?.source?.day || {};
  const usesLegacyQuota = Object.values(daySources).includes('legacy') ||
    effectiveQuota?.source?.online === 'legacy' ||
    effectiveQuota?.source?.weeklyRest === 'legacy';
  const nowMs = Date.now();
  if (usesLegacyQuota && nowMs - lastLegacyQuotaFallbackLogAt > 60 * 60 * 1000) {
    lastLegacyQuotaFallbackLogAt = nowMs;
    recordFallbackLog({
      level: 'warning',
      category: 'access',
      eventCode: 'quota_eval_fallback_legacy_config',
      module: 'product/quota',
      reason: 'legacy_quota_config',
      message: 'Quota evaluation used legacy quota fields as compatibility fallback',
      details: {
        dateKey: calendar.date,
        daySources,
        onlineSource: effectiveQuota?.source?.online || null,
        weeklyRestSource: effectiveQuota?.source?.weeklyRest || null,
      },
    });
  }

  const usage = await getQuotaUsageView(calendar.date, { config });
  if (usage?.ok === false) {
    recordFallbackLog({
      level: 'error',
      category: 'storage',
      eventCode: 'quota_usage_view_failed',
      module: 'product/quota',
      reason: 'quota_usage_view_failed',
      message: usage.error || 'Quota usage view failed',
      details: { dateKey: calendar.date, quotaSource: usage.quotaSource || usage.source || null },
    });
    return {
      ok: true,
      skipped: 'quota_usage_unavailable',
      error: usage.error || 'Quota usage view failed',
      usage,
      config,
      stateChanged: false,
    };
  }
  const oldState = config.quotaState || {};
  const localState = buildQuotaStateFromUsage(config, usage, calendar.date);
  const factStorage = await chrome.storage.local.get([CLOUD_QUOTA_STATE_FACT_KEY]);
  const cloudFact = factStorage?.[CLOUD_QUOTA_STATE_FACT_KEY] || null;
  const cloudFactCurrent = isCloudQuotaStateFactCurrent(cloudFact, calendar);
  if (cloudFact && !cloudFactCurrent) {
    await chrome.storage.local.remove(CLOUD_QUOTA_STATE_FACT_KEY);
    recordFallbackLog({
      level: 'warning',
      category: 'access',
      eventCode: 'cloud_quota_fact_period_mismatch',
      module: 'product/quota',
      reason: 'quota_period_changed',
      message: 'Stale cloud quota fact ignored for current quota period',
      details: {
        currentDate: calendar.date,
        currentWeekStart: calendar.weekStart,
        factDate: cloudFact.date || null,
        factWeekStart: cloudFact.weekStart || null,
      },
    });
  }
  const newState = combineQuotaStates(localState, cloudFactCurrent ? cloudFact : null, calendar);
  const stateChanged = quotaStateChanged(newState, oldState);

  if (stateChanged) {
    config.quotaState = newState;
    await saveConfig(config);
    recordFallbackLog({
      level: 'info',
      category: 'access',
      eventCode: 'quota_state_evaluated',
      module: 'product/quota',
      reason: 'quota_state_changed',
      message: 'Quota state changed from current-period facts',
      details: {
        date: calendar.date,
        weekStart: calendar.weekStart,
        localRestSeconds: Math.max(0, Number(usage.restSeconds) || 0),
        localWeekRestSeconds: Math.max(0, Number(usage.weekRestSeconds) || 0),
        cloudRestSeconds: cloudFactCurrent ? cloudFact.usage?.restSeconds || 0 : null,
        cloudWeekRestSeconds: cloudFactCurrent ? cloudFact.usage?.weekRestSeconds || 0 : null,
        dailyRestLimitMinutes: effectiveQuota.todayEffectiveQuota.restMinutes,
        weeklyRestLimitMinutes: effectiveQuota.todayEffectiveQuota.weeklyRestMinutes,
        dailyRestLocked: newState.dailyRestLocked,
        weeklyRestLocked: newState.weeklyRestLocked,
      },
    });
  }

  // Single domain quota check
  const newlyLocked = [];
  for (const [domain, seconds] of Object.entries(usage.domainSeconds || {})) {
    const minutes = Math.floor(seconds / 60);
    const quota = config.domainQuotas?.[domain];
    if (quota && quota > 0 && minutes >= quota) {
      if (!(config.lockedDomains || []).includes(domain)) {
        newlyLocked.push(domain);
      }
    }
  }

  if (newlyLocked.length > 0) {
    config.lockedDomains = [...(config.lockedDomains || []), ...newlyLocked];
    await saveConfig(config);
  }

  return {
    ok: true,
    usage,
    calendar,
    localState,
    cloudState: cloudFactCurrent ? cloudFact.state : null,
    oldState,
    newState,
    stateChanged,
    newlyLockedDomains: newlyLocked,
    config,
  };
}

// ── Borrow rest quota ───────────────────────────────────────────────────────────

export async function borrowRestQuota(updateDeclarativeRulesFn) {
  return { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' };
}
