// stats/admin-read-model.js
// Read-only admin statistics view. This module must stay page-safe:
// it only reads chrome.storage.local and must not import background/runtime code.

const CONFIG_KEY = 'guardian_config';
const USAGE_SEGMENTS_KEY = 'usage_segments_v1';
const SEGMENT_INDEX_KEY = 'usage_segments_index_v1';
const DAILY_USAGE_STATS_KEY = 'daily_usage_stats_v1';
const HOURLY_USAGE_STATS_KEY = 'hourly_usage_stats_v1';
const MEDIA_SEGMENTS_KEY = 'media_segments_v1';
const DAILY_MEDIA_STATS_KEY = 'daily_media_stats_v1';
const HOURLY_MEDIA_STATS_KEY = 'hourly_media_stats_v1';
const SITE_CLASSIFICATION_REQUESTS_KEY = 'site_classification_requests_v1';
const TEMP_COMPOSITE_DOMAINS_KEY = 'temporary_composite_domains';

const STATS_KEYS = [
  'audioSeconds',
  'backgroundMediaByDomain',
  'pipSeconds',
  'pipByDomain',
  'onlineSeconds',
  'compositeSeconds',
  'undeterminedSeconds',
];

export const ADMIN_READ_MODEL_KEYS = [
  CONFIG_KEY,
  USAGE_SEGMENTS_KEY,
  SEGMENT_INDEX_KEY,
  DAILY_USAGE_STATS_KEY,
  HOURLY_USAGE_STATS_KEY,
  MEDIA_SEGMENTS_KEY,
  DAILY_MEDIA_STATS_KEY,
  HOURLY_MEDIA_STATS_KEY,
  SITE_CLASSIFICATION_REQUESTS_KEY,
  TEMP_COMPOSITE_DOMAINS_KEY,
];

export function getAdminDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function readAdminStatsStorage(extraKeys = []) {
  const keys = Array.from(new Set([...ADMIN_READ_MODEL_KEYS, ...extraKeys]));
  return storageGet(keys);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function safeConfig(config) {
  return isObject(config)
    ? { studyList: [], compositeList: [], ...config }
    : { studyList: [], compositeList: [] };
}

export function isAdminStatsMetaKey(key) {
  return STATS_KEYS.includes(key);
}

function normalizeHostname(input) {
  if (typeof input !== 'string') return null;
  let raw = input.trim().toLowerCase().replace(/\.+$/g, '');
  if (!raw) return null;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      raw = new URL(raw).hostname;
    } else {
      raw = new URL(`http://${raw}`).hostname;
    }
    return raw.toLowerCase().replace(/\.+$/g, '') || null;
  } catch {
    return raw || null;
  }
}

function matchDomain(domain, pattern) {
  const d = normalizeHostname(domain);
  const p = normalizeHostname(pattern);
  if (!d || !p) return false;
  if (d === p) return true;
  if (d.startsWith('www.') && d.slice(4) === p) return true;
  if (p.startsWith('www.') && p.slice(4) === d) return true;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return !!base && d !== base && d.endsWith(`.${base}`);
  }
  return d.endsWith(`.${p}`);
}

function recordTarget(record) {
  if (!record || typeof record !== 'object') return null;
  const targetType = record.decisionTargetType || record.requestedTargetType || record.targetType || record.type;
  const normalizedValue = record.decisionNormalizedValue || record.requestedNormalizedValue || record.normalizedValue || record.targetValue || record.value;
  if (!targetType || typeof normalizedValue !== 'string' || !normalizedValue.trim()) return null;
  return { targetType, normalizedValue };
}

function requestMatchesDomain(record, domain) {
  const target = recordTarget(record);
  if (!target || !domain) return false;
  if (target.targetType === 'host') return matchDomain(domain, target.normalizedValue);
  if (target.targetType === 'url') {
    try {
      return matchDomain(domain, new URL(target.normalizedValue).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

function temporaryCompositeDomains(storage) {
  const raw = storage[TEMP_COMPOSITE_DOMAINS_KEY];
  if (Array.isArray(raw)) return raw.map((item) => item?.domain || item).filter(Boolean);
  if (isObject(raw)) return Object.values(raw).map((item) => item?.domain || item).filter(Boolean);
  return [];
}

function classifyDomain(domain, config, storage) {
  if (!domain) return 'rest';
  if ((config.studyList || []).some((pattern) => matchDomain(domain, pattern))) return 'study';
  if ((config.compositeList || []).some((pattern) => matchDomain(domain, pattern))) return 'composite';
  if (temporaryCompositeDomains(storage).some((pattern) => matchDomain(domain, pattern))) return 'composite';

  const requests = storage[SITE_CLASSIFICATION_REQUESTS_KEY] || {};
  const records = Array.isArray(requests) ? requests : Object.values(requests);
  const pending = records.some((record) => {
    const status = record?.status || 'pending';
    return (status === 'pending' || status === 'approved') && requestMatchesDomain(record, domain);
  });
  return pending ? 'pending_composite' : 'rest';
}

function addModeSeconds(target, source = {}) {
  target.study += Math.max(0, Number(source.study) || 0);
  target.composite += Math.max(0, Number(source.composite) || 0);
  target.rest += Math.max(0, Number(source.rest) || 0);
  target.locked += Math.max(0, Number(source.locked) || 0);
  target.paused += Math.max(0, Number(source.paused) || 0);
  target.unknown += Math.max(0, Number(source.unknown) || 0);
}

function convertDailyStatsToLegacyShape(dayStats) {
  if (!dayStats || (!dayStats.domains && !dayStats.targets)) {
    return {
      audioSeconds: 0,
      backgroundMediaByDomain: {},
      pipSeconds: 0,
      pipByDomain: {},
    };
  }

  if (dayStats.targets && Object.keys(dayStats.targets).length > 0) {
    const result = {};
    const backgroundMediaByDomain = {};
    const pipByDomain = {};
    const targetRows = [];
    let audioSeconds = 0;
    let pipSeconds = 0;
    let studySeconds = 0;
    let restSeconds = 0;
    let compositeSeconds = 0;
    let lockedSeconds = 0;

    for (const [targetKey, ts] of Object.entries(dayStats.targets || {})) {
      if (!ts) continue;
      const label = ts.managedTargetLabelAtTime || ts.managedTargetValue || ts.fallbackDomain || targetKey;
      const active = Math.max(0, Number(ts.activeSeconds) || 0);
      const pip = Math.max(0, Number(ts.pipSeconds) || 0);
      const background = Math.max(0, Number(ts.backgroundMediaSeconds) || 0);
      const online = active + pip;
      if (online > 0) result[label] = (result[label] || 0) + online;
      if (background > 0) {
        backgroundMediaByDomain[label] = (backgroundMediaByDomain[label] || 0) + background;
        audioSeconds += background;
      }
      if (pip > 0) {
        pipByDomain[label] = (pipByDomain[label] || 0) + pip;
        pipSeconds += pip;
      }
      const addQuota = (bucketMap = {}) => {
        studySeconds += Math.max(0, Number(bucketMap.study) || 0);
        compositeSeconds += Math.max(0, Number(bucketMap.composite) || 0);
        restSeconds += Math.max(0, Number(bucketMap.rest) || 0);
        lockedSeconds += Math.max(0, Number(bucketMap.locked) || 0);
      };
      addQuota(ts.activeByQuotaBucket);
      addQuota(ts.pipByQuotaBucket);
      targetRows.push({
        targetKey,
        label,
        seconds: online,
        fallbackDomain: ts.fallbackDomain || null,
        managedTargetId: ts.managedTargetId || null,
        managedTargetType: ts.managedTargetType || null,
        targetClassificationAtTime: ts.targetClassificationAtTime || null,
        quotaBuckets: {
          active: ts.activeByQuotaBucket || {},
          pip: ts.pipByQuotaBucket || {},
        },
        isFallback: !!ts.isFallback,
      });
    }
    return {
      ...result,
      audioSeconds,
      backgroundMediaByDomain,
      pipSeconds,
      pipByDomain,
      studySeconds,
      restSeconds,
      compositeSeconds,
      undeterminedSeconds: compositeSeconds,
      lockedSeconds,
      targetRows,
      sourceKind: 'target',
    };
  }

  const result = {};
  const backgroundMediaByDomain = {};
  const pipByDomain = {};
  let audioSeconds = 0;
  let pipSeconds = 0;
  for (const [domain, ds] of Object.entries(dayStats.domains || {})) {
    if (!ds) continue;
    const active = Math.max(0, Number(ds.activeSeconds) || 0);
    const pip = Math.max(0, Number(ds.pipSeconds) || 0);
    const background = Math.max(0, Number(ds.backgroundMediaSeconds) || 0);
    result[domain] = active + pip;
    if (background > 0) {
      backgroundMediaByDomain[domain] = background;
      audioSeconds += background;
    }
    if (pip > 0) {
      pipByDomain[domain] = pip;
      pipSeconds += pip;
    }
  }
  return { ...result, audioSeconds, backgroundMediaByDomain, pipSeconds, pipByDomain };
}

function readCompositeSeconds(statsLike, config, storage) {
  const explicitComposite = Number(statsLike?.compositeSeconds);
  if (Number.isFinite(explicitComposite)) return Math.max(0, explicitComposite);
  const legacyUndetermined = Number(statsLike?.undeterminedSeconds);
  if (Number.isFinite(legacyUndetermined)) return Math.max(0, legacyUndetermined);
  const domainStats = statsLike?.domainStats || statsLike || {};
  let total = 0;
  for (const [domain, seconds] of Object.entries(domainStats)) {
    if (isAdminStatsMetaKey(domain)) continue;
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) continue;
    const classification = classifyDomain(domain, config, storage);
    if (classification === 'composite' || classification === 'pending_composite') total += value;
  }
  return total;
}

function splitStatsDay(dayStats, config, storage) {
  const safe = isObject(dayStats) ? dayStats : {};
  const audioSeconds = Number(safe.audioSeconds) || 0;
  const pipSeconds = Number(safe.pipSeconds) || 0;
  const compositeSeconds = readCompositeSeconds(safe, config, storage);
  const hasExplicitBuckets = Number.isFinite(Number(safe.studySeconds)) || Number.isFinite(Number(safe.restSeconds));
  const domainStats = {};
  for (const [domain, seconds] of Object.entries(safe)) {
    if (isAdminStatsMetaKey(domain)) continue;
    if (['studySeconds', 'restSeconds', 'lockedSeconds', 'targetRows', 'sourceKind'].includes(domain)) continue;
    domainStats[domain] = Number(seconds) || 0;
  }
  return {
    domainStats,
    audioSeconds,
    pipSeconds,
    compositeSeconds,
    studySeconds: hasExplicitBuckets ? Math.max(0, Number(safe.studySeconds) || 0) : null,
    restSeconds: hasExplicitBuckets ? Math.max(0, Number(safe.restSeconds) || 0) : null,
    lockedSeconds: hasExplicitBuckets ? Math.max(0, Number(safe.lockedSeconds) || 0) : null,
    targetRows: Array.isArray(safe.targetRows) ? safe.targetRows : [],
    sourceKind: safe.sourceKind || 'domain',
  };
}

function mergeStatsRange(rangeData, config, storage) {
  const merged = {};
  let audioSeconds = 0;
  let pipSeconds = 0;
  let compositeSeconds = 0;
  for (const dayStats of Object.values(rangeData || {})) {
    const day = splitStatsDay(dayStats, config, storage);
    audioSeconds += day.audioSeconds;
    pipSeconds += day.pipSeconds;
    compositeSeconds += day.compositeSeconds;
    for (const [domain, seconds] of Object.entries(day.domainStats)) {
      merged[domain] = (merged[domain] || 0) + seconds;
    }
  }
  const explicitStudy = Object.values(rangeData || {}).some((stats) => splitStatsDay(stats, config, storage).studySeconds !== null);
  if (!explicitStudy) return { domainStats: merged, audioSeconds, pipSeconds, compositeSeconds };
  let studySeconds = 0;
  let restSeconds = 0;
  let lockedSeconds = 0;
  for (const dayStats of Object.values(rangeData || {})) {
    const day = splitStatsDay(dayStats, config, storage);
    studySeconds += Math.max(0, Number(day.studySeconds) || 0);
    restSeconds += Math.max(0, Number(day.restSeconds) || 0);
    lockedSeconds += Math.max(0, Number(day.lockedSeconds) || 0);
  }
  return { domainStats: merged, audioSeconds, pipSeconds, compositeSeconds, studySeconds, restSeconds, lockedSeconds, sourceKind: 'target' };
}

function computeOverview(data, config, storage) {
  let online = 0;
  const hasExplicitStudy = data?.studySeconds !== null && data?.studySeconds !== undefined && Number.isFinite(Number(data.studySeconds));
  const hasExplicitRest = data?.restSeconds !== null && data?.restSeconds !== undefined && Number.isFinite(Number(data.restSeconds));
  let study = hasExplicitStudy ? Math.max(0, Number(data.studySeconds) || 0) : 0;
  let rest = hasExplicitRest ? Math.max(0, Number(data.restSeconds) || 0) : 0;
  const audio = Number(data?.audioSeconds) || 0;
  const pip = Number(data?.pipSeconds) || 0;
  const composite = readCompositeSeconds(data, config, storage);
  const useExplicitBuckets = hasExplicitStudy || hasExplicitRest;
  for (const [domain, seconds] of Object.entries(data?.domainStats || {})) {
    const value = Math.max(0, Number(seconds) || 0);
    online += value;
    if (useExplicitBuckets) continue;
    const type = classifyDomain(domain, config, storage);
    if (type === 'study') study += value;
    else if (type === 'composite' || type === 'pending_composite') {
      // Composite is tracked separately from rest.
    } else {
      rest += value;
    }
  }
  return { online, study, rest: Math.max(0, rest), audio, pip, composite, undetermined: composite };
}

function dateKeysForDays(days, now = new Date()) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    keys.push(getAdminDateKey(date));
  }
  return keys;
}

function buildStatsRange(allDailyStats, days, config, storage) {
  const result = {};
  for (const date of dateKeysForDays(days)) {
    result[date] = convertDailyStatsToLegacyShape(allDailyStats?.[date]);
    result[date].compositeSeconds = readCompositeSeconds(result[date], config, storage);
    result[date].undeterminedSeconds = result[date].compositeSeconds;
  }
  return result;
}

function segmentDate(segment) {
  if (segment?.date) return segment.date;
  const startMs = Number(segment?.startMs);
  return Number.isFinite(startMs) ? getAdminDateKey(new Date(startMs)) : null;
}

function normalizeUsageSegment(segment) {
  const startMs = Number(segment?.startMs);
  const endMs = Number(segment?.endMs);
  const durationSeconds = Number(segment?.durationSeconds);
  return {
    id: segment?.id || null,
    date: segmentDate(segment),
    domain: segment?.domain || null,
    channel: segment?.channel || null,
    framework: segment?.framework || null,
    sourceState: segment?.sourceState || null,
    tabId: segment?.tabId ?? null,
    windowId: Number.isInteger(segment?.windowId) ? segment.windowId : null,
    mode: segment?.mode || null,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
    settlementReason: segment?.settlementReason || null,
    description: segment?.description || null,
    suspect: !!segment?.suspect,
    suspectReason: segment?.suspectReason || null,
    uploaded: !!segment?.uploadedAt,
    createdAt: Number.isFinite(Number(segment?.createdAt)) ? Number(segment.createdAt) : null,
    updatedAt: Number.isFinite(Number(segment?.updatedAt)) ? Number(segment.updatedAt) : null,
  };
}

function allUsageSegments(storage) {
  return Object.values(storage[USAGE_SEGMENTS_KEY] || {}).map(normalizeUsageSegment);
}

function inRange(date, range) {
  if (!date) return false;
  if (range?.from && date < range.from) return false;
  if (range?.to && date > range.to) return false;
  return true;
}

function isHourInRange(hourKey, range) {
  return typeof hourKey === 'string' && inRange(hourKey.slice(0, 10), range);
}

export function getAdminRangeBounds(range = 'today') {
  const today = new Date();
  if (range === 'all') return { from: null, to: null, label: '全部' };
  if (range === 'yesterday') {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const key = getAdminDateKey(date);
    return { from: key, to: key, label: '昨日' };
  }
  if (range === 'week') {
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
    return { from: getAdminDateKey(start), to: getAdminDateKey(today), label: '本周' };
  }
  const key = getAdminDateKey(today);
  return { from: key, to: key, label: '今日' };
}

function reconciliationStatus(statsSeconds, segmentSeconds) {
  if (statsSeconds === segmentSeconds) return 'match';
  if (statsSeconds <= 0 && segmentSeconds > 0) return 'stats_missing';
  if (statsSeconds > 0 && segmentSeconds <= 0) return 'segments_missing';
  return 'mismatch';
}

function addReconciliationSeconds(map, keyParts, field, seconds) {
  const [date, domain, channel, mode] = keyParts;
  const key = `${date}\t${domain}\t${channel}\t${mode}`;
  const row = map.get(key) || { date, domain, channel, mode, statsSeconds: 0, segmentSeconds: 0 };
  row[field] += Math.max(0, Number(seconds) || 0);
  map.set(key, row);
}

function buildReconciliation(dayStatsByDate, segments) {
  const rowsByKey = new Map();
  for (const [date, dayStats] of Object.entries(dayStatsByDate || {})) {
    for (const [domain, ds] of Object.entries(dayStats?.domains || {})) {
      for (const [mode, seconds] of Object.entries(ds?.activeByMode || {})) {
        addReconciliationSeconds(rowsByKey, [date, domain, 'active', mode], 'statsSeconds', seconds);
      }
      for (const [mode, seconds] of Object.entries(ds?.backgroundMediaByMode || {})) {
        addReconciliationSeconds(rowsByKey, [date, domain, 'backgroundMedia', mode], 'statsSeconds', seconds);
      }
      for (const [mode, seconds] of Object.entries(ds?.pipByMode || {})) {
        addReconciliationSeconds(rowsByKey, [date, domain, 'pip', mode], 'statsSeconds', seconds);
      }
    }
  }
  for (const segment of segments || []) {
    addReconciliationSeconds(
      rowsByKey,
      [segment.date || getAdminDateKey(), segment.domain, segment.channel, segment.mode || 'unknown'],
      'segmentSeconds',
      segment.durationSeconds
    );
  }
  const rows = [...rowsByKey.values()].map((row) => ({
    ...row,
    deltaSeconds: row.segmentSeconds - row.statsSeconds,
    status: reconciliationStatus(row.statsSeconds, row.segmentSeconds),
  })).sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'match') return 1;
      if (b.status === 'match') return -1;
    }
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
    if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
    return a.mode < b.mode ? -1 : (a.mode > b.mode ? 1 : 0);
  });
  const summary = rows.reduce((acc, row) => {
    acc.statsSeconds += row.statsSeconds;
    acc.segmentSeconds += row.segmentSeconds;
    acc.deltaSeconds += row.deltaSeconds;
    if (row.status !== 'match') acc.mismatchCount++;
    acc.statusCounts[row.status] = (acc.statusCounts[row.status] || 0) + 1;
    return acc;
  }, { rowCount: rows.length, statsSeconds: 0, segmentSeconds: 0, deltaSeconds: 0, mismatchCount: 0, statusCounts: {} });
  return { rows, summary };
}

function summarizeUsageSegments(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row.durationSeconds) || 0);
    summary.rowCount++;
    summary.totalSeconds += seconds;
    if (row.channel === 'active') summary.activeSeconds += seconds;
    else if (row.channel === 'backgroundMedia' || row.channel === 'media') summary.backgroundMediaSeconds += seconds;
    else if (row.channel === 'pip') summary.pipSeconds += seconds;
    return summary;
  }, { rowCount: 0, totalSeconds: 0, activeSeconds: 0, backgroundMediaSeconds: 0, pipSeconds: 0 });
}

function endpointOperation(description, side) {
  const endpoint = description?.[side];
  return endpoint?.reason || endpoint?.operation || null;
}

function normalizeMediaSegment(segment) {
  const startMs = Number(segment?.startMs);
  const endMs = Number(segment?.endMs);
  const durationSeconds = Number(segment?.durationSeconds);
  const description = segment?.description || null;
  return {
    id: segment?.id || null,
    date: segmentDate(segment),
    domain: segment?.domain || null,
    tabId: segment?.tabId ?? null,
    windowId: Number.isInteger(segment?.windowId) ? segment.windowId : null,
    mediaClass: segment?.mediaClass || null,
    mediaKind: segment?.mediaKind || null,
    visibility: segment?.visibility || null,
    mode: segment?.mode || null,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
    settlementReason: segment?.settlementReason || segment?.reason || null,
    reason: segment?.reason || segment?.settlementReason || null,
    description,
    openOperation: endpointOperation(description, 'start'),
    closeOperation: endpointOperation(description, 'end'),
    uploaded: !!segment?.uploadedAt,
    createdAt: Number.isFinite(Number(segment?.createdAt)) ? Number(segment.createdAt) : null,
    updatedAt: Number.isFinite(Number(segment?.updatedAt)) ? Number(segment.updatedAt) : null,
  };
}

function summarizeMediaRows(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row.durationSeconds) || 0);
    const classKey = `${row.mediaClass || 'unknown'}Seconds`;
    summary.rowCount++;
    summary.totalSeconds += seconds;
    if (!Object.prototype.hasOwnProperty.call(summary, classKey)) summary[classKey] = 0;
    summary[classKey] += seconds;
    return summary;
  }, {
    rowCount: 0,
    totalSeconds: 0,
    foregroundAudioSeconds: 0,
    backgroundAudioSeconds: 0,
    foregroundVideoSeconds: 0,
    backgroundVideoSeconds: 0,
    pipSeconds: 0,
  });
}

function timelineFromSegments(segments, date) {
  return (segments || [])
    .filter((segment) => segment.date === date && segment.channel === 'active')
    .map((segment) => ({
      date: segment.date,
      domain: segment.domain,
      startAt: Number(segment.startMs),
      duration: Number(segment.durationSeconds) || 0,
      classification: 'active',
    }))
    .filter((row) => Number.isFinite(row.startAt) && row.duration > 0 && row.domain)
    .sort((a, b) => a.startAt - b.startAt);
}

function compositeSessionsFromRange(rangeData, config, storage) {
  const sessions = [];
  for (const [date, stats] of Object.entries(rangeData || {})) {
    const day = splitStatsDay(stats, config, storage);
    for (const [domain, seconds] of Object.entries(day.domainStats)) {
      const classification = classifyDomain(domain, config, storage);
      if (classification === 'composite' || classification === 'pending_composite') {
        sessions.push({ date, domain, duration: Number(seconds) || 0, classification: 'pending' });
      }
    }
  }
  return sessions.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.duration - a.duration;
  });
}

function buildSuspectSummary(segments) {
  const suspect = (segments || []).filter((segment) => segment.suspect);
  const suspectByReason = {};
  let excludedSeconds = 0;
  for (const segment of suspect) {
    const reason = segment.suspectReason || 'unknown';
    suspectByReason[reason] = (suspectByReason[reason] || 0) + 1;
    excludedSeconds += Math.max(0, Number(segment.durationSeconds) || 0);
  }
  return { ok: true, markedCount: suspect.length, excludedSeconds, suspectByReason };
}

export async function getAdminUsageAnalysisView() {
  const storage = await readAdminStatsStorage();
  const config = safeConfig(storage[CONFIG_KEY]);
  const dailyStats = storage[DAILY_USAGE_STATS_KEY] || {};
  const today = getAdminDateKey();
  const todayRangeData = buildStatsRange(dailyStats, 1, config, storage);
  const weekRangeData = buildStatsRange(dailyStats, 7, config, storage);
  const todayData = splitStatsDay(todayRangeData[today] || {}, config, storage);
  const weekData = mergeStatsRange(weekRangeData, config, storage);
  const segments = allUsageSegments(storage);
  const todayOverview = computeOverview(todayData, config, storage);
  const weekOverview = computeOverview(weekData, config, storage);
  return {
    ok: true,
    source: 'admin_read_model',
    date: today,
    config,
    todayRangeData,
    weekRangeData,
    todayData,
    weekData,
    todayOverview,
    weekOverview,
    timelineSegments: timelineFromSegments(segments, today),
    todayCompositeSessions: compositeSessionsFromRange(todayRangeData, config, storage).filter((row) => row.date === today),
    weekCompositeSessions: compositeSessionsFromRange(weekRangeData, config, storage),
    suspectSummary: buildSuspectSummary(segments),
    meta: { source: 'chrome.storage.local', readOnly: true },
  };
}

export async function getAdminSettlementView(rangeName = 'today') {
  const storage = await readAdminStatsStorage();
  const range = getAdminRangeBounds(rangeName);
  const segments = allUsageSegments(storage)
    .filter((segment) => inRange(segment.date, range))
    .sort((a, b) => {
      const aStart = Number.isFinite(a.startMs) ? a.startMs : Number.MAX_SAFE_INTEGER;
      const bStart = Number.isFinite(b.startMs) ? b.startMs : Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    });
  const rangeStats = {};
  for (const [date, dayStats] of Object.entries(storage[DAILY_USAGE_STATS_KEY] || {})) {
    if (inRange(date, range)) rangeStats[date] = dayStats;
  }
  return {
    ok: true,
    range: rangeName,
    label: range.label,
    from: range.from,
    to: range.to,
    date: range.from === range.to ? range.from : null,
    segments,
    rows: segments,
    domains: Array.from(new Set(segments.map((segment) => segment.domain).filter(Boolean))).sort(),
    summary: summarizeUsageSegments(segments),
    reconciliation: buildReconciliation(rangeStats, segments),
    meta: { source: 'chrome.storage.local', readOnly: true },
  };
}

export async function getAdminMediaSettlementView(rangeName = 'today') {
  const storage = await readAdminStatsStorage();
  const range = getAdminRangeBounds(rangeName);
  const rows = Object.values(storage[MEDIA_SEGMENTS_KEY] || {})
    .map(normalizeMediaSegment)
    .filter((segment) => inRange(segment.date, range))
    .sort((a, b) => {
      const aStart = Number.isFinite(a.startMs) ? a.startMs : Number.MIN_SAFE_INTEGER;
      const bStart = Number.isFinite(b.startMs) ? b.startMs : Number.MIN_SAFE_INTEGER;
      return bStart - aStart;
    });
  return {
    ok: true,
    range: rangeName,
    label: range.label,
    from: range.from,
    to: range.to,
    date: range.from === range.to ? range.from : null,
    rows,
    domains: Array.from(new Set(rows.map((row) => row.domain).filter(Boolean))).sort(),
    mediaClasses: Array.from(new Set(rows.map((row) => row.mediaClass).filter(Boolean))).sort(),
    summary: summarizeMediaRows(rows),
    meta: { source: 'chrome.storage.local', readOnly: true },
  };
}

const HOURLY_MEDIA_CLASS_FIELDS = [
  ['foregroundAudio', 'foregroundAudioSeconds'],
  ['backgroundAudio', 'backgroundAudioSeconds'],
  ['foregroundVideo', 'foregroundVideoSeconds'],
  ['backgroundVideo', 'backgroundVideoSeconds'],
  ['pip', 'pipSeconds'],
];

function pushHourlyUsageRows(rows, hourStats) {
  for (const [domain, ds] of Object.entries(hourStats?.domains || {})) {
    for (const [mode, seconds] of Object.entries(ds?.activeByMode || {})) {
      if (Number(seconds || 0) > 0) rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, channel: 'active', mode, durationSeconds: Number(seconds || 0) });
    }
    for (const [mode, seconds] of Object.entries(ds?.backgroundMediaByMode || {})) {
      if (Number(seconds || 0) > 0) rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, channel: 'backgroundMedia', mode, durationSeconds: Number(seconds || 0) });
    }
    for (const [mode, seconds] of Object.entries(ds?.pipByMode || {})) {
      if (Number(seconds || 0) > 0) rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, channel: 'pip', mode, durationSeconds: Number(seconds || 0) });
    }
  }
}

function summarizeHourlyUsage(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row.durationSeconds) || 0);
    summary.rowCount++;
    summary.totalSeconds += seconds;
    if (row.channel === 'active') summary.activeSeconds += seconds;
    else if (row.channel === 'backgroundMedia') summary.backgroundMediaSeconds += seconds;
    else if (row.channel === 'pip') summary.pipSeconds += seconds;
    return summary;
  }, { rowCount: 0, totalSeconds: 0, activeSeconds: 0, backgroundMediaSeconds: 0, pipSeconds: 0 });
}

export async function getAdminHourlyUsageView(rangeName = 'today') {
  const storage = await readAdminStatsStorage();
  const range = getAdminRangeBounds(rangeName);
  const rows = [];
  for (const [hourKey, hourStats] of Object.entries(storage[HOURLY_USAGE_STATS_KEY] || {})) {
    if (!isHourInRange(hourKey, range)) continue;
    pushHourlyUsageRows(rows, { ...hourStats, hourKey: hourStats.hourKey || hourKey });
  }
  rows.sort((a, b) => {
    if (a.hourKey !== b.hourKey) return a.hourKey < b.hourKey ? 1 : -1;
    if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
    if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
    return a.mode < b.mode ? -1 : (a.mode > b.mode ? 1 : 0);
  });
  return { ok: true, range: rangeName, label: range.label, from: range.from, to: range.to, rows, summary: summarizeHourlyUsage(rows), meta: { source: 'chrome.storage.local', readOnly: true } };
}

function pushHourlyMediaRows(rows, hourStats) {
  for (const [domain, ds] of Object.entries(hourStats?.domains || {})) {
    for (const [mode, byMode] of Object.entries(ds?.byMode || {})) {
      for (const [mediaClass, field] of HOURLY_MEDIA_CLASS_FIELDS) {
        const seconds = Number(byMode?.[field] || 0);
        if (seconds > 0) rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, mediaClass, mode, durationSeconds: seconds });
      }
    }
  }
}

export async function getAdminHourlyMediaView(rangeName = 'today') {
  const storage = await readAdminStatsStorage();
  const range = getAdminRangeBounds(rangeName);
  const rows = [];
  for (const [hourKey, hourStats] of Object.entries(storage[HOURLY_MEDIA_STATS_KEY] || {})) {
    if (!isHourInRange(hourKey, range)) continue;
    pushHourlyMediaRows(rows, { ...hourStats, hourKey: hourStats.hourKey || hourKey });
  }
  rows.sort((a, b) => {
    if (a.hourKey !== b.hourKey) return a.hourKey < b.hourKey ? 1 : -1;
    if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
    if (a.mediaClass !== b.mediaClass) return a.mediaClass < b.mediaClass ? -1 : 1;
    return a.mode < b.mode ? -1 : (a.mode > b.mode ? 1 : 0);
  });
  return { ok: true, range: rangeName, label: range.label, from: range.from, to: range.to, rows, summary: summarizeMediaRows(rows), meta: { source: 'chrome.storage.local', readOnly: true } };
}
