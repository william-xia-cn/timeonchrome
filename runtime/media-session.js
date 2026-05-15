// runtime/media-session.js — checkpoint-first background media timing

import {
  appendUsageSegments,
  buildUsageSegment,
  incrementDailyUsageStats,
  markSegmentSyncDirty,
  markStatsSyncDirty,
  splitSegmentByLocalDate,
} from '../core/usage-segments.js';
import { getCachedEffectiveMode, resolveSettlementIdentity } from './session.js';

const MEDIA_SESSION_KEY = 'media_session_v1';
const MEDIA_CHECKPOINT_MS = 180 * 1000;
const MEDIA_STABILIZATION_MS = 5 * 1000;

let mediaQueue = Promise.resolve();
let appliedMediaBoundary = { framework: 'none', domain: null };
let pendingMediaBoundary = null;
let pendingMediaTimer = null;

function runMediaSerialized(task) {
  mediaQueue = mediaQueue.then(task, task);
  return mediaQueue;
}

function sameBoundary(a, b) {
  return (a?.framework ?? 'none') === (b?.framework ?? 'none') &&
    (a?.domain ?? null) === (b?.domain ?? null);
}

function normalizeBoundary(framework, domain) {
  const fw = framework || 'none';
  return {
    framework: fw,
    domain: fw === 'none' ? null : (domain || null),
  };
}

function stateForFramework(framework) {
  if (framework === 'pip_video') return 'PIP_ACTIVE';
  if (framework === 'background_audio' || framework === 'background_video') return 'BACKGROUND_ACTIVE';
  return null;
}

function channelForFramework(framework) {
  if (framework === 'pip_video') return 'pip';
  if (framework === 'background_audio' || framework === 'background_video') return 'backgroundMedia';
  return null;
}

async function readMediaSession() {
  const data = await chrome.storage.local.get(MEDIA_SESSION_KEY);
  return data?.[MEDIA_SESSION_KEY] || null;
}

async function saveMediaSession(session) {
  await chrome.storage.local.set({ [MEDIA_SESSION_KEY]: session });
}

async function clearMediaSession(now = Date.now()) {
  await saveMediaSession({
    framework: 'none',
    domain: null,
    startTime: null,
    lastHeartbeat: now,
  });
}

async function ensureAppliedFromStorage() {
  const session = await readMediaSession();
  if (session?.framework && session.framework !== 'none' && session.domain) {
    appliedMediaBoundary = { framework: session.framework, domain: session.domain };
  }
}

async function settleMediaCheckpoint(session, checkpointEnd) {
  const sourceState = stateForFramework(session.framework);
  const channel = channelForFramework(session.framework);
  if (!sourceState || !channel || !session.domain) {
    return { appended: 0, durationSeconds: 0, skipped: 'invalid_media_session' };
  }

  const durationMs = checkpointEnd - session.startTime;
  if (durationMs <= 0 || durationMs > MEDIA_CHECKPOINT_MS) {
    return { appended: 0, durationSeconds: 0, skipped: 'invalid_checkpoint_window' };
  }

  const identity = await resolveSettlementIdentity({
    state: sourceState,
    domain: session.domain,
    startTime: session.startTime,
  }, 'periodic_checkpoint');

  const input = {
    startMs: session.startTime,
    endMs: checkpointEnd,
    domain: session.domain,
    channel,
    mode: getCachedEffectiveMode() || 'unknown',
    sourceState,
    settlementReason: 'periodic_checkpoint',
    profileId: identity.profileId,
    deviceId: identity.deviceId,
  };

  const segments = splitSegmentByLocalDate(input).map((segment) => ({
    ...segment,
    framework: session.framework,
  }));
  const appended = await appendUsageSegments(segments);
  if (appended > 0) {
    const dates = new Set();
    for (const segment of segments) {
      await incrementDailyUsageStats(segment);
      dates.add(segment.date);
    }
    await markSegmentSyncDirty(segments.map((segment) => segment.id));
    await markStatsSyncDirty([...dates]);
  }

  return {
    appended,
    durationSeconds: Math.floor(durationMs / 1000),
    domain: session.domain,
    framework: session.framework,
    channel,
  };
}

async function applyMediaBoundary(boundary, now = Date.now()) {
  const session = await readMediaSession();
  if (session?.framework && session.framework !== 'none') {
    await clearMediaSession(now);
  }

  if (boundary.framework !== 'none' && boundary.domain) {
    await saveMediaSession({
      framework: boundary.framework,
      domain: boundary.domain,
      startTime: boundary.boundaryAt,
      lastHeartbeat: now,
    });
  }

  appliedMediaBoundary = { framework: boundary.framework, domain: boundary.domain || null };
}

export async function handleMediaBoundary(framework, domain, reason = 'media_boundary', now = Date.now()) {
  return runMediaSerialized(async () => {
    await ensureAppliedFromStorage();
    const target = normalizeBoundary(framework, domain);

    if (pendingMediaBoundary && (now - pendingMediaBoundary.boundaryAt) >= MEDIA_STABILIZATION_MS) {
      const ready = pendingMediaBoundary;
      pendingMediaBoundary = null;
      if (pendingMediaTimer) {
        clearTimeout(pendingMediaTimer);
        pendingMediaTimer = null;
      }
      await applyMediaBoundary({
        framework: ready.target.framework,
        domain: ready.target.domain,
        boundaryAt: ready.boundaryAt,
      }, now);
    }

    if (sameBoundary(target, appliedMediaBoundary)) {
      if (pendingMediaBoundary && !sameBoundary(pendingMediaBoundary.target, target)) {
        pendingMediaBoundary = null;
        if (pendingMediaTimer) {
          clearTimeout(pendingMediaTimer);
          pendingMediaTimer = null;
        }
      }
      const current = await readMediaSession();
      if (current?.framework && current.framework !== 'none') {
        await saveMediaSession({ ...current, lastHeartbeat: now });
      }
      return { ok: true, changed: false, reason: 'stable_or_jitter_cancelled' };
    }

    if (pendingMediaBoundary && sameBoundary(pendingMediaBoundary.target, target)) {
      return { ok: true, changed: false, reason: 'pending_same_boundary' };
    }

    if (pendingMediaTimer) clearTimeout(pendingMediaTimer);
    const pending = { target, boundaryAt: now, reason };
    pendingMediaBoundary = pending;
    pendingMediaTimer = setTimeout(() => {
      if (pendingMediaBoundary !== pending) return;
      runMediaSerialized(async () => {
        pendingMediaBoundary = null;
        pendingMediaTimer = null;
        await applyMediaBoundary({
          framework: target.framework,
          domain: target.domain,
          boundaryAt: pending.boundaryAt,
        }, Date.now());
      }).catch((err) => {
        console.warn('[MediaTiming] media boundary stabilization failed:', err?.message || err);
      });
    }, MEDIA_STABILIZATION_MS);
    pendingMediaTimer?.unref?.();
    return { ok: true, changed: false, reason: 'pending_boundary' };
  });
}

export async function runMediaPeriodicCheckpoint(now = Date.now()) {
  return runMediaSerialized(async () => {
    const session = await readMediaSession();
    if (!session?.framework || session.framework === 'none' || !session.startTime || !session.domain) {
      return { ok: true, checkpointed: false, reason: 'no_open_media_session' };
    }
    if ((now - session.startTime) < MEDIA_CHECKPOINT_MS) {
      await saveMediaSession({ ...session, lastHeartbeat: now });
      return { ok: true, checkpointed: false, reason: 'interval_not_reached' };
    }

    const checkpointEnd = session.startTime + MEDIA_CHECKPOINT_MS;
    const settlement = await settleMediaCheckpoint(session, checkpointEnd);
    await saveMediaSession({
      framework: session.framework,
      domain: session.domain,
      startTime: checkpointEnd,
      lastHeartbeat: now,
    });
    return {
      ok: true,
      checkpointed: (settlement.appended || 0) > 0,
      reason: 'periodic_checkpoint',
      flushedSegments: settlement.appended || 0,
      flushedSeconds: settlement.durationSeconds || 0,
      framework: session.framework,
      domain: session.domain,
    };
  });
}

export async function closeMediaSession(reason = 'close', options = {}) {
  return runMediaSerialized(async () => {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const session = await readMediaSession();
    if (!session?.framework || session.framework === 'none') {
      await clearMediaSession(now);
      return { ok: true, closed: false, reason: 'no_open_media_session' };
    }
    await clearMediaSession(now);
    return {
      ok: true,
      closed: true,
      reason,
      framework: session.framework,
      domain: session.domain,
      droppedUnconfirmedSeconds: Math.max(0, Math.floor((Math.min(now, session.startTime + MEDIA_CHECKPOINT_MS) - session.startTime) / 1000)),
    };
  });
}

export async function getMediaSession() {
  return readMediaSession();
}

export function __resetMediaSessionForTest() {
  appliedMediaBoundary = { framework: 'none', domain: null };
  pendingMediaBoundary = null;
  if (pendingMediaTimer) clearTimeout(pendingMediaTimer);
  pendingMediaTimer = null;
  mediaQueue = Promise.resolve();
}
