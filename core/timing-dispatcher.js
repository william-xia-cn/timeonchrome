// core/timing-dispatcher.js — fan-out normalized timing signals to independent consumers

import { processForegroundModeBoundary, processForegroundSignal } from './foreground-timing.js';
import { isMediaOnlyTimingSignal, observeMediaFromSignal, processMediaModeBoundary } from './media-timing.js';
import { drainModeBoundaryIntents } from './mode-boundary-intents.js';

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
  const result = { ok: true, foreground: null, media: null };
  const emitTrace = typeof options.emitTrace === 'function' ? options.emitTrace : async () => {};

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
      boundaryAtMs: signal.boundaryAtMs || null,
      fromMode: signal.fromMode || null,
      toMode: signal.toMode || null,
      foreground: result.foreground,
      media: result.media,
    },
  });
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
  if (rawEvent?._reason === 'windowFocusPolled') {
    return { ok: true, skipped: true, reason: 'focus_polling_disabled' };
  }
  const signalClass = classifyTimingSignal(rawEvent);
  if (signalClass.modeBoundary) {
    return processModeBoundarySignal(rawEvent, options);
  }
  await drainPendingModeBoundaries(options);
  const mediaObservation = await observeMediaFromSignal(rawEvent);
  if (signalClass.mediaOnly) {
    return {
      ok: true,
      skipped: true,
      reason: 'media_signal_foreground_unchanged',
      media: mediaObservation,
      foreground: { skipped: true, reason: 'media_signal_foreground_unchanged' },
    };
  }
  return processForegroundSignal(rawEvent, {
    scheduleBadgeUpdate: options.scheduleBadgeUpdate,
  });
}
