// core/timing-dispatcher.js — fan-out normalized timing signals to independent consumers

import { processForegroundSignal } from './foreground-timing.js';
import { isMediaOnlyTimingSignal, observeMediaFromSignal } from './media-timing.js';

export function classifyTimingSignal(rawEvent = {}) {
  const mediaOnly = isMediaOnlyTimingSignal(rawEvent);
  const hasForegroundCandidate =
    rawEvent?.domain != null ||
    rawEvent?.url != null ||
    rawEvent?.isFocused != null ||
    rawEvent?.idleState != null ||
    rawEvent?._reason === 'tabActivated' ||
    rawEvent?._reason === 'tabUpdated' ||
    rawEvent?._reason === 'tabReplaced' ||
    rawEvent?._reason === 'windowFocusChanged' ||
    rawEvent?._reason === 'windowFocusLost' ||
    rawEvent?._reason === 'windowFocusPolled';
  return {
    mediaOnly,
    foreground: !mediaOnly && hasForegroundCandidate,
    media: mediaOnly || rawEvent?.mediaSourceTabId != null,
  };
}

export async function dispatchTimingSignal(rawEvent, options = {}) {
  if (typeof options.ensureBootstrapped === 'function') {
    await options.ensureBootstrapped('signal');
  }
  const signalClass = classifyTimingSignal(rawEvent);
  const mediaObservation = await observeMediaFromSignal(rawEvent);
  return processForegroundSignal(rawEvent, {
    mediaObservation,
    isMediaOnlySignal: signalClass.mediaOnly,
    scheduleBadgeUpdate: options.scheduleBadgeUpdate,
  });
}
