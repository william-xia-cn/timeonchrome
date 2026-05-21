// stats/managed-statistics.js — managed statistics semantics layer

import { computeAllDomainsWithAudio } from '../core/aggregate.js';
import { matchDomain } from '../core/domain-semantics.js';
import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { emitTrace } from '../core/timing-trace.js';
import { getAllUsageSegments, getDailyUsageStats, getHourlyUsageStats } from '../core/usage-segments.js';
import { getHourlyMediaStats, getMediaSegments } from '../runtime/media-session.js';

const EVENT_LOG_KEY = 'event_log_v1';
const DAILY_USAGE_STATS_KEY = 'daily_usage_stats_v1';
const TEMP_COMPOSITE_DOMAINS_KEY = 'temporary_composite_domains';
const SITE_CLASSIFICATION_REQUESTS_KEY = 'site_classification_requests_v1';

export const STATS_META_KEYS = new Set([
  'audioSeconds',
  'backgroundMediaByDomain',
  'pipSeconds',
  'pipByDomain',
  'onlineSeconds',
  'compositeSeconds',
  'undeterminedSeconds',
]);

export function isStatsMetaKey(key) {
  return STATS_META_KEYS.has(key);
}

export function getDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(date) {
  return getDateKey(date);
}

function isDailyUsageStatsAuthoritative(dayStats) {
  if (!dayStats || !dayStats.domains) return false;
  if (Object.keys(dayStats.domains).length > 0) return true;
  return !!dayStats.suspectCleanup?.excludeSuspect;
}

export function convertDailyStatsToLegacyShape(dayStats) {
  if (!dayStats || !dayStats.domains) {
    return {
      audioSeconds: 0,
      backgroundMediaByDomain: {},
      pipSeconds: 0,
      pipByDomain: {},
    };
  }

  const result = {};
  const backgroundMediaByDomain = {};
  const pipByDomain = {};
  let audioSeconds = 0;
  let pipSeconds = 0;

  for (const [domain, ds] of Object.entries(dayStats.domains)) {
    if (!ds) continue;
    result[domain] = Number(ds.activeSeconds || 0) + Number(ds.pipSeconds || 0);

    if (Number(ds.backgroundMediaSeconds || 0) > 0) {
      backgroundMediaByDomain[domain] = Number(ds.backgroundMediaSeconds || 0);
      audioSeconds += Number(ds.backgroundMediaSeconds || 0);
    }

    if (Number(ds.pipSeconds || 0) > 0) {
      pipByDomain[domain] = Number(ds.pipSeconds || 0);
      pipSeconds += Number(ds.pipSeconds || 0);
    }
  }

  return {
    ...result,
    audioSeconds,
    backgroundMediaByDomain,
    pipSeconds,
    pipByDomain,
  };
}

function aggregateFromEvents(events, date) {
  const { domains, audioSeconds, backgroundMediaByDomain, pipSeconds, pipByDomain } =
    computeAllDomainsWithAudio(events, date);
  const mergedDomains = { ...domains };
  for (const [domain, seconds] of Object.entries(pipByDomain || {})) {
    mergedDomains[domain] = (mergedDomains[domain] || 0) + (Number(seconds) || 0);
  }
  return {
    ...mergedDomains,
    audioSeconds: Number.isFinite(audioSeconds) ? audioSeconds : 0,
    backgroundMediaByDomain: backgroundMediaByDomain || {},
    pipSeconds: Number.isFinite(pipSeconds) ? pipSeconds : 0,
    pipByDomain: pipByDomain || {},
  };
}

function addModeSeconds(target, source = {}) {
  target.studySeconds += Math.max(0, Number(source.study) || 0);
  target.restSeconds += Math.max(0, Number(source.rest) || 0);
  target.compositeSeconds += Math.max(0, Number(source.composite) || 0);
}

function buildPopupSettledModeStats(dayStats) {
  const summary = {
    studySeconds: 0,
    restSeconds: 0,
    compositeSeconds: 0,
    onlineSeconds: 0,
    backgroundMediaSeconds: 0,
    pipSeconds: 0,
  };
  if (!dayStats || !dayStats.domains) return summary;

  for (const ds of Object.values(dayStats.domains)) {
    if (!ds) continue;
    addModeSeconds(summary, ds.activeByMode || {});
    summary.onlineSeconds += Math.max(0, Number(ds.activeSeconds) || 0) + Math.max(0, Number(ds.pipSeconds) || 0);
    summary.backgroundMediaSeconds += Math.max(0, Number(ds.backgroundMediaSeconds) || 0);
    summary.pipSeconds += Math.max(0, Number(ds.pipSeconds) || 0);
  }
  return summary;
}

function readCompositeSeconds(stats = {}, config = {}) {
  const explicitComposite = Number(stats?.compositeSeconds);
  if (Number.isFinite(explicitComposite)) return Math.max(0, explicitComposite);

  const legacyUndetermined = Number(stats?.undeterminedSeconds);
  if (Number.isFinite(legacyUndetermined)) return Math.max(0, legacyUndetermined);

  const compositeList = config?.compositeList || [];
  let compositeSeconds = 0;
  for (const [domain, value] of Object.entries(stats || {})) {
    if (isStatsMetaKey(domain)) continue;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    if (compositeList.some((pattern) => matchDomain(domain, pattern))) {
      compositeSeconds += seconds;
    }
  }
  return compositeSeconds;
}

export function withUsageSummary(stats = {}, config = {}) {
  let onlineSeconds = 0;
  for (const [key, value] of Object.entries(stats || {})) {
    if (isStatsMetaKey(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      onlineSeconds += value;
    }
  }
  const compositeSeconds = readCompositeSeconds(stats, config);
  return { ...stats, onlineSeconds, compositeSeconds, undeterminedSeconds: compositeSeconds };
}

export async function getTodayUsageView(options = {}) {
  const date = options.date || getDateKey();
  let source = 'daily_usage_stats_v1';
  let stats = null;
  let dayStats = null;

  try {
    const data = await chrome.storage.local.get(DAILY_USAGE_STATS_KEY);
    const allStats = data[DAILY_USAGE_STATS_KEY] || {};
    dayStats = allStats[date];
    if (isDailyUsageStatsAuthoritative(dayStats)) {
      stats = convertDailyStatsToLegacyShape(dayStats);
      await emitTrace('stats_calculated', {
        source,
        reason: 'dailyAggregation',
        domain: null,
        statsAfter: dayStats,
        payload: { date },
      });
    }
  } catch (_) {
    stats = null;
  }

  if (!stats) {
    source = 'event_log_v1_fallback';
    const eventData = await chrome.storage.local.get(EVENT_LOG_KEY);
    const events = eventData[EVENT_LOG_KEY] || [];
    stats = aggregateFromEvents(events, date);
    await emitTrace('stats_calculated', {
      source,
      reason: 'dailyAggregation',
      domain: null,
      statsAfter: stats,
      payload: { date, eventCount: events.length, note: 'event-log fallback — compacted history may be lost' },
    });
  }

  const config = options.config || {};
  return {
    ok: true,
    date,
    source,
    dayStats,
    stats,
    statsWithSummary: withUsageSummary(stats, config),
    meta: { source, date },
  };
}

export async function getUsageRangeView(days = 7, options = {}) {
  const result = {};
  const sources = {};

  try {
    const data = await chrome.storage.local.get(DAILY_USAGE_STATS_KEY);
    const allStats = data[DAILY_USAGE_STATS_KEY] || {};

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      const dayStats = allStats[dateStr];
      if (isDailyUsageStatsAuthoritative(dayStats)) {
        result[dateStr] = convertDailyStatsToLegacyShape(dayStats);
        sources[dateStr] = 'daily_usage_stats_v1';
      } else {
        result[dateStr] = null;
      }
    }

    let events = null;
    for (const dateStr of Object.keys(result)) {
      if (result[dateStr] !== null) continue;
      if (!events) {
        const eventData = await chrome.storage.local.get(EVENT_LOG_KEY);
        events = eventData[EVENT_LOG_KEY] || [];
      }
      const fallback = aggregateFromEvents(events, dateStr);
      const hasDomains = Object.keys(fallback).some((key) =>
        !isStatsMetaKey(key) && Number(fallback[key] || 0) > 0
      );
      result[dateStr] = hasDomains ? fallback : {
        audioSeconds: 0,
        backgroundMediaByDomain: {},
        pipSeconds: 0,
        pipByDomain: {},
      };
      sources[dateStr] = hasDomains ? 'event_log_v1_fallback' : 'empty';
    }
  } catch (_) {
    const eventData = await chrome.storage.local.get(EVENT_LOG_KEY);
    const events = eventData[EVENT_LOG_KEY] || [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      result[dateStr] = aggregateFromEvents(events, dateStr);
      sources[dateStr] = 'event_log_v1_fallback';
    }
  }

  const config = options.config || {};
  const statsWithSummaryByDate = {};
  for (const [date, stats] of Object.entries(result)) {
    statsWithSummaryByDate[date] = withUsageSummary(stats || {}, config);
  }
  return {
    ok: true,
    days,
    statsByDate: result,
    statsWithSummaryByDate,
    sources,
    meta: { sources },
  };
}

export async function getPopupModeStatsView(date = getDateKey()) {
  try {
    const data = await chrome.storage.local.get(DAILY_USAGE_STATS_KEY);
    const allStats = data[DAILY_USAGE_STATS_KEY] || {};
    const summary = buildPopupSettledModeStats(allStats[date]);
    return { ok: true, date, summary, source: 'daily_usage_stats_v1' };
  } catch (_) {
    return { ok: true, date, summary: buildPopupSettledModeStats(null), source: 'empty' };
  }
}

async function readTemporaryCompositeDomains() {
  const area = chrome.storage.session || null;
  if (!area) return [];
  const data = await area.get(TEMP_COMPOSITE_DOMAINS_KEY);
  const list = data?.[TEMP_COMPOSITE_DOMAINS_KEY];
  if (!Array.isArray(list)) return [];
  return [...new Set(list
    .map((item) => typeof item === 'string' ? item : item?.domain)
    .filter((domain) => typeof domain === 'string' && domain.trim())
    .map((domain) => domain.trim().toLowerCase()))];
}

async function readSiteClassificationRecords() {
  const data = await chrome.storage.local.get(SITE_CLASSIFICATION_REQUESTS_KEY);
  const records = data?.[SITE_CLASSIFICATION_REQUESTS_KEY];
  return Array.isArray(records) ? records : [];
}

function classifyDomainForManagedStats(config, siteClassificationRecords, temporaryCompositeDomains, domain) {
  const resolved = resolveSiteAccessClassification(config || {}, siteClassificationRecords || [], domain);
  if (resolved.classification) return resolved.classification;
  if ((temporaryCompositeDomains || []).some((pattern) => matchDomain(domain, pattern))) return 'composite';
  return null;
}

function domainEntries(stats = {}) {
  return Object.entries(stats || {})
    .filter(([domain, seconds]) => !isStatsMetaKey(domain) && Number.isFinite(Number(seconds)))
    .map(([domain, seconds]) => [domain, Math.max(0, Number(seconds) || 0)]);
}

export async function getQuotaUsageView(date = getDateKey(), options = {}) {
  const config = options.config || {};
  const stats = options.stats || (await getTodayUsageView({ date, config })).stats;
  const temporaryCompositeDomains = options.temporaryCompositeDomains || await readTemporaryCompositeDomains();
  const siteClassificationRecords = options.siteClassificationRecords || await readSiteClassificationRecords();

  let studySeconds = 0;
  let compositeSeconds = 0;
  let totalSeconds = 0;
  const domainSeconds = {};
  const domainClassifications = {};

  for (const [domain, seconds] of domainEntries(stats)) {
    totalSeconds += seconds;
    domainSeconds[domain] = seconds;
    const classification = classifyDomainForManagedStats(config, siteClassificationRecords, temporaryCompositeDomains, domain);
    domainClassifications[domain] = classification;
    if (classification === 'study') studySeconds += seconds;
    else if (classification === 'composite' || classification === 'pending_composite') compositeSeconds += seconds;
  }

  const restSeconds = Math.max(0, totalSeconds - studySeconds - compositeSeconds);
  const today = getDateKey();
  const dayOfWeek = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const range = await getUsageRangeView(dayOfWeek + 1, { config });
  let weekRestSeconds = 0;
  for (const [dateKey, dayStats] of Object.entries(range.statsByDate || {})) {
    const tempComposite = dateKey === today ? temporaryCompositeDomains : [];
    let dayTotal = 0;
    let dayStudy = 0;
    let dayComposite = 0;
    for (const [domain, seconds] of domainEntries(dayStats)) {
      dayTotal += seconds;
      const classification = classifyDomainForManagedStats(config, siteClassificationRecords, tempComposite, domain);
      if (classification === 'study') dayStudy += seconds;
      else if (classification === 'composite' || classification === 'pending_composite') dayComposite += seconds;
    }
    weekRestSeconds += Math.max(0, dayTotal - dayStudy - dayComposite);
  }

  return {
    ok: true,
    date,
    totalSeconds,
    studySeconds,
    compositeSeconds,
    undeterminedSeconds: compositeSeconds,
    restSeconds,
    weekRestSeconds,
    totalMinutes: Math.floor(totalSeconds / 60),
    studyMinutes: Math.floor(studySeconds / 60),
    compositeMinutes: Math.floor(compositeSeconds / 60),
    undeterminedMinutes: Math.floor(compositeSeconds / 60),
    restMinutes: Math.floor(restSeconds / 60),
    weekRestMinutes: Math.floor(weekRestSeconds / 60),
    domainSeconds,
    domainClassifications,
    media: {
      backgroundMediaSeconds: Number(stats?.audioSeconds || 0),
      backgroundMediaByDomain: stats?.backgroundMediaByDomain || {},
      pipSeconds: Number(stats?.pipSeconds || 0),
      pipByDomain: stats?.pipByDomain || {},
    },
    source: 'managed_statistics',
  };
}

function isDateInSettlementRange(date, range) {
  if (!date) return false;
  if (!range?.from && !range?.to) return true;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function isHourKeyInSettlementRange(hourKey, range) {
  if (!hourKey || typeof hourKey !== 'string') return false;
  return isDateInSettlementRange(hourKey.slice(0, 10), range);
}

export function getSettlementRangeBounds(range = 'today') {
  const today = new Date();
  if (range === 'all') return { from: null, to: null, label: '全部' };
  if (range === 'yesterday') {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const key = formatDate(d);
    return { from: key, to: key, label: '昨日' };
  }
  if (range === 'week') {
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
    return { from: formatDate(start), to: formatDate(today), label: '本周' };
  }
  const key = getDateKey();
  return { from: key, to: key, label: '今日' };
}

function segmentDate(segment) {
  if (segment?.date) return segment.date;
  const startMs = Number(segment?.startMs);
  if (Number.isFinite(startMs)) return formatDate(new Date(startMs));
  return null;
}

function normalizeSettlementAnalysisSegment(segment) {
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

function buildLocalSettlementReconciliation(dayStatsByDate, segments) {
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
      [segment.date || getDateKey(), segment.domain, segment.channel, segment.mode || 'unknown'],
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

export async function getReconciliationView(rangeName = 'today') {
  const range = getSettlementRangeBounds(rangeName);
  const allSegments = await getAllUsageSegments();
  const allDailyStats = await getDailyUsageStats();
  const segments = Object.values(allSegments || {})
    .filter((segment) => isDateInSettlementRange(segmentDate(segment), range))
    .map(normalizeSettlementAnalysisSegment)
    .sort((a, b) => {
      const aStart = Number.isFinite(a.startMs) ? a.startMs : Number.MAX_SAFE_INTEGER;
      const bStart = Number.isFinite(b.startMs) ? b.startMs : Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    });
  const rangeStats = {};
  for (const [date, dayStats] of Object.entries(allDailyStats || {})) {
    if (isDateInSettlementRange(date, range)) rangeStats[date] = dayStats;
  }
  return {
    ok: true,
    range: rangeName,
    label: range.label,
    from: range.from,
    to: range.to,
    date: range.from === range.to ? range.from : null,
    segments,
    reconciliation: buildLocalSettlementReconciliation(rangeStats, segments),
  };
}

export async function getSettlementAnalysisView(range = 'today') {
  return getReconciliationView(range);
}

function mediaEndpointOperation(description, side) {
  const endpoint = description?.[side];
  return endpoint?.reason || endpoint?.operation || null;
}

function normalizeMediaAnalysisSegment(segment) {
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
    openOperation: mediaEndpointOperation(description, 'start'),
    closeOperation: mediaEndpointOperation(description, 'end'),
    uploaded: !!segment?.uploadedAt,
    createdAt: Number.isFinite(Number(segment?.createdAt)) ? Number(segment.createdAt) : null,
    updatedAt: Number.isFinite(Number(segment?.updatedAt)) ? Number(segment.updatedAt) : null,
  };
}

function buildMediaSettlementSummary(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row?.durationSeconds) || 0);
    const classKey = `${row?.mediaClass || 'unknown'}Seconds`;
    summary.rowCount++;
    summary.totalSeconds += seconds;
    if (!Object.prototype.hasOwnProperty.call(summary, classKey)) {
      summary[classKey] = 0;
    }
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

export async function getMediaSettlementAnalysisView(rangeName = 'today') {
  const range = getSettlementRangeBounds(rangeName);
  const allSegments = await getMediaSegments();
  const rows = Object.values(allSegments || {})
    .filter((segment) => isDateInSettlementRange(segmentDate(segment), range))
    .map(normalizeMediaAnalysisSegment)
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
    summary: buildMediaSettlementSummary(rows),
  };
}

function pushHourlyUsageRows(rows, hourStats) {
  for (const [domain, ds] of Object.entries(hourStats?.domains || {})) {
    for (const [mode, seconds] of Object.entries(ds?.activeByMode || {})) {
      if (Number(seconds || 0) > 0) {
        rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, channel: 'active', mode, durationSeconds: Number(seconds || 0) });
      }
    }
    for (const [mode, seconds] of Object.entries(ds?.backgroundMediaByMode || {})) {
      if (Number(seconds || 0) > 0) {
        rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, channel: 'backgroundMedia', mode, durationSeconds: Number(seconds || 0) });
      }
    }
    for (const [mode, seconds] of Object.entries(ds?.pipByMode || {})) {
      if (Number(seconds || 0) > 0) {
        rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, channel: 'pip', mode, durationSeconds: Number(seconds || 0) });
      }
    }
  }
}

function summarizeHourlyUsageRows(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row?.durationSeconds) || 0);
    summary.rowCount++;
    summary.totalSeconds += seconds;
    if (row.channel === 'active') summary.activeSeconds += seconds;
    else if (row.channel === 'backgroundMedia') summary.backgroundMediaSeconds += seconds;
    else if (row.channel === 'pip') summary.pipSeconds += seconds;
    return summary;
  }, { rowCount: 0, totalSeconds: 0, activeSeconds: 0, backgroundMediaSeconds: 0, pipSeconds: 0 });
}

export async function getHourlyUsageStatsRangeView(rangeName = 'today') {
  const range = getSettlementRangeBounds(rangeName);
  const allStats = await getHourlyUsageStats();
  const rows = [];
  for (const [hourKey, hourStats] of Object.entries(allStats || {})) {
    if (!isHourKeyInSettlementRange(hourKey, range)) continue;
    pushHourlyUsageRows(rows, { ...hourStats, hourKey: hourStats.hourKey || hourKey });
  }
  rows.sort((a, b) => {
    if (a.hourKey !== b.hourKey) return a.hourKey < b.hourKey ? 1 : -1;
    if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
    if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
    return a.mode < b.mode ? -1 : (a.mode > b.mode ? 1 : 0);
  });
  return {
    ok: true,
    range: rangeName,
    label: range.label,
    from: range.from,
    to: range.to,
    rows,
    summary: summarizeHourlyUsageRows(rows),
  };
}

const HOURLY_MEDIA_CLASS_FIELDS = [
  ['foregroundAudio', 'foregroundAudioSeconds'],
  ['backgroundAudio', 'backgroundAudioSeconds'],
  ['foregroundVideo', 'foregroundVideoSeconds'],
  ['backgroundVideo', 'backgroundVideoSeconds'],
  ['pip', 'pipSeconds'],
];

function pushHourlyMediaRows(rows, hourStats) {
  for (const [domain, ds] of Object.entries(hourStats?.domains || {})) {
    for (const [mode, byMode] of Object.entries(ds?.byMode || {})) {
      for (const [mediaClass, field] of HOURLY_MEDIA_CLASS_FIELDS) {
        const seconds = Number(byMode?.[field] || 0);
        if (seconds > 0) {
          rows.push({ hourKey: hourStats.hourKey, date: hourStats.date, hour: hourStats.hour, hourStartMs: hourStats.hourStartMs, hourEndMs: hourStats.hourEndMs, domain, mediaClass, mode, durationSeconds: seconds });
        }
      }
    }
  }
}

function summarizeHourlyMediaRows(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row?.durationSeconds) || 0);
    const classKey = `${row?.mediaClass || 'unknown'}Seconds`;
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

export async function getHourlyMediaStatsRangeView(rangeName = 'today') {
  const range = getSettlementRangeBounds(rangeName);
  const allStats = await getHourlyMediaStats();
  const rows = [];
  for (const [hourKey, hourStats] of Object.entries(allStats || {})) {
    if (!isHourKeyInSettlementRange(hourKey, range)) continue;
    pushHourlyMediaRows(rows, { ...hourStats, hourKey: hourStats.hourKey || hourKey });
  }
  rows.sort((a, b) => {
    if (a.hourKey !== b.hourKey) return a.hourKey < b.hourKey ? 1 : -1;
    if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
    if (a.mediaClass !== b.mediaClass) return a.mediaClass < b.mediaClass ? -1 : 1;
    return a.mode < b.mode ? -1 : (a.mode > b.mode ? 1 : 0);
  });
  return {
    ok: true,
    range: rangeName,
    label: range.label,
    from: range.from,
    to: range.to,
    rows,
    summary: summarizeHourlyMediaRows(rows),
  };
}
