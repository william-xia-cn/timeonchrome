// core/foreground-timing.js — foreground webpage timing consumer

import { buildContext } from './context.js';
import { resolveState } from './state.js';
import { emitTrace } from './timing-trace.js';
import { queryKnownForegroundMediaFacts } from './media-timing.js';
import { extractDomain } from '../infra/storage.js';
import { getSession as getTimingSession, transitionStateAt } from '../runtime/session.js';

const UNKNOWN_FOREGROUND_DOMAIN = '__unknown__';
const SHORT_FOREGROUND_GAP_DIAGNOSTIC_MS = 30 * 1000;
const IDLE_DETECTION_SECONDS = 90;

let currentContext = null;
let appliedForegroundBoundary = { state: null, domain: null };
let pendingForegroundGapDiagnostic = null;

function isOrdinaryForegroundFrameworkState(state) {
  return state === 'ACTIVE' || state === 'PASSIVE' || state === 'IDLE';
}

function sameBoundary(a, b) {
  return (a?.state ?? null) === (b?.state ?? null) && (a?.domain ?? null) === (b?.domain ?? null);
}

function numericTabId(tabId) {
  const n = Number(tabId);
  return Number.isInteger(n) ? n : null;
}

function tabMatchesContext(tab, context = {}) {
  if (!tab?.id) return false;
  if (Number.isInteger(context.tabId)) return tab.id === context.tabId;
  if (Number.isInteger(context.windowId) && tab.windowId === context.windowId && tab.active !== false) return true;
  return false;
}

function domainFromCandidateTab(tab, context = {}, source = 'candidate') {
  if (!tab?.id) return { ok: false, reason: `${source}_missing_tab` };
  if (!tabMatchesContext(tab, context)) {
    return {
      ok: false,
      reason: Number.isInteger(context.tabId) ? 'tab_mismatch' : 'window_mismatch',
      error: `candidate tab ${tab.id} window ${tab.windowId ?? 'unknown'} does not match context`,
    };
  }
  if (!tab.url) return { ok: false, reason: 'active_tab_missing_url' };
  const domain = extractDomain(tab.url || '');
  if (!domain) return { ok: false, reason: 'special_page', error: tab.url || null };
  return { ok: true, domain, reason: source, tabId: tab.id, windowId: tab.windowId ?? null };
}

async function resolveActiveUnknownDomain(context = {}) {
  let lastFailure = { ok: false, reason: 'no_candidate_context' };

  if (Number.isInteger(context.tabId) && context.tabId > 0) {
    try {
      const tab = await chrome.tabs.get(context.tabId);
      const result = domainFromCandidateTab(tab, context, 'tabs_get');
      if (result.ok) return result;
      lastFailure = result;
    } catch (err) {
      lastFailure = { ok: false, reason: 'tabs_get_failed', error: err?.message || String(err) };
    }
  }

  if (Number.isInteger(context.windowId) && context.windowId > 0) {
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId: context.windowId });
      const tab = tabs && tabs[0];
      const result = domainFromCandidateTab(tab, context, 'tabs_query_window');
      if (result.ok) return result;
      lastFailure = result;
    } catch (err) {
      lastFailure = { ok: false, reason: 'tabs_query_window_failed', error: err?.message || String(err) };
    }
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs[0];
    const result = domainFromCandidateTab(tab, context, 'tabs_query_last_focused');
    if (result.ok) return result;
    lastFailure = result;
  } catch (err) {
    lastFailure = { ok: false, reason: 'tabs_query_last_focused_failed', error: err?.message || String(err) };
  }

  return lastFailure;
}

export function getForegroundContext() {
  return currentContext;
}

export async function resolveUnknownDomainForSettlement(session) {
  const context = {
    tabId: Number.isInteger(session?.tabId) ? session.tabId : null,
    windowId: Number.isInteger(session?.windowId) ? session.windowId : null,
  };
  if (!Number.isInteger(context.tabId) && !Number.isInteger(context.windowId)) {
    return { ok: false, reason: 'missing_session_tab_context' };
  }
  const result = await resolveActiveUnknownDomain(context);
  if (!result.ok) return result;
  return { ok: true, domain: result.domain, reason: `unknown_recovered_at_settlement:${result.reason}` };
}

async function readActiveTabSignal(reason = 'active_tab_lookup') {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs[0];
    if (!tab?.id) {
      return {
        tabId: null,
        windowId: null,
        url: null,
        domain: null,
        isFocused: false,
        error: 'active_tab_missing',
        _reason: reason,
      };
    }
    let isFocused = true;
    try {
      const win = Number.isInteger(tab.windowId) ? await chrome.windows.get(tab.windowId) : null;
      isFocused = win?.focused !== false;
    } catch (err) {
      return {
        tabId: tab.id,
        windowId: tab.windowId ?? null,
        url: tab.url || null,
        domain: tab.url ? extractDomain(tab.url) : null,
        isFocused: true,
        error: err?.message || String(err),
        _reason: reason,
      };
    }
    const url = tab.url || null;
    return {
      tabId: tab.id,
      windowId: tab.windowId ?? null,
      url,
      domain: url ? extractDomain(url) : null,
      isFocused,
      _reason: reason,
    };
  } catch (err) {
    return {
      tabId: null,
      windowId: null,
      url: null,
      domain: null,
      isFocused: false,
      error: err?.message || String(err),
      _reason: reason,
    };
  }
}

async function getWindowSnapshot(windowId) {
  if (!Number.isInteger(windowId) || !chrome.windows?.get) {
    return { focused: false, state: null };
  }
  try {
    const win = await chrome.windows.get(windowId);
    return {
      focused: !!win?.focused,
      state: win?.state || null,
    };
  } catch (err) {
    return { focused: false, state: null, error: err?.message || String(err) };
  }
}

function isForegroundMediaClassification(classification) {
  return classification?.mediaClass === 'foregroundAudio' || classification?.mediaClass === 'foregroundVideo';
}

async function enrichContextWithForegroundMedia(context, previousContext, rawEvent, mediaObservation) {
  if (!context || context.idleState === 'locked') {
    return { ...(context || {}), foregroundMediaActive: false };
  }

  let foreground = null;
  if (mediaObservation && isForegroundMediaClassification(mediaObservation.classification)) {
    foreground = mediaObservation;
  }

  const shouldQueryForegroundMedia =
    !foreground &&
    (rawEvent?._reason === 'idleStateChanged' ||
      rawEvent?._reason === 'windowFocusLost' ||
      rawEvent?._reason === 'windowFocusPolled' ||
      context.isFocused === false);

  if (shouldQueryForegroundMedia) {
    const candidates = await queryKnownForegroundMediaFacts([
      {
        tabId: context.mediaSourceTabId ?? context.tabId,
        overrides: {
          windowId: context.windowId,
          domain: context.domain,
          windowState: context.windowState,
          mediaFactSource: rawEvent?._reason || 'foreground_media_context_query',
        },
      },
      {
        tabId: previousContext?.mediaSourceTabId ?? previousContext?.tabId,
        overrides: {
          windowId: previousContext?.windowId,
          domain: previousContext?.domain,
          windowState: previousContext?.windowState,
          mediaFactSource: rawEvent?._reason || 'foreground_media_previous_context_query',
        },
      },
    ]);
    foreground = candidates.find((candidate) =>
      candidate.fact?.tabId === context.tabId ||
      candidate.fact?.tabId === previousContext?.tabId ||
      candidate.fact?.domain === context.domain ||
      candidate.fact?.domain === previousContext?.domain
    ) || candidates[0] || null;
  }

  if (!foreground) {
    return { ...context, foregroundMediaActive: false };
  }

  const fact = foreground.fact;
  const factTabId = numericTabId(fact.tabId);
  return {
    ...context,
    tabId: context.tabId ?? factTabId ?? previousContext?.tabId ?? null,
    windowId: context.windowId ?? fact.windowId ?? previousContext?.windowId ?? null,
    domain: context.domain || previousContext?.domain || fact.domain || 'unknown-page.chrome-local',
    foregroundMediaActive: true,
    mediaSourceTabId: factTabId ?? context.mediaSourceTabId ?? null,
    mediaSourceDomain: fact.domain || context.mediaSourceDomain || null,
    mediaKind: fact.mediaKind || context.mediaKind || null,
    isAudible: fact.audible === true || context.isAudible === true,
    isPiP: fact.isPiP === true || context.isPiP === true,
    windowState: fact.windowState || context.windowState || null,
    mediaFactSource: fact.source || context.mediaFactSource || null,
  };
}

async function applyForegroundBoundary(boundary, applyReason) {
  await transitionStateAt(boundary.state, boundary.domain, boundary.boundaryAt, applyReason, {
    ...(boundary.metadata || {}),
    resolveUnknownDomainForSettlement,
  });
  appliedForegroundBoundary = { state: boundary.state, domain: boundary.domain };
}

async function handleForegroundBoundary(state, domain, reason, boundaryAt, metadata = {}) {
  const target = { state, domain: state === 'ACTIVE' ? (domain || UNKNOWN_FOREGROUND_DOMAIN) : domain || null };

  if (appliedForegroundBoundary.state === 'ACTIVE' && target.state !== 'ACTIVE') {
    pendingForegroundGapDiagnostic = {
      startAt: boundaryAt,
      fromDomain: appliedForegroundBoundary.domain || null,
      intermediateState: target.state || null,
      reason,
    };
  } else if (target.state === 'ACTIVE' && pendingForegroundGapDiagnostic) {
    const gapMs = Math.max(0, boundaryAt - pendingForegroundGapDiagnostic.startAt);
    if (gapMs > 0 && gapMs <= SHORT_FOREGROUND_GAP_DIAGNOSTIC_MS) {
      await emitTrace('foreground_short_gap_detected', {
        source: 'foreground-boundary',
        reason,
        domain: target.domain || null,
        nextState: target.state,
        payload: {
          gapStartAt: pendingForegroundGapDiagnostic.startAt,
          gapEndAt: boundaryAt,
          gapMs,
          fromDomain: pendingForegroundGapDiagnostic.fromDomain,
          toDomain: target.domain || null,
          intermediateState: pendingForegroundGapDiagnostic.intermediateState,
          intermediateReason: pendingForegroundGapDiagnostic.reason,
        },
      });
    }
    pendingForegroundGapDiagnostic = null;
  }

  if (sameBoundary(target, appliedForegroundBoundary)) return;

  await emitTrace('foreground_boundary_applied', {
    source: 'foreground-boundary',
    reason,
    domain: target.domain || null,
    nextState: target.state,
    payload: {
      boundaryAt,
      immediate: true,
    },
  });
  await applyForegroundBoundary({
    state: target.state,
    domain: target.domain,
    boundaryAt,
    metadata,
  }, reason || 'foreground_boundary');
}

export async function processForegroundSignal(rawEvent, options = {}) {
  let signal = rawEvent || {};
  const scheduleBadgeUpdate = typeof options.scheduleBadgeUpdate === 'function'
    ? options.scheduleBadgeUpdate
    : () => {};

  if (signal?._reason === 'idleStateChanged' && signal.idleState === 'active') {
    const activeTabSignal = await readActiveTabSignal('idle_active_reopen_lookup');
    signal = {
      ...signal,
      ...activeTabSignal,
      idleState: 'active',
      isIdle: false,
      _reason: 'idleStateChanged',
    };
    await emitTrace('idle_active_reopen', {
      source: 'signal',
      reason: 'idleStateChanged',
      tabId: signal.tabId ?? null,
      windowId: signal.windowId ?? null,
      domain: signal.domain ?? null,
      payload: {
        phase: 'active_tab_lookup',
        idleDetectionSeconds: IDLE_DETECTION_SECONDS,
        urlPresent: !!signal.url,
        error: signal.error || null,
      },
    });
  }

  await emitTrace('signal_received', {
    source: 'signal',
    reason: signal._reason || 'unknown',
    tabId: signal.tabId ?? null,
    windowId: signal.windowId ?? null,
    domain: signal.domain ?? null,
    payload: { event: signal },
  });

  const previousContext = currentContext;
  currentContext = buildContext(currentContext, signal);
  currentContext = await enrichContextWithForegroundMedia(currentContext, previousContext, signal, options.mediaObservation || null);
  const foregroundDiagnostics = {
    eventDomain: currentContext?.domain ?? null,
    idleState: currentContext?.idleState ?? null,
    isIdle: currentContext?.isIdle ?? null,
    isFocused: currentContext?.isFocused ?? null,
    foregroundMediaActive: currentContext?.foregroundMediaActive ?? false,
  };
  await emitTrace('snapshot_created', {
    source: 'context',
    reason: signal._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain: currentContext?.domain ?? null,
    payload: {
      ...foregroundDiagnostics,
      isAudible: currentContext?.isAudible,
      isPiP: currentContext?.isPiP,
      mediaSourceDomain: currentContext?.mediaSourceDomain,
      mediaFactSource: currentContext?.mediaFactSource,
    },
  });

  if (options.isMediaOnlySignal === true) {
    await emitTrace('transition_skipped', {
      source: 'session',
      reason: signal._reason || 'media_signal',
      tabId: currentContext?.tabId ?? null,
      windowId: currentContext?.windowId ?? null,
      domain: currentContext?.domain ?? null,
      nextState: null,
      payload: { skippedReason: 'media_signal_foreground_unchanged' },
    });
    return;
  }

  const state = resolveState(currentContext);
  let domain = (state === 'BACKGROUND_ACTIVE' || state === 'PIP_ACTIVE')
    ? (currentContext?.mediaSourceDomain || currentContext?.domain || null)
    : (state === 'ACTIVE' ? (currentContext?.domain || UNKNOWN_FOREGROUND_DOMAIN) : (currentContext?.domain || null));
  let domainResolution = {
    reason: currentContext?.domain ? 'event_domain' : 'context_domain',
    error: currentContext?.error || null,
  };
  if (
    state === 'ACTIVE' &&
    domain === UNKNOWN_FOREGROUND_DOMAIN &&
    (Number.isInteger(currentContext?.tabId) || Number.isInteger(currentContext?.windowId))
  ) {
    const resolved = await resolveActiveUnknownDomain(currentContext);
    if (resolved.ok) {
      domain = resolved.domain;
      domainResolution = { reason: `pre_open_recheck:${resolved.reason}`, error: null };
    } else {
      domainResolution = { reason: resolved.reason || 'pre_open_recheck_failed', error: resolved.error || null };
      await emitTrace('unknown_pre_open_recheck_failed', {
        source: 'state',
        reason: signal._reason || 'unknown',
        tabId: currentContext?.tabId ?? null,
        windowId: currentContext?.windowId ?? null,
        domain,
        nextState: state,
        payload: {
          foreground: foregroundDiagnostics,
          resolutionReason: domainResolution.reason,
          resolutionError: domainResolution.error,
        },
      });
    }
  }
  await emitTrace('state_resolved', {
    source: 'state',
    reason: signal._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain,
    nextState: state,
    payload: {
      context: currentContext,
      foreground: {
        ...foregroundDiagnostics,
        resolvedDomain: domain,
        domainResolution,
      },
    },
  });

  await emitTrace('transition_begin', {
    source: 'session',
    reason: signal._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain,
    previousState: state,
    nextState: state,
    payload: { state, domain, foreground: foregroundDiagnostics },
  });

  const metadata = {
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domainResolutionReason: domainResolution.reason,
    domainResolutionError: domainResolution.error,
  };
  const idleBoundarySignal = signal._reason === 'idleStateChanged' && signal.isIdle === true;
  const idleActiveSignal = signal._reason === 'idleStateChanged' && signal.idleState === 'active';

  if (idleBoundarySignal && currentContext?.foregroundMediaActive !== true) {
    const session = await getTimingSession();
    if (session?.state === 'ACTIVE') {
      await emitTrace('idle_inactive_close', {
        source: 'runtime-session',
        reason: 'idleStateChanged',
        tabId: session.tabId ?? currentContext?.tabId ?? null,
        windowId: session.windowId ?? currentContext?.windowId ?? null,
        domain: session.domain || domain || null,
        previousState: session.state,
        nextState: 'IDLE',
        payload: {
          idleState: signal.idleState || 'idle',
          idleDetectionSeconds: IDLE_DETECTION_SECONDS,
          sessionStartTime: session.startTime || null,
        },
      });
      await transitionStateAt('IDLE', null, Date.now(), 'idle_inactive_close', {
        ...metadata,
        resolveUnknownDomainForSettlement,
      });
      appliedForegroundBoundary = { state: 'IDLE', domain: null };
      scheduleBadgeUpdate();
      return { state: 'IDLE', domain: null, context: currentContext };
    }
  }

  if (idleActiveSignal && state === 'ACTIVE') {
    await transitionStateAt('ACTIVE', domain, Date.now(), 'idle_active_reopen', {
      ...metadata,
      resolveUnknownDomainForSettlement,
    });
    appliedForegroundBoundary = { state: 'ACTIVE', domain };
    await emitTrace('idle_active_reopen', {
      source: 'runtime-session',
      reason: 'idleStateChanged',
      tabId: currentContext?.tabId ?? null,
      windowId: currentContext?.windowId ?? null,
      domain,
      nextState: 'ACTIVE',
      payload: {
        phase: 'session_reopen',
        idleDetectionSeconds: IDLE_DETECTION_SECONDS,
        domainResolution,
      },
    });
    scheduleBadgeUpdate();
    return { state, domain, context: currentContext };
  }

  if (isOrdinaryForegroundFrameworkState(state)) {
    await handleForegroundBoundary(state, domain, signal._reason || 'unknown', Date.now(), {
      ...metadata,
    });
  } else if (state !== 'BACKGROUND_ACTIVE' && state !== 'PIP_ACTIVE') {
    await transitionStateAt(state, domain, Date.now(), signal._reason || 'unknown', {
      ...metadata,
      resolveUnknownDomainForSettlement,
    });
    appliedForegroundBoundary = { state, domain };
  }
  scheduleBadgeUpdate();

  await emitTrace('transition_end', {
    source: 'session',
    reason: signal._reason || 'unknown',
    tabId: currentContext?.tabId ?? null,
    windowId: currentContext?.windowId ?? null,
    domain,
    previousState: state,
    nextState: state,
    payload: { state, domain, foreground: foregroundDiagnostics },
  });

  return { state, domain, context: currentContext };
}

function queryIdleState(seconds) {
  return new Promise((resolve, reject) => {
    try {
      chrome.idle.queryState(seconds, (state) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(new Error(err.message));
        else resolve(state);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function confirmForegroundPageCheckpoint(session) {
  try {
    const idleState = await queryIdleState(180).catch((err) => ({ error: err?.message || String(err) }));
    if (idleState && typeof idleState === 'object' && idleState.error) {
      return { ok: false, reason: 'idle_query_failed', error: idleState.error };
    }
    if (idleState === 'locked') {
      return { ok: false, reason: 'idle_not_active', idleState };
    }

    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs[0];
    let win = { focused: true, state: null };
    if (tab?.id && tab.windowId && chrome.windows?.get) {
      win = await getWindowSnapshot(tab.windowId);
      if (win.error) {
        return { ok: false, reason: 'observed_query_failed', error: win.error };
      }
    }
    const observedDomain = tab?.id
      ? (extractDomain(tab.url || '') || 'unknown-page.chrome-local')
      : null;

    const foregroundMediaSample = async (failureReason) => {
      const candidates = await queryKnownForegroundMediaFacts([
        {
          tabId: session?.tabId,
          overrides: {
            windowId: session?.windowId ?? null,
            mediaFactSource: 'checkpoint_session_media_query',
          },
        },
        {
          tabId: tab?.id,
          overrides: {
            windowId: tab?.windowId,
            domain: observedDomain,
            isActiveTab: true,
            windowState: win.state || null,
            isAudible: tab?.audible === true,
            mediaFactSource: 'checkpoint_active_tab_media_query',
          },
        },
      ]);
      const match = candidates.find((candidate) =>
        !session?.domain ||
        candidate.fact?.domain === session.domain ||
        candidate.fact?.tabId === session.tabId
      ) || candidates[0] || null;
      if (!match) return null;
      const result = {
        observedDomain: match.fact.domain,
        observedState: 'ACTIVE',
        tabId: numericTabId(match.fact.tabId),
        windowId: Number.isInteger(match.fact.windowId) ? match.fact.windowId : null,
        idleState,
        foregroundMediaActive: true,
        mediaClass: match.classification.mediaClass,
      };
      if (session?.domain && match.fact.domain !== session.domain) {
        return {
          ...result,
          ok: false,
          reason: match.fact.domain === 'unknown-page.chrome-local' ? 'unknown_domain' : 'observed_mismatch',
          mediaCompensationAttempted: true,
          mediaCompensationFailureReason: failureReason || null,
        };
      }
      return {
        ...result,
        ok: true,
        reason: failureReason ? `foreground_media_compensated:${failureReason}` : 'foreground_media_compensated',
      };
    };

    if (idleState !== 'active') {
      const mediaSample = await foregroundMediaSample('idle_not_active');
      if (mediaSample) return mediaSample;
      return { ok: false, reason: 'idle_not_active', idleState };
    }

    if (!tab?.id) {
      const mediaSample = await foregroundMediaSample('no_active_tab');
      if (mediaSample) return mediaSample;
      return { ok: false, reason: 'no_active_tab' };
    }

    if (!win.focused) {
      const mediaSample = await foregroundMediaSample('window_unfocused');
      if (mediaSample) return mediaSample;
      return { ok: false, reason: 'window_unfocused' };
    }

    if (!session?.domain) {
      return { ok: true, observedDomain, observedState: 'ACTIVE', tabId: numericTabId(tab.id), windowId: tab.windowId ?? null, idleState };
    }
    if (observedDomain !== session.domain) {
      return {
        ok: false,
        reason: observedDomain === 'unknown-page.chrome-local' ? 'unknown_domain' : 'observed_mismatch',
        observedDomain,
        observedState: 'ACTIVE',
        tabId: numericTabId(tab.id),
        windowId: tab.windowId ?? null,
        idleState,
      };
    }
    return { ok: true, observedDomain, observedState: 'ACTIVE', tabId: numericTabId(tab.id), windowId: tab.windowId ?? null, idleState };
  } catch (err) {
    return { ok: false, reason: 'observed_query_failed', error: err?.message || String(err) };
  }
}
