import { createSharedBrowserExecutionPreparation, readBrowserExecutionContext } from './shared-browser-execution-preparation.js';
import { sharedBrowserExecutionEligibility } from '../core/shared-browser-execution.js';
import { sharedReminderIdentity } from '../core/shared-reminder-lifecycle.js';
import { requestSharedReminderLifecycle } from '../infra/native-host-client.js';
import { createSharedBrowserCloser, readSharedBrowserCloseCapability } from './shared-browser-closer.js';

export function createSharedBrowserExecutor({ enabled = false, effectsEnabled = false,
  preparation = createSharedBrowserExecutionPreparation({ enabled }), readContext = readBrowserExecutionContext,
  request = requestSharedReminderLifecycle, closer = null, readCapability = readSharedBrowserCloseCapability,
  now = () => Math.floor(performance.now()) } = {}) {
  let busy = false;
  const unconfirmed = new Map();
  return { async execute(state, target) {
    if (!enabled || !effectsEnabled) return { ok: true, skipped: true, effectsEnabled: false };
    if (busy) return { ok: false, errorCode: 'shared_browser_execution_busy' };
    if (state?.status !== 'resolved' || !['end_rest', 'timeout_end'].includes(state.resolution))
      return { ok: true, skipped: true, reason: 'shared_browser_execution_not_resolved' };
    busy = true;
    try {
      const pending = unconfirmed.get(JSON.stringify(sharedReminderIdentity(state)));
      if (pending) return await acknowledge(pending);
      const capability = await readCapability();
      if (!capability?.available) return { ok: false,
        errorCode: capability?.errorCode || 'shared_browser_close_permission_unavailable', effectsEnabled: false };
      const start = now(), checked = await preparation.inspect(state.date);
      if (!checked?.eligible) return { ok: false, errorCode: checked?.reasonCode || checked?.errorCode || 'shared_browser_execution_not_issued' };
      const permit = checked.permit;
      if (Object.entries(sharedReminderIdentity(state)).some(([k, v]) =>
        (k === 'stateRevision' ? permit.triggerStateRevision ?? permit.stateRevision : permit[k]) !== v)
        || permit.effect !== (state.resolution === 'end_rest' ? 'request-normal-close' : 'force-close')
        || state.resolution === 'timeout_end' && state.timeoutAction !== 'end')
        return { ok: false, errorCode: 'shared_browser_execution_resolution_mismatch' };
      if (unconfirmed.size >= 20) return { ok: false, errorCode: 'shared_browser_execution_ack_backlog' };
      const claimed = await preparation.claim(permit);
      if (!claimed?.ok) return claimed;
      const isCurrent = async () => sharedBrowserExecutionEligibility(permit, {
        ...await readContext(state), reminder: sharedReminderIdentity(state), attemptedIds: new Set(),
        requestStartedMonotonicMs: start, monotonicNowMs: now(),
      }).eligible;
      if (!await isCurrent()) return { ok: false, errorCode: 'shared_browser_execution_stale', registered: true };
      const result = await (closer || createSharedBrowserCloser()).close(target, permit.effect, isCurrent);
      const payload = { ...sharedReminderIdentity(permit),
        ...(permit.triggerStateRevision === undefined ? {} : { triggerStateRevision: permit.triggerStateRevision }),
        executionId: permit.executionId, leaseId: permit.leaseId,
        activityId: permit.activityId, outcome: result.outcome };
      unconfirmed.set(JSON.stringify(sharedReminderIdentity(state)), payload);
      return await acknowledge(payload);
    } catch (_) { return { ok: false, errorCode: 'shared_browser_execution_failed' }; }
    finally { busy = false; }
  } };
  async function acknowledge(payload) {
    const response = await request('acknowledgeBrowserExecution', payload);
      if (response?.ok) unconfirmed.delete(JSON.stringify({ ...sharedReminderIdentity(payload),
        stateRevision: payload.triggerStateRevision ?? payload.stateRevision }));
    return { ...response, outcome: payload.outcome, effectsEnabled: true };
  }
}
