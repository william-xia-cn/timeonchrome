// runtime/recovery.js — extension lifecycle boundary recovery

import { appendEvent, EVENT_TYPE } from '../core/event-log.js';
import { isCountedState } from '../core/usage-segments.js';
import { getSession, getSessionWithPersistenceSource, runSessionCommit, saveSession, settleCurrentSessionSegment } from './session.js';

export const RECOVERY_ESTIMATE_MS = 90 * 1000;

function emptySession(now = Date.now()) {
  return {
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: now,
  };
}

/**
 * 恢复未闭合事件
 * 仅在 extension lifecycle boundary 调用（onStartup / onInstalled）。
 * 不把普通 MV3 Service Worker module-load / alarm / message 唤醒当作恢复边界。
 */
export async function recover() {
  const commit = typeof runSessionCommit === 'function'
    ? runSessionCommit
    : async (task) => task();

  return commit(async () => {
    const snapshot = typeof getSessionWithPersistenceSource === 'function'
      ? await getSessionWithPersistenceSource()
      : { session: await getSession(), source: 'session' };
    const { session, source } = snapshot;
    const now = Date.now();
    if (!session || !session.state || !session.startTime) {
      return { ok: true, recovered: false, reason: 'no_open_session', source };
    }

    if (!isCountedState(session.state)) {
      await saveSession(emptySession(now));
      return {
        ok: true,
        recovered: true,
        settled: false,
        reason: 'non_counted_state',
        source,
        state: session.state,
        domain: session.domain || null,
      };
    }

    const startTime = Number(session.startTime);
    if (!Number.isFinite(startTime) || startTime <= 0) {
      await saveSession(emptySession(now));
      return {
        ok: true,
        recovered: true,
        settled: false,
        reason: 'invalid_start_time',
        source,
        state: session.state,
        domain: session.domain || null,
      };
    }

    const closeAt = Math.min(now, startTime + RECOVERY_ESTIMATE_MS);
    const durationMs = Math.max(0, closeAt - startTime);
    const durationSeconds = Math.floor(durationMs / 1000);
    if (durationMs <= 0) {
      await saveSession(emptySession(now));
      return {
        ok: true,
        recovered: true,
        settled: false,
        reason: 'non_positive_duration',
        source,
        state: session.state,
        domain: session.domain || null,
      };
    }

    await appendEvent({
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: closeAt,
    });

    const settlement = await settleCurrentSessionSegment(session, closeAt, 'recovery_estimated_close', {
      endReason: 'recovery_estimated_half_checkpoint',
      endOperationSource: 'recovery',
      endAtMs: closeAt,
    });

    await saveSession(emptySession(now));
    return {
      ok: true,
      recovered: true,
      settled: (settlement?.appended || 0) > 0,
      settlement,
      reason: 'recovery_estimated_close',
      source,
      state: session.state,
      domain: session.domain || null,
      startTime,
      closeAt,
      estimateMs: RECOVERY_ESTIMATE_MS,
      durationSeconds,
    };
  });
}
