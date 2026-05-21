// runtime/media-session.js — independent multi-tab media timing ledger

import { getCachedEffectiveMode, resolveSettlementIdentity } from './session.js';

const LEGACY_MEDIA_SESSION_KEY = 'media_session_v1';
const MEDIA_FACTS_KEY = 'media_facts_v1';
const MEDIA_FRAME_FACTS_KEY = 'media_frame_facts_v1';
const MEDIA_SESSIONS_KEY = 'media_sessions_v2';
const MEDIA_SEGMENTS_KEY = 'media_segments_v1';
const DAILY_MEDIA_STATS_KEY = 'daily_media_stats_v1';
const HOURLY_MEDIA_STATS_KEY = 'hourly_media_stats_v1';
const MEDIA_SEGMENT_OUTBOX_KEY = 'media_segment_sync_outbox_v1';
const MEDIA_STATS_OUTBOX_KEY = 'media_stats_sync_outbox_v1';
const HOURLY_MEDIA_STATS_OUTBOX_KEY = 'hourly_media_stats_sync_outbox_v1';
const MEDIA_CHECKPOINT_MS = 180 * 1000;
const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const MEDIA_CHECKPOINT_ESTIMATED_CLOSE_REASON = 'media_checkpoint_estimated_close';
const MEDIA_CHECKPOINT_ESTIMATED_END_REASON = 'media_checkpoint_estimated_half_interval_close';
const PIP_FORBIDDEN_CLEANUP_REASON = 'pip_forbidden_cleanup';

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

function getLocalHourInfo(epochMs, timezone = DEFAULT_TIMEZONE) {
  const offsetMinutes = parseTimezoneOffset(timezone);
  const offsetMs = (typeof offsetMinutes === 'number' ? offsetMinutes : -new Date().getTimezoneOffset()) * 60 * 1000;
  const localMs = epochMs + offsetMs;
  const localDate = new Date(localMs);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const hour = localDate.getUTCHours();
  const date = `${year}-${month}-${day}`;
  const hourKey = `${date}T${String(hour).padStart(2, '0')}`;
  const hourStartLocal = Date.UTC(year, localDate.getUTCMonth(), localDate.getUTCDate(), hour, 0, 0, 0);
  const hourStartMs = hourStartLocal - offsetMs;
  return {
    hourKey,
    date,
    hour,
    hourStartMs,
    hourEndMs: hourStartMs + 3599999,
  };
}

function allocateMediaSliceSeconds(rawSlices, totalSeconds) {
  const slices = rawSlices.map((slice, index) => {
    const durationMs = Math.max(0, Number(slice.endMs || 0) - Number(slice.startMs || 0));
    return {
      ...slice,
      durationSeconds: Math.floor(durationMs / 1000),
      _index: index,
      _durationMs: durationMs,
      _remainderMs: durationMs % 1000,
    };
  });
  let remaining = Math.max(0, Number(totalSeconds || 0) - slices.reduce((sum, slice) => sum + slice.durationSeconds, 0));
  const order = [...slices].sort((a, b) => {
    if (b._remainderMs !== a._remainderMs) return b._remainderMs - a._remainderMs;
    return a.startMs - b.startMs;
  });
  for (const slice of order) {
    if (remaining <= 0) break;
    if (slice._durationMs <= 0 && slice._remainderMs <= 0) continue;
    slice.durationSeconds += 1;
    remaining--;
  }
  return slices
    .sort((a, b) => a._index - b._index)
    .map(({ _index, _durationMs, _remainderMs, ...slice }) => slice);
}

function splitMediaSegmentByLocalHour(segment) {
  if (!segment || typeof segment.startMs !== 'number' || typeof segment.endMs !== 'number') return [];
  const timezone = segment.timezone || DEFAULT_TIMEZONE;
  const startMs = segment.startMs;
  const endMs = segment.endMs;
  const totalSeconds = Math.max(0, Number(segment.durationSeconds ?? Math.floor(Math.max(0, endMs - startMs) / 1000)) || 0);

  if (endMs <= startMs) {
    const info = getLocalHourInfo(startMs, timezone);
    return [{
      ...segment,
      hourKey: info.hourKey,
      date: info.date,
      hour: info.hour,
      hourStartMs: info.hourStartMs,
      hourEndMs: info.hourEndMs,
      durationSeconds: totalSeconds,
    }];
  }

  const rawSlices = [];
  let currentMs = startMs;
  while (currentMs < endMs) {
    const info = getLocalHourInfo(currentMs, timezone);
    const sliceEndMs = Math.min(endMs, info.hourEndMs + 1);
    rawSlices.push({
      ...segment,
      hourKey: info.hourKey,
      date: info.date,
      hour: info.hour,
      hourStartMs: info.hourStartMs,
      hourEndMs: info.hourEndMs,
      startMs: currentMs,
      endMs: sliceEndMs,
    });
    currentMs = sliceEndMs;
  }
  return allocateMediaSliceSeconds(rawSlices, totalSeconds);
}

function normalizeTabId(tabId) {
  if (Number.isInteger(tabId)) return String(tabId);
  if (typeof tabId === 'string' && tabId.trim()) return tabId.trim();
  return null;
}

function normalizeFrameId(frameId) {
  if (Number.isInteger(frameId)) return String(frameId);
  if (typeof frameId === 'string' && frameId.trim()) return frameId.trim();
  return 'tab';
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

function frameFactKey(tabId, frameId) {
  return `${normalizeTabId(tabId)}::${normalizeFrameId(frameId)}`;
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
    frameId: normalizeFrameId(fact.frameId ?? fact.mediaFrameId),
    documentId: typeof fact.documentId === 'string' && fact.documentId.trim()
      ? fact.documentId.trim()
      : (typeof fact.mediaDocumentId === 'string' && fact.mediaDocumentId.trim() ? fact.mediaDocumentId.trim() : null),
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
    clearMediaFrames: fact.clearMediaFrames === true,
    lastObservedAt: observedAt,
  };
}

function factsForTab(frameFacts = {}, tabId) {
  const normalizedTabId = normalizeTabId(tabId);
  return Object.values(frameFacts || {}).filter((fact) => normalizeTabId(fact?.tabId) === normalizedTabId);
}

function latestFact(facts = [], fallback = null) {
  return facts
    .filter(Boolean)
    .sort((a, b) => (Number(b.lastObservedAt) || 0) - (Number(a.lastObservedAt) || 0))[0] || fallback || null;
}

function chooseActiveFact(activeFacts = [], kind = null) {
  const filtered = kind ? activeFacts.filter((fact) => fact.mediaKind === kind) : activeFacts;
  return latestFact(filtered);
}

function aggregateTabMediaFact(tabId, frameFacts = {}, fallbackFact = null) {
  const tabFacts = factsForTab(frameFacts, tabId);
  const latest = latestFact(tabFacts, fallbackFact);
  if (!latest) return null;

  const activeFacts = tabFacts.filter((fact) => factHasMedia(fact));
  const pipFact = latestFact(activeFacts.filter((fact) => fact.isPiP === true));
  const videoFact = chooseActiveFact(activeFacts, 'video');
  const audioFact = chooseActiveFact(activeFacts, 'audio');
  const chosen = pipFact || videoFact || audioFact || latest;
  const hasVideo = !!(pipFact || videoFact);
  const hasAudio = !hasVideo && !!audioFact;
  const hasMedia = activeFacts.length > 0;
  const lastObservedAt = Math.max(...tabFacts.map((fact) => Number(fact.lastObservedAt) || 0), Number(latest.lastObservedAt) || 0);

  return {
    tabId: normalizeTabId(tabId),
    windowId: Number.isInteger(chosen?.windowId) ? chosen.windowId : (Number.isInteger(latest.windowId) ? latest.windowId : null),
    domain: normalizeDomain(chosen?.domain || latest.domain),
    playing: hasMedia,
    mediaKind: pipFact ? 'video' : (hasVideo ? 'video' : (hasAudio ? 'audio' : null)),
    isPiP: !!pipFact,
    audible: activeFacts.some((fact) => fact.audible === true && fact.muted !== true),
    muted: hasMedia ? activeFacts.every((fact) => fact.muted === true) : latest.muted === true,
    isActiveTab: tabFacts.some((fact) => fact.isActiveTab === true) || latest.isActiveTab === true,
    windowState: chosen?.windowState || latest.windowState || null,
    source: chosen?.source || latest.source || 'unknown',
    reason: chosen?.reason || latest.reason || 'media_fact',
    lastObservedAt,
    frameCount: tabFacts.length,
    activeFrameCount: activeFacts.length,
  };
}

function aggregateCheckpointMediaFact(tabId, frameFacts = {}, facts = {}) {
  const tabFacts = factsForTab(frameFacts, tabId);
  const fallback = facts?.[normalizeTabId(tabId)] || null;
  return tabFacts.length > 0 ? aggregateTabMediaFact(tabId, frameFacts, fallback) : fallback;
}

function removeFrameFactsForTab(frameFacts = {}, tabId) {
  const normalizedTabId = normalizeTabId(tabId);
  let removed = 0;
  for (const [key, fact] of Object.entries(frameFacts || {})) {
    if (normalizeTabId(fact?.tabId) === normalizedTabId) {
      delete frameFacts[key];
      removed++;
    }
  }
  return removed;
}

function removePiPFrameFactsForTab(frameFacts = {}, tabId) {
  const normalizedTabId = normalizeTabId(tabId);
  let removed = 0;
  for (const [key, fact] of Object.entries(frameFacts || {})) {
    if (normalizeTabId(fact?.tabId) === normalizedTabId && fact?.isPiP === true) {
      delete frameFacts[key];
      removed++;
    }
  }
  return removed;
}

function normalizeModeValue(mode) {
  if (mode === 'study' || mode === 'composite' || mode === 'rest' || mode === 'locked' || mode === 'paused') return mode;
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  return mode || 'unknown';
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
    (endReason === 'periodic_checkpoint' || String(endReason || '').includes('checkpoint')) ? 'timer' : 'media'
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
    input.profileId || '',
    input.deviceId || '',
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
    profileId: input.profileId || null,
    deviceId: input.deviceId || null,
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

async function readFrameFacts() {
  const data = await chrome.storage.local.get(MEDIA_FRAME_FACTS_KEY);
  return data?.[MEDIA_FRAME_FACTS_KEY] || {};
}

async function writeFrameFacts(frameFacts) {
  await chrome.storage.local.set({ [MEDIA_FRAME_FACTS_KEY]: frameFacts || {} });
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
    await markMediaSegmentsPending(flat.filter((segment) => segment?.id && all[segment.id]).map((segment) => segment.id));
  }
  return appended;
}

async function markMediaSegmentsPending(segmentIds) {
  const ids = Array.isArray(segmentIds) ? segmentIds.filter(Boolean) : [segmentIds].filter(Boolean);
  if (ids.length === 0) return;
  const data = await chrome.storage.local.get(MEDIA_SEGMENT_OUTBOX_KEY);
  const outbox = data?.[MEDIA_SEGMENT_OUTBOX_KEY] || { pendingIds: [], retryCounts: {}, lastErrors: {} };
  const pending = new Set(outbox.pendingIds || []);
  ids.forEach((id) => pending.add(id));
  await chrome.storage.local.set({
    [MEDIA_SEGMENT_OUTBOX_KEY]: {
      pendingIds: [...pending],
      retryCounts: outbox.retryCounts || {},
      lastErrors: outbox.lastErrors || {},
    },
  });
}

async function markMediaStatsDirty(date) {
  if (!date) return;
  const data = await chrome.storage.local.get(MEDIA_STATS_OUTBOX_KEY);
  const outbox = data?.[MEDIA_STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };
  const dirty = new Set(outbox.dirtyDates || []);
  dirty.add(date);
  await chrome.storage.local.set({
    [MEDIA_STATS_OUTBOX_KEY]: {
      dirtyDates: [...dirty],
      retryCounts: outbox.retryCounts || {},
      lastErrors: outbox.lastErrors || {},
    },
  });
}

async function markHourlyMediaStatsDirty(hourKeys) {
  const keys = Array.isArray(hourKeys) ? hourKeys.filter(Boolean) : [hourKeys].filter(Boolean);
  if (keys.length === 0) return;
  const data = await chrome.storage.local.get(HOURLY_MEDIA_STATS_OUTBOX_KEY);
  const outbox = data?.[HOURLY_MEDIA_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  const dirty = new Set(outbox.dirtyHourKeys || []);
  keys.forEach((key) => dirty.add(key));
  await chrome.storage.local.set({
    [HOURLY_MEDIA_STATS_OUTBOX_KEY]: {
      dirtyHourKeys: [...dirty],
      retryCounts: outbox.retryCounts || {},
      lastErrors: outbox.lastErrors || {},
    },
  });
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
  await markMediaStatsDirty(segment.date);
}

async function incrementHourlyMediaStats(segment) {
  if (!segment?.domain) return;
  const slices = splitMediaSegmentByLocalHour(segment);
  if (slices.length === 0) return;
  const data = await chrome.storage.local.get(HOURLY_MEDIA_STATS_KEY);
  const stats = data?.[HOURLY_MEDIA_STATS_KEY] || {};
  const dirtyHourKeys = new Set();

  for (const slice of slices) {
    if (!slice.hourKey) continue;
    if (!stats[slice.hourKey]) {
      stats[slice.hourKey] = {
        hourKey: slice.hourKey,
        date: slice.date,
        hour: slice.hour,
        timezone: slice.timezone || DEFAULT_TIMEZONE,
        hourStartMs: slice.hourStartMs,
        hourEndMs: slice.hourEndMs,
        segmentsCount: 0,
        lastSegmentId: null,
        domains: {},
      };
    }
    applyMediaSliceToHourlyStats(stats[slice.hourKey], slice);
    dirtyHourKeys.add(slice.hourKey);
  }

  await chrome.storage.local.set({ [HOURLY_MEDIA_STATS_KEY]: stats });
  await markHourlyMediaStatsDirty([...dirtyHourKeys]);
}

function applyMediaSliceToHourlyStats(hourStats, slice) {
  if (!hourStats || !slice?.domain) return;
  if (!hourStats.domains[slice.domain]) {
    hourStats.domains[slice.domain] = makeEmptyMediaDomainStats();
  }
  const ds = hourStats.domains[slice.domain];
  const seconds = Number(slice.durationSeconds || 0);
  const classKey = `${slice.mediaClass}Seconds`;
  ds[classKey] = Number(ds[classKey] || 0) + seconds;
  ds.totalSeconds =
    Number(ds.foregroundAudioSeconds || 0) +
    Number(ds.backgroundAudioSeconds || 0) +
    Number(ds.foregroundVideoSeconds || 0) +
    Number(ds.backgroundVideoSeconds || 0) +
    Number(ds.pipSeconds || 0);
  const mode = slice.mode || 'unknown';
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
  if (!ds.firstSeenAt || slice.startMs < ds.firstSeenAt) ds.firstSeenAt = slice.startMs;
  if (!ds.lastSeenAt || slice.endMs > ds.lastSeenAt) ds.lastSeenAt = slice.endMs;
  ds.lastUpdatedAt = Date.now();
  hourStats.segmentsCount = Number(hourStats.segmentsCount || 0) + 1;
  hourStats.lastSegmentId = slice.id;
}

async function settleMediaSession(session, endMs, reason = 'media_boundary', options = {}) {
  if (!session?.startTime || endMs < session.startTime) {
    return { appended: 0, durationSeconds: 0, skipped: 'invalid_media_session' };
  }
  const identity = await resolveSettlementIdentity(
    { domain: session.domain, state: 'MEDIA_ACTIVE' },
    reason
  );
  const input = {
    profileId: identity.profileId,
    deviceId: identity.deviceId,
    startMs: session.startTime,
    endMs,
    domain: session.domain,
    tabId: session.tabId,
    windowId: session.windowId,
    mediaClass: session.mediaClass,
    mediaKind: session.mediaKind,
    visibility: session.visibility,
    mode: options.modeOverride || session.mode || getCachedEffectiveMode() || 'unknown',
    settlementReason: reason,
    reason,
    description: mediaSettlementDescription(session, options.endReason || reason, endMs),
  };
  const segments = splitMediaSegmentByLocalDate(input);
  const existingData = await chrome.storage.local.get(MEDIA_SEGMENTS_KEY);
  const existingSegments = existingData?.[MEDIA_SEGMENTS_KEY] || {};
  const newSegments = segments.filter((segment) => segment?.id && !existingSegments[segment.id]);
  const appended = await appendMediaSegments(segments);
  if (appended > 0) {
    for (const segment of newSegments) {
      await incrementDailyMediaStats(segment);
      await incrementHourlyMediaStats(segment);
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

async function getTabCheckpointSnapshot(tabId) {
  const normalizedTabId = Number(tabId);
  if (!Number.isInteger(normalizedTabId) || !chrome.tabs?.get) {
    return { ok: true, tab: null, window: null, reason: 'tab_api_unavailable' };
  }

  try {
    const tab = await chrome.tabs.get(normalizedTabId);
    let win = null;
    if (Number.isInteger(tab?.windowId) && chrome.windows?.get) {
      try {
        win = await chrome.windows.get(tab.windowId);
      } catch (_) {
        win = null;
      }
    }
    return { ok: true, tab, window: win };
  } catch (err) {
    return { ok: false, reason: 'tab_unavailable', error: err?.message || String(err) };
  }
}

function overlayCheckpointSnapshot(fact, snapshot) {
  if (!fact || !snapshot?.tab) return fact;
  const tab = snapshot.tab;
  const win = snapshot.window;
  return {
    ...fact,
    windowId: Number.isInteger(tab.windowId) ? tab.windowId : fact.windowId,
    audible: tab.audible === true || fact.audible === true,
    muted: tab.mutedInfo?.muted === true || fact.muted === true,
    isActiveTab: tab.active === true,
    windowState: win?.state || fact.windowState || null,
  };
}

async function confirmMediaSessionForCheckpoint(session, facts, frameFacts) {
  const tabId = normalizeTabId(session?.tabId);
  if (!tabId || !session?.mediaClass) return { ok: false, reason: 'invalid_media_session' };

  const snapshot = await getTabCheckpointSnapshot(tabId);
  if (snapshot.ok === false) {
    return { ok: false, reason: snapshot.reason || 'tab_unavailable' };
  }

  const rawFact = aggregateCheckpointMediaFact(tabId, frameFacts, facts);
  if (!rawFact) return { ok: false, reason: 'media_fact_missing' };

  const fact = overlayCheckpointSnapshot(rawFact, snapshot);
  const classification = classifyMediaFact(fact);
  if (!classification) return { ok: false, reason: 'media_inactive', fact };
  if (classification.mediaClass !== session.mediaClass) {
    return { ok: false, reason: 'media_class_mismatch', fact, classification };
  }
  if (session.mediaClass === 'pip' && fact.isPiP !== true) {
    return { ok: false, reason: 'pip_inactive', fact, classification };
  }
  if (normalizeTabId(fact.tabId) !== tabId) {
    return { ok: false, reason: 'tab_mismatch', fact, classification };
  }
  if (session.domain && normalizeDomain(fact.domain) !== normalizeDomain(session.domain)) {
    return { ok: false, reason: 'domain_mismatch', fact, classification };
  }
  if (Number.isInteger(session.windowId) && Number.isInteger(fact.windowId) && fact.windowId !== session.windowId) {
    return { ok: false, reason: 'window_mismatch', fact, classification };
  }
  return {
    ok: true,
    fact,
    classification,
    lastConfirmedAt: Number(fact.lastObservedAt) || Number(session.lastObservedAt) || Number(session.startTime) || 0,
  };
}

function estimatedMediaCheckpointCloseAt(session, now, lastConfirmedAt) {
  const start = Number(session?.startTime) || 0;
  const confirmed = Number(lastConfirmedAt) || start;
  const end = confirmed + ((Number(now) - confirmed) / 2);
  return Math.max(start, Math.min(Number(now), Math.floor(end)));
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

export async function closeForbiddenPiPSessionsForTab(tabId, reason = PIP_FORBIDDEN_CLEANUP_REASON, options = {}) {
  return runMediaSerialized(async () => {
    const normalizedTabId = normalizeTabId(tabId);
    if (!normalizedTabId) return { ok: false, reason: 'invalid_tab_id' };
    const atMs = Number.isFinite(options.now) ? options.now : Date.now();
    const sessions = await readSessions();
    const facts = await readFacts();
    const frameFacts = await readFrameFacts();
    let closedPiP = 0;
    let appended = 0;
    let reclassified = 0;

    for (const [key, session] of Object.entries(sessions)) {
      if (!session?.startTime) continue;
      if (normalizeTabId(session.tabId) !== normalizedTabId) continue;
      if (session.mediaClass !== 'pip') continue;
      const settlement = await settleMediaSession(session, atMs, reason, {
        endReason: reason,
      });
      appended += settlement.appended || 0;
      delete sessions[key];
      closedPiP++;
    }

    const removedPiPFrameFacts = removePiPFrameFactsForTab(frameFacts, normalizedTabId);
    const tabFact = aggregateCheckpointMediaFact(normalizedTabId, frameFacts, facts);
    const classification = classifyMediaFact(tabFact);
    if (!classification || classification.mediaClass === 'pip') {
      delete facts[normalizedTabId];
    } else {
      facts[normalizedTabId] = tabFact;
      const key = sessionKey(tabFact.tabId, classification.mediaClass);
      if (!sessions[key]) {
        sessions[key] = openSessionFromFact(
          tabFact,
          classification,
          `${reason}_reclassify`,
          atMs
        );
        reclassified++;
      }
    }

    await writeFrameFacts(frameFacts);
    await writeFacts(facts);
    await writeSessions(sessions);
    return {
      ok: true,
      reason,
      tabId: normalizedTabId,
      closedPiP,
      appended,
      reclassified,
      removedPiPFrameFacts,
    };
  });
}

export async function applyMediaFacts(factsInput, reason = 'media_fact', atMs = Date.now()) {
  return runMediaSerialized(async () => {
    const factsList = Array.isArray(factsInput) ? factsInput : [factsInput];
    const facts = await readFacts();
    const frameFacts = await readFrameFacts();
    const sessions = await readSessions();
    const results = [];
    let opened = 0;
    let closed = 0;
    let appended = 0;
    const changedTabs = new Map();

    for (const rawFact of factsList) {
      const fact = normalizeMediaFact(rawFact, reason, atMs);
      if (!fact) {
        results.push({ ok: false, reason: 'invalid_media_fact' });
        continue;
      }
      if (fact.clearMediaFrames) {
        removeFrameFactsForTab(frameFacts, fact.tabId);
      }
      frameFacts[frameFactKey(fact.tabId, fact.frameId)] = fact;
      changedTabs.set(fact.tabId, fact);
    }

    for (const fact of changedTabs.values()) {
      const tabFact = aggregateTabMediaFact(fact.tabId, frameFacts, fact);
      const classification = classifyMediaFact(tabFact);
      facts[fact.tabId] = tabFact;

      if (!classification) {
        const closeResult = await closeSessionsForTabInMap(sessions, tabFact.tabId, reason, atMs);
        closed += closeResult.closed;
        appended += closeResult.appended;
        results.push({ ok: true, tabId: tabFact.tabId, mediaClass: null, closed: closeResult.closed, frameId: fact.frameId });
        continue;
      }

      const key = sessionKey(tabFact.tabId, classification.mediaClass);
      const existing = sessions[key];
      if (existing && sameSessionFacts(existing, tabFact, classification)) {
        sessions[key] = {
          ...existing,
          windowId: tabFact.windowId,
          lastObservedAt: atMs,
        };
        results.push({ ok: true, tabId: tabFact.tabId, mediaClass: classification.mediaClass, changed: false, frameId: fact.frameId });
        continue;
      }

      const closeResult = await closeSessionsForTabInMap(sessions, tabFact.tabId, reason, atMs, key);
      closed += closeResult.closed;
      appended += closeResult.appended;
      sessions[key] = openSessionFromFact(tabFact, classification, reason, atMs);
      opened++;
      results.push({ ok: true, tabId: tabFact.tabId, mediaClass: classification.mediaClass, changed: true, frameId: fact.frameId });
    }

    await writeFrameFacts(frameFacts);
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
    const facts = await readFacts();
    const frameFacts = await readFrameFacts();
    let checkpointed = 0;
    let estimatedClosed = 0;
    let flushedSegments = 0;
    let flushedSeconds = 0;

    for (const [key, session] of Object.entries(sessions)) {
      if (!session?.startTime) continue;
      const confirmation = await confirmMediaSessionForCheckpoint(session, facts, frameFacts);
      const lastConfirmedAt = confirmation.ok
        ? confirmation.lastConfirmedAt
        : (Number(session.lastObservedAt) || Number(session.startTime) || now);

      if (!confirmation.ok) {
        const closeAt = estimatedMediaCheckpointCloseAt(session, now, lastConfirmedAt);
        const settlement = await settleMediaSession(session, closeAt, MEDIA_CHECKPOINT_ESTIMATED_CLOSE_REASON, {
          endReason: MEDIA_CHECKPOINT_ESTIMATED_END_REASON,
        });
        flushedSegments += settlement.appended || 0;
        flushedSeconds += settlement.durationSeconds || 0;
        delete sessions[key];
        estimatedClosed++;
        continue;
      }

      while ((now - session.startTime) >= MEDIA_CHECKPOINT_MS) {
        const checkpointEnd = session.startTime + MEDIA_CHECKPOINT_MS;
        if (lastConfirmedAt < checkpointEnd) {
          const closeAt = estimatedMediaCheckpointCloseAt(session, now, lastConfirmedAt);
          const settlement = await settleMediaSession(session, closeAt, MEDIA_CHECKPOINT_ESTIMATED_CLOSE_REASON, {
            endReason: MEDIA_CHECKPOINT_ESTIMATED_END_REASON,
          });
          flushedSegments += settlement.appended || 0;
          flushedSeconds += settlement.durationSeconds || 0;
          delete sessions[key];
          estimatedClosed++;
          break;
        }

        const settlement = await settleMediaSession(session, checkpointEnd, 'periodic_checkpoint');
        flushedSegments += settlement.appended || 0;
        flushedSeconds += settlement.durationSeconds || 0;
        checkpointed++;
        session.startTime = checkpointEnd;
        session.lastCheckpointAt = checkpointEnd;
        session.startReason = 'periodic_checkpoint_reopen';
        session.startOperationSource = 'timer';
        session.startAtMs = checkpointEnd;
      }
      if (sessions[key]) sessions[key] = session;
    }

    await writeSessions(sessions);
    return {
      ok: true,
      checkpointed: checkpointed > 0,
      estimatedClosed: estimatedClosed > 0,
      reason: checkpointed > 0
        ? 'periodic_checkpoint'
        : (estimatedClosed > 0 ? MEDIA_CHECKPOINT_ESTIMATED_CLOSE_REASON : 'interval_not_reached'),
      flushedSegments,
      flushedSeconds,
      checkpointWindows: checkpointed,
      estimatedCloseWindows: estimatedClosed,
    };
  });
}

export async function splitOpenMediaSessionsAtModeBoundary(intent = {}) {
  return runMediaSerialized(async () => {
    const boundary = Number(intent.boundaryAtMs ?? intent.effectiveAtMs ?? intent.atMs);
    const toMode = typeof intent.toMode === 'string' && intent.toMode.trim()
      ? intent.toMode.trim()
      : (getCachedEffectiveMode() || 'unknown');
    if (!Number.isFinite(boundary)) {
      return { ok: false, reason: 'invalid_mode_boundary_time' };
    }

    const sessions = await readSessions();
    let split = 0;
    let appended = 0;
    let updated = 0;

    for (const [key, session] of Object.entries(sessions)) {
      if (!session?.startTime) continue;
      if (boundary <= session.startTime) {
        sessions[key] = {
          ...session,
          mode: toMode,
          startReason: session.startReason || 'mode_effective_boundary_reopen',
          startOperationSource: session.startOperationSource || 'mode_boundary',
          startAtMs: session.startAtMs || session.startTime,
        };
        updated++;
        continue;
      }

      const settlement = await settleMediaSession(session, boundary, 'mode_effective_boundary', {
        modeOverride: intent.fromMode || null,
      });
      appended += settlement.appended || 0;
      sessions[key] = {
        ...session,
        startTime: boundary,
        lastObservedAt: session.lastObservedAt,
        lastCheckpointAt: session.lastCheckpointAt,
        startReason: 'mode_effective_boundary_reopen',
        startOperationSource: 'mode_boundary',
        startAtMs: boundary,
        mode: toMode,
      };
      split++;
    }

    await writeSessions(sessions);
    return {
      ok: true,
      reason: 'mode_effective_boundary',
      split,
      updated,
      appended,
      closedPiP: 0,
      reclassified: 0,
      mode: toMode,
    };
  });
}

export async function closeMediaForTab(tabId, reason = 'tab_close', options = {}) {
  return runMediaSerialized(async () => {
    const atMs = Number.isFinite(options.now) ? options.now : Date.now();
    const sessions = await readSessions();
    const facts = await readFacts();
    const frameFacts = await readFrameFacts();
    const result = await closeSessionsForTabInMap(sessions, tabId, reason, atMs);
    delete facts[normalizeTabId(tabId)];
    removeFrameFactsForTab(frameFacts, tabId);
    await writeFrameFacts(frameFacts);
    await writeFacts(facts);
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
    await writeFrameFacts({});
    await writeFacts({});
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

export async function getMediaFrameFacts() {
  return readFrameFacts();
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

export async function getHourlyMediaStats(hourKey = null) {
  const data = await chrome.storage.local.get(HOURLY_MEDIA_STATS_KEY);
  const stats = data?.[HOURLY_MEDIA_STATS_KEY] || {};
  return hourKey ? (stats[hourKey] || null) : stats;
}

export async function rebuildHourlyMediaStats(dateOrHourKey, options = {}) {
  const target = String(dateOrHourKey || '');
  const isHourKey = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(target);
  const date = isHourKey ? target.slice(0, 10) : target;
  const allSegments = await getMediaSegments();
  const segments = Object.values(allSegments || {}).filter((segment) => segment?.date === date);
  const { forceWriteEmpty = false } = options || {};
  if (segments.length === 0 && !forceWriteEmpty) return { target, rebuilt: false, rebuiltHours: [] };

  const nextByHour = {};
  for (const segment of segments) {
    const slices = splitMediaSegmentByLocalHour(segment)
      .filter((slice) => !isHourKey || slice.hourKey === target);
    for (const slice of slices) {
      if (!nextByHour[slice.hourKey]) {
        nextByHour[slice.hourKey] = {
          hourKey: slice.hourKey,
          date: slice.date,
          hour: slice.hour,
          timezone: slice.timezone || DEFAULT_TIMEZONE,
          hourStartMs: slice.hourStartMs,
          hourEndMs: slice.hourEndMs,
          segmentsCount: 0,
          lastSegmentId: null,
          domains: {},
        };
      }
      applyMediaSliceToHourlyStats(nextByHour[slice.hourKey], slice);
    }
  }

  const data = await chrome.storage.local.get(HOURLY_MEDIA_STATS_KEY);
  const stats = data?.[HOURLY_MEDIA_STATS_KEY] || {};
  for (const key of Object.keys(stats)) {
    if (isHourKey ? key === target : key.startsWith(`${date}T`)) {
      delete stats[key];
    }
  }
  for (const [key, value] of Object.entries(nextByHour)) {
    stats[key] = value;
  }
  if (Object.keys(nextByHour).length > 0 || forceWriteEmpty) {
    await chrome.storage.local.set({ [HOURLY_MEDIA_STATS_KEY]: stats });
  }
  const rebuiltHours = Object.keys(nextByHour).sort();
  await markHourlyMediaStatsDirty(rebuiltHours);
  return { target, date, rebuilt: true, rebuiltHours, segmentsUsed: segments.length };
}

export async function getPendingMediaSegments() {
  const [segmentData, outboxData] = await Promise.all([
    chrome.storage.local.get(MEDIA_SEGMENTS_KEY),
    chrome.storage.local.get(MEDIA_SEGMENT_OUTBOX_KEY),
  ]);
  const allSegments = segmentData?.[MEDIA_SEGMENTS_KEY] || {};
  const outbox = outboxData?.[MEDIA_SEGMENT_OUTBOX_KEY] || { pendingIds: [], retryCounts: {}, lastErrors: {} };
  const segments = (outbox.pendingIds || [])
    .map((id) => allSegments[id])
    .filter(Boolean)
    .sort((a, b) => (Number(a.startMs) || 0) - (Number(b.startMs) || 0));
  return {
    pendingCount: segments.length,
    segments,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

export async function markMediaSegmentsUploaded(segmentIds, uploadedAt = Date.now()) {
  const ids = new Set((Array.isArray(segmentIds) ? segmentIds : [segmentIds]).filter(Boolean));
  if (ids.size === 0) return;
  const [segmentData, outboxData] = await Promise.all([
    chrome.storage.local.get(MEDIA_SEGMENTS_KEY),
    chrome.storage.local.get(MEDIA_SEGMENT_OUTBOX_KEY),
  ]);
  const allSegments = segmentData?.[MEDIA_SEGMENTS_KEY] || {};
  const outbox = outboxData?.[MEDIA_SEGMENT_OUTBOX_KEY] || { pendingIds: [], retryCounts: {}, lastErrors: {} };
  for (const id of ids) {
    if (allSegments[id]) {
      allSegments[id] = { ...allSegments[id], uploadedAt, updatedAt: Date.now() };
    }
    delete outbox.retryCounts?.[id];
    delete outbox.lastErrors?.[id];
  }
  outbox.pendingIds = (outbox.pendingIds || []).filter((id) => !ids.has(id));
  await chrome.storage.local.set({
    [MEDIA_SEGMENTS_KEY]: allSegments,
    [MEDIA_SEGMENT_OUTBOX_KEY]: outbox,
  });
}

export async function markMediaSegmentUploadFailed(segmentIds, error) {
  const ids = (Array.isArray(segmentIds) ? segmentIds : [segmentIds]).filter(Boolean);
  if (ids.length === 0) return;
  const data = await chrome.storage.local.get(MEDIA_SEGMENT_OUTBOX_KEY);
  const outbox = data?.[MEDIA_SEGMENT_OUTBOX_KEY] || { pendingIds: [], retryCounts: {}, lastErrors: {} };
  const pending = new Set(outbox.pendingIds || []);
  outbox.retryCounts = outbox.retryCounts || {};
  outbox.lastErrors = outbox.lastErrors || {};
  for (const id of ids) {
    pending.add(id);
    outbox.retryCounts[id] = Number(outbox.retryCounts[id] || 0) + 1;
    outbox.lastErrors[id] = String(error || 'upload_failed');
  }
  outbox.pendingIds = [...pending];
  await chrome.storage.local.set({ [MEDIA_SEGMENT_OUTBOX_KEY]: outbox });
}

export async function getPendingDailyMediaStats() {
  const [statsData, outboxData] = await Promise.all([
    chrome.storage.local.get(DAILY_MEDIA_STATS_KEY),
    chrome.storage.local.get(MEDIA_STATS_OUTBOX_KEY),
  ]);
  const allStats = statsData?.[DAILY_MEDIA_STATS_KEY] || {};
  const outbox = outboxData?.[MEDIA_STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };
  const stats = {};
  for (const date of outbox.dirtyDates || []) {
    if (allStats[date]) stats[date] = allStats[date];
  }
  return {
    pendingCount: Object.keys(stats).length,
    stats,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

export async function getPendingHourlyMediaStats() {
  const [statsData, outboxData] = await Promise.all([
    chrome.storage.local.get(HOURLY_MEDIA_STATS_KEY),
    chrome.storage.local.get(HOURLY_MEDIA_STATS_OUTBOX_KEY),
  ]);
  const allStats = statsData?.[HOURLY_MEDIA_STATS_KEY] || {};
  const outbox = outboxData?.[HOURLY_MEDIA_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  const stats = {};
  for (const hourKey of outbox.dirtyHourKeys || []) {
    if (allStats[hourKey]) stats[hourKey] = allStats[hourKey];
  }
  return {
    pendingCount: Object.keys(stats).length,
    stats,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

export async function markDailyMediaStatsUploaded(dates, uploadedAt = Date.now()) {
  const dateSet = new Set((Array.isArray(dates) ? dates : [dates]).filter(Boolean));
  if (dateSet.size === 0) return;
  const [statsData, outboxData] = await Promise.all([
    chrome.storage.local.get(DAILY_MEDIA_STATS_KEY),
    chrome.storage.local.get(MEDIA_STATS_OUTBOX_KEY),
  ]);
  const allStats = statsData?.[DAILY_MEDIA_STATS_KEY] || {};
  const outbox = outboxData?.[MEDIA_STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };
  for (const date of dateSet) {
    if (allStats[date]) {
      allStats[date] = { ...allStats[date], uploadedAt, lastUploadedAt: uploadedAt };
    }
    delete outbox.retryCounts?.[date];
    delete outbox.lastErrors?.[date];
  }
  outbox.dirtyDates = (outbox.dirtyDates || []).filter((date) => !dateSet.has(date));
  await chrome.storage.local.set({
    [DAILY_MEDIA_STATS_KEY]: allStats,
    [MEDIA_STATS_OUTBOX_KEY]: outbox,
  });
}

export async function markHourlyMediaStatsUploaded(hourKeys, uploadedAt = Date.now()) {
  const hourKeySet = new Set((Array.isArray(hourKeys) ? hourKeys : [hourKeys]).filter(Boolean));
  if (hourKeySet.size === 0) return;
  const [statsData, outboxData] = await Promise.all([
    chrome.storage.local.get(HOURLY_MEDIA_STATS_KEY),
    chrome.storage.local.get(HOURLY_MEDIA_STATS_OUTBOX_KEY),
  ]);
  const allStats = statsData?.[HOURLY_MEDIA_STATS_KEY] || {};
  const outbox = outboxData?.[HOURLY_MEDIA_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  for (const hourKey of hourKeySet) {
    if (allStats[hourKey]) {
      allStats[hourKey] = { ...allStats[hourKey], uploadedAt, lastUploadedAt: uploadedAt };
    }
    delete outbox.retryCounts?.[hourKey];
    delete outbox.lastErrors?.[hourKey];
  }
  outbox.dirtyHourKeys = (outbox.dirtyHourKeys || []).filter((hourKey) => !hourKeySet.has(hourKey));
  await chrome.storage.local.set({
    [HOURLY_MEDIA_STATS_KEY]: allStats,
    [HOURLY_MEDIA_STATS_OUTBOX_KEY]: outbox,
  });
}

export async function markDailyMediaStatsUploadFailed(dates, error) {
  const dateList = (Array.isArray(dates) ? dates : [dates]).filter(Boolean);
  if (dateList.length === 0) return;
  const data = await chrome.storage.local.get(MEDIA_STATS_OUTBOX_KEY);
  const outbox = data?.[MEDIA_STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };
  const dirty = new Set(outbox.dirtyDates || []);
  outbox.retryCounts = outbox.retryCounts || {};
  outbox.lastErrors = outbox.lastErrors || {};
  for (const date of dateList) {
    dirty.add(date);
    outbox.retryCounts[date] = Number(outbox.retryCounts[date] || 0) + 1;
    outbox.lastErrors[date] = String(error || 'upload_failed');
  }
  outbox.dirtyDates = [...dirty];
  await chrome.storage.local.set({ [MEDIA_STATS_OUTBOX_KEY]: outbox });
}

export async function markHourlyMediaStatsUploadFailed(hourKeys, error) {
  const hourKeyList = (Array.isArray(hourKeys) ? hourKeys : [hourKeys]).filter(Boolean);
  if (hourKeyList.length === 0) return;
  const data = await chrome.storage.local.get(HOURLY_MEDIA_STATS_OUTBOX_KEY);
  const outbox = data?.[HOURLY_MEDIA_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  const dirty = new Set(outbox.dirtyHourKeys || []);
  outbox.retryCounts = outbox.retryCounts || {};
  outbox.lastErrors = outbox.lastErrors || {};
  for (const hourKey of hourKeyList) {
    dirty.add(hourKey);
    outbox.retryCounts[hourKey] = Number(outbox.retryCounts[hourKey] || 0) + 1;
    outbox.lastErrors[hourKey] = String(error || 'upload_failed');
  }
  outbox.dirtyHourKeys = [...dirty];
  await chrome.storage.local.set({ [HOURLY_MEDIA_STATS_OUTBOX_KEY]: outbox });
}

export async function buildMediaSegmentsUploadPayload(segmentIds) {
  const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
  if (ids.length === 0) return { schemaVersion: 1, segments: [] };
  const data = await chrome.storage.local.get(MEDIA_SEGMENTS_KEY);
  const allSegments = data?.[MEDIA_SEGMENTS_KEY] || {};
  const segments = [];
  for (const id of ids) {
    const seg = allSegments[id];
    if (!seg) continue;
    segments.push({
      id: seg.id,
      date: seg.date,
      timezone: seg.timezone,
      dayStartMs: seg.dayStartMs,
      dayEndMs: seg.dayEndMs,
      startMs: seg.startMs,
      endMs: seg.endMs,
      durationSeconds: seg.durationSeconds,
      domain: seg.domain,
      tabId: seg.tabId ?? null,
      windowId: seg.windowId ?? null,
      mediaClass: seg.mediaClass,
      mediaKind: seg.mediaKind,
      visibility: seg.visibility,
      mode: seg.mode,
      settlementReason: seg.settlementReason,
      description: seg.description || null,
      parentSegmentId: seg.parentSegmentId || null,
      partIndex: seg.partIndex || 1,
      partCount: seg.partCount || 1,
      createdAt: seg.createdAt,
      updatedAt: seg.updatedAt,
    });
  }
  return { schemaVersion: 1, segments };
}

export async function buildDailyMediaStatsUploadPayload(date) {
  const data = await chrome.storage.local.get(DAILY_MEDIA_STATS_KEY);
  const allStats = data?.[DAILY_MEDIA_STATS_KEY] || {};
  const dayStats = allStats[date];
  if (!dayStats || !dayStats.domains) {
    return { schemaVersion: 1, date, timezone: 'Asia/Shanghai', dayStartMs: null, dayEndMs: null, domains: [] };
  }
  const domains = Object.entries(dayStats.domains).map(([domain, ds]) => ({
    domain,
    foregroundAudioSeconds: Number(ds?.foregroundAudioSeconds || 0),
    backgroundAudioSeconds: Number(ds?.backgroundAudioSeconds || 0),
    foregroundVideoSeconds: Number(ds?.foregroundVideoSeconds || 0),
    backgroundVideoSeconds: Number(ds?.backgroundVideoSeconds || 0),
    pipSeconds: Number(ds?.pipSeconds || 0),
    totalSeconds: Number(ds?.totalSeconds || 0),
    byMode: ds?.byMode || {},
    firstSeenAt: ds?.firstSeenAt || null,
    lastSeenAt: ds?.lastSeenAt || null,
    lastUpdatedAt: ds?.lastUpdatedAt || null,
  }));
  return {
    schemaVersion: 1,
    date,
    timezone: dayStats.timezone || 'Asia/Shanghai',
    dayStartMs: dayStats.dayStartMs,
    dayEndMs: dayStats.dayEndMs,
    segmentsCount: dayStats.segmentsCount || 0,
    lastSegmentId: dayStats.lastSegmentId || null,
    domains,
  };
}

export async function buildHourlyMediaStatsUploadPayload(hourKey) {
  const data = await chrome.storage.local.get(HOURLY_MEDIA_STATS_KEY);
  const allStats = data?.[HOURLY_MEDIA_STATS_KEY] || {};
  const hourStats = allStats[hourKey];
  if (!hourStats || !hourStats.domains) {
    const date = typeof hourKey === 'string' ? hourKey.slice(0, 10) : null;
    const hour = typeof hourKey === 'string' ? Number(hourKey.slice(11, 13)) : null;
    return { schemaVersion: 1, hourKey, date, hour, timezone: DEFAULT_TIMEZONE, hourStartMs: null, hourEndMs: null, domains: [] };
  }
  const domains = Object.entries(hourStats.domains).map(([domain, ds]) => ({
    domain,
    foregroundAudioSeconds: Number(ds?.foregroundAudioSeconds || 0),
    backgroundAudioSeconds: Number(ds?.backgroundAudioSeconds || 0),
    foregroundVideoSeconds: Number(ds?.foregroundVideoSeconds || 0),
    backgroundVideoSeconds: Number(ds?.backgroundVideoSeconds || 0),
    pipSeconds: Number(ds?.pipSeconds || 0),
    totalSeconds: Number(ds?.totalSeconds || 0),
    byMode: ds?.byMode || {},
    firstSeenAt: ds?.firstSeenAt || null,
    lastSeenAt: ds?.lastSeenAt || null,
    lastUpdatedAt: ds?.lastUpdatedAt || null,
  }));
  return {
    schemaVersion: 1,
    hourKey,
    date: hourStats.date || String(hourKey).slice(0, 10),
    hour: Number.isInteger(hourStats.hour) ? hourStats.hour : Number(String(hourKey).slice(11, 13)),
    timezone: hourStats.timezone || DEFAULT_TIMEZONE,
    hourStartMs: hourStats.hourStartMs,
    hourEndMs: hourStats.hourEndMs,
    segmentsCount: hourStats.segmentsCount || 0,
    lastSegmentId: hourStats.lastSegmentId || null,
    domains,
  };
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
