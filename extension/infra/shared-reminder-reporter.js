// Opt-in shadow reporting. Delivery failures never invoke a reminder or access action.
import { buildSharedReminderResultsV1 } from '../core/shared-reminder-result.js';

const MAX_RESULTS = 20;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 15 * 60_000;
const RETRYABLE_ERRORS = new Set(['native_host_unavailable', 'native_port_disconnected',
  'native_response_timeout', 'native_post_failed', 'runtime_service_unavailable',
  'shared_reminder_unavailable', 'shared_reminder_busy', 'shared_reminder_invalid_ack',
  'shared_reminder_unsupported', 'shared_reminder_disabled', 'managed_marker_unavailable']);

export function createSharedReminderReporterV1({ enabled = false, sendResult,
  now = () => Date.now() } = {}) {
  const pending = new Map();
  const acknowledged = new Map();
  let inFlight = null;
  const keyFor = result => JSON.stringify([result.policyRevision, result.reminderId]);

  function enqueue(prompt, resolution, versions) {
    if (enabled !== true) return { ok: true, skipped: true, reason: 'shared_reminder_disabled' };
    const built = buildSharedReminderResultsV1(prompt, resolution, versions);
    if (!built.ok) return built;
    const additions = [];
    for (const result of built.results) {
      const key = keyFor(result);
      const fingerprint = JSON.stringify(result);
      const existing = pending.get(key)?.fingerprint || acknowledged.get(key);
      if (existing && existing !== fingerprint) return { ok: false, errorCode: 'shared_reminder_result_conflict' };
      if (!existing) additions.push({ key, result, fingerprint, failures: 0, nextAttemptAt: 0, errorCode: null });
    }
    if (pending.size + additions.length > MAX_RESULTS) return { ok: false, errorCode: 'shared_reminder_queue_full' };
    for (const row of additions) pending.set(row.key, row);
    return { ok: true, queued: additions.length, duplicate: additions.length === 0 };
  }

  async function drain() {
    if (enabled !== true) return { ok: true, skipped: true, reason: 'shared_reminder_disabled' };
    if (typeof sendResult !== 'function') return { ok: false, errorCode: 'shared_reminder_transport_unavailable' };
    for (const [key, row] of pending) {
      if (row.nextAttemptAt === Infinity) continue;
      if (now() < row.nextAttemptAt) return { ok: true, skipped: true,
        reason: 'shared_reminder_retry_wait', pendingCount: pending.size };
      let response;
      try { response = await sendResult({ ...row.result }); }
      catch (_) { response = { ok: false, errorCode: 'shared_reminder_unavailable' }; }
      if (response?.ok === true) {
        pending.delete(key);
        acknowledged.set(key, row.fingerprint);
        if (acknowledged.size > MAX_RESULTS) acknowledged.delete(acknowledged.keys().next().value);
        continue;
      }
      const code = typeof response?.errorCode === 'string' ? response.errorCode : 'shared_reminder_unavailable';
      row.errorCode = RETRYABLE_ERRORS.has(code) || code === 'shared_reminder_not_issued'
        ? code : 'shared_reminder_rejected';
      row.failures = Math.min(9999, row.failures + 1);
      row.nextAttemptAt = RETRYABLE_ERRORS.has(code)
        ? now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(4, row.failures - 1)) : Infinity;
      // One failure ends this flush, leaving other results intact.
      return { ok: false, errorCode: row.errorCode, pendingCount: pending.size };
    }
    const blocked = [...pending.values()].find(row => row.nextAttemptAt === Infinity);
    return blocked ? { ok: false, errorCode: blocked.errorCode, pendingCount: pending.size }
      : { ok: true, pendingCount: pending.size };
  }

  function flush() {
    if (!inFlight) inFlight = drain().finally(() => { inFlight = null; });
    return inFlight;
  }

  return { enqueue, flush, inspect: () => ({ pendingCount: pending.size,
    blockedCount: [...pending.values()].filter(row => row.nextAttemptAt === Infinity).length,
    acknowledgedCount: acknowledged.size, inFlight: inFlight !== null }) };
}
