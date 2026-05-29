// runtime/recovery.js — extension lifecycle boundary recovery

import { appendEvent, EVENT_TYPE } from '../core/event-log.js';
import { emitTimingInbound } from '../core/timing-trace.js';
import { isCountedState } from '../core/usage-segments.js';
import { logFallbackEventBestEffort } from '../infra/client-logs.js';
import { getSession, getSessionWithPersistenceSource, runSessionCommit, saveSession, settleCurrentSessionSegment } from './session.js';

export const RECOVERY_ESTIMATE_MS = 90 * 1000;
const GUARDIAN_SESSION_KEY = 'guardian_session';
const GUARDIAN_CONFIG_KEY = 'guardian_config';
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};
const emitInboundTrace = (...args) => (
  typeof emitTimingInbound === 'function'
    ? emitTimingInbound(...args)
    : null
);

function emptySession(now = Date.now()) {
  return {
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: now,
  };
}

function normalizeMode(mode) {
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  if (mode === 'study' || mode === 'composite' || mode === 'rest' || mode === 'locked' || mode === 'paused') return mode;
  return null;
}

async function readRecoveryMode() {
  try {
    const data = await chrome.storage.local.get([GUARDIAN_SESSION_KEY, GUARDIAN_CONFIG_KEY]);
    return normalizeMode(data?.[GUARDIAN_SESSION_KEY]?.currentMode) ||
      normalizeMode(data?.[GUARDIAN_CONFIG_KEY]?.mode) ||
      null;
  } catch {
    return null;
  }
}

/**
 * 恢复未闭合事件
 * 仅在 extension lifecycle boundary 调用（onStartup / onInstalled）。
 * 不把普通 MV3 Service Worker module-load / alarm / message 唤醒当作恢复边界。
 */
export async function recover() {
  const auditId = await emitInboundTrace('timing_inbound_received', {
    type: 'lifecycle_recovery',
    _reason: 'recover',
    source: 'extension_lifecycle',
    timestamp: Date.now(),
  }, {
    source: 'recovery',
  });
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
      await emitInboundTrace('timing_inbound_skipped', {
        type: 'lifecycle_recovery',
        _reason: 'recover',
        source: 'extension_lifecycle',
        timestamp: now,
        auditId,
      }, {
        auditId,
        source: 'recovery',
        reason: 'no_open_session',
        payload: { skippedReason: 'no_open_session', persistenceSource: source },
      });
      return { ok: true, recovered: false, reason: 'no_open_session', source };
    }

    if (!isCountedState(session.state)) {
      await saveSession(emptySession(now));
      await emitInboundTrace('timing_inbound_skipped', {
        type: 'lifecycle_recovery',
        _reason: 'recover',
        source: 'extension_lifecycle',
        timestamp: now,
        auditId,
      }, {
        auditId,
        source: 'recovery',
        reason: 'non_counted_state',
        payload: { skippedReason: 'non_counted_state', persistenceSource: source },
      });
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
      await emitInboundTrace('timing_inbound_skipped', {
        type: 'lifecycle_recovery',
        _reason: 'recover',
        source: 'extension_lifecycle',
        timestamp: now,
        auditId,
      }, {
        auditId,
        source: 'recovery',
        reason: 'invalid_start_time',
        payload: { skippedReason: 'invalid_start_time', persistenceSource: source },
      });
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
      await emitInboundTrace('timing_inbound_skipped', {
        type: 'lifecycle_recovery',
        _reason: 'recover',
        source: 'extension_lifecycle',
        timestamp: now,
        auditId,
      }, {
        auditId,
        source: 'recovery',
        reason: 'non_positive_duration',
        payload: { skippedReason: 'non_positive_duration', persistenceSource: source },
      });
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

    const modeOverride = await readRecoveryMode();
    const settlement = await settleCurrentSessionSegment(session, closeAt, 'recovery_estimated_close', {
      endReason: 'recovery_estimated_half_checkpoint',
      endOperationSource: 'recovery',
      endAtMs: closeAt,
      modeOverride,
    });

    await saveSession(emptySession(now));
    await emitInboundTrace('timing_inbound_routed', {
      type: 'lifecycle_recovery',
      _reason: 'recover',
      source: 'extension_lifecycle',
      timestamp: now,
      auditId,
      domain: session.domain || null,
    }, {
      auditId,
      source: 'recovery',
      reason: 'recovery_estimated_close',
      payload: {
        route: 'residual_open_session',
        persistenceSource: source,
        state: session.state || null,
        closeAt,
        durationSeconds,
      },
    });
    recordFallbackLog({
      level: 'warning',
      category: 'timing',
      eventCode: 'recovery_estimated_close',
      module: 'runtime/recovery',
      reason: 'recovery_estimated_half_checkpoint',
      message: 'Recovery used estimated close fallback for residual open session',
      domain: session.domain || null,
      details: {
        state: session.state || null,
        source,
        startTime,
        closeAt,
        estimateMs: RECOVERY_ESTIMATE_MS,
        durationSeconds,
        settled: (settlement?.appended || 0) > 0,
      },
    });
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
