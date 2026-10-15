const MAX_GRANTS = 128;

function validKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function validSeconds(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons) || !reasons.length || reasons.some(reason => !validKey(reason))) return null;
  return [...new Set(reasons)].sort();
}

function validState(state) {
  return state && state.schemaVersion === 1 && validKey(state.identityKey)
    && /^\d{4}-\d{2}-\d{2}$/.test(state.dateKey)
    && (state.lastAcknowledgedUsageSeconds === null || validSeconds(state.lastAcknowledgedUsageSeconds))
    && state.grants && typeof state.grants === 'object' && !Array.isArray(state.grants)
    && Object.keys(state.grants).length <= MAX_GRANTS
    && Object.entries(state.grants).every(([key, reasons]) => validKey(key)
      && normalizeReasons(reasons) !== null);
}

function currentState(state, identityKey, dateKey) {
  if (state === null || state === undefined || state.identityKey !== identityKey || state.dateKey !== dateKey) {
    return { schemaVersion: 1, identityKey, dateKey, lastAcknowledgedUsageSeconds: null, grants: {} };
  }
  return state;
}

export function evaluateForcedUseReminderProgress({ state = null, identityKey, dateKey,
  ruleKey, reasons, forcedUsageSeconds, intervalMinutes } = {}) {
  const uniqueReasons = normalizeReasons(reasons);
  if (!validKey(identityKey) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')
    || !validKey(ruleKey) || !uniqueReasons || !validSeconds(forcedUsageSeconds)
    || !Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440
    || state != null && !validState(state)) {
    return { ok: false, reason: 'reminder_progress_unavailable' };
  }
  const current = currentState(state, identityKey, dateKey);
  const granted = current.grants[ruleKey] || [];
  const newReasons = uniqueReasons.filter(reason => !granted.includes(reason));
  const baseline = current.lastAcknowledgedUsageSeconds;
  if (baseline !== null && forcedUsageSeconds < baseline) {
    return { ok: false, reason: 'reminder_usage_regressed' };
  }
  // A due reminder also covers new entry reasons, so one confirmation handles both.
  const action = baseline === null ? 'entry'
    : forcedUsageSeconds - baseline >= intervalMinutes * 60 ? 'repeat'
      : newReasons.length ? 'entry' : 'none';
  return { ok: true, action, reasons: uniqueReasons, newReasons, identityKey, dateKey,
    ruleKey, forcedUsageSeconds, baselineSeconds: baseline };
}

export function acknowledgeForcedUseReminderProgress(state, decision) {
  if (!decision?.ok || !['entry', 'repeat'].includes(decision.action)
    || !validKey(decision.identityKey) || !/^\d{4}-\d{2}-\d{2}$/.test(decision.dateKey || '')
    || !validKey(decision.ruleKey) || !validSeconds(decision.forcedUsageSeconds)
    || !normalizeReasons(decision.reasons) || state != null && !validState(state)) {
    return { ok: false, reason: 'reminder_ack_invalid' };
  }
  if (state != null && (state.identityKey !== decision.identityKey || state.dateKey !== decision.dateKey)) {
    return { ok: false, reason: 'reminder_ack_stale' };
  }
  const current = currentState(state, decision.identityKey, decision.dateKey);
  if (current.lastAcknowledgedUsageSeconds !== decision.baselineSeconds
    || Object.keys(current.grants).length >= MAX_GRANTS && !Object.hasOwn(current.grants, decision.ruleKey)) {
    return { ok: false, reason: 'reminder_ack_stale' };
  }
  const grants = { ...current.grants,
    [decision.ruleKey]: normalizeReasons([...(current.grants[decision.ruleKey] || []), ...decision.reasons]) };
  return { ok: true, state: { ...current,
    lastAcknowledgedUsageSeconds: current.lastAcknowledgedUsageSeconds === null || decision.action === 'repeat'
      ? decision.forcedUsageSeconds : current.lastAcknowledgedUsageSeconds, grants } };
}
