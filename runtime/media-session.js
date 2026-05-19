// runtime/media-session.js — local-only multi-tab media timing ledger

import { getCachedEffectiveMode } from './session.js';

const LEGACY_MEDIA_SESSION_KEY = 'media_session_v1';
const MEDIA_FACTS_KEY = 'media_facts_v1';
const MEDIA_SESSIONS_KEY = 'media_sessions_v2';
const MEDIA_SEGMENTS_KEY = 'media_segments_v1';
const DAILY_MEDIA_STATS_KEY = 'daily_media_stats_v1';
const MEDIA_CHECKPOINT_MS = 180 * 1000;
const DEFAULT_TIMEZONE = 'Asia/Shanghai';

const MEDIA_CLASSES = new Set([
  'foregroundAudio',
  'backgroundAudio',
  'foregroundVideo',
  'backgroundVideo',
  'pip',
]);

let mediaQueue = Promise.resolve();

function runMediaSerialized(task) {
  mediaQueue = mediaQueue.then(task, task);
  return mediaQueue;
}

function mediaHash64(input) {
  function fnv1a(str, seed) {
    let h = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
      h = (h >>> 0);
    }
    return h;
  }
  return fnv1a(input, 0).toString(16).padStart(8, '0') +
    fnv1a(input, 0x9e3779b9).toString(16).padStart(8, '0');
}

function parseTimezoneOffset(tz) {
  if (!tz) return null;
  const offsetMatch = String(tz).match(/^([+-])(\d{2}):(\d{2})$/);
  if (offsetMatch) {
    const total = Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]);
    return offsetMatch[1] === '-' ? -total : total;
  }
  if (tz === 'Asia/Shanghai') return 480;
  return null;
}

function getLocalDateInfo(epochMs, timezone = DEFAULT_TIMEZONE) {
  const offsetMinutes = parseTimezoneOffset(timezone);
  const offsetMs = (typeof offsetMinutes === 'number' ? offsetMinutes : -new Date().getTimezoneOffset()) * 60 * 1000;
  const localMs = epochMs + offsetMs;
  const localDate = new Date(localMs);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  const dayStartLocal = Date.UTC(year, localDate.getUTCMonth(), localDate.getUTCDate(), 0, 0, 0, 0);
  const dayStartMs = dayStartLocal - offsetMs;
  return {
    date,
    dayStartMs,
    dayEndMs: dayStartMs + 86399999,
  };
}

function normalizeTabId(tabId) {
  if (Number.isInteger(tabId)) return String(tabId);
  if (typeof tabId === 'string' && tabId.trim()) return tabId.trim();
  return null;
}

function normalizeDomain(domain) {
  return typeof domain === 'string' && domain.trim()
    ? domain.trim().toLowerCase().replace(/\.+$/g, '')
    : 'unknown-page.chrome-local';
}

function normalizeMediaKind(kind) {
  return kind === 'video' ? 'video' : (kind === 'audio' ? 'audio' : null);
}

function sessionKey(tabId, mediaClass) {
  return `${normalizeTabId(tabId)}::${mediaClass}`;
}

function isForegroundMediaFact(fact) {
  return fact?.isActiveTab === true && fact?.windowState !== 'minimized';
}

function factHasMedia(fact) {
  return !!(fact?.isPiP || fact?.playing || (fact?.audible && fact?.muted !== true));
}

export function classifyMediaFact(fact = {}) {
  if (!factHasMedia(fact)) return null;

  const isPiP = fact.isPiP === true;
  const mediaKind = isPiP
    ? 'pip'
    : (normalizeMediaKind(fact.mediaKind) || (fact.audible ? 'audio' : null));
  if (!mediaKind) return null;

  if (isPiP) {
    return {
      mediaClass: 'pip',
      mediaKind: 'pip',
      visibility: 'pip',
    };
  }

  const foreground = isForegroundMediaFact(fact);
  if (mediaKind === 'video') {
    return {
      mediaClass: foreground ? 'foregroundVideo' : 'backgroundVideo',
      mediaKind: 'video',
      visibility: foreground ? 'foreground' : 'background',
    };
  }

  return {
    mediaClass: foreground ? 'foregroundAudio' : 'backgroundAudio',
    mediaKind: 'audio',
    visibility: foreground ? 'foreground' : 'background',
  };
}

function normalizeMediaFact(fact = {}, reason = 'media_fact', atMs = Date.now()) {
  const tabId = normalizeTabId(fact.tabId ?? fact.mediaSourceTabId);
  if (!tabId) return null;
  const observedAt = Number.isFinite(atMs) ? atMs : Date.now();
  const audible = fact.audible ?? fact.isAudible ?? false;
  const isPiP = fact.isPiP === true;
  const playing = fact.playing ?? fact.isPlaying ?? (isPiP || audible);
  return {
    tabId,
    windowId: Number.isInteger(fact.windowId) ? fact.windowId : null,
    domain: normalizeDomain(fact.domain ?? fact.mediaSourceDomain),
    playing: playing === true,
    mediaKind: normalizeMediaKind(fact.mediaKind),
    isPiP,
    audible: audible === true,
    muted: fact.muted === true || fact.isMuted === true,
    isActiveTab: fact.isActiveTab === true,
    windowState: typeof fact.windowState === 'string' ? fact.windowState : null,
    source: typeof fact.source === 'string' && fact.source.trim() ? fact.source.trim() : 'unknown',
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'media_fact',
    lastObservedAt: observedAt,
  };
}

function mediaDescriptionEndpoint(reason, atMs, source = 'media') {
  const normalized = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
  const when = Number(atMs);
  return {
    reason: normalized,
    operation: normalized,
    source,
    atMs: Number.isFinite(when) && when >= 0 ? when : null,
  };
}

function mediaSettlementDescription(session, endReason, endAtMs) {
  const start = mediaDescriptionEndpoint(
    session?.startReason || 'media_boundary',
    session?.startAtMs || session?.startTime,
    session?.startOperationSource || 'media'
  );
  const end = mediaDescriptionEndpoint(
    endReason,
    endAtMs,
    endReason === 'periodic_checkpoint' ? 'timer' : 'media'
  );
  return {
    schemaVersion: 1,
    start,
    end,
    summary: `开始：${start.operation || start.reason || '—'}；结束：${end.operation || end.reason || '—'}`,
  };
}

function makeMediaSegmentId(input) {
  const composite = [
    input.date || '',
    String(input.startMs || 0),
    String(input.endMs || 0),
    input.domain || '',
    input.tabId || '',
    String(input.windowId ?? ''),
    input.mediaClass || '',
    input.mediaKind || '',
    input.visibility || '',
    input.mode || '',
    input.settlementReason || '',
    input.parentSegmentId || '',
    String(input.partIndex || 0),
  ].join('::');
  const dateStr = (input.date || '19700101').replace(/-/g, '');
  return `mseg-${dateStr}-${mediaHash64(composite)}`;
}

function buildMediaSegment(input) {
  const info = getLocalDateInfo(input.startMs, input.timezone || DEFAULT_TIMEZONE);
  const date = input.date || info.date;
  const durationMs = Math.max(0, (input.endMs || 0) - (input.startMs || 0));
  return {
    id: input.id || makeMediaSegmentId({ ...input, date }),
    schemaVersion: 1,
    date,
    timezone: input.timezone || DEFAULT_TIMEZONE,
    dayStartMs: input.dayStartMs || info.dayStartMs,
    dayEndMs: input.dayEndMs || info.dayEndMs,
    startMs: input.startMs,
    endMs: input.endMs,
    durationSeconds: input.durationSeconds ?? Math.floor(durationMs / 1000),
    domain: normalizeDomain(input.domain),
    tabId: input.tabId ?? null,
    windowId: Number.isInteger(input.windowId) ? input.windowId : null,
    mediaClass: MEDIA_CLASSES.has(input.mediaClass) ? input.mediaClass : 'backgroundAudio',
    mediaKind: input.mediaKind || 'audio',
    visibility: input.visibility || 'background',
    mode: input.mode || 'unknown',
    settlementReason: input.settlementReason || 'media_boundary',
    reason: input.reason || input.settlementReason || 'media_boundary',
    description: input.description || mediaSettlementDescription(input, input.settlementReason || 'media_boundary', input.endMs),
    parentSegmentId: input.parentSegmentId || null,
    partIndex: input.partIndex || 1,
    partCount: input.partCount || 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function splitMediaSegmentByLocalDate(input) {
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const startInfo = getLocalDateInfo(input.startMs, timezone);
  const endInfo = getLocalDateInfo(input.endMs, timezone);
  if (startInfo.date === endInfo.date) {
    return [buildMediaSegment({
      ...input,
      date: startInfo.date,
      dayStartMs: startInfo.dayStartMs,
      dayEndMs: startInfo.dayEndMs,
      parentSegmentId: null,
      partIndex: 1,
      partCount: 1,
    })];
  }

  const children = [];
  let currentMs = input.startMs;
  let partIndex = 0;
  while (currentMs <= input.endMs) {
    const info = getLocalDateInfo(currentMs, timezone);
    const dayEndEpoch = info.dayEndMs + 1;
    const endMs = Math.min(input.endMs, dayEndEpoch);
    partIndex++;
    children.push(buildMediaSegment({
      ...input,
      date: info.date,
      dayStartMs: info.dayStartMs,
      dayEndMs: info.dayEndMs,
      startMs: currentMs,
      endMs,
      parentSegmentId: null,
      partIndex,
      partCount: 0,
    }));
    if (endMs >= input.endMs) break;
    currentMs = endMs;
  }

  const parentId = children.length > 1 ? makeMediaSegmentId({
    ...input,
    date: startInfo.date,
    partIndex: 0,
    parentSegmentId: null,
  }) : null;
  for (const child of children) {
    child.partCount = children.length;
    if (parentId) {
      child.parentSegmentId = parentId;
      child.id = makeMediaSegmentId(child);
    }
  }
  return children;
}

async function readFacts() {
  const data = await chrome.storage.local.get(MEDIA_FACTS_KEY);
  return data?.[MEDIA_FACTS_KEY] || {};
}

async function writeFacts(facts) {
  await chrome.storage.local.set({ [MEDIA_FACTS_KEY]: facts || {} });
}

async function readSessions() {
  const data = await chrome.storage.local.get(MEDIA_SESSIONS_KEY);
  return data?.[MEDIA_SESSIONS_KEY] || {};
}

async function writeSessions(sessions) {
  await chrome.storage.local.set({ [MEDIA_SESSIONS_KEY]: sessions || {} });
  await syncLegacyMediaSession(sessions || {});
}

function frameworkForMediaClass(mediaClass) {
  if (mediaClass === 'pip') return 'pip_video';
  if (mediaClass === 'backgroundVideo') return 'background_video';
  if (mediaClass === 'backgroundAudio') return 'background_audio';
  if (mediaClass === 'foregroundVideo') return 'foreground_video';
  if (mediaClass === 'foregroundAudio') return 'foreground_audio';
  return 'none';
}

async function syncLegacyMediaSession(sessions = {}) {
  const open = Object.values(sessions)
    .filter((session) => session?.startTime != null)
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))[0];
  if (!open) {
    await chrome.storage.local.set({
      [LEGACY_MEDIA_SESSION_KEY]: {
        framework: 'none',
        domain: null,
        startTime: null,
        lastHeartbeat: Date.now(),
      },
    });
    return;
  }
  await chrome.storage.local.set({
    [LEGACY_MEDIA_SESSION_KEY]: {
      framework: frameworkForMediaClass(open.mediaClass),
      domain: open.domain || null,
      startTime: open.startTime,
      lastHeartbeat: Date.now(),
      tabId: open.tabId ?? null,
      windowId: open.windowId ?? null,
      mediaClass: open.mediaClass,
    },
  });
}

async function appendMediaSegments(segments) {
  const flat = Array.isArray(segments) ? segments : [segments];
  if (flat.length === 0) return 0;
  const data = await chrome.storage.local.get(MEDIA_SEGMENTS_KEY);
  const all = data?.[MEDIA_SEGMENTS_KEY] || {};
  let appended = 0;
  for (const segment of flat) {
    if (!segment?.id) continue;
    if (all[segment.id]) continue;
    all[segment.id] = { ...segment, updatedAt: Date.now() };
    appended++;
  }
  if (appended > 0) {
    await chrome.storage.local.set({ [MEDIA_SEGMENTS_KEY]: all });
  }
  return appended;
}

function makeEmptyMediaDomainStats() {
  return {
    foregroundAudioSeconds: 0,
    backgroundAudioSeconds: 0,
    foregroundVideoSeconds: 0,
    backgroundVideoSeconds: 0,
    pipSeconds: 0,
    totalSeconds: 0,
    byMode: {},
    firstSeenAt: null,
    lastSeenAt: null,
    lastUpdatedAt: null,
  };
}

async function incrementDailyMediaStats(segment) {
  if (!segment?.date || !segment.domain) return;
  const data = await chrome.storage.local.get(DAILY_MEDIA_STATS_KEY);
  const stats = data?.[DAILY_MEDIA_STATS_KEY] || {};
  if (!stats[segment.date]) {
    stats[segment.date] = {
      date: segment.date,
      timezone: segment.timezone || DEFAULT_TIMEZONE,
      dayStartMs: segment.dayStartMs,
      dayEndMs: segment.dayEndMs,
      segmentsCount: 0,
      lastSegmentId: null,
      domains: {},
    };
  }
  const day = stats[segment.date];
  if (!day.domains[segment.domain]) {
    day.domains[segment.domain] = makeEmptyMediaDomainStats();
  }
  const ds = day.domains[segment.domain];
  const seconds = Number(segment.durationSeconds || 0);
  const classKey = `${segment.mediaClass}Seconds`;
  ds[classKey] = Number(ds[classKey] || 0) + seconds;
  ds.totalSeconds =
    Number(ds.foregroundAudioSeconds || 0) +
    Number(ds.backgroundAudioSeconds || 0) +
    Number(ds.foregroundVideoSeconds || 0) +
    Number(ds.backgroundVideoSeconds || 0) +
    Number(ds.pipSeconds || 0);
  const mode = segment.mode || 'unknown';
  if (!ds.byMode[mode]) {
    ds.byMode[mode] = {
      foregroundAudioSeconds: 0,
      backgroundAudioSeconds: 0,
      foregroundVideoSeconds: 0,
      backgroundVideoSeconds: 0,
      pipSeconds: 0,
      totalSeconds: 0,
    };
  }
  ds.byMode[mode][classKey] = Number(ds.byMode[mode][classKey] || 0) + seconds;
  ds.byMode[mode].totalSeconds =
    Number(ds.byMode[mode].foregroundAudioSeconds || 0) +
    Number(ds.byMode[mode].backgroundAudioSeconds || 0) +
    Number(ds.byMode[mode].foregroundVideoSeconds || 0) +
    Number(ds.byMode[mode].backgroundVideoSeconds || 0) +
    Number(ds.byMode[mode].pipSeconds || 0);
  if (!ds.firstSeenAt || segment.startMs < ds.firstSeenAt) ds.firstSeenAt = segment.startMs;
  if (!ds.lastSeenAt || segment.endMs > ds.lastSeenAt) ds.lastSeenAt = segment.endMs;
  ds.lastUpdatedAt = Date.now();
  day.segmentsCount = Number(day.segmentsCount || 0) + 1;
  day.lastSegmentId = segment.id;
  await chrome.storage.local.set({ [DAILY_MEDIA_STATS_KEY]: stats });
}

async function settleMediaSession(session, endMs, reason = 'media_boundary') {
  if (!session?.startTime || endMs < session.startTime) {
    return { appended: 0, durationSeconds: 0, skipped: 'invalid_media_session' };
  }
  const input = {
    startMs: session.startTime,
    endMs,
    domain: session.domain,
    tabId: session.tabId,
    windowId: session.windowId,
    mediaClass: session.mediaClass,
    mediaKind: session.mediaKind,
    visibility: session.visibility,
    mode: session.mode || getCachedEffectiveMode() || 'unknown',
    settlementReason: reason,
    reason,
    description: mediaSettlementDescription(session, reason, endMs),
  };
  const segments = splitMediaSegmentByLocalDate(input);
  const appended = await appendMediaSegments(segments);
  if (appended > 0) {
    for (const segment of segments) {
      await incrementDailyMediaStats(segment);
    }
  }
  return {
    appended,
    durationSeconds: Math.max(0, Math.floor((endMs - session.startTime) / 1000)),
    domain: session.domain,
    mediaClass: session.mediaClass,
    tabId: session.tabId,
  };
}

function openSessionFromFact(fact, classification, reason, atMs) {
  return {
    tabId: fact.tabId,
    windowId: fact.windowId,
    domain: fact.domain,
    mediaClass: classification.mediaClass,
    mediaKind: classification.mediaKind,
    visibility: classification.visibility,
    startTime: atMs,
    lastObservedAt: atMs,
    startReason: reason || fact.reason || 'media_boundary',
    startOperationSource: 'media',
    startAtMs: atMs,
    mode: getCachedEffectiveMode() || 'unknown',
  };
}

function sameSessionFacts(session, fact, classification) {
  return session?.mediaClass === classification?.mediaClass &&
    session?.domain === fact?.domain &&
    session?.windowId === fact?.windowId;
}

async function closeSessionsForTabInMap(sessions, tabId, reason, atMs, exceptKey = null) {
  let closed = 0;
  let appended = 0;
  for (const [key, session] of Object.entries(sessions)) {
    if (key === exceptKey) continue;
    if (normalizeTabId(session?.tabId) !== normalizeTabId(tabId)) continue;
    const result = await settleMediaSession(session, atMs, reason);
    appended += result.appended || 0;
    delete sessions[key];
    closed++;
  }
  return { closed, appended };
}

export async function applyMediaFacts(factsInput, reason = 'media_fact', atMs = Date.now()) {
  return runMediaSerialized(async () => {
    const factsList = Array.isArray(factsInput) ? factsInput : [factsInput];
    const facts = await readFacts();
    const sessions = await readSessions();
    const results = [];
    let opened = 0;
    let closed = 0;
    let appended = 0;

    for (const rawFact of factsList) {
      const fact = normalizeMediaFact(rawFact, reason, atMs);
      if (!fact) {
        results.push({ ok: false, reason: 'invalid_media_fact' });
        continue;
      }
      const classification = classifyMediaFact(fact);
      facts[fact.tabId] = fact;

      if (!classification) {
        const closeResult = await closeSessionsForTabInMap(sessions, fact.tabId, reason, atMs);
        closed += closeResult.closed;
        appended += closeResult.appended;
        results.push({ ok: true, tabId: fact.tabId, mediaClass: null, closed: closeResult.closed });
        continue;
      }

      const key = sessionKey(fact.tabId, classification.mediaClass);
      const existing = sessions[key];
      if (existing && sameSessionFacts(existing, fact, classification)) {
        sessions[key] = {
          ...existing,
          windowId: fact.windowId,
          lastObservedAt: atMs,
        };
        results.push({ ok: true, tabId: fact.tabId, mediaClass: classification.mediaClass, changed: false });
        continue;
      }

      const closeResult = await closeSessionsForTabInMap(sessions, fact.tabId, reason, atMs, key);
      closed += closeResult.closed;
      appended += closeResult.appended;
      sessions[key] = openSessionFromFact(fact, classification, reason, atMs);
      opened++;
      results.push({ ok: true, tabId: fact.tabId, mediaClass: classification.mediaClass, changed: true });
    }

    await writeFacts(facts);
    await writeSessions(sessions);
    return {
      ok: true,
      opened,
      closed,
      appended,
      results,
    };
  });
}

export async function runMediaPeriodicCheckpoint(now = Date.now()) {
  return runMediaSerialized(async () => {
    const sessions = await readSessions();
    let checkpointed = 0;
    let flushedSegments = 0;
    let flushedSeconds = 0;

    for (const [key, session] of Object.entries(sessions)) {
      if (!session?.startTime) continue;
      while ((now - session.startTime) >= MEDIA_CHECKPOINT_MS) {
        const checkpointEnd = session.startTime + MEDIA_CHECKPOINT_MS;
        const settlement = await settleMediaSession(session, checkpointEnd, 'periodic_checkpoint');
        flushedSegments += settlement.appended || 0;
        flushedSeconds += settlement.durationSeconds || 0;
        checkpointed++;
        session.startTime = checkpointEnd;
        session.lastObservedAt = now;
        session.startReason = 'periodic_checkpoint_reopen';
        session.startOperationSource = 'timer';
        session.startAtMs = checkpointEnd;
      }
      sessions[key] = session;
    }

    await writeSessions(sessions);
    return {
      ok: true,
      checkpointed: checkpointed > 0,
      reason: checkpointed > 0 ? 'periodic_checkpoint' : 'interval_not_reached',
      flushedSegments,
      flushedSeconds,
      checkpointWindows: checkpointed,
    };
  });
}

export async function closeMediaForTab(tabId, reason = 'tab_close', options = {}) {
  return runMediaSerialized(async () => {
    const atMs = Number.isFinite(options.now) ? options.now : Date.now();
    const sessions = await readSessions();
    const result = await closeSessionsForTabInMap(sessions, tabId, reason, atMs);
    await writeSessions(sessions);
    return {
      ok: true,
      closed: result.closed > 0,
      closedSessions: result.closed,
      appended: result.appended,
      reason,
    };
  });
}

export async function closeMediaSession(reason = 'close', options = {}) {
  return runMediaSerialized(async () => {
    const atMs = Number.isFinite(options.now) ? options.now : Date.now();
    const sessions = await readSessions();
    let closed = 0;
    let appended = 0;
    for (const [key, session] of Object.entries(sessions)) {
      const settlement = await settleMediaSession(session, atMs, reason);
      appended += settlement.appended || 0;
      delete sessions[key];
      closed++;
    }
    await writeSessions(sessions);
    return {
      ok: true,
      closed: closed > 0,
      closedSessions: closed,
      appended,
      reason,
    };
  });
}

export async function getMediaFact(tabId) {
  const facts = await readFacts();
  return facts[normalizeTabId(tabId)] || null;
}

export async function getMediaFacts() {
  return readFacts();
}

export async function getMediaSessions() {
  return readSessions();
}

export async function getMediaSegments() {
  const data = await chrome.storage.local.get(MEDIA_SEGMENTS_KEY);
  return data?.[MEDIA_SEGMENTS_KEY] || {};
}

export async function getDailyMediaStats(date = null) {
  const data = await chrome.storage.local.get(DAILY_MEDIA_STATS_KEY);
  const stats = data?.[DAILY_MEDIA_STATS_KEY] || {};
  return date ? (stats[date] || null) : stats;
}

export async function getMediaSession() {
  const sessions = await readSessions();
  const open = Object.values(sessions)
    .filter((session) => session?.startTime != null)
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))[0];
  if (!open) {
    return {
      framework: 'none',
      domain: null,
      startTime: null,
      lastHeartbeat: Date.now(),
    };
  }
  return {
    framework: frameworkForMediaClass(open.mediaClass),
    domain: open.domain || null,
    startTime: open.startTime,
    lastHeartbeat: open.lastObservedAt || Date.now(),
    tabId: open.tabId ?? null,
    windowId: open.windowId ?? null,
    mediaClass: open.mediaClass,
  };
}

export async function handleMediaBoundary(framework, domain, reason = 'media_boundary', now = Date.now()) {
  if (!framework || framework === 'none') {
    return closeMediaForTab('legacy', reason, { now });
  }
  const mediaClass = framework === 'pip_video'
    ? 'pip'
    : (framework === 'background_video' ? 'backgroundVideo' : 'backgroundAudio');
  const fact = {
    tabId: 'legacy',
    domain,
    playing: true,
    audible: mediaClass !== 'pip',
    mediaKind: mediaClass === 'backgroundVideo' || mediaClass === 'pip' ? 'video' : 'audio',
    isPiP: mediaClass === 'pip',
    isActiveTab: false,
    windowState: 'normal',
    source: 'legacy_media_boundary',
  };
  return applyMediaFacts(fact, reason, now);
}

export function __resetMediaSessionForTest() {
  mediaQueue = Promise.resolve();
}
