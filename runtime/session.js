// runtime/session.js — 当前会话快照（单一真相源）+ 状态切换 + 心跳

import { appendEvent, EVENT_TYPE } from '../core/event-log.js';
import { emitTrace } from '../core/timing-trace.js';
import { getReliableCloseTime } from './time-boundary.js';
import { isCountedState, settleUsageDuration } from '../core/usage-segments.js';

const SESSION_KEY = 'session_v1';
const PERSISTENT_SESSION_KEY = 'session_v1_persistent';
const GUARDIAN_SESSION_KEY = 'guardian_session';
const GUARDIAN_CONFIG_KEY = 'guardian_config';
const CLOUD_PROFILE_ID_KEY = 'cloud_profile_id';
const CLOUD_DEVICE_ID_KEY = 'cloud_device_id';
const CLOUD_DEVICE_TOKEN_KEY = 'cloud_device_token';
const UI_FLUSH_GUARD_KEY = 'ui_flush_guard_v1';
const UI_FLUSH_MIN_INTERVAL_MS = 30 * 1000;
const PERIODIC_CHECKPOINT_MIN_INTERVAL_MS = 3 * 60 * 1000;
const FOREGROUND_CHECKPOINT_MS = 180 * 1000;
const FOREGROUND_UNKNOWN_DOMAIN = '__unknown__';
const FOREGROUND_DIAGNOSTICS_KEY = 'foreground_page_diagnostics_v1';
let commitQueue = Promise.resolve();

// 缓存的模式上下文 — 在 segment 打开时读取，避免在 segment 关闭后读取到已切换的模式。
// 由 transitionState 在每次打开新 segment 时更新。
let cachedEffectiveMode = 'unknown';

function runSerialized(task) {
  commitQueue = commitQueue.then(task, task);
  return commitQueue;
}

async function recordForegroundDiagnostic(updates = {}) {
  try {
    const data = await chrome.storage.local.get(FOREGROUND_DIAGNOSTICS_KEY);
    const current = data?.[FOREGROUND_DIAGNOSTICS_KEY] || {};
    const next = { ...current };
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'number' && key !== 'lastDropAt') {
        next[key] = Number(next[key] || 0) + value;
      } else {
        next[key] = value;
      }
    }
    await chrome.storage.local.set({ [FOREGROUND_DIAGNOSTICS_KEY]: next });
  } catch (_) {
    // diagnostics must never block timing
  }
}

function isForegroundPageSession(session) {
  return session?.state === 'ACTIVE';
}

function boundedForegroundCloseTime(session, observedAt = Date.now()) {
  const start = Number(session?.startTime || 0);
  if (!start) return observedAt;
  const observed = Number.isFinite(observedAt) ? observedAt : Date.now();
  return Math.max(start, Math.min(observed, start + FOREGROUND_CHECKPOINT_MS));
}

/**
 * @typedef {Object} SessionState
 * @property {string|null} state
 * @property {string|null} domain
 * @property {number|null} startTime
 * @property {number} lastHeartbeat
 */

/**
 * 获取当前会话快照
 * @returns {Promise<SessionState|null>}
 */
export async function getSession() {
  return (await getSessionWithPersistenceSource()).session;
}

export async function getSessionWithPersistenceSource() {
  const data = await chrome.storage.session.get(SESSION_KEY);
  if (data[SESSION_KEY]) return { session: data[SESSION_KEY], source: 'session' };

  const persistent = await chrome.storage.local.get(PERSISTENT_SESSION_KEY);
  return {
    session: persistent[PERSISTENT_SESSION_KEY] || null,
    source: persistent[PERSISTENT_SESSION_KEY] ? 'persistent' : 'none',
  };
}

/**
 * 保存当前会话快照
 * @param {SessionState} session
 */
export async function saveSession(session) {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  await chrome.storage.local.set({ [PERSISTENT_SESSION_KEY]: session });
}

/**
 * 初始化 session（首次）
 * @returns {Promise<SessionState>}
 */
export async function initSession() {
  const existing = await getSession();
  if (existing) return existing;

  const initial = {
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: Date.now(),
  };
  await saveSession(initial);
  return initial;
}

/**
 * 状态切换（统一入口，所有 state 变化必须走这里）
 * @param {string|null} newState
 * @param {string|null} newDomain
 */
export async function transitionState(newState, newDomain) {
  return transitionStateAt(newState, newDomain, Date.now(), 'transition');
}

export async function transitionStateAt(newState, newDomain, timestamp = Date.now(), reason = 'transition') {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session) return;

    const now = Number.isFinite(timestamp) ? timestamp : Date.now();

    // 没变化直接忽略（抗抖）
    if (session.state === newState && session.domain === newDomain) {
      return;
    }

    const sessionBefore = { state: session.state, domain: session.domain, startTime: session.startTime };

    // 1. 关闭旧事件
    if (session.state && session.startTime) {
      const foreground = isForegroundPageSession(session);
      const boundary = foreground
        ? { closeTime: boundedForegroundCloseTime(session, now), stale: false }
        : getReliableCloseTime(session, now);
      const { closeTime, stale } = boundary;
      const endEvent = {
        type: EVENT_TYPE.END,
        state: session.state,
        domain: session.domain,
        time: closeTime,
      };
      await appendEvent(endEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: stale ? 'transitionStaleClose' : 'transitionClose',
        domain: session.domain,
        previousState: session.state,
        event: endEvent,
        sessionBefore,
      });

      if (foreground) {
        const droppedMs = Math.max(0, closeTime - session.startTime);
        await recordForegroundDiagnostic({
          droppedUnconfirmedSeconds: Math.floor(droppedMs / 1000),
          lastDropReason: reason,
          lastDropAt: Date.now(),
        });
      } else {
        // 结算已完成的非 foreground_page 使用时长段；普通 foreground_page 只由 checkpoint 落账。
        await settleCurrentSessionSegment(session, closeTime, stale ? 'transition_stale_close' : 'transition_complete');
      }
    }

    // 2. 开启新事件
    if (newState) {
      const startEvent = {
        type: EVENT_TYPE.START,
        state: newState,
        domain: newDomain,
        time: now,
      };
      await appendEvent(startEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: 'transitionOpen',
        domain: newDomain,
        nextState: newState,
        event: startEvent,
        sessionBefore,
      });
    }

    // 3. 缓存模式上下文 — 在 segment 打开时读取，确保 segment 模式反映打开时的模式，而不是关闭时的模式
    if (newState) {
      await refreshCachedMode();
    }

    // 4. 更新 session
    const sessionAfter = {
      state: newState,
      domain: newDomain,
      startTime: newState ? now : null,
      lastHeartbeat: now,
    };
    await saveSession(sessionAfter);
  });
}

/**
 * 心跳：维持恢复锚点
 */
export async function heartbeat() {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session) return;

    const now = Date.now();
    const closeBoundary = getReliableCloseTime(session, now);
    const staleGap = closeBoundary.stale;

    if (session.state && session.startTime && staleGap) {
      if (isForegroundPageSession(session)) {
        const closeTime = boundedForegroundCloseTime(session, closeBoundary.closeTime);
        const sessionBefore = {
          state: session.state,
          domain: session.domain,
          startTime: session.startTime,
          lastHeartbeat: session.lastHeartbeat,
        };
        const endEvent = {
          type: EVENT_TYPE.END,
          state: session.state,
          domain: session.domain,
          time: closeTime,
        };
        await appendEvent(endEvent);
        await emitTrace('event_appended', {
          source: 'event-log',
          reason: 'heartbeatForegroundStaleDrop',
          domain: session.domain,
          previousState: session.state,
          event: endEvent,
          sessionBefore,
        });
        await recordForegroundDiagnostic({
          longOpenSessionDrops: 1,
          droppedUnconfirmedSeconds: Math.floor(Math.max(0, closeTime - session.startTime) / 1000),
          lastDropReason: 'heartbeat_stale_foreground_drop',
          lastDropAt: Date.now(),
        });
        await saveSession({
          state: null,
          domain: null,
          startTime: null,
          lastHeartbeat: now,
        });
        return;
      }

      const sessionBefore = {
        state: session.state,
        domain: session.domain,
        startTime: session.startTime,
        lastHeartbeat: session.lastHeartbeat,
      };
      const endEvent = {
        type: EVENT_TYPE.END,
        state: session.state,
        domain: session.domain,
        time: closeBoundary.closeTime,
      };
      await appendEvent(endEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: 'heartbeatStaleClose',
        domain: session.domain,
        previousState: session.state,
        event: endEvent,
        sessionBefore,
      });

      // 结算过期的使用时长段
      await settleCurrentSessionSegment(session, closeBoundary.closeTime, 'session_expired');

      const startEvent = {
        type: EVENT_TYPE.START,
        state: session.state,
        domain: session.domain,
        time: now,
      };
      await appendEvent(startEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: 'heartbeatStaleReopen',
        domain: session.domain,
        nextState: session.state,
        event: startEvent,
        sessionBefore,
      });

      await saveSession({
        state: session.state,
        domain: session.domain,
        startTime: now,
        lastHeartbeat: now,
      });
      return;
    }

    await saveSession({ ...session, lastHeartbeat: now });
  });
}

export async function runSessionCommit(task) {
  return runSerialized(task);
}

// ── Mode context cache ──────────────────────────────────────────────────────────

/**
 * 刷新缓存的模式上下文。
 * 在 segment 打开时调用，以便 segment 记录其打开时的模式，而不是关闭时的模式。
 */
async function refreshCachedMode() {
  try {
    const storage = await chrome.storage.local.get(GUARDIAN_SESSION_KEY);
    const gs = storage[GUARDIAN_SESSION_KEY];
    cachedEffectiveMode = gs?.currentMode || 'unknown';
  } catch (_) {
    cachedEffectiveMode = 'unknown';
  }
}

/**
 * 获取当前缓存的模式。segment 打开时会调用 refreshCachedMode，
 * 因此返回的模式是 segment 打开时的模式。
 */
export function getCachedEffectiveMode() {
  return cachedEffectiveMode;
}

function normalizeIdentityValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickIdentity(candidates) {
  for (const candidate of candidates) {
    const value = normalizeIdentityValue(candidate.value);
    if (value) return { value, source: candidate.source };
  }
  return { value: null, source: 'missing' };
}

export async function resolveSettlementIdentity(timingSession = null, reason = 'settlement') {
  let storage = {};
  try {
    storage = await chrome.storage.local.get([
      CLOUD_PROFILE_ID_KEY,
      CLOUD_DEVICE_ID_KEY,
      CLOUD_DEVICE_TOKEN_KEY,
      GUARDIAN_CONFIG_KEY,
      GUARDIAN_SESSION_KEY,
    ]);
  } catch (e) {
    console.warn('[Settlement] identity storage read failed; falling back to null identity', {
      reason,
      error: e?.message || String(e),
    });
    storage = {};
  }

  const config = storage[GUARDIAN_CONFIG_KEY] || {};
  const guardianSession = storage[GUARDIAN_SESSION_KEY] || {};
  const profile = pickIdentity([
    { value: storage[CLOUD_PROFILE_ID_KEY], source: CLOUD_PROFILE_ID_KEY },
    { value: config.profileId, source: `${GUARDIAN_CONFIG_KEY}.profileId` },
    { value: guardianSession.profileId, source: `${GUARDIAN_SESSION_KEY}.profileId` },
  ]);
  const device = pickIdentity([
    { value: storage[CLOUD_DEVICE_ID_KEY], source: CLOUD_DEVICE_ID_KEY },
    { value: config.deviceId, source: `${GUARDIAN_CONFIG_KEY}.deviceId` },
    { value: guardianSession.deviceId, source: `${GUARDIAN_SESSION_KEY}.deviceId` },
  ]);

  if (!profile.value || !device.value) {
    const hasDeviceToken = !!normalizeIdentityValue(storage[CLOUD_DEVICE_TOKEN_KEY]);
    const fallback = {
      reason,
      domain: timingSession?.domain || null,
      sourceState: timingSession?.state || null,
      hasProfileId: !!profile.value,
      hasDeviceId: !!device.value,
      hasDeviceToken,
      profileIdSource: profile.source,
      deviceIdSource: device.source,
    };
    console.warn('[Settlement] identity fallback to null because explicit profile/device identity is missing', fallback);
    try {
      await emitTrace('settlement_identity_fallback', {
        source: 'runtime-session',
        reason,
        domain: timingSession?.domain || null,
        payload: fallback,
      });
    } catch (_) {}
  }

  return {
    profileId: profile.value,
    deviceId: device.value,
    profileIdSource: profile.source,
    deviceIdSource: device.source,
  };
}

// ── Usage segment settlement ────────────────────────────────────────────────────

/**
 * 从已完成的时间段会话结算使用 segment。
 * 使用 segment 打开时缓存的模式（而不是关闭后可能已切换的模式）。
 *
 * 可从外部调用（例如 background.js 的 tab close / monitoring off）。
 *
 * @param {{startTime: number, state: string, domain: string}} timingSession - 时间段的 session
 * @param {number} closeTimeMs - 结束的 epoch 毫秒
 * @param {string} reason - settlement 原因
 */
export async function settleCurrentSessionSegment(timingSession, closeTimeMs, reason) {
  try {
    const startMs = timingSession.startTime;
    const endMs = closeTimeMs;
    if (!startMs || !endMs || endMs <= startMs) return { appended: 0, durationSeconds: 0 };

    const durationMs = endMs - startMs;
    const durationSeconds = Math.floor(durationMs / 1000);
    if (durationSeconds <= 0) return { appended: 0, durationSeconds: 0 };
    if (timingSession.state && !isCountedState(timingSession.state)) {
      return { appended: 0, durationSeconds: 0, skipped: 'non_counted_state' };
    }
    if (timingSession.state === 'ACTIVE') {
      if (reason !== 'periodic_checkpoint') {
        return { appended: 0, durationSeconds: 0, skipped: 'foreground_checkpoint_required' };
      }
      if (durationMs > FOREGROUND_CHECKPOINT_MS) {
        return { appended: 0, durationSeconds: 0, skipped: 'foreground_window_too_large' };
      }
    }

    // 使用 segment 打开时缓存的模式（而不是当前 guardian_session 中的模式）
    const mode = cachedEffectiveMode || 'unknown';
    const identity = await resolveSettlementIdentity(timingSession, reason);

    const appended = await settleUsageDuration({
      startMs,
      endMs,
      domain: timingSession.domain || null,
      sourceState: timingSession.state,
      settlementReason: reason,
      mode,
      profileId: identity.profileId,
      deviceId: identity.deviceId,
    });
    return {
      appended,
      durationSeconds,
      domain: timingSession.domain || null,
      state: timingSession.state || null,
      mode,
      profileIdSource: identity.profileIdSource,
      deviceIdSource: identity.deviceIdSource,
    };
  } catch (e) {
    console.error('[Settlement] settleCurrentSessionSegment failed:', e?.message || e, { reason, domain: timingSession?.domain, sourceState: timingSession?.state });
    // 结算失败不破坏现有的管线。
    // 失败的结算可以通过下次 heartbeat/recovery 重试。
    return { appended: 0, durationSeconds: 0, error: e?.message || String(e) };
  }
}

export async function flushOpenSessionToStats(reason = 'ui_flush', options = {}) {
  const task = async () => {
    const session = await getSession();
    const now = Date.now();

    if (!session?.state || !session?.startTime) {
      return { ok: true, flushed: false, flushedSeconds: 0, reason: 'no_open_session' };
    }
    if (!isCountedState(session.state)) {
      return {
        ok: true,
        flushed: false,
        flushedSeconds: 0,
        domain: session.domain || null,
        state: session.state || null,
        reason: 'non_counted_state',
      };
    }
    if (isForegroundPageSession(session) && !options.allowForeground) {
      return {
        ok: true,
        flushed: false,
        flushedSeconds: 0,
        domain: session.domain || null,
        state: session.state || null,
        reason: 'foreground_checkpoint_required',
      };
    }

    // Guardrail: popup-driven ui_flush should not fragment segments when opened frequently.
    // Only skip when state/domain/mode are exactly the same and last flush is recent.
    if (reason === 'ui_flush') {
      const mode = cachedEffectiveMode || 'unknown';
      const sessionState = session.state || null;
      const sessionDomain = session.domain || null;
      let guard = null;
      try {
        const guardData = await chrome.storage.local.get(UI_FLUSH_GUARD_KEY);
        guard = guardData?.[UI_FLUSH_GUARD_KEY] || null;
      } catch (_) {
        guard = null;
      }

      const isSameContext = !!guard &&
        guard.state === sessionState &&
        guard.domain === sessionDomain &&
        guard.mode === mode;
      const lastFlushAt = Number(guard?.lastFlushAt) || 0;
      if (isSameContext && (now - lastFlushAt) < UI_FLUSH_MIN_INTERVAL_MS) {
        return {
          ok: true,
          flushed: false,
          flushedSeconds: 0,
          domain: sessionDomain,
          state: sessionState,
          reason: 'ui_flush_guard_interval',
          guardIntervalMs: UI_FLUSH_MIN_INTERVAL_MS,
          sinceLastFlushMs: Math.max(0, now - lastFlushAt),
        };
      }
    }

    const closeBoundary = options.closeTime
      ? { closeTime: options.closeTime, stale: false }
      : getReliableCloseTime(session, now);
    const { closeTime, stale } = closeBoundary;
    if (closeTime <= session.startTime || Math.floor((closeTime - session.startTime) / 1000) <= 0) {
      return {
        ok: true,
        flushed: false,
        flushedSeconds: 0,
        domain: session.domain || null,
        state: session.state || null,
        reason: 'duration_below_one_second',
      };
    }

    const sessionBefore = {
      state: session.state,
      domain: session.domain,
      startTime: session.startTime,
      lastHeartbeat: session.lastHeartbeat,
    };
    const endEvent = {
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: closeTime,
    };
    await appendEvent(endEvent);
    await emitTrace('event_appended', {
      source: 'event-log',
      reason: stale ? 'uiFlushStaleClose' : 'uiFlushClose',
      domain: session.domain,
      previousState: session.state,
      event: endEvent,
      sessionBefore,
    });

    const settlement = await settleCurrentSessionSegment(session, closeTime, reason);
    const reopenTime = Number.isFinite(options.reopenTime) ? options.reopenTime : now;
    const startEvent = {
      type: EVENT_TYPE.START,
      state: session.state,
      domain: session.domain,
      time: reopenTime,
    };
    await appendEvent(startEvent);
    await emitTrace('event_appended', {
      source: 'event-log',
      reason: 'uiFlushReopen',
      domain: session.domain,
      nextState: session.state,
      event: startEvent,
      sessionBefore,
    });

    await saveSession({
      state: session.state,
      domain: session.domain,
      startTime: reopenTime,
      lastHeartbeat: reopenTime,
    });

    if (reason === 'ui_flush') {
      try {
        await chrome.storage.local.set({
          [UI_FLUSH_GUARD_KEY]: {
            state: session.state || null,
            domain: session.domain || null,
            mode: cachedEffectiveMode || 'unknown',
            lastFlushAt: now,
          },
        });
      } catch (_) {
        // Guard write failure must not block popup/read path.
      }
    }

    return {
      ok: true,
      flushed: (settlement?.appended || 0) > 0,
      flushedSegments: settlement?.appended || 0,
      flushedSeconds: settlement?.durationSeconds || 0,
      domain: session.domain || null,
      state: session.state || null,
      reason,
      stale: !!stale,
      reopened: true,
      startTime: session.startTime,
      closeTime,
      reopenedAt: reopenTime,
    };
  };
  return options.alreadySerialized ? task() : runSerialized(task);
}

export async function closeCurrentSession(reason = 'close', options = {}) {
  const task = async () => {
    const session = await getSession();
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    if (!session?.state || !session?.startTime) {
      await saveSession({
        state: null,
        domain: null,
        startTime: null,
        lastHeartbeat: now,
      });
      return { ok: true, closed: false, reason: 'no_open_session' };
    }

    const foreground = isForegroundPageSession(session);
    const closeTime = foreground
      ? boundedForegroundCloseTime(session, now)
      : getReliableCloseTime(session, now).closeTime;
    await appendEvent({
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: closeTime,
    });

    let settlement = null;
    if (!foreground && isCountedState(session.state)) {
      settlement = await settleCurrentSessionSegment(session, closeTime, reason);
    }
    if (foreground) {
      const droppedSeconds = Math.floor(Math.max(0, closeTime - session.startTime) / 1000);
      await recordForegroundDiagnostic({
        droppedUnconfirmedSeconds: droppedSeconds,
        longOpenSessionDrops: now - session.startTime > FOREGROUND_CHECKPOINT_MS ? 1 : 0,
        lastDropReason: reason,
        lastDropAt: Date.now(),
      });
    }

    await saveSession({
      state: null,
      domain: null,
      startTime: null,
      lastHeartbeat: now,
    });
    return {
      ok: true,
      closed: true,
      reason,
      state: session.state,
      domain: session.domain || null,
      closeTime,
      foregroundDropped: foreground,
      settlement,
    };
  };
  return options.alreadySerialized ? task() : runSerialized(task);
}

/**
 * 后台定时 checkpoint：每次触发时尝试把当前 open counted session 落账为 durable segment。
 * 仅在满足最低条件时才执行；执行后会重开同一 state/domain 的 session。
 */
export async function runPeriodicCheckpoint(now = Date.now(), options = {}) {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session?.state || !session?.startTime) {
      return { ok: true, checkpointed: false, reason: 'no_open_session' };
    }
    if (!isCountedState(session.state)) {
      return { ok: true, checkpointed: false, reason: 'non_counted_state' };
    }
    if (typeof session.domain !== 'string' || !session.domain.trim()) {
      return { ok: true, checkpointed: false, reason: 'invalid_domain' };
    }
    if (!Number.isFinite(session.startTime) || session.startTime <= 0) {
      return { ok: true, checkpointed: false, reason: 'invalid_start_time' };
    }
    const minIntervalMs = isForegroundPageSession(session)
      ? FOREGROUND_CHECKPOINT_MS
      : PERIODIC_CHECKPOINT_MIN_INTERVAL_MS;
    if ((now - session.startTime) < minIntervalMs) {
      return {
        ok: true,
        checkpointed: false,
        reason: 'interval_not_reached',
        minIntervalMs,
      };
    }

    if (isForegroundPageSession(session)) {
      const confirmation = typeof options.confirmForegroundPage === 'function'
        ? await options.confirmForegroundPage(session, now)
        : { ok: true };
      if (!confirmation?.ok) {
        const closeTime = boundedForegroundCloseTime(session, now);
        await appendEvent({
          type: EVENT_TYPE.END,
          state: session.state,
          domain: session.domain,
          time: closeTime,
        });
        await recordForegroundDiagnostic({
          checkpointDrops: 1,
          droppedUnconfirmedSeconds: Math.floor(Math.max(0, closeTime - session.startTime) / 1000),
          lastDropReason: confirmation?.reason || 'checkpoint_confirmation_failed',
          lastDropAt: Date.now(),
          ...(confirmation?.reason === 'unknown_domain' ? { unknownDomainSeconds: Math.floor(Math.max(0, closeTime - session.startTime) / 1000) } : {}),
          ...(confirmation?.reason === 'candidate_query_failed' ? { candidateQueryFailures: 1 } : {}),
          ...(confirmation?.reason === 'idle_query_failed' ? { idleQueryFailures: 1 } : {}),
        });
        await saveSession({
          state: null,
          domain: null,
          startTime: null,
          lastHeartbeat: now,
        });
        return { ok: true, checkpointed: false, reason: confirmation?.reason || 'checkpoint_confirmation_failed', dropped: true };
      }

      const checkpointEnd = session.startTime + FOREGROUND_CHECKPOINT_MS;
      const flushResult = await flushOpenSessionToStats('periodic_checkpoint', {
        alreadySerialized: true,
        closeTime: checkpointEnd,
        reopenTime: checkpointEnd,
        allowForeground: true,
      });
      if (flushResult?.ok === false || flushResult?.error) {
        console.warn('[Checkpoint] foreground checkpoint settlement failed', {
          error: flushResult?.error || 'unknown_error',
          state: session.state,
          domain: session.domain,
        });
        return { ok: false, checkpointed: false, reason: 'settlement_failed', error: flushResult?.error || null };
      }
      await saveSession({
        state: session.state,
        domain: session.domain || FOREGROUND_UNKNOWN_DOMAIN,
        startTime: checkpointEnd,
        lastHeartbeat: now,
      });
      return {
        ok: true,
        checkpointed: !!flushResult?.flushed,
        flushedSeconds: flushResult?.flushedSeconds || 0,
        flushedSegments: flushResult?.flushedSegments || 0,
        reason: 'periodic_checkpoint',
      };
    }

    const closeBoundary = getReliableCloseTime(session, now);
    if (closeBoundary.stale) {
      return { ok: true, checkpointed: false, reason: 'stale_session' };
    }
    const flushResult = await flushOpenSessionToStats('periodic_checkpoint', { alreadySerialized: true });
    if (flushResult?.ok === false || flushResult?.error) {
      console.warn('[Checkpoint] periodic checkpoint settlement failed', {
        error: flushResult?.error || 'unknown_error',
        state: session.state,
        domain: session.domain,
      });
      return { ok: false, checkpointed: false, reason: 'settlement_failed', error: flushResult?.error || null };
    }
    return {
      ok: true,
      checkpointed: !!flushResult?.flushed,
      flushedSeconds: flushResult?.flushedSeconds || 0,
      flushedSegments: flushResult?.flushedSegments || 0,
      reason: 'periodic_checkpoint',
    };
  });
}
