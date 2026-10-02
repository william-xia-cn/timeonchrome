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

  return { ok: true, results: scopes.map((kind) => ({
    schemaVersion: 1, reminderId: `${token}:${kind}`, policyRevision, stateRevision, kind,
    delivery: deliveryFailed ? 'failed' : 'visible', visibleAtMs, action, resolvedAtMs,
  })) };
}
