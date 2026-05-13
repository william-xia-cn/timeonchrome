// runtime/session.js — 当前会话快照（单一真相源）+ 状态切换 + 心跳

import { appendEvent, EVENT_TYPE } from '../core/event-log.js';
import { emitTrace } from '../core/timing-trace.js';
import { getReliableCloseTime } from './time-boundary.js';
import { isCountedState, settleUsageDuration } from '../core/usage-segments.js';
import {
  CHECKPOINT_INTERVAL_MS,
  ForegroundConfidence,
  getBoundedForegroundCloseTime,
  hasCheckpointGap,
  isForegroundCountable,
  resolveForegroundConfidence,
} from './foreground-evidence.js';

const SESSION_KEY = 'session_v1';
const PERSISTENT_SESSION_KEY = 'session_v1_persistent';
const GUARDIAN_SESSION_KEY = 'guardian_session';
const GUARDIAN_CONFIG_KEY = 'guardian_config';
const CLOUD_PROFILE_ID_KEY = 'cloud_profile_id';
const CLOUD_DEVICE_ID_KEY = 'cloud_device_id';
const CLOUD_DEVICE_TOKEN_KEY = 'cloud_device_token';
const UI_FLUSH_GUARD_KEY = 'ui_flush_guard_v1';
const FOREGROUND_DIAGNOSTICS_KEY = 'foreground_timing_diagnostics_v1';
const UI_FLUSH_MIN_INTERVAL_MS = 30 * 1000;
const PERIODIC_CHECKPOINT_MIN_INTERVAL_MS = CHECKPOINT_INTERVAL_MS;
let commitQueue = Promise.resolve();

// 缓存的模式上下文 — 在 segment 打开时读取，避免在 segment 关闭后读取到已切换的模式。
// 由 transitionState 在每次打开新 segment 时更新。
let cachedEffectiveMode = 'unknown';

function runSerialized(task) {
  commitQueue = commitQueue.then(task, task);
  return commitQueue;
}

/**
 * @typedef {Object} SessionState
 * @property {string|null} state
 * @property {string|null} domain
 * @property {number|null} startTime
 * @property {number} lastHeartbeat
 * @property {string|null} mode
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

function evidenceFromContext(context = {}, now = Date.now()) {
  return {
    tabId: context.tabId ?? null,
    pageVisible: context.pageVisible ?? null,
    lastPageActivityAt: Number.isFinite(context.lastPageActivityAt) ? context.lastPageActivityAt : null,
    lastVisibleAt: Number.isFinite(context.lastVisibleAt) ? context.lastVisibleAt : null,
    lastForegroundEvidenceAt: Number.isFinite(context.lastForegroundEvidenceAt) ? context.lastForegroundEvidenceAt : null,
    serviceHeartbeatAt: Number.isFinite(context.serviceHeartbeatAt) ? context.serviceHeartbeatAt : null,
    lastCheckpointAt: now,
  };
}

function mergeSessionEvidence(session, context = {}, now = Date.now()) {
  const evidence = evidenceFromContext(context, now);
  return {
    ...session,
    tabId: evidence.tabId ?? session?.tabId ?? null,
    pageVisible: evidence.pageVisible ?? session?.pageVisible ?? null,
    lastPageActivityAt: evidence.lastPageActivityAt ?? session?.lastPageActivityAt ?? null,
    lastVisibleAt: evidence.lastVisibleAt ?? session?.lastVisibleAt ?? null,
    lastForegroundEvidenceAt: evidence.lastForegroundEvidenceAt ?? session?.lastForegroundEvidenceAt ?? null,
    serviceHeartbeatAt: evidence.serviceHeartbeatAt ?? session?.serviceHeartbeatAt ?? null,
  };
}

async function recordForegroundDiagnostic(reason, session, details = {}) {
  const entry = {
    reason,
    at: Date.now(),
    state: session?.state || null,
    domain: session?.domain || null,
    startTime: session?.startTime || null,
    lastCheckpointAt: session?.lastCheckpointAt || null,
    lastForegroundEvidenceAt: session?.lastForegroundEvidenceAt || null,
    lastPageActivityAt: session?.lastPageActivityAt || null,
    details,
  };
  try {
    const data = await chrome.storage.local.get(FOREGROUND_DIAGNOSTICS_KEY);
    const existing = Array.isArray(data[FOREGROUND_DIAGNOSTICS_KEY]) ? data[FOREGROUND_DIAGNOSTICS_KEY] : [];
    const next = existing.concat(entry).slice(-200);
    await chrome.storage.local.set({ [FOREGROUND_DIAGNOSTICS_KEY]: next });
  } catch (_) {}
  try {
    await emitTrace('foreground_timing_diagnostic', {
      source: 'runtime-session',
      reason,
      domain: session?.domain || null,
      payload: entry,
    });
  } catch (_) {}
}

async function appendSessionEndEvent(session, closeTime, reason, sessionBefore = null) {
  const endEvent = {
    type: EVENT_TYPE.END,
    state: session.state,
    domain: session.domain,
    time: closeTime,
  };
  await appendEvent(endEvent);
  await emitTrace('event_appended', {
    source: 'event-log',
    reason,
    domain: session.domain,
    previousState: session.state,
    event: endEvent,
    sessionBefore: sessionBefore || {
      state: session.state,
      domain: session.domain,
      startTime: session.startTime,
      lastHeartbeat: session.lastHeartbeat,
      mode: session.mode || null,
    },
  });
  return endEvent;
}

function emptySession(now = Date.now()) {
  return {
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: now,
    mode: null,
    tabId: null,
    pageVisible: null,
    lastPageActivityAt: null,
    lastVisibleAt: null,
    lastForegroundEvidenceAt: null,
    serviceHeartbeatAt: null,
    lastCheckpointAt: null,
  };
}

/**
 * 初始化 session（首次）
 * @returns {Promise<SessionState>}
 */
export async function initSession() {
  const existing = await getSession();
  if (existing) return existing;

  const initial = emptySession(Date.now());
  await saveSession(initial);
  return initial;
}

/**
 * 状态切换（统一入口，所有 state 变化必须走这里）
 * @param {string|null} newState
 * @param {string|null} newDomain
 */
export async function transitionState(newState, newDomain, options = {}) {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session) return;

    const now = Date.now();

    // 没变化直接忽略（抗抖）
    if (session.state === newState && session.domain === newDomain) {
      const updated = mergeSessionEvidence({ ...session, lastHeartbeat: now }, options.context, now);
      await saveSession(updated);
      return;
    }

    const sessionBefore = { state: session.state, domain: session.domain, startTime: session.startTime };

    // 1. 关闭旧事件
    if (session.state && session.startTime) {
      const reliable = getReliableCloseTime(session, now);
      const isOrdinaryForeground = session.state === 'ACTIVE';
      const closeTime = isOrdinaryForeground
        ? getBoundedForegroundCloseTime(session, reliable.closeTime)
        : reliable.closeTime;
      const confidenceResult = isOrdinaryForeground
        ? resolveForegroundConfidence(session, closeTime)
        : { confidence: null, reason: null };
      const checkpointGap = isOrdinaryForeground && hasCheckpointGap(session, now);
      const suspect = isOrdinaryForeground &&
        (checkpointGap || !isForegroundCountable(confidenceResult.confidence));
      const stale = reliable.stale || checkpointGap || suspect;
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

      // 结算已完成的使用时长段
      if (suspect) {
        await recordForegroundDiagnostic('transition_suspect_close', session, {
          closeTime,
          now,
          confidence: confidenceResult.confidence,
          confidenceReason: confidenceResult.reason,
          checkpointGap,
        });
      } else {
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
    let openedMode = null;
    if (newState) {
      openedMode = await refreshCachedMode();
    }

    // 4. 更新 session
    const sessionAfter = {
      state: newState,
      domain: newDomain,
      startTime: newState ? now : null,
      lastHeartbeat: now,
      mode: newState ? openedMode : null,
      ...(newState ? evidenceFromContext(options.context, now) : {
        tabId: null,
        pageVisible: null,
        lastPageActivityAt: null,
        lastVisibleAt: null,
        lastForegroundEvidenceAt: null,
        serviceHeartbeatAt: null,
        lastCheckpointAt: null,
      }),
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
      const sessionBefore = {
        state: session.state,
        domain: session.domain,
        startTime: session.startTime,
        lastHeartbeat: session.lastHeartbeat,
      };
      if (session.state === 'ACTIVE') {
        await appendSessionEndEvent(session, closeBoundary.closeTime, 'heartbeatStaleClose', sessionBefore);
        await recordForegroundDiagnostic('service_heartbeat_active_close', session, {
          closeTime: closeBoundary.closeTime,
          now,
        });
        await saveSession(emptySession(now));
        return;
      }

      await appendSessionEndEvent(session, closeBoundary.closeTime, 'heartbeatStaleClose', sessionBefore);

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
        mode: session.mode || cachedEffectiveMode || 'unknown',
        tabId: session.tabId ?? null,
        pageVisible: session.pageVisible ?? null,
        lastPageActivityAt: session.lastPageActivityAt ?? null,
        lastVisibleAt: session.lastVisibleAt ?? null,
        lastForegroundEvidenceAt: session.lastForegroundEvidenceAt ?? null,
        serviceHeartbeatAt: now,
        lastCheckpointAt: now,
      });
      return;
    }

    await saveSession({ ...session, lastHeartbeat: now, serviceHeartbeatAt: now, mode: session.mode || cachedEffectiveMode || 'unknown' });
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
  return cachedEffectiveMode;
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

    // 使用 segment 打开时缓存的模式（而不是当前 guardian_session 中的模式）
    const mode = timingSession.mode || cachedEffectiveMode || 'unknown';
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

export async function closeCurrentSession(reason = 'manual_close', options = {}) {
  return runSerialized(async () => {
    const session = await getSession();
    const now = Number.isFinite(options.now) ? options.now : Date.now();

    if (!session?.state || !session?.startTime) {
      await saveSession(emptySession(now));
      return { ok: true, closed: false, reason: 'no_open_session' };
    }

    const isOrdinaryForeground = session.state === 'ACTIVE';
    const reliable = getReliableCloseTime(session, now, { forceStale: !!options.forceStale });
    const foregroundCloseTime = isOrdinaryForeground
      ? getBoundedForegroundCloseTime(session, reliable.closeTime)
      : reliable.closeTime;
    const checkpointGap = isOrdinaryForeground && hasCheckpointGap(session, now);
    const confidenceResult = isOrdinaryForeground
      ? resolveForegroundConfidence(session, foregroundCloseTime)
      : { confidence: null, reason: null };
    const suspect = isOrdinaryForeground &&
      (checkpointGap || !isForegroundCountable(confidenceResult.confidence));
    const closeTime = foregroundCloseTime;
    const stale = reliable.stale || checkpointGap || suspect;
    const sessionBefore = {
      state: session.state,
      domain: session.domain,
      startTime: session.startTime,
      lastHeartbeat: session.lastHeartbeat,
      mode: session.mode || null,
    };
    const endEvent = {
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: closeTime,
    };
    await appendEvent(endEvent);
    const settlementReason = stale ? `${reason}_stale_close` : reason;
    await emitTrace('event_appended', {
      source: 'event-log',
      reason: settlementReason,
      domain: session.domain,
      previousState: session.state,
      event: endEvent,
      sessionBefore,
    });

    let settlement = { appended: 0, durationSeconds: 0, skipped: null };
    if (suspect) {
      settlement = {
        appended: 0,
        durationSeconds: 0,
        skipped: 'suspect_foreground',
        confidence: confidenceResult.confidence,
        confidenceReason: checkpointGap ? 'checkpoint_gap' : confidenceResult.reason,
      };
      await recordForegroundDiagnostic(`${reason}_suspect_close`, session, {
        closeTime,
        now,
        confidence: confidenceResult.confidence,
        confidenceReason: confidenceResult.reason,
        checkpointGap,
      });
    } else {
      settlement = await settleCurrentSessionSegment(session, closeTime, settlementReason);
    }
    const shouldReopen = !!options.reopenState;
    let reopenedMode = null;
    if (shouldReopen) {
      reopenedMode = await refreshCachedMode();
      const startEvent = {
        type: EVENT_TYPE.START,
        state: options.reopenState,
        domain: options.reopenDomain || null,
        time: now,
      };
      await appendEvent(startEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: `${reason}_reopen`,
        domain: options.reopenDomain || null,
        nextState: options.reopenState,
        event: startEvent,
        sessionBefore,
      });
    }

    await saveSession({
      state: shouldReopen ? options.reopenState : null,
      domain: shouldReopen ? (options.reopenDomain || null) : null,
      startTime: shouldReopen ? now : null,
      lastHeartbeat: now,
      mode: shouldReopen ? reopenedMode : null,
      tabId: shouldReopen ? (options.reopenTabId ?? session.tabId ?? null) : null,
      pageVisible: shouldReopen ? (session.pageVisible ?? null) : null,
      lastPageActivityAt: shouldReopen ? (session.lastPageActivityAt ?? null) : null,
      lastVisibleAt: shouldReopen ? (session.lastVisibleAt ?? null) : null,
      lastForegroundEvidenceAt: shouldReopen ? (session.lastForegroundEvidenceAt ?? null) : null,
      serviceHeartbeatAt: shouldReopen ? (session.serviceHeartbeatAt ?? null) : null,
      lastCheckpointAt: shouldReopen ? now : null,
    });

    return {
      ok: true,
      closed: true,
      closeTime,
      stale: !!stale,
      settlementReason,
      settlement,
      confidence: confidenceResult.confidence || null,
      suspect,
      reopened: shouldReopen,
      state: session.state || null,
      domain: session.domain || null,
      mode: session.mode || cachedEffectiveMode || 'unknown',
    };
  });
}

export async function flushOpenSessionToStats(reason = 'ui_flush', options = {}) {
  const task = async () => {
    const session = await getSession();
    const now = Number.isFinite(options.now) ? options.now : Date.now();

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

    const { closeTime, stale } = getReliableCloseTime(session, now);
    if (session.state === 'ACTIVE') {
      const confidenceResult = resolveForegroundConfidence(session, closeTime);
      const checkpointGap = hasCheckpointGap(session, now);
      if (checkpointGap || !isForegroundCountable(confidenceResult.confidence)) {
        await appendSessionEndEvent(session, closeTime, `${reason}_suspect_close`);
        await recordForegroundDiagnostic(`${reason}_suspect_flush`, session, {
          closeTime,
          now,
          confidence: confidenceResult.confidence,
          confidenceReason: confidenceResult.reason,
          checkpointGap,
        });
        await saveSession(emptySession(now));
        return {
          ok: true,
          flushed: false,
          flushedSeconds: 0,
          domain: session.domain || null,
          state: session.state || null,
          reason: 'suspect_foreground',
          confidence: confidenceResult.confidence,
          confidenceReason: checkpointGap ? 'checkpoint_gap' : confidenceResult.reason,
        };
      }
    }
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
    const reopenTime = now;
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
      mode: session.mode || cachedEffectiveMode || 'unknown',
      tabId: session.tabId ?? null,
      pageVisible: session.pageVisible ?? null,
      lastPageActivityAt: session.lastPageActivityAt ?? null,
      lastVisibleAt: session.lastVisibleAt ?? null,
      lastForegroundEvidenceAt: session.lastForegroundEvidenceAt ?? null,
      serviceHeartbeatAt: session.serviceHeartbeatAt ?? null,
      lastCheckpointAt: reopenTime,
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

/**
 * 后台定时 checkpoint：每次触发时尝试把当前 open counted session 落账为 durable segment。
 * 仅在满足最低条件时才执行；执行后会重开同一 state/domain 的 session。
 */
export async function runPeriodicCheckpoint(now = Date.now()) {
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
    if ((now - session.startTime) < PERIODIC_CHECKPOINT_MIN_INTERVAL_MS) {
      return {
        ok: true,
        checkpointed: false,
        reason: 'interval_not_reached',
        minIntervalMs: PERIODIC_CHECKPOINT_MIN_INTERVAL_MS,
      };
    }

    const closeBoundary = getReliableCloseTime(session, now);
    if (closeBoundary.stale) {
      await recordForegroundDiagnostic('periodic_checkpoint_stale_session', session, {
        closeTime: closeBoundary.closeTime,
        now,
      });
      if (session.state === 'ACTIVE') {
        await appendSessionEndEvent(session, closeBoundary.closeTime, 'periodic_checkpoint_stale_close');
        await saveSession(emptySession(now));
      }
      return { ok: true, checkpointed: false, reason: 'stale_session' };
    }

    const flushResult = await flushOpenSessionToStats('periodic_checkpoint', { now, alreadySerialized: true });
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
