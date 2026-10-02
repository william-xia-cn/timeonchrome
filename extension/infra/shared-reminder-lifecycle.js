import { sharedReminderIdentity, validateSharedReminderState } from '../core/shared-reminder-lifecycle.js';

// Explicit candidate caller. No bootstrap hook, wall-clock timeout action or Rest mutation.
export function createSharedReminderLifecycle({ enabled = false, request, present, dismiss, update } = {}) {
  let state = null;
  let displayedId = null;
  let displayedDelivery = null;
  let busy = false;
  let generation = 0;
  const identityKey = value => JSON.stringify(sharedReminderIdentity(value));
  const copy = value => value ? { ...value, kinds: [...value.kinds] } : null;

  async function clearDisplay() {
    if (!displayedId) return;
    displayedId = null;
    displayedDelivery = null;
    try { await dismiss?.(); } catch (_) { /* UI cleanup cannot authorize a close. */ }
  }

  async function accept(response, expected = {}, isCurrent = () => true) {
    if (!isCurrent()) return { ok: false, errorCode: 'shared_reminder_context_changed' };
    if (!response?.ok) return response || { ok: false, errorCode: 'shared_reminder_unavailable' };
    const checked = validateSharedReminderState(response.state, expected);
    if (!checked.ok) return checked;
    const next = checked.state;
    if (displayedId && (!next || identityKey(next) !== displayedId
      || next.presenter !== 'browser' || ['resolved', 'withdrawn', 'delivery_failed'].includes(next.status))) {
      await clearDisplay();
    }
    if (!isCurrent()) return { ok: false, errorCode: 'shared_reminder_context_changed' };
    state = next;
    return { ok: true, state: copy(state) };
  }

  async function run(operation) {
    if (enabled !== true) return { ok: true, skipped: true, reason: 'shared_reminder_disabled' };
    if (busy) return { ok: false, errorCode: 'shared_reminder_busy' };
    if (typeof request !== 'function') return { ok: false, errorCode: 'shared_reminder_unavailable' };
    busy = true;
    const captured = generation;
    try { return await operation(() => captured === generation); }
    catch (_) { return { ok: false, errorCode: 'shared_reminder_unavailable' }; }
    finally { busy = false; }
  }

  function poll(date) {
    return run(async isCurrent => {
      const read = await accept(await request('getSharedReminderState', { date }), { date }, isCurrent);
      if (!read.ok || !state || state.presenter !== 'browser'
        || !['offered', 'visible'].includes(state.status)) return read;
      const identity = sharedReminderIdentity(state);
      const key = identityKey(state);
      if (displayedId !== key) {
        let delivery;
        try { delivery = await present?.(copy(state)); } catch (_) { delivery = null; }
        if (!isCurrent()) return { ok: false, errorCode: 'shared_reminder_context_changed' };
        // This ACK is evidence supplied by the display endpoint, not assumed by the sender.
        displayedDelivery = delivery?.visible === true ? 'visible' : 'failed';
        displayedId = key;
      }
      const acknowledged = await accept(await request('acknowledgeSharedReminderDelivery',
        { ...identity, delivery: displayedDelivery }), identity, isCurrent);
      if (acknowledged.ok && state?.status === 'visible' && displayedDelivery === 'visible') {
        await update?.(copy(state));
      }
      return isCurrent() ? acknowledged : { ok: false, errorCode: 'shared_reminder_context_changed' };
    });
  }

  function choose(action) {
    return run(async isCurrent => {
      if (!['continue', 'end_rest'].includes(action)) return { ok: false, errorCode: 'INVALID_SHARED_REMINDER_MESSAGE' };
      if (!state || state.presenter !== 'browser' || state.status !== 'visible'
        || displayedDelivery !== 'visible' || displayedId !== identityKey(state)) {
        return { ok: false, errorCode: 'SHARED_REMINDER_NOT_VISIBLE' };
      }
      const identity = sharedReminderIdentity(state);
      const response = await request('resolveSharedReminder', { ...identity, action });
      // A late button is not a timeout instruction. Refresh explicitly to learn Service's outcome.
      return accept(response, identity, isCurrent);
    });
  }

  async function invalidate() {
    generation++;
    state = null;
    await clearDisplay();
  }
  return { poll, choose, invalidate, inspect: () => ({ state: copy(state), busy, displayed: displayedDelivery === 'visible' }) };
}
