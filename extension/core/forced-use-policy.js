function finiteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function reached(usedSeconds, limitSeconds) {
  return finiteNonnegative(usedSeconds) && finiteNonnegative(limitSeconds) && usedSeconds >= limitSeconds;
}

const OVERRUN_KEYS = ['dailyStudy', 'dailyComposite', 'dailyRest', 'dailyOnline', 'weeklyRest', 'domain'];

export function readForcedUsePolicy(config = {}) {
  const policy = config?.forcedUsePolicyV1;
  if (policy === undefined) return { enabled: false, reason: 'legacy_profile' };
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
    || policy.schemaVersion !== 1 || typeof policy.enabled !== 'boolean'
    || Object.keys(policy).length !== 5
    || !['schemaVersion', 'enabled', 'reminderIntervalMinutes', 'quotaOverrunMinutes',
      'advisoryWindowDailyMaxMinutes'].every(key => Object.hasOwn(policy, key))
    || !Number.isInteger(policy.reminderIntervalMinutes)
    || policy.reminderIntervalMinutes < 1 || policy.reminderIntervalMinutes > 1440) {
    return { enabled: false, reason: 'invalid_policy' };
  }
  const overrun = policy.quotaOverrunMinutes;
  if (!overrun || typeof overrun !== 'object' || Array.isArray(overrun)
    || Object.keys(overrun).length !== OVERRUN_KEYS.length
    || OVERRUN_KEYS.some(key => !Object.hasOwn(overrun, key)
      || overrun[key] !== null && (!Number.isInteger(overrun[key])
        || overrun[key] < 0 || overrun[key] > 10080))) {
    return { enabled: false, reason: 'invalid_policy' };
  }
  const dailyMax = policy.advisoryWindowDailyMaxMinutes;
  if (dailyMax !== null && (!Number.isInteger(dailyMax) || dailyMax < 1 || dailyMax > 1440)) {
    return { enabled: false, reason: 'invalid_policy' };
  }
  return { ...policy, quotaOverrunMinutes: { ...overrun } };
}

export function evaluateForcedUsePolicy({
  absoluteBlocks = [],
  quotas = [],
  advisoryWindow = null,
  forcedUsageSeconds = 0,
  lastReminderUsageSeconds = null,
  reminderIntervalMinutes = 30,
  entryConfirmationRequired = false,
} = {}) {
  const hardReasons = [...absoluteBlocks];
  const advisoryReasons = [];

  for (const quota of quotas) {
    if (!quota || !reached(quota.usedSeconds, quota.limitSeconds)) continue;
    advisoryReasons.push(quota.id);
    const overrunSeconds = quota.overrunSeconds === undefined ? 0 : quota.overrunSeconds;
    if (overrunSeconds !== null && (!finiteNonnegative(overrunSeconds)
      || reached(quota.usedSeconds, quota.limitSeconds + overrunSeconds))) {
      hardReasons.push(quota.id);
    }
  }

  if (advisoryWindow?.active === true) {
    advisoryReasons.push(advisoryWindow.id);
    if (advisoryWindow.maxSeconds !== null && finiteNonnegative(advisoryWindow.maxSeconds)
      && reached(advisoryWindow.usedSeconds, advisoryWindow.maxSeconds)) {
      hardReasons.push(advisoryWindow.id);
    }
  }

  if (hardReasons.length) return { action: 'block', reasons: [...new Set(hardReasons)] };
  if (!advisoryReasons.length) return { action: 'allow', reasons: [] };

  const reasons = [...new Set(advisoryReasons)];
  if (entryConfirmationRequired || lastReminderUsageSeconds === null) {
    return { action: 'confirm', kind: 'entry', reasons };
  }
  if (Number.isInteger(reminderIntervalMinutes) && reminderIntervalMinutes > 0
    && finiteNonnegative(forcedUsageSeconds) && finiteNonnegative(lastReminderUsageSeconds)
    && forcedUsageSeconds - lastReminderUsageSeconds >= reminderIntervalMinutes * 60) {
    return { action: 'confirm', kind: 'repeat', reasons };
  }
  return { action: 'allow', reasons };
}
import { selectForcedUseQuotaFacts } from './forced-use-quota-facts.js';
import { evaluateForcedUseReminderProgress } from './forced-use-reminder-progress.js';


export function decideForcedUseAccess({ policy, quotaFacts, quotaBucket, absoluteBlocks = [],
  advisoryWindow = null, reminderState = null, identityKey, dateKey, ruleKey,
  forcedUsageSeconds } = {}) {
  if (!policy?.enabled || !Array.isArray(absoluteBlocks)
    || absoluteBlocks.some(reason => typeof reason !== 'string' || !reason)
    || !Number.isInteger(policy.reminderIntervalMinutes)
    || policy.reminderIntervalMinutes < 1 || policy.reminderIntervalMinutes > 1440) {
    return { ok: false, action: 'block', reasons: ['forced_use_evidence_unavailable'] };
  }
  if (absoluteBlocks.length) {
    return { ok: true, action: 'block', reasons: [...new Set(absoluteBlocks)] };
  }
  const selected = selectForcedUseQuotaFacts(quotaFacts, quotaBucket);
  if (!selected.ok) {
    return { ok: false, action: 'block', reasons: [selected.reason] };
  }
  if (selected.quotas.some(row => typeof row.id !== 'string' || !row.id
    || !Number.isSafeInteger(row.usedSeconds) || row.usedSeconds < 0
    || !Number.isSafeInteger(row.limitSeconds) || row.limitSeconds < 0
    || row.overrunSeconds !== null && (!Number.isSafeInteger(row.overrunSeconds)
      || row.overrunSeconds < 0))
    || advisoryWindow?.active === true && (typeof advisoryWindow.id !== 'string'
      || !advisoryWindow.id || !Number.isSafeInteger(advisoryWindow.usedSeconds)
      || advisoryWindow.usedSeconds < 0 || advisoryWindow.maxSeconds !== null
      && (!Number.isSafeInteger(advisoryWindow.maxSeconds) || advisoryWindow.maxSeconds < 0))) {
    return { ok: false, action: 'block', reasons: ['forced_use_evidence_unavailable'] };
  }
  const evaluated = evaluateForcedUsePolicy({ absoluteBlocks, quotas: selected.quotas,
    advisoryWindow, forcedUsageSeconds, reminderIntervalMinutes: policy.reminderIntervalMinutes });
  if (evaluated.action === 'block') return { ok: true, ...evaluated };
  if (!evaluated.reasons.length) return { ok: true, action: 'allow', reasons: [] };
  if (!Number.isSafeInteger(forcedUsageSeconds) || forcedUsageSeconds < 0) {
    return { ok: false, action: 'block', reasons: ['forced_use_evidence_unavailable'] };
  }
  const progress = evaluateForcedUseReminderProgress({ state: reminderState, identityKey,
    dateKey, ruleKey, reasons: evaluated.reasons, forcedUsageSeconds,
    intervalMinutes: policy.reminderIntervalMinutes });
  if (!progress.ok) return { ok: false, action: 'block', reasons: [progress.reason] };
  return { ok: true, action: progress.action === 'none' ? 'allow' : 'confirm',
    kind: progress.action === 'none' ? null : progress.action,
    reasons: evaluated.reasons, progress };
}
