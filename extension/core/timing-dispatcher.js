// core/timing-dispatcher.js — fan-out normalized timing signals to independent consumers

import { processForegroundModeBoundary, processForegroundSignal } from './foreground-timing.js';
import { isMediaOnlyTimingSignal, observeMediaFromSignal, processMediaModeBoundary } from './media-timing.js';
import { drainModeBoundaryIntents } from './mode-boundary-intents.js';
import { createTimingAuditId, inboundAuditFields } from './timing-trace.js';
import { logClientEventBestEffort, logFallbackEventBestEffort } from '../infra/client-logs.js';

const recordClientLog = typeof logClientEventBestEffort === 'function'
  ? logClientEventBestEffort
  : () => {};
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};

async function emitInboundAudit(action, rawEvent = {}, options = {}, extra = {}) {
  const emitTrace = typeof options.emitTrace === 'function' ? options.emitTrace : async () => {};
  const auditId = extra.auditId || rawEvent.auditId || createTimingAuditId();
  const inbound = inboundAuditFields({ ...rawEvent, auditId });
  await emitTrace(action, {
    source: extra.source || 'timing-dispatcher',
    reason: extra.reason || rawEvent._reason || rawEvent.reason || rawEvent.type || null,
    tabId: inbound.tabId,
    windowId: inbound.windowId,
    url: inbound.url,
    domain: inbound.domain,
    payload: {
      ...inbound,
      ...(extra.payload || {}),
      auditId,
    },
  });
  return auditId;
}

export function classifyTimingSignal(rawEvent = {}) {
  const modeBoundary = rawEvent?.type === 'mode_boundary' || rawEvent?._reason === 'modeBoundary';
  const mediaOnly = isMediaOnlyTimingSignal(rawEvent);
  const hasForegroundCandidate =
    modeBoundary ||
    rawEvent?.domain != null ||
    rawEvent?.url != null ||
    rawEvent?.isFocused != null ||
    rawEvent?.idleState != null ||
    rawEvent?._reason === 'tabActivated' ||
    rawEvent?._reason === 'tabUpdated' ||
    rawEvent?._reason === 'tabReplaced' ||
    rawEvent?._reason === 'windowFocusChanged' ||
    rawEvent?._reason === 'windowFocusLost';
  return {
    modeBoundary,
    mediaOnly,
    foreground: !mediaOnly && hasForegroundCandidate,
    media: modeBoundary || mediaOnly || rawEvent?.mediaSourceTabId != null,
  };
}

export async function processModeBoundarySignal(rawEvent = {}, options = {}) {
  const signal = {
    ...rawEvent,
    type: 'mode_boundary',
    _reason: 'modeBoundary',
  };
  const auditId = options.auditId || await emitInboundAudit('timing_inbound_received', signal, options, {
    source: 'mode-boundary',
  });
  signal.auditId = auditId;
  const result = { ok: true, foreground: null, media: null, auditId };
  const emitTrace = typeof options.emitTrace === 'function' ? options.emitTrace : async () => {};

  await emitInboundAudit('timing_inbound_routed', signal, options, {
    auditId,
    source: 'mode-boundary',
    payload: { route: 'foreground+media' },
  });

  try {
    result.foreground = await processForegroundModeBoundary(signal);
    if (result.foreground?.ok === false) result.ok = false;
  } catch (err) {
    result.ok = false;
    result.foreground = { ok: false, error: err?.message || String(err) };
  }

  try {
    result.media = await processMediaModeBoundary(signal);
    if (result.media?.ok === false) result.ok = false;
  } catch (err) {
    result.ok = false;
    result.media = { ok: false, error: err?.message || String(err) };
  }

  await emitTrace('mode_boundary_result', {
    source: 'mode-boundary',
    reason: signal.reason || 'mode_boundary',
    domain: null,
    payload: {
      id: signal.id || null,
      auditId,
      boundaryAtMs: signal.boundaryAtMs || null,
      fromMode: signal.fromMode || null,
      toMode: signal.toMode || null,
      foreground: result.foreground,
      media: result.media,
    },
  });
  if (result.ok === false) {
    recordFallbackLog({
      level: 'error',
      category: 'mode_transition',
      eventCode: 'mode_boundary_failed',
      module: 'core/timing-dispatcher',
      reason: result.foreground?.error || result.media?.error || 'mode_boundary_failed',
      message: 'Mode boundary failed while splitting ledgers',
      details: {
        auditId,
        phase: 'mode_boundary_consumed',
        intentId: signal.id || null,
        fromMode: signal.fromMode || null,
        toMode: signal.toMode || null,
        boundaryAtMs: signal.boundaryAtMs || null,
        foreground: result.foreground,
        media: result.media,
      },
    });
  } else {
    recordClientLog({
      level: 'info',
      category: 'mode_transition',
      eventCode: 'mode_boundary_consumed',
      module: 'core/timing-dispatcher',
      message: 'Mode boundary consumed',
      details: {
        auditId,
        phase: 'mode_boundary_consumed',
        intentId: signal.id || null,
        fromMode: signal.fromMode || null,
        toMode: signal.toMode || null,
        boundaryAtMs: signal.boundaryAtMs || null,
        foreground: result.foreground,
        media: result.media,
      },
    });
  }
  return result;
}

export async function drainPendingModeBoundaries(options = {}) {
  return drainModeBoundaryIntents(
    (intent) => processModeBoundarySignal(intent, options),
    { throwOnFailure: false }
  );
}

export async function dispatchTimingSignal(rawEvent, options = {}) {
  if (typeof options.ensureBootstrapped === 'function') {
    await options.ensureBootstrapped('signal');
  }
  const signalClass = classifyTimingSignal(rawEvent);
  if (signalClass.modeBoundary) {
    return processModeBoundarySignal(rawEvent, options);
  }
  const auditId = await emitInboundAudit('timing_inbound_received', rawEvent, options, {
    source: 'timing-dispatcher',
  });
  const auditedEvent = { ...rawEvent, auditId };
  if (rawEvent?._reason === 'windowFocusPolled') {
    await emitInboundAudit('timing_inbound_skipped', rawEvent, options, {
      auditId,
      source: 'timing-dispatcher',
      reason: 'focus_polling_disabled',
      payload: { skippedReason: 'focus_polling_disabled' },
    });
    return { ok: true, skipped: true, reason: 'focus_polling_disabled', auditId };
  }
  await emitInboundAudit('timing_inbound_routed', rawEvent, options, {
    auditId,
    source: 'timing-dispatcher',
    payload: { signalClass },
  });
  await drainPendingModeBoundaries(options);
  const mediaObservation = await observeMediaFromSignal(auditedEvent);
  if (signalClass.mediaOnly) {
    await emitInboundAudit('timing_inbound_skipped', rawEvent, options, {
      auditId,
      source: 'timing-dispatcher',
      reason: 'media_signal_foreground_unchanged',
      payload: {
        skippedReason: 'media_signal_foreground_unchanged',
        media: mediaObservation,
      },
    });
    return {
      ok: true,
      skipped: true,
      reason: 'media_signal_foreground_unchanged',
      auditId,
      media: mediaObservation,
      foreground: { skipped: true, reason: 'media_signal_foreground_unchanged' },
    };
  }
  const foreground = await processForegroundSignal(auditedEvent, {
    scheduleBadgeUpdate: options.scheduleBadgeUpdate,
  });
  return { ...foreground, auditId };
}
