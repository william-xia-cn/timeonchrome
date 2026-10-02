import { requestSharedReminderLifecycle, getSharedBrowserActivityLease } from '../infra/native-host-client.js';
import { sharedReminderIdentity } from '../core/shared-reminder-lifecycle.js';
import { sharedBrowserExecutionEligibility, validateSharedBrowserExecution } from '../core/shared-browser-execution.js';
import { inspectSharedBrowserActivity, readBrowserRestActivity } from './shared-browser-activity.js';
import { sharedBrowserExecutionAttempts } from '../infra/shared-browser-execution-attempts.js';
import { browserExecutionFence } from '../infra/shared-browser-execution-fence.js';

export async function readBrowserExecutionContext(state) {
  const before = inspectSharedBrowserActivity();
  const fact = await readBrowserRestActivity();
  const after = inspectSharedBrowserActivity();
  return { connectionCurrent: !!before?.leaseId && getSharedBrowserActivityLease() === before.leaseId,
    leaseId: after?.leaseId, activityId: after?.activityId,
    restEligible: before?.active === true && after?.active === true && fact.active === true
      && fact.key === before.key && before.key === after.key && before.activityId === after.activityId
      && before.leaseId === after.leaseId,
    policyRevision: state.policyRevision, stateRevision: state.stateRevision };
}

// No execution callback: even an eligible explicit permit cannot close a page here.
export function createSharedBrowserExecutionPreparation({ enabled = false, request = requestSharedReminderLifecycle,
  readContext = readBrowserExecutionContext, readAttemptedIds = sharedBrowserExecutionAttempts.readAttemptedIds,
  claimAttempt = sharedBrowserExecutionAttempts.claimAttempt,
  fence = browserExecutionFence,
  now = () => Math.floor(performance.now()) } = {}) {
  let busy = false;
  let candidate = null;
  async function inspect(date) {
    if (!enabled) return { ok: true, skipped: true, reason: 'browser_execution_preparation_disabled' };
    if (busy) return { ok: false, errorCode: 'browser_execution_preparation_busy' };
    busy = true;
    candidate = null;
    const generation = fence.capture();
    try {
      const response = await request('getSharedReminderState', { date });
      if (!response?.ok) return response || { ok: false, errorCode: 'shared_reminder_unavailable' };
      if (!response.browserExecution) return { ok: true, eligible: false, reasonCode: 'browser_execution_not_issued' };
      const checked = validateSharedBrowserExecution(response.browserExecution);
      if (!checked.ok) return checked;
      if (!response.state || typeof readContext !== 'function') return { ok: false, errorCode: 'browser_execution_context_unavailable' };
      const current = await readContext(response.state);
      const attemptedIds = await readAttemptedIds();
      if (!fence.current(generation)) return { ok: false, errorCode: 'browser_execution_generation_changed' };
      if (!(attemptedIds instanceof Set)) return { ok: false, errorCode: 'browser_execution_attempts_unavailable' };
      const context = { ...current, reminder: sharedReminderIdentity(response.state), attemptedIds,
        requestStartedMonotonicMs: response.requestStartedMonotonicMs, monotonicNowMs: now() };
      const eligibility = sharedBrowserExecutionEligibility(checked.payload, context);
      if (eligibility.eligible) candidate = { permit: checked.payload, state: response.state,
        requestStartedMonotonicMs: response.requestStartedMonotonicMs, generation };
      return { ok: true, ...eligibility, effectsEnabled: false,
        ...(eligibility.eligible ? { permit: checked.payload } : {}) };
    } catch (_) { return { ok: false, errorCode: 'browser_execution_context_unavailable' }; }
    finally { busy = false; }
  }
  return {
    inspect,
    // Durable preparation only. Never executed by inspect, and never invokes effects.
    async claim(permit) {
      if (!enabled || typeof claimAttempt !== 'function') return { ok: false, errorCode: 'browser_execution_claim_disabled' };
      const checked = validateSharedBrowserExecution(permit);
      if (!checked.ok) return checked;
      if (!candidate || JSON.stringify(candidate.permit) !== JSON.stringify(checked.payload)) {
        return { ok: false, errorCode: 'browser_execution_not_prepared' };
      }
      const prepared = candidate;
      candidate = null;
      try {
        const context = { ...await readContext(prepared.state), reminder: sharedReminderIdentity(prepared.state),
          attemptedIds: await readAttemptedIds(), requestStartedMonotonicMs: prepared.requestStartedMonotonicMs,
          monotonicNowMs: now() };
        const eligibility = sharedBrowserExecutionEligibility(checked.payload, context);
        if (!fence.current(prepared.generation)) return { ok: false, errorCode: 'browser_execution_generation_changed' };
        if (!eligibility.eligible) return { ok: false, errorCode: eligibility.reasonCode };
        const claimed = await claimAttempt(checked.payload.executionId, checked.payload.leaseId, checked.payload, prepared.generation);
        if (!claimed?.ok) return claimed;
        const rechecked = sharedBrowserExecutionEligibility(checked.payload, {
          ...await readContext(prepared.state), reminder: sharedReminderIdentity(prepared.state), attemptedIds: new Set(),
          requestStartedMonotonicMs: prepared.requestStartedMonotonicMs, monotonicNowMs: now(),
        });
        if (!fence.current(prepared.generation) || !rechecked.eligible) return { ok: false,
          errorCode: !fence.current(prepared.generation) ? 'browser_execution_generation_changed' : rechecked.reasonCode,
          registered: true, effectsEnabled: false };
        return { ...claimed, registered: true, effectsEnabled: false };
      }
      catch (_) { return { ok: false, errorCode: 'browser_execution_claim_failed' }; }
    },
  };
}

// Explicit read-only caller; never enabled by bootstrap or a reminder button.
export async function inspectSharedBrowserExecution(date, { enabled = false } = {}) {
  return createSharedBrowserExecutionPreparation({ enabled }).inspect(date);
}
