// core/checkpoint-scheduler.js — split foreground and media checkpoint execution

import { runPeriodicCheckpoint } from '../runtime/session.js';
import { runMediaCheckpoint } from './media-timing.js';
import { createTimingAuditId } from './timing-trace.js';
import { logFallbackEventBestEffort } from '../infra/client-logs.js';

export const TIMING_CHECKPOINT_HEALTH_KEY = 'timing_checkpoint_health_v1';

const SESSION_KEY = 'session_v1';
const PERSISTENT_SESSION_KEY = 'session_v1_persistent';
const USAGE_SEGMENTS_KEY = 'usage_segments_v1';
const MEDIA_SEGMENTS_KEY = 'media_segments_v1';
const MEDIA_SESSIONS_KEY = 'media_sessions_v2';
const MEDIA_FACTS_KEY = 'media_facts_v1';
const MODE_BOUNDARY_INTENTS_KEY = 'mode_boundary_intents_v1';

const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};

export async function runForegroundCheckpoint(now = Date.now(), options = {}) {
  return runPeriodicCheckpoint(now, options);
}

function checkpointStatus(result, type = 'foreground') {
  if (!result) return { status: 'warning', reason: 'missing_result' };
  if (result.ok === false || result.error) {
    return { status: 'error', reason: result.failureReason || result.reason || result.error || 'checkpoint_failed' };
  }
  const reason = result.failureReason || result.reason || 'ok';
  const infoReasons = new Set([
    'monitoring_disabled',
    'no_active_tab',
    'window_unfocused',
    'idle_not_active',
    'interval_not_reached',
    'non_counted_state',
    'no_media_sessions',
    'no_media_candidates',
  ]);
  if (!result.failureReason && (infoReasons.has(reason) || infoReasons.has(result.reason))) {
    return { status: 'info', reason };
  }
  const warningReasons = new Set([
    'no_open_session',
    'checkpoint_confirmation_unavailable',
    'observed_query_failed',
    'candidate_query_failed',
    'idle_query_failed',
    'domain_unresolved',
    'unknown_domain',
    'checkpoint_estimated_close',
    'checkpoint_estimated_open_failed',
  ]);
  if (result.failureReason || warningReasons.has(reason) || warningReasons.has(result.reason)) {
    return { status: 'warning', reason };
  }
  if (type === 'media' && result.discovery?.snapshotFailures > 0) {
    return { status: 'warning', reason: result.discovery?.reason || 'media_snapshot_partial_failure' };
  }
  return { status: 'ok', reason };
}

async function readPreviousHealth() {
  try {
    const data = await chrome.storage.local.get(TIMING_CHECKPOINT_HEALTH_KEY);
    return data[TIMING_CHECKPOINT_HEALTH_KEY] || null;
  } catch (_) {
    return null;
  }
}

function summarizeForeground(result) {
  const status = checkpointStatus(result, 'foreground');
  return {
    status: status.status,
    reason: status.reason,
    domain: result?.domain || null,
    sessionOpened: result?.sessionOpened === true || result?.opened === true,
    segmentsWritten: Number(result?.flushedSegments || 0),
    secondsWritten: Number(result?.flushedSeconds || 0),
    checkpointed: result?.checkpointed === true,
    repaired: result?.repaired === true,
    opened: result?.opened === true,
    failureReason: result?.failureReason || null,
    tabId: Number.isInteger(result?.tabId) ? result.tabId : null,
    windowId: Number.isInteger(result?.windowId) ? result.windowId : null,
    error: result?.error || null,
  };
}

function summarizeMedia(result) {
  const status = checkpointStatus(result, 'media');
  return {
    status: status.status,
    reason: status.reason,
    discoveredFacts: Number(result?.discovery?.factsApplied || result?.discovery?.factsObserved || 0),
    sessionsOpened: Number(result?.discovery?.sessionsOpened || 0),
    segmentsWritten: Number(result?.flushedSegments || 0),
    secondsWritten: Number(result?.flushedSeconds || 0),
    checkpointed: result?.checkpointed === true,
    estimatedClosed: result?.estimatedClosed === true,
    snapshotFailures: Number(result?.discovery?.snapshotFailures || 0),
    error: result?.error || null,
  };
}

async function storageLocalGet(keys) {
  try {
    return await chrome.storage.local.get(keys);
  } catch (_) {
    return {};
  }
}

async function storageSessionGet(keys) {
  try {
    if (!chrome.storage?.session?.get) return {};
    return await chrome.storage.session.get(keys);
  } catch (_) {
    return {};
  }
}

function countObjectRows(value) {
  if (!value || typeof value !== 'object') return 0;
  return Object.keys(value).length;
}

function compactOpenForegroundSession(session) {
  if (!session || typeof session !== 'object') return null;
  return {
    state: session.state || null,
    domain: session.domain || null,
    startTime: Number.isFinite(Number(session.startTime)) ? Number(session.startTime) : null,
    tabId: Number.isInteger(session.tabId) ? session.tabId : null,
    windowId: Number.isInteger(session.windowId) ? session.windowId : null,
    mode: session.mode || session.currentMode || null,
    startReason: session.startReason || null,
  };
}

function hasOpenForegroundSession(session) {
  return !!(session && session.state === 'ACTIVE' && session.domain && Number.isFinite(Number(session.startTime)));
}

function summarizeModeBoundaryIntents(intents = {}) {
  const rows = Object.values(intents || {}).filter((intent) => intent?.id);
  return {
    pending: rows.length,
    failed: rows.filter((intent) => intent.lastError).length,
    oldestCreatedAtMs: rows.reduce((min, intent) => {
      const created = Number(intent.createdAtMs || 0);
      if (!created) return min;
      return min == null ? created : Math.min(min, created);
    }, null),
  };
}

async function readCheckpointAuditSnapshot() {
  const [local, sessionStore] = await Promise.all([
    storageLocalGet([
      PERSISTENT_SESSION_KEY,
      USAGE_SEGMENTS_KEY,
      MEDIA_SEGMENTS_KEY,
      MEDIA_SESSIONS_KEY,
      MEDIA_FACTS_KEY,
      MODE_BOUNDARY_INTENTS_KEY,
    ]),
    storageSessionGet(SESSION_KEY),
  ]);
  const openSession = sessionStore?.[SESSION_KEY] || local?.[PERSISTENT_SESSION_KEY] || null;
  const modeBoundary = summarizeModeBoundaryIntents(local?.[MODE_BOUNDARY_INTENTS_KEY] || {});
  return {
    openSession: compactOpenForegroundSession(openSession),
    openForegroundSession: hasOpenForegroundSession(openSession),
    usageSegments: countObjectRows(local?.[USAGE_SEGMENTS_KEY]),
    mediaSegments: countObjectRows(local?.[MEDIA_SEGMENTS_KEY]),
    mediaSessions: countObjectRows(local?.[MEDIA_SESSIONS_KEY]),
    mediaFacts: countObjectRows(local?.[MEDIA_FACTS_KEY]),
    modeBoundary,
  };
}

function safeDelta(after, before) {
  return Math.max(0, Number(after || 0) - Number(before || 0));
}

function hasForegroundObservation(summary = {}) {
  if (!summary) return false;
  if (summary.sessionOpened || summary.opened || summary.repaired || summary.checkpointed || summary.segmentsWritten > 0) {
    return true;
  }
  const noEvidenceReasons = new Set([
    'monitoring_disabled',
    'no_active_tab',
    'window_unfocused',
    'idle_not_active',
    'observed_query_failed',
    'candidate_query_failed',
    'idle_query_failed',
    'interval_not_reached',
    'non_counted_state',
    'invalid_domain',
    'invalid_start_time',
  ]);
  return !!(summary.domain && !noEvidenceReasons.has(summary.reason));
}

function hasMediaObservation(summary = {}, before = {}, after = {}) {
  return !!(
    summary?.discoveredFacts > 0 ||
    summary?.sessionsOpened > 0 ||
    summary?.segmentsWritten > 0 ||
    safeDelta(after.mediaFacts, before.mediaFacts) > 0 ||
    safeDelta(after.mediaSessions, before.mediaSessions) > 0 ||
    safeDelta(after.mediaSegments, before.mediaSegments) > 0
  );
}

function computeLedgerGap({ previous, before, after, foreground, media }) {
  const previousGap = previous?.ledgerGap || {};
  const foregroundObserved = hasForegroundObservation(foreground);
  const foregroundResolved = !!(
    after?.openForegroundSession ||
    foreground?.sessionOpened ||
    foreground?.opened ||
    foreground?.segmentsWritten > 0 ||
    safeDelta(after?.usageSegments, before?.usageSegments) > 0
  );
  const foregroundConsecutive = foregroundObserved && !foregroundResolved
    ? Number(previousGap.foregroundConsecutive || 0) + 1
    : 0;

  const mediaObserved = hasMediaObservation(media, before, after);
  const mediaResolved = !!(
    after?.mediaSessions > 0 ||
    media?.sessionsOpened > 0 ||
    media?.segmentsWritten > 0 ||
    safeDelta(after?.mediaSegments, before?.mediaSegments) > 0
  );
  const mediaConsecutive = mediaObserved && !mediaResolved
    ? Number(previousGap.mediaConsecutive || 0) + 1
    : 0;

  const maxConsecutive = Math.max(foregroundConsecutive, mediaConsecutive);
  const status = maxConsecutive >= 2
    ? 'confirmed'
    : (maxConsecutive === 1 ? 'suspected' : 'none');
  const reason = status === 'none'
    ? 'no_gap'
    : [
      foregroundConsecutive > 0 ? 'foreground_observed_without_ledger' : null,
      mediaConsecutive > 0 ? 'media_observed_without_ledger' : null,
    ].filter(Boolean).join('+');
  return {
    status,
    reason,
    foregroundConsecutive,
    mediaConsecutive,
    usageSegmentDelta: safeDelta(after?.usageSegments, before?.usageSegments),
    mediaSegmentDelta: safeDelta(after?.mediaSegments, before?.mediaSegments),
  };
}

async function writeCheckpointHealth({ now, auditId, monitoringEnabled, foreground, media, before = null, after = null, skipped = null }) {
  const previous = await readPreviousHealth();
  const foregroundSummary = foreground || {
    status: skipped === 'monitoring_disabled' ? 'info' : 'warning',
    reason: skipped || 'not_run',
    domain: null,
    sessionOpened: false,
    segmentsWritten: 0,
  };
  const mediaSummary = media || {
    status: skipped === 'monitoring_disabled' ? 'info' : 'warning',
    reason: skipped || 'not_run',
    discoveredFacts: 0,
    sessionsOpened: 0,
    segmentsWritten: 0,
  };
  const foregroundFailed = foregroundSummary.status === 'warning' || foregroundSummary.status === 'error';
  const mediaFailed = mediaSummary.status === 'warning' || mediaSummary.status === 'error';
  const ledgerGap = skipped
    ? {
      status: 'none',
      reason: skipped,
      foregroundConsecutive: 0,
      mediaConsecutive: 0,
      usageSegmentDelta: 0,
      mediaSegmentDelta: 0,
    }
    : computeLedgerGap({
      previous,
      before,
      after,
      foreground: foregroundSummary,
      media: mediaSummary,
    });
  const health = {
    lastRunAt: now,
    updatedAt: Date.now(),
    auditId,
    monitoringEnabled: monitoringEnabled === true,
    foreground: foregroundSummary,
    media: mediaSummary,
    modeBoundary: {
      pendingBefore: before?.modeBoundary?.pending ?? null,
      pendingAfter: after?.modeBoundary?.pending ?? null,
      failedAfter: after?.modeBoundary?.failed ?? null,
      drained: Math.max(0, Number(before?.modeBoundary?.pending || 0) - Number(after?.modeBoundary?.pending || 0)),
    },
    ledgerGap,
    counters: {
      before: before ? {
        usageSegments: before.usageSegments,
        mediaSegments: before.mediaSegments,
        mediaSessions: before.mediaSessions,
        mediaFacts: before.mediaFacts,
        openForegroundSession: before.openForegroundSession,
      } : null,
      after: after ? {
        usageSegments: after.usageSegments,
        mediaSegments: after.mediaSegments,
        mediaSessions: after.mediaSessions,
        mediaFacts: after.mediaFacts,
        openForegroundSession: after.openForegroundSession,
      } : null,
    },
    consecutiveForegroundFailures: foregroundFailed
      ? Number(previous?.consecutiveForegroundFailures || 0) + 1
      : 0,
    consecutiveMediaFailures: mediaFailed
      ? Number(previous?.consecutiveMediaFailures || 0) + 1
      : 0,
  };
  try {
    await chrome.storage.local.set({ [TIMING_CHECKPOINT_HEALTH_KEY]: health });
  } catch (err) {
    recordFallbackLog({
      level: 'error',
      category: 'storage',
      module: 'core/checkpoint-scheduler',
      eventCode: 'checkpoint_health_write_failed',
      reason: 'storage_write_failed',
      message: err?.message || 'Failed to write checkpoint health',
      details: { auditId, error: err?.message || String(err) },
    });
  }
  return health;
}

function logLedgerGapIfNeeded(ledgerGap, auditId, before, after) {
  if (!ledgerGap || ledgerGap.status === 'none') return;
  const confirmed = ledgerGap.status === 'confirmed';
  recordFallbackLog({
    level: confirmed ? 'error' : 'warning',
    category: 'ledger_gap',
    module: 'core/checkpoint-scheduler',
    eventCode: confirmed ? 'ledger_gap_confirmed' : 'ledger_gap_suspected',
    reason: ledgerGap.reason || 'ledger_gap',
    message: confirmed
      ? 'Checkpoint observed browser activity without durable ledger for consecutive runs'
      : 'Checkpoint observed browser activity without durable ledger',
    domain: after?.openSession?.domain || before?.openSession?.domain || null,
    details: {
      auditId,
      ledgerGap,
      before: {
        usageSegments: before?.usageSegments ?? null,
        mediaSegments: before?.mediaSegments ?? null,
        mediaSessions: before?.mediaSessions ?? null,
        mediaFacts: before?.mediaFacts ?? null,
        openForegroundSession: before?.openForegroundSession === true,
      },
      after: {
        usageSegments: after?.usageSegments ?? null,
        mediaSegments: after?.mediaSegments ?? null,
        mediaSessions: after?.mediaSessions ?? null,
        mediaFacts: after?.mediaFacts ?? null,
        openForegroundSession: after?.openForegroundSession === true,
      },
    },
  });
}

function logCheckpointOutcome(type, summary, auditId) {
  if (!summary || summary.status === 'ok' || summary.status === 'info') return;
  recordFallbackLog({
    level: summary.status === 'error' ? 'error' : 'warning',
    category: 'checkpoint',
    module: 'core/checkpoint-scheduler',
    eventCode: `${type}_checkpoint_${summary.status}`,
    reason: summary.reason || 'checkpoint_failed',
    message: `${type} checkpoint ${summary.status}`,
    domain: summary.domain || null,
    details: {
      auditId,
      reason: summary.reason || null,
      failureReason: summary.failureReason || null,
      error: summary.error || null,
      segmentsWritten: summary.segmentsWritten || 0,
      sessionOpened: summary.sessionOpened === true,
      sessionsOpened: summary.sessionsOpened || 0,
      discoveredFacts: summary.discoveredFacts || 0,
      snapshotFailures: summary.snapshotFailures || 0,
    },
  });
}

export async function runTimingCheckpoints(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const emitTrace = typeof options.emitTrace === 'function' ? options.emitTrace : async () => {};
  const auditId = createTimingAuditId('checkpoint');
  const beforeSnapshot = await readCheckpointAuditSnapshot();
  await emitTrace('timing_inbound_received', {
    source: 'checkpoint',
    reason: 'periodic_checkpoint',
    payload: {
      auditId,
      type: 'alarm',
      _reason: 'periodic_checkpoint',
      source: 'chrome_alarm',
      timestamp: now,
    },
  });
  if (typeof options.isMonitoringEnabled === 'function' && !options.isMonitoringEnabled()) {
    await emitTrace('timing_inbound_skipped', {
      source: 'checkpoint',
      reason: 'monitoring_disabled',
      payload: {
        auditId,
        skippedReason: 'monitoring_disabled',
      },
    });
    const health = await writeCheckpointHealth({
      now,
      auditId,
      monitoringEnabled: false,
      before: beforeSnapshot,
      after: await readCheckpointAuditSnapshot(),
      skipped: 'monitoring_disabled',
    });
    return { ok: true, skipped: 'monitoring_disabled', auditId, health };
  }

  const warn = typeof options.warn === 'function' ? options.warn : () => {};
  const result = { ok: true, foreground: null, media: null, auditId };
  await emitTrace('timing_inbound_routed', {
    source: 'checkpoint',
    reason: 'periodic_checkpoint',
    payload: {
      auditId,
      route: 'foreground+media',
      timestamp: now,
    },
  });

  try {
    result.foreground = await runForegroundCheckpoint(now, {
      confirmForegroundPage: options.confirmForegroundPage,
      resolveUnknownDomainForSettlement: options.resolveUnknownDomainForSettlement,
    });
    const foregroundSummary = summarizeForeground(result.foreground);
    logCheckpointOutcome('foreground', foregroundSummary, auditId);
    await emitTrace('foreground_checkpoint_result', {
      source: 'checkpoint',
      reason: result.foreground?.reason || 'periodic_checkpoint',
      domain: result.foreground?.domain || null,
      payload: { ...result.foreground, auditId },
    });
  } catch (err) {
    result.ok = false;
    result.foreground = { ok: false, error: err?.message || String(err) };
    warn('[Checkpoint] foreground checkpoint failed:', err?.message || err);
    logCheckpointOutcome('foreground', summarizeForeground(result.foreground), auditId);
  }

  try {
    result.media = await runMediaCheckpoint(now);
    const mediaSummary = summarizeMedia(result.media);
    logCheckpointOutcome('media', mediaSummary, auditId);
    await emitTrace('media_checkpoint_result', {
      source: 'checkpoint',
      reason: result.media?.reason || 'periodic_checkpoint',
      domain: null,
      payload: { ...result.media, auditId },
    });
  } catch (err) {
    result.ok = false;
    result.media = { ok: false, error: err?.message || String(err) };
    warn('[Checkpoint] media checkpoint failed:', err?.message || err);
    logCheckpointOutcome('media', summarizeMedia(result.media), auditId);
  }

  const foregroundSummary = summarizeForeground(result.foreground);
  const mediaSummary = summarizeMedia(result.media);
  const afterSnapshot = await readCheckpointAuditSnapshot();
  result.health = await writeCheckpointHealth({
    now,
    auditId,
    monitoringEnabled: true,
    foreground: foregroundSummary,
    media: mediaSummary,
    before: beforeSnapshot,
    after: afterSnapshot,
  });
  logLedgerGapIfNeeded(result.health.ledgerGap, auditId, beforeSnapshot, afterSnapshot);

  return result;
}
