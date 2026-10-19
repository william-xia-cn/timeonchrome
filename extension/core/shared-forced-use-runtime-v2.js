import { validateSharedBrowserActivityV2, validateSharedBrowserActivityAckV2,
  validateSharedReminderStateQueryV2,
  validateSharedReminderStateV2, validateSharedReminderDeliveryAckV2, validateSharedReminderResolutionV2,
  validateSharedBrowserExecutionV2, validateSharedBrowserExecutionAckV2 } from './shared-contracts/1.58.0/shared-reminder-lifecycle.js';

export function checkSharedActivityV2(value) {
  try { return { ok: true, payload: validateSharedBrowserActivityV2(value) }; }
  catch (_) { return { ok: false, errorCode: 'INVALID_SHARED_BROWSER_ACTIVITY_V2' }; }
}
export function checkSharedActivityAckV2(value, expected) {
  try { return { ok: true, receipt: validateSharedBrowserActivityAckV2(value, expected) }; }
  catch (_) { return { ok: false, errorCode: 'INVALID_SHARED_BROWSER_ACTIVITY_ACK_V2' }; }
}
export function checkSharedReminderStateV2(value, expected = {}) {
  if (value === null && !expected.roundId) return { ok: true, state: null };
  try {
    const state = validateSharedReminderStateV2(value);
    if (Object.keys(expected).some(key => state[key] !== expected[key])) throw Error('scope');
    return { ok: true, state };
  } catch (_) { return { ok: false, errorCode: 'INVALID_SHARED_REMINDER_STATE_V2' }; }
}
export function checkSharedReminderMessageV2(value, method) {
  try {
    const validate = method === 'getSharedReminderState' ? validateSharedReminderStateQueryV2
      : method === 'acknowledgeSharedReminderDelivery' ? validateSharedReminderDeliveryAckV2
      : method === 'resolveSharedReminder' ? validateSharedReminderResolutionV2
        : method === 'acknowledgeBrowserExecution' ? validateSharedBrowserExecutionAckV2 : null;
    if (!validate) throw Error('method');
    return { ok: true, payload: validate(value) };
  } catch (_) { return { ok: false, errorCode: 'INVALID_SHARED_REMINDER_MESSAGE_V2' }; }
}
export function checkSharedExecutionV2(value) {
  try { return { ok: true, payload: validateSharedBrowserExecutionV2(value) }; }
  catch (_) { return { ok: false, errorCode: 'INVALID_SHARED_BROWSER_EXECUTION_V2' }; }
}

export function sharedExecutionEligibilityV2(value, context) {
  const checked = checkSharedExecutionV2(value);
  const reject = reasonCode => ({ eligible: false, reasonCode });
  if (!checked.ok) return reject(checked.errorCode);
  const permit = checked.payload;
  if (context?.attemptedIds?.has(permit.executionId)) return reject('SHARED_BROWSER_EXECUTION_ALREADY_ATTEMPTED');
  if (!context?.connectionCurrent || context.leaseId !== permit.leaseId) return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if (context.activityId !== permit.activityId || !context.restEligible) return reject('SHARED_BROWSER_ACTIVITY_CHANGED');
  if (['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision']
    .some(key => context.reminder?.[key] !== permit[key])) return reject('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
  if (['schemaVersion', 'revision', 'effectiveAtMs', 'stage', 'policyHash']
    .some(key => context.policyIdentity?.[key] !== permit.policyIdentity[key])) return reject('SHARED_REMINDER_SCOPE_CHANGED');
  if (context.stateRevision !== permit.stateRevision) return reject('SHARED_REMINDER_SCOPE_CHANGED');
  if (![context.monotonicNowMs, context.requestStartedMonotonicMs].every(value => Number.isSafeInteger(value) && value >= 0)
    || context.monotonicNowMs < context.requestStartedMonotonicMs) return reject('INVALID_SHARED_BROWSER_EXECUTION_CLOCK');
  if (context.monotonicNowMs - context.requestStartedMonotonicMs >= permit.maxAgeMs) return reject('SHARED_BROWSER_EXECUTION_EXPIRED');
  return { eligible: true, reasonCode: null };
}
