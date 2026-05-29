// core/checkpoint-scheduler.js — split foreground and media checkpoint execution

import { runPeriodicCheckpoint } from '../runtime/session.js';
import { runMediaCheckpoint } from './media-timing.js';
import { createTimingAuditId } from './timing-trace.js';
import { logFallbackEventBestEffort } from '../infra/client-logs.js';

export const TIMING_CHECKPOINT_HEALTH_KEY = 'timing_checkpoint_health_v1';

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
  const warningReasons = new Set([
    'no_open_session',
    'checkpoint_confirmation_unavailable',
    'no_active_tab',
    'window_unfocused',
    'idle_not_active',
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
    failureReason: result?.failureReason || null,
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

async function writeCheckpointHealth({ now, auditId, monitoringEnabled, foreground, media, skipped = null }) {
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
  const health = {
    lastRunAt: now,
    updatedAt: Date.now(),
    auditId,
    monitoringEnabled: monitoringEnabled === true,
    foreground: foregroundSummary,
    media: mediaSummary,
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
      category: 'timing',
      module: 'core/checkpoint-scheduler',
      eventCode: 'checkpoint_health_write_failed',
      reason: 'storage_write_failed',
      message: err?.message || 'Failed to write checkpoint health',
      details: { auditId, error: err?.message || String(err) },
    });
  }
  return health;
}

function logCheckpointOutcome(type, summary, auditId) {
  if (!summary || summary.status === 'ok' || summary.status === 'info') return;
  recordFallbackLog({
    level: summary.status === 'error' ? 'error' : 'warning',
    category: type === 'media' ? 'media' : 'timing',
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
  result.health = await writeCheckpointHealth({
    now,
    auditId,
    monitoringEnabled: true,
    foreground: foregroundSummary,
    media: mediaSummary,
  });

  return result;
}
