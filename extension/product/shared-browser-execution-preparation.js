import { requestSharedReminderLifecycle } from '../infra/native-host-client.js';
import { sharedReminderIdentity } from '../core/shared-reminder-lifecycle.js';
import { sharedBrowserExecutionAttempts } from '../infra/shared-browser-execution-attempts.js';
import { browserExecutionFence } from '../infra/shared-browser-execution-fence.js';
import { checkSharedExecutionV2, sharedExecutionEligibilityV2 } from '../core/shared-forced-use-runtime-v2.js';

// No execution callback: even an eligible explicit permit cannot close a page here.
export function createSharedBrowserExecutionPreparation({ enabled = false, schemaVersion = 2, request = requestSharedReminderLifecycle,
  readContext, readAttemptedIds = sharedBrowserExecutionAttempts.readAttemptedIds,
  claimAttempt = sharedBrowserExecutionAttempts.claimAttempt,
  fence = browserExecutionFence,
  now = () => Math.floor(performance.now()) } = {}) {
  let busy = false;
  let candidate = null;
  async function inspect(date) {
    if (!enabled || schemaVersion !== 2) return { ok: true, skipped: true, reason: 'browser_execution_preparation_disabled' };
    if (busy) return { ok: false, errorCode: 'browser_execution_preparation_busy' };
    busy = true;
    candidate = null;
    const generation = fence.capture();
    try {
      const response = await request('getSharedReminderState', { schemaVersion: 2, date });
      if (!response?.ok) return response || { ok: false, errorCode: 'shared_reminder_unavailable' };
      if (!response.browserExecution) return { ok: true, eligible: false, reasonCode: 'browser_execution_not_issued' };
      const checked = checkSharedExecutionV2(response.browserExecution);
      if (checked.ok && checked.payload.schemaVersion !== schemaVersion) return { ok: false, errorCode: 'shared_execution_version_mismatch' };
      if (!checked.ok) return checked;
      if (!response.state || typeof readContext !== 'function') return { ok: false, errorCode: 'browser_execution_context_unavailable' };
      const current = await readContext(response.state);
      const attemptedIds = await readAttemptedIds();
      if (!fence.current(generation)) return { ok: false, errorCode: 'browser_execution_generation_changed' };
      if (!(attemptedIds instanceof Set)) return { ok: false, errorCode: 'browser_execution_attempts_unavailable' };
      const context = { ...current, reminder: sharedReminderIdentity(response.state), attemptedIds,
        requestStartedMonotonicMs: response.requestStartedMonotonicMs, monotonicNowMs: now() };
      const eligibility = sharedExecutionEligibilityV2(checked.payload, context);
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
      const checked = checkSharedExecutionV2(permit);
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
        const eligibility = sharedExecutionEligibilityV2(checked.payload, context);
        if (!fence.current(prepared.generation)) return { ok: false, errorCode: 'browser_execution_generation_changed' };
        if (!eligibility.eligible) return { ok: false, errorCode: eligibility.reasonCode };
        const claimed = await claimAttempt(checked.payload.executionId, checked.payload.leaseId, checked.payload, prepared.generation);
        if (!claimed?.ok) return claimed;
        const rechecked = sharedExecutionEligibilityV2(checked.payload, {
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
