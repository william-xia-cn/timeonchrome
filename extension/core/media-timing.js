// core/media-timing.js — independent media timing signal consumer

import {
  applyMediaFacts,
  classifyMediaFact,
  closeForbiddenPiPSessionsForTab,
  closeMediaForTab,
  getMediaFact,
  getMediaSessions,
  runMediaPeriodicCheckpoint,
  splitOpenMediaSessionsAtModeBoundary,
} from '../runtime/media-session.js';
import { extractDomain } from '../infra/storage.js';
import { closeForbiddenPictureInPicture, isPictureInPictureDisallowed } from './pip-policy.js';
import { emitTrace } from './timing-trace.js';
import { logFallbackEventBestEffort } from '../infra/client-logs.js';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function numericTabId(tabId) {
  const n = Number(tabId);
  return Number.isInteger(n) ? n : null;
}

const FORBIDDEN_PIP_CLEANUP_PENDING_MS = 5000;
const pendingForbiddenPiPCleanupByTab = new Map();
const recordFallbackLog = typeof logFallbackEventBestEffort === 'function'
  ? logFallbackEventBestEffort
  : () => {};

function markPendingForbiddenPiPCleanup(tabId, reason, atMs) {
  const normalizedTabId = numericTabId(tabId);
  if (normalizedTabId == null) return null;
  const entry = {
    tabId: normalizedTabId,
    reason: reason || 'pip_forbidden_cleanup',
    markedAt: atMs,
    expiresAt: atMs + FORBIDDEN_PIP_CLEANUP_PENDING_MS,
  };
  pendingForbiddenPiPCleanupByTab.set(normalizedTabId, entry);
  return entry;
}

function clearPendingForbiddenPiPCleanup(tabId) {
  const normalizedTabId = numericTabId(tabId);
  if (normalizedTabId != null) pendingForbiddenPiPCleanupByTab.delete(normalizedTabId);
}

function consumePendingForbiddenPiPCleanup(tabId, atMs) {
  const normalizedTabId = numericTabId(tabId);
  if (normalizedTabId == null) return null;
  const entry = pendingForbiddenPiPCleanupByTab.get(normalizedTabId);
  if (!entry) return null;
  if (Number(entry.expiresAt) < atMs) {
    pendingForbiddenPiPCleanupByTab.delete(normalizedTabId);
    return null;
  }
  pendingForbiddenPiPCleanupByTab.delete(normalizedTabId);
  return entry;
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
  let tab = hasOwn(overrides, 'tabSnapshot') ? overrides.tabSnapshot : null;
  if (!tab && !hasOwn(overrides, 'tabSnapshot') && normalizedTabId != null && chrome.tabs?.get) {
    try {
      tab = await chrome.tabs.get(normalizedTabId);
    } catch (_) {
      tab = null;
    }
  }

  const windowId = Number.isInteger(overrides.windowId)
    ? overrides.windowId
    : (Number.isInteger(tab?.windowId) ? tab.windowId : (Number.isInteger(stored?.windowId) ? stored.windowId : null));
  const win = overrides.windowSnapshot || await getWindowSnapshot(windowId);
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
    frameId: overrides.mediaFrameId ?? overrides.frameId ?? undefined,
    documentId: overrides.mediaDocumentId ?? overrides.documentId ?? undefined,
    windowId,
    domain,
    playing,
    mediaKind,
    isPiP,
    audible,
    muted: overrides.isMuted === true || overrides.muted === true || tab?.mutedInfo?.muted === true || stored?.muted === true,
    isActiveTab: hasOwn(overrides, 'isActiveTab') ? overrides.isActiveTab === true : tab?.active === true,
    windowState: overrides.windowState || win.state || stored?.windowState || null,
    source: overrides.mediaFactSource || overrides.source || stored?.source || 'chrome_tab_query',
    incognito: overrides.incognito === true || tab?.incognito === true || stored?.incognito === true,
    clearMediaFrames: overrides.clearMediaFrames === true,
  };
}

function isForegroundMediaClassification(classification) {
  return classification?.mediaClass === 'foregroundAudio' || classification?.mediaClass === 'foregroundVideo';
}

function cleanupSucceededForTab(cleanup, tabId) {
  const normalized = numericTabId(tabId);
  const tabResult = (cleanup?.tabResults || []).find((result) => numericTabId(result?.tabId) === normalized);
  return tabResult?.ok === true || tabResult?.closed === true || tabResult?.confirmedNoPiP === true;
}

async function emitPiPPolicyTrace(action, payload) {
  if (typeof emitTrace !== 'function') return;
  try {
    await emitTrace(action, {
      source: 'media-timing',
      reason: payload?.reason || 'pip_forbidden_cleanup',
      domain: payload?.domain || null,
      payload,
    });
  } catch {}
}

async function enforceForbiddenPiPForTab(tabId, reason = 'pip_forbidden_cleanup', atMs = Date.now(), domain = null, incognito = false) {
  const normalizedTabId = numericTabId(tabId);
  if (normalizedTabId == null) return { ok: false, skipped: 'invalid_tab_id' };
  const disallowed = typeof isPictureInPictureDisallowed === 'function'
    ? isPictureInPictureDisallowed()
    : true;
  if (!disallowed) return { ok: true, skipped: 'pip_allowed_by_policy' };

  markPendingForbiddenPiPCleanup(normalizedTabId, reason, atMs);
  const cleanup = typeof closeForbiddenPictureInPicture === 'function'
    ? await closeForbiddenPictureInPicture({ preferredTabId: normalizedTabId, reason })
    : { ok: false, attempted: false, handled: false, tabResults: [], reason };
  if (!cleanupSucceededForTab(cleanup, normalizedTabId)) {
    await emitPiPPolicyTrace('pip_forbidden_cleanup_failed', {
      reason,
      tabId: normalizedTabId,
      domain,
      cleanup,
    });
    recordFallbackLog({
      level: 'error',
      category: 'media',
      eventCode: 'pip_forbidden_cleanup_failed',
      module: 'core/media-timing',
      reason: 'pip_forbidden_cleanup_failed',
      message: 'PiP policy cleanup fallback failed; PiP session remains factual until confirmed closed',
      domain,
      incognito: incognito === true,
      details: { tabId: normalizedTabId, cleanup, incognito: incognito === true },
    });
    return { ok: false, cleanup, reason: 'pip_forbidden_cleanup_failed' };
  }

  const ledger = typeof closeForbiddenPiPSessionsForTab === 'function'
    ? await closeForbiddenPiPSessionsForTab(normalizedTabId, 'pip_forbidden_cleanup', { now: atMs })
    : { ok: false, reason: 'pip_ledger_cleanup_unavailable' };
  clearPendingForbiddenPiPCleanup(normalizedTabId);
  await emitPiPPolicyTrace('pip_forbidden_cleanup_applied', {
    reason,
    tabId: normalizedTabId,
    domain,
    cleanup,
    ledger,
  });
  return { ok: true, cleanup, ledger };
}

export async function enforceForbiddenPiPForOpenSessions(reason, atMs = Date.now()) {
  const sessions = await getMediaSessions();
  const pipSessions = Object.values(sessions || {})
    .filter((session) => session?.startTime != null && session.mediaClass === 'pip');
  const results = [];
  for (const session of pipSessions) {
    results.push(await enforceForbiddenPiPForTab(session.tabId, reason, atMs, session.domain, session.incognito === true));
  }
  return {
    ok: results.every((result) => result.ok !== false),
    attempted: results.length,
    results,
  };
}

function domainMismatchReason(domain) {
  return domain === 'unknown-page.chrome-local' || !domain ? 'unknown_domain' : 'observed_mismatch';
}

function buildAudibleFact(tab, win, reason) {
  const domain = tab?.url ? (extractDomain(tab.url) || 'unknown-page.chrome-local') : 'unknown-page.chrome-local';
  return {
    tabId: numericTabId(tab?.id),
    windowId: numericTabId(tab?.windowId),
    domain,
    playing: true,
    mediaKind: 'audio',
    isPiP: false,
    audible: true,
    muted: tab?.mutedInfo?.muted === true,
    isActiveTab: tab?.active === true,
    windowState: win?.state || null,
    source: reason || 'tab_audible',
  };
}

function buildTabSnapshotFact(tab, win, reason) {
  const domain = tab?.url ? (extractDomain(tab.url) || 'unknown-page.chrome-local') : 'unknown-page.chrome-local';
  return {
    tabId: numericTabId(tab?.id),
    windowId: numericTabId(tab?.windowId),
    domain,
    playing: tab?.audible === true,
    mediaKind: tab?.audible === true ? 'audio' : null,
    isPiP: false,
    audible: tab?.audible === true,
    muted: tab?.mutedInfo?.muted === true,
    isActiveTab: tab?.active === true,
    windowState: win?.state || null,
    source: reason || 'tab_query',
  };
}

export async function queryForegroundMediaForOpenSession(sessionLike = {}, reason = 'foreground_media_open_session_query') {
  const sessionTabId = numericTabId(sessionLike?.tabId);
  if (sessionLike?.state !== 'ACTIVE' || sessionTabId == null) {
    return { ok: false, reason: 'invalid_open_session' };
  }

  const sessionWindowId = numericTabId(sessionLike?.windowId);
  const sessionDomain = sessionLike?.domain || null;
  let tab = null;
  if (chrome.tabs?.get) {
    try {
      tab = await chrome.tabs.get(sessionTabId);
    } catch (_) {
      tab = null;
    }
  }

  if (tab) {
    const tabWindowId = numericTabId(tab.windowId);
    if (sessionWindowId != null && tabWindowId != null && tabWindowId !== sessionWindowId) {
      return {
        ok: false,
        reason: 'window_mismatch',
        source: tab.audible === true ? 'tab_audible' : 'tab_query',
        fact: buildTabSnapshotFact(tab, { state: null }, reason),
      };
    }

    if (tab.audible === true) {
      const win = await getWindowSnapshot(tabWindowId);
      const fact = buildAudibleFact(tab, win, reason);
      const classification = { mediaClass: 'foregroundAudio', visibility: 'foreground' };
      if (tab.active !== true) {
        return { ok: false, reason: 'not_active_tab', source: 'tab_audible', fact, classification };
      }
      if (win.state === 'minimized') {
        return { ok: false, reason: 'window_minimized', source: 'tab_audible', fact, classification };
      }
      if (sessionDomain && fact.domain !== sessionDomain) {
        return {
          ok: false,
          reason: domainMismatchReason(fact.domain),
          source: 'tab_audible',
          fact,
          classification,
        };
      }
      return { ok: true, source: 'tab_audible', fact, classification };
    }
  }

  const fact = await queryTabMediaFact(sessionTabId, {
    mediaFactSource: reason || 'foreground_media_open_session_query',
    tabSnapshot: tab,
  });
  const factTabId = numericTabId(fact?.tabId);
  if (factTabId !== sessionTabId) {
    return { ok: false, reason: 'tab_mismatch', source: 'media_fact', fact };
  }
  const factWindowId = numericTabId(fact?.windowId);
  if (sessionWindowId != null && factWindowId != null && factWindowId !== sessionWindowId) {
    return { ok: false, reason: 'window_mismatch', source: 'media_fact', fact };
  }
  const classification = classifyMediaFact(fact);
  if (sessionDomain && fact?.domain !== sessionDomain) {
    return {
      ok: false,
      reason: domainMismatchReason(fact?.domain),
      source: 'media_fact',
      fact,
      classification,
    };
  }
  if (!isForegroundMediaClassification(classification)) {
    return { ok: false, reason: 'no_foreground_media', source: 'media_fact', fact, classification };
  }
  return { ok: true, source: 'media_fact', fact, classification };
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
  const atMs = Date.now();
  const classification = classifyMediaFact(fact);
  let pipPolicy = null;
  const isPiPFact = fact?.isPiP === true || classification?.mediaClass === 'pip';
  if (!isPiPFact) {
    const pendingCleanup = consumePendingForbiddenPiPCleanup(fact.tabId, atMs);
    if (pendingCleanup && typeof closeForbiddenPiPSessionsForTab === 'function') {
      const ledger = await closeForbiddenPiPSessionsForTab(fact.tabId, 'pip_forbidden_cleanup', { now: atMs });
      pipPolicy = {
        ok: true,
        reason: 'pip_forbidden_cleanup_confirmed_by_media_fact',
        pendingCleanup,
        ledger,
      };
    }
  }
  const result = await applyMediaFacts(fact, rawEvent._reason || 'media_fact', atMs);
  if (isPiPFact) {
    pipPolicy = await enforceForbiddenPiPForTab(fact.tabId, rawEvent._reason || 'media_fact', atMs, fact.domain, fact.incognito === true);
  }
  return {
    fact,
    classification,
    result,
    pipPolicy,
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

async function queryTabsSafe(queryInfo, reason) {
  if (!chrome.tabs?.query) return { ok: false, reason: 'tabs_query_unavailable', tabs: [] };
  try {
    const tabs = await chrome.tabs.query(queryInfo);
    return { ok: true, reason, tabs: Array.isArray(tabs) ? tabs : [] };
  } catch (err) {
    return { ok: false, reason: `${reason}_failed`, error: err?.message || String(err), tabs: [] };
  }
}

async function getTabSafe(tabId, reason) {
  const normalized = numericTabId(tabId);
  if (normalized == null) return { ok: false, reason: 'invalid_tab_id', tab: null };
  if (!chrome.tabs?.get) return { ok: false, reason: 'tabs_get_unavailable', tab: null };
  try {
    const tab = await chrome.tabs.get(normalized);
    return { ok: !!tab?.id, reason, tab: tab || null };
  } catch (err) {
    return { ok: false, reason: `${reason}_failed`, error: err?.message || String(err), tab: null };
  }
}

function isPositiveMediaSnapshot(snapshot) {
  return snapshot?.playing === true || snapshot?.isPiP === true || snapshot?.audible === true;
}

function isHttpTab(tab) {
  if (!tab?.url) return false;
  try {
    const parsed = new URL(tab.url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function normalizedMediaSnapshot(snapshot = {}) {
  return {
    playing: snapshot.playing === true,
    isPiP: snapshot.isPiP === true,
    mediaKind: snapshot.mediaKind || snapshot.kind || null,
  };
}

async function requestContentMediaSnapshot(tabId, reason) {
  const normalized = numericTabId(tabId);
  if (normalized == null) return { ok: false, reason: 'invalid_tab_id' };
  if (!chrome.tabs?.sendMessage) return { ok: false, reason: 'content_snapshot_unavailable' };
  try {
    const response = await chrome.tabs.sendMessage(normalized, {
      type: 'GET_MEDIA_SNAPSHOT',
      source: reason,
    });
    if (response?.ok !== true) {
      return { ok: false, reason: response?.reason || 'content_snapshot_failed', response };
    }
    return { ok: true, snapshot: normalizedMediaSnapshot(response), response };
  } catch (err) {
    return { ok: false, reason: 'content_snapshot_missing_listener', error: err?.message || String(err) };
  }
}

function addMediaCandidate(candidates, candidate) {
  const tabId = numericTabId(candidate?.tabId ?? candidate?.tab?.id);
  if (tabId == null) return;
  const existing = candidates.get(tabId);
  candidates.set(tabId, {
    ...(existing || {}),
    ...candidate,
    tabId,
    sources: [...new Set([...(existing?.sources || []), ...(candidate?.sources || [candidate?.source]).filter(Boolean)])],
  });
}

async function discoverCheckpointMediaFacts(now = Date.now()) {
  const candidates = new Map();
  const activeResult = await queryTabsSafe({ active: true, lastFocusedWindow: true }, 'active_tab_query');
  const activeTab = activeResult.tabs[0] || null;
  if (activeTab?.id) {
    addMediaCandidate(candidates, {
      tabId: activeTab.id,
      tab: activeTab,
      source: 'checkpoint_active_tab',
      requestSnapshot: isHttpTab(activeTab),
    });
  }

  const audibleResult = await queryTabsSafe({ audible: true }, 'audible_tabs_query');
  for (const tab of audibleResult.tabs) {
    if (!tab?.id) continue;
    addMediaCandidate(candidates, {
      tabId: tab.id,
      tab,
      source: 'checkpoint_audible_tab',
      audible: true,
      requestSnapshot: isHttpTab(tab),
    });
  }

  let knownSessions = {};
  try {
    knownSessions = await getMediaSessions();
  } catch (err) {
    recordFallbackLog({
      level: 'warning',
      category: 'media',
      eventCode: 'media_checkpoint_session_scan_failed',
      module: 'core/media-timing',
      reason: 'media_session_scan_failed',
      message: err?.message || 'Media checkpoint could not scan known media sessions',
      details: { error: err?.message || String(err) },
    });
    knownSessions = {};
  }
  for (const session of Object.values(knownSessions || {})) {
    const tabId = numericTabId(session?.tabId);
    if (tabId == null || !session?.startTime) continue;
    const candidate = candidates.get(tabId);
    if (candidate?.tab) {
      addMediaCandidate(candidates, {
        tabId,
        source: 'checkpoint_known_media_session',
        session,
        requestSnapshot: isHttpTab(candidate.tab),
      });
      continue;
    }
    const tabResult = await getTabSafe(tabId, 'known_media_tab_get');
    addMediaCandidate(candidates, {
      tabId,
      tab: tabResult.tab,
      source: 'checkpoint_known_media_session',
      session,
      requestSnapshot: isHttpTab(tabResult.tab),
      tabError: tabResult.ok ? null : (tabResult.error || tabResult.reason),
    });
  }

  const summary = {
    ok: true,
    reason: 'media_checkpoint_discovery',
    candidates: candidates.size,
    snapshotsRequested: 0,
    snapshotFailures: 0,
    factsObserved: 0,
    factsApplied: 0,
    sessionsOpened: 0,
    warnings: [],
  };

  for (const candidate of candidates.values()) {
    const tab = candidate.tab || null;
    let snapshotResult = null;
    if (candidate.requestSnapshot) {
      summary.snapshotsRequested++;
      snapshotResult = await requestContentMediaSnapshot(candidate.tabId, 'media_checkpoint_discovery');
      if (snapshotResult.ok !== true) {
        summary.snapshotFailures++;
        const warning = {
          tabId: candidate.tabId,
          reason: snapshotResult.reason,
          source: candidate.sources?.join('+') || candidate.source || null,
        };
        summary.warnings.push(warning);
        recordFallbackLog({
          level: 'warning',
          category: 'media',
          eventCode: 'media_checkpoint_content_snapshot_unavailable',
          module: 'core/media-timing',
          reason: snapshotResult.reason || 'content_snapshot_unavailable',
          message: 'Media checkpoint could not read content media snapshot',
          domain: tab?.url ? extractDomain(tab.url) : candidate.session?.domain || null,
          incognito: tab?.incognito === true || candidate.session?.incognito === true,
          details: {
            tabId: candidate.tabId,
            windowId: tab?.windowId ?? candidate.session?.windowId ?? null,
            source: warning.source,
            error: snapshotResult.error || null,
            incognito: tab?.incognito === true || candidate.session?.incognito === true,
          },
        });
      }
    }

    const snapshot = snapshotResult?.ok === true ? snapshotResult.snapshot : null;
    const hasAudibleEvidence = candidate.audible === true || tab?.audible === true;
    const hasSnapshotEvidence = isPositiveMediaSnapshot(snapshot);
    if (!hasAudibleEvidence && !hasSnapshotEvidence) continue;

    const fact = await queryTabMediaFact(candidate.tabId, {
      tabSnapshot: tab,
      isAudible: hasAudibleEvidence,
      ...(hasSnapshotEvidence ? {
        playing: snapshot.playing === true || snapshot.isPiP === true,
        isPiP: snapshot.isPiP === true,
        mediaKind: snapshot.mediaKind || (snapshot.isPiP ? 'video' : null),
      } : {}),
      mediaFactSource: candidate.sources?.join('+') || candidate.source || 'media_checkpoint_discovery',
    });
    summary.factsObserved++;
    const applied = await applyMediaFacts(fact, 'media_checkpoint_discovery', now);
    summary.factsApplied++;
    if (applied?.opened === true || applied?.sessionOpened === true || applied?.created === true) {
      summary.sessionsOpened++;
    }
  }

  return summary;
}

export async function runMediaCheckpoint(now = Date.now()) {
  const discovery = await discoverCheckpointMediaFacts(now);
  const pipPolicy = await enforceForbiddenPiPForOpenSessions('media_checkpoint_pip_policy', now);
  const checkpoint = await runMediaPeriodicCheckpoint(now);
  return {
    ...checkpoint,
    discovery,
    pipPolicy,
  };
}

export async function processMediaModeBoundary(intent = {}) {
  const boundary = Number(intent.boundaryAtMs ?? intent.effectiveAtMs ?? intent.atMs);
  const pipPolicy = await enforceForbiddenPiPForOpenSessions(
    intent.reason || 'mode_boundary_pip_policy',
    Number.isFinite(boundary) ? boundary : Date.now()
  );
  const split = await splitOpenMediaSessionsAtModeBoundary(intent);
  return {
    ...split,
    pipPolicy,
  };
}
