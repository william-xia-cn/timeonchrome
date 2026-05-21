// product/quota.js — 配额事实计算 + 借用逻辑

import { getConfig, saveConfig, getDateKey, formatDate } from '../infra/storage.js';
import { getQuotaUsageView } from '../stats/managed-statistics.js';

let borrowInProgress = false;

// ── Week rest calculation ───────────────────────────────────────────────────────

export async function getWeekRestSeconds() {
  const config = await getConfig();
  const view = await getQuotaUsageView(getDateKey(), { config });
  return view.weekRestSeconds;
}

export function getTodayEffectiveRestLimit(config) {
  const baseLimit = config.dailyRestQuota ?? 120;
  const borrow = config.quotaBorrow;
  if (!borrow || borrow.repaid) return baseLimit;

  const today = getDateKey();
  if (today === borrow.borrowedFrom) {
    return baseLimit + borrow.amount;
  }

  const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
  repayD.setDate(repayD.getDate() + 1);
  const repayStr = formatDate(repayD);
  if (today === repayStr) {
    return Math.max(0, baseLimit - borrow.amount);
  }

  return baseLimit;
}

// ── Quota check ─────────────────────────────────────────────────────────────────

export function buildQuotaStateFromUsage(config = {}, usage = {}) {
  const totalMinutes = usage.totalMinutes;
  const studyMinutes = usage.studyMinutes;
  const restMinutes = usage.restMinutes;
  const undeterminedMinutes = usage.undeterminedMinutes;
  const weekRestMinutes = usage.weekRestMinutes;

  const dailyOnlineQuota = config.dailyOnlineQuota ?? config.dailyQuota ?? 0;
  const dailyUndeterminedQuota = config.dailyUndeterminedQuota ?? 60;
  const effectiveDailyRest = getTodayEffectiveRestLimit(config);
  const weeklyRestLimit = config.weeklyRestQuota ?? (effectiveDailyRest * 7);

  const restLockedByDay = effectiveDailyRest > 0 && restMinutes >= effectiveDailyRest;
  const restLockedByWeek = weeklyRestLimit > 0 && weekRestMinutes >= weeklyRestLimit;

  return {
    onlineLocked: dailyOnlineQuota > 0 && totalMinutes >= dailyOnlineQuota,
    studyLocked: (config.dailyStudyQuota || 0) > 0 && studyMinutes >= config.dailyStudyQuota,
    restLocked: restLockedByDay || restLockedByWeek,
    undeterminedLocked: dailyUndeterminedQuota > 0 && undeterminedMinutes >= dailyUndeterminedQuota,
    weeklyRestLocked: restLockedByWeek,
  };
}

function quotaStateChanged(a = {}, b = {}) {
  return a.onlineLocked !== b.onlineLocked ||
    a.studyLocked !== b.studyLocked ||
    a.restLocked !== b.restLocked ||
    a.undeterminedLocked !== b.undeterminedLocked ||
    a.weeklyRestLocked !== b.weeklyRestLocked;
}

export async function evaluateQuotaState() {
  const config = await getConfig();
  if (!config.enabled) {
    return { ok: true, skipped: 'config_disabled', stateChanged: false, config };
  }

  const usage = await getQuotaUsageView(getDateKey(), { config });
  const oldState = config.quotaState || {};
  const newState = buildQuotaStateFromUsage(config, usage);
  const stateChanged = quotaStateChanged(newState, oldState);

  if (stateChanged) {
    config.quotaState = newState;
    await saveConfig(config);
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
