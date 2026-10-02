// D-114 result candidates for an existing Rest prompt. This module never sends them.

const ACTIONS = {
  user_continue: 'continue',
  user_end: 'end_rest',
  timeout_continue: 'timeout_continue',
  timeout: 'timeout_end',
  delivery_failed_continue: 'delivery_failed_continue',
  delivery_failed: 'delivery_failed_end',
};
const KINDS = new Set(['entry', 'daily', 'weekly']);
const RESULT_FIELDS = ['schemaVersion', 'reminderId', 'policyRevision', 'stateRevision', 'kind',
  'delivery', 'visibleAtMs', 'action', 'resolvedAtMs'];
const RESULT_ACTIONS = new Set(Object.values(ACTIONS));

export function validateSharedReminderResultV1(value) {
  const failed = value?.delivery === 'failed';
  const failureAction = value?.action === 'delivery_failed_continue' || value?.action === 'delivery_failed_end';
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !RESULT_FIELDS.includes(key))
    || value.schemaVersion !== 1
    || !['reminderId', 'policyRevision', 'stateRevision'].every(key => typeof value[key] === 'string'
      && value[key].trim().length > 0 && value[key].length <= 128)
    || !KINDS.has(value.kind) || !RESULT_ACTIONS.has(value.action)
    || !['visible', 'failed'].includes(value.delivery) || failed !== failureAction
    || !Number.isSafeInteger(value.resolvedAtMs) || value.resolvedAtMs < 0
    || (failed ? value.visibleAtMs !== null : !Number.isSafeInteger(value.visibleAtMs)
      || value.visibleAtMs < 0 || value.visibleAtMs > value.resolvedAtMs)
    || (['timeout_continue', 'timeout_end'].includes(value.action)
      && value.resolvedAtMs - value.visibleAtMs < 60_000)) {
    return { ok: false, errorCode: 'shared_reminder_result_invalid' };
  }
  return { ok: true, result: Object.fromEntries(RESULT_FIELDS.map(key => [key, value[key]])) };
}

export function buildSharedReminderResultsV1(prompt, resolution, { policyRevision, stateRevision } = {}) {
  const token = prompt?.token;
  const action = ACTIONS[resolution?.reason];
  const resolvedAtMs = resolution?.at;
  const visibleAtMs = Number.isSafeInteger(prompt?.shownAt) && prompt.shownAt >= 0 ? prompt.shownAt : null;
  const deliveryFailed = action === 'delivery_failed_continue' || action === 'delivery_failed_end';
  const scopes = Array.isArray(prompt?.reminders) && prompt.reminders.length > 0
    ? prompt.reminders.map((item) => item.scope) : [];
  if (typeof token !== 'string' || !token
    || typeof policyRevision !== 'string' || !policyRevision
    || typeof stateRevision !== 'string' || !stateRevision
    || !action || !Number.isSafeInteger(resolvedAtMs) || resolvedAtMs < 0
    || scopes.length === 0 || scopes.some((kind) => !KINDS.has(kind))
    || new Set(scopes).size !== scopes.length
    || (deliveryFailed && visibleAtMs !== null)
    || (!deliveryFailed && (visibleAtMs === null || visibleAtMs > resolvedAtMs))) {
    return { ok: false, errorCode: 'shared_reminder_result_invalid' };
  }

  const results = scopes.map((kind) => ({
    schemaVersion: 1, reminderId: `${token}:${kind}`, policyRevision, stateRevision, kind,
    delivery: deliveryFailed ? 'failed' : 'visible', visibleAtMs, action, resolvedAtMs,
  }));
  if (results.some(result => !validateSharedReminderResultV1(result).ok)) {
    return { ok: false, errorCode: 'shared_reminder_result_invalid' };
  }
  return { ok: true, results };
}
