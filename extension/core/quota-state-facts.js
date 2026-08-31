// Quota state facts: current-period identity and non-sticky state composition.

export const QUOTA_TIMEZONE = 'Asia/Shanghai';
export const CLOUD_QUOTA_STATE_FACT_KEY = 'cloud_quota_state_fact_v1';

function dateKeyInTimezone(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function weekStartForDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay();
  const daysBack = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

export function getQuotaCalendarContext(epochMs = Date.now(), timeZone = QUOTA_TIMEZONE) {
  const date = dateKeyInTimezone(epochMs, timeZone);
  return {
    date,
    weekStart: weekStartForDateKey(date),
    timeZone,
  };
}

export function normalizeQuotaState(state = {}) {
  const weeklyRestLocked = state.weeklyRestLocked === true;
  const dailyRestLocked = state.dailyRestLocked === true ||
    (state.restLocked === true && !weeklyRestLocked && state.dailyRestLocked !== false);
  return {
    onlineLocked: state.onlineLocked === true,
    studyLocked: state.studyLocked === true,
    restLocked: state.restLocked === true || dailyRestLocked || weeklyRestLocked,
    undeterminedLocked: state.undeterminedLocked === true,
    dailyRestLocked,
    weeklyRestLocked,
  };
}

export function makeCloudQuotaStateFact(result = {}, context = getQuotaCalendarContext(), computedAt = Date.now()) {
  if (result.date !== context.date || result.weekStart !== context.weekStart) return null;
  return {
    schemaVersion: 1,
    date: result.date,
    weekStart: result.weekStart,
    computedAt: Number(result.computedAt) || computedAt,
    receivedAt: computedAt,
    source: result.source || 'cloud_quota_state',
    state: normalizeQuotaState(result),
    usage: {
      onlineSeconds: Math.max(0, Number(result.onlineSeconds) || 0),
      studySeconds: Math.max(0, Number(result.studySeconds) || 0),
      undeterminedSeconds: Math.max(0, Number(result.undeterminedSeconds) || 0),
      restSeconds: Math.max(0, Number(result.restSeconds) || 0),
      weekRestSeconds: Math.max(0, Number(result.weekRestSeconds) || 0),
    },
  };
}

export function isCloudQuotaStateFactCurrent(fact, context = getQuotaCalendarContext()) {
  return Boolean(
    fact &&
    fact.schemaVersion === 1 &&
    fact.date === context.date &&
    fact.weekStart === context.weekStart &&
    fact.state &&
    Number.isFinite(Number(fact.computedAt))
  );
}

export function combineQuotaStates(localState = {}, cloudFact = null, context = getQuotaCalendarContext()) {
  const local = normalizeQuotaState(localState);
  const cloud = isCloudQuotaStateFactCurrent(cloudFact, context)
    ? normalizeQuotaState(cloudFact.state)
    : normalizeQuotaState();
  const dailyRestLocked = local.dailyRestLocked || cloud.dailyRestLocked;
  const weeklyRestLocked = local.weeklyRestLocked || cloud.weeklyRestLocked;
  return {
    onlineLocked: local.onlineLocked || cloud.onlineLocked,
    studyLocked: local.studyLocked || cloud.studyLocked,
    restLocked: local.restLocked || cloud.restLocked || dailyRestLocked || weeklyRestLocked,
    undeterminedLocked: local.undeterminedLocked || cloud.undeterminedLocked,
    dailyRestLocked,
    weeklyRestLocked,
  };
}

export function restQuotaReminderReason(quotaState = {}) {
  if (quotaState.weeklyRestLocked === true) return 'weekly_rest_locked';
  if (quotaState.dailyRestLocked === true) return 'daily_rest_locked';
  return 'rest_locked';
}
