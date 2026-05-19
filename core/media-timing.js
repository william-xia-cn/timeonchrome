// core/media-timing.js — local-only media timing signal consumer

import {
  applyMediaFacts,
  classifyMediaFact,
  closeMediaForTab,
  getMediaFact,
  getMediaSessions,
  runMediaPeriodicCheckpoint,
} from '../runtime/media-session.js';
import { extractDomain } from '../infra/storage.js';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function numericTabId(tabId) {
  const n = Number(tabId);
  return Number.isInteger(n) ? n : null;
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

export async function queryTabMediaFact(tabId, overrides = {}) {
  const normalizedTabId = numericTabId(tabId);
  const stored = await getMediaFact(normalizedTabId ?? tabId);
  let tab = null;
  if (normalizedTabId != null && chrome.tabs?.get) {
    try {
      tab = await chrome.tabs.get(normalizedTabId);
    } catch (_) {
      tab = null;
    }
  }

  const windowId = Number.isInteger(overrides.windowId)
    ? overrides.windowId
    : (Number.isInteger(tab?.windowId) ? tab.windowId : (Number.isInteger(stored?.windowId) ? stored.windowId : null));
  const win = await getWindowSnapshot(windowId);
  const domain = overrides.mediaSourceDomain ||
    overrides.domain ||
    (tab?.url ? extractDomain(tab.url) : null) ||
    stored?.domain ||
    'unknown-page.chrome-local';
  const explicitAudible = hasOwn(overrides, 'isAudible') ? overrides.isAudible : (hasOwn(overrides, 'audible') ? overrides.audible : undefined);
  const explicitPlaying = hasOwn(overrides, 'playing') ? overrides.playing : undefined;
  const explicitPiP = hasOwn(overrides, 'isPiP') ? overrides.isPiP : undefined;
  const audible = explicitAudible !== undefined
    ? explicitAudible === true
    : (tab?.audible === true || stored?.audible === true);
  const isPiP = explicitPiP !== undefined ? explicitPiP === true : stored?.isPiP === true;
  const playing = explicitPlaying !== undefined
    ? explicitPlaying === true
    : (isPiP || audible || stored?.playing === true);
  const mediaKind = overrides.mediaKind ||
    stored?.mediaKind ||
    (isPiP ? 'video' : (audible ? 'audio' : null));

  return {
    tabId: normalizedTabId ?? tabId,
    windowId,
    domain,
    playing,
    mediaKind,
    isPiP,
    audible,
    muted: overrides.isMuted === true || overrides.muted === true || tab?.mutedInfo?.muted === true || stored?.muted === true,
    isActiveTab: overrides.isActiveTab === true || tab?.active === true,
    windowState: overrides.windowState || win.state || stored?.windowState || null,
    source: overrides.mediaFactSource || overrides.source || stored?.source || 'chrome_tab_query',
  };
}

function isForegroundMediaClassification(classification) {
  return classification?.mediaClass === 'foregroundAudio' || classification?.mediaClass === 'foregroundVideo';
}

export async function queryKnownForegroundMediaFacts(requests = []) {
  const facts = [];
  const seen = new Set();
  for (const request of requests || []) {
    const tabId = numericTabId(request?.tabId ?? request);
    if (tabId == null || seen.has(tabId)) continue;
    seen.add(tabId);
    const fact = await queryTabMediaFact(tabId, {
      ...(request?.overrides || {}),
      mediaFactSource: request?.overrides?.mediaFactSource || 'foreground_media_tab_query',
    });
    const classification = classifyMediaFact(fact);
    if (isForegroundMediaClassification(classification)) {
      facts.push({ fact, classification });
    }
  }
  return facts;
}

export async function observeMediaFromSignal(rawEvent = {}) {
  const hasMediaFields = rawEvent.mediaSourceTabId != null ||
    hasOwn(rawEvent, 'playing') ||
    hasOwn(rawEvent, 'isAudible') ||
    hasOwn(rawEvent, 'isPiP') ||
    hasOwn(rawEvent, 'mediaKind');
  if (!hasMediaFields) return null;
  const sourceTabId = rawEvent.mediaSourceTabId ?? rawEvent.tabId;
  if (sourceTabId == null) return null;
  const fact = await queryTabMediaFact(sourceTabId, rawEvent);
  await applyMediaFacts(fact, rawEvent._reason || 'media_fact', Date.now());
  return {
    fact,
    classification: classifyMediaFact(fact),
  };
}

export function isMediaOnlyTimingSignal(rawEvent = {}) {
  const reason = rawEvent?._reason || null;
  if (reason === 'tabAudible' || reason === 'mediaState') return true;
  if (rawEvent?.mediaFactSource) return true;
  return rawEvent.mediaSourceTabId != null &&
    rawEvent.domain == null &&
    !hasOwn(rawEvent, 'url');
}

async function hasKnownMediaForTab(tabId) {
  const normalized = numericTabId(tabId);
  if (normalized == null) return false;
  const fact = await getMediaFact(normalized);
  if (fact && (fact.playing || fact.audible || fact.isPiP)) return true;
  const sessions = await getMediaSessions();
  return Object.values(sessions || {}).some((session) =>
    numericTabId(session?.tabId) === normalized && session?.startTime != null
  );
}

export async function refreshKnownMediaTab(tabId, reason = 'media_reclassify', overrides = {}) {
  const normalized = numericTabId(tabId);
  if (normalized == null) return { ok: false, reason: 'invalid_tab_id' };
  if (!(await hasKnownMediaForTab(normalized))) {
    return { ok: true, skipped: 'unknown_media_tab', tabId: normalized };
  }
  const fact = await queryTabMediaFact(normalized, {
    ...overrides,
    mediaFactSource: overrides.mediaFactSource || reason,
  });
  const result = await applyMediaFacts(fact, reason, Date.now());
  return {
    ok: true,
    tabId: normalized,
    fact,
    classification: classifyMediaFact(fact),
    result,
  };
}

export async function reclassifyKnownMediaTabs(tabIds = [], reason = 'media_reclassify') {
  const ids = [...new Set((tabIds || []).map(numericTabId).filter((tabId) => tabId != null))];
  const results = [];
  for (const tabId of ids) {
    results.push(await refreshKnownMediaTab(tabId, reason));
  }
  return { ok: true, reason, results };
}

export async function handleMediaTabActivated(previousTabId, nextTabId) {
  return reclassifyKnownMediaTabs([previousTabId, nextTabId], 'tabActivated_reclassify');
}

export async function handleMediaTabReplaced(addedTabId, removedTabId) {
  const removedKnown = await hasKnownMediaForTab(removedTabId);
  if (!removedKnown) {
    return { ok: true, skipped: 'unknown_replaced_media_tab', addedTabId, removedTabId };
  }
  const close = await closeMediaForTab(removedTabId, 'tab_replaced');
  const fact = await queryTabMediaFact(addedTabId, { mediaFactSource: 'tab_replaced_reopen' });
  const reopen = await applyMediaFacts(fact, 'tab_replaced_reopen', Date.now());
  return { ok: true, addedTabId, removedTabId, close, reopen };
}

export async function handleMediaWindowStateChanged(windowId, windowState = null) {
  if (!Number.isInteger(windowId) || !chrome.tabs?.query) {
    return { ok: false, reason: 'invalid_window_id' };
  }
  const tabs = await chrome.tabs.query({ active: true, windowId });
  const tab = tabs && tabs[0];
  if (!tab?.id) return { ok: true, skipped: 'no_active_tab', windowId };
  return refreshKnownMediaTab(tab.id, 'window_state_reclassify', {
    windowId,
    windowState,
    isActiveTab: true,
    isAudible: tab.audible === true,
    domain: tab.url ? extractDomain(tab.url) : undefined,
  });
}

export async function closeMediaForTabLifecycle(tabId, reason) {
  return closeMediaForTab(tabId, reason);
}

export async function runMediaCheckpoint(now = Date.now()) {
  return runMediaPeriodicCheckpoint(now);
}
