const EXECUTION_ID_FIELDS = ['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision',
  'executionId', 'leaseId', 'activityId'];
export function validateSharedBrowserExecution(value, ack = false) {
  const fields = [...EXECUTION_ID_FIELDS, ...(ack ? ['outcome'] : ['targetSource', 'effect', 'maxAgeMs'])];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
    || !fields.every(field => Object.hasOwn(value, field)) || value.schemaVersion !== 1
    || !EXECUTION_ID_FIELDS.slice(1).every(field => typeof value[field] === 'string' && value[field].trim()
      && value[field].length <= 128)
    || (ack ? !['completed', 'canceled', 'failed', 'stale'].includes(value.outcome)
      : value.targetSource !== 'browser' || !['request-normal-close', 'force-close'].includes(value.effect)
        || !Number.isSafeInteger(value.maxAgeMs) || value.maxAgeMs < 1 || value.maxAgeMs > 5000)) {
    return { ok: false, errorCode: 'INVALID_SHARED_BROWSER_EXECUTION' };
  }
  return { ok: true, payload: { ...value } };
}

export function sharedBrowserExecutionEligibility(value, context) {
  const checked = validateSharedBrowserExecution(value);
  if (!checked.ok) return { eligible: false, reasonCode: checked.errorCode };
  const permit = checked.payload;
  const reject = reasonCode => ({ eligible: false, reasonCode });
  if (context?.attemptedIds?.has(permit.executionId)) return reject('SHARED_BROWSER_EXECUTION_ALREADY_ATTEMPTED');
  if (!context?.connectionCurrent || context.leaseId !== permit.leaseId) return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if (context.activityId !== permit.activityId || !context.restEligible) return reject('SHARED_BROWSER_ACTIVITY_CHANGED');
  if (EXECUTION_ID_FIELDS.slice(0, 6).some(field => context.reminder?.[field] !== permit[field])) {
    return reject('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
  }
  if (context.policyRevision !== permit.policyRevision || context.stateRevision !== permit.stateRevision) {
    return reject('SHARED_REMINDER_SCOPE_CHANGED');
  }
  if (![context.monotonicNowMs, context.requestStartedMonotonicMs].every(time => Number.isSafeInteger(time) && time >= 0)
    || context.monotonicNowMs < context.requestStartedMonotonicMs) return reject('INVALID_SHARED_BROWSER_EXECUTION_CLOCK');
  if (context.monotonicNowMs - context.requestStartedMonotonicMs >= permit.maxAgeMs) return reject('SHARED_BROWSER_EXECUTION_EXPIRED');
  return { eligible: true, reasonCode: null };
}

export function validateSharedBrowserExecutionOutcome(permit, ack) {
  const first = validateSharedBrowserExecution(permit);
  const second = validateSharedBrowserExecution(ack, true);
  if (!first.ok || !second.ok) return { ok: false, errorCode: 'INVALID_SHARED_BROWSER_EXECUTION' };
  if (EXECUTION_ID_FIELDS.some(field => permit[field] !== ack[field])) {
    return { ok: false, errorCode: 'SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED' };
  }
  if (permit.effect === 'force-close' && ack.outcome === 'canceled') {
    return { ok: false, errorCode: 'SHARED_BROWSER_EXECUTION_RESULT_CONFLICT' };
  }
  return second;
}
