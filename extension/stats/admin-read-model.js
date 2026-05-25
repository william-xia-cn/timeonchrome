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
const ANALYSIS_CATEGORY_KEYS = ['study', 'composite', 'rest', 'other'];
const MEDIA_ANALYSIS_CATEGORY_KEYS = ['foregroundAudio', 'backgroundAudio', 'foregroundVideo', 'backgroundVideo', 'pip'];
const ANALYSIS_CATEGORY_LABELS = {
  study: '学习',
  composite: '综合',
  rest: '休息',
  other: '其他',
  foregroundAudio: '前台音频',
  backgroundAudio: '后台音频',
  foregroundVideo: '前台视频',
  backgroundVideo: '后台视频',
  pip: 'PiP',
};

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

function parseAdminDateKey(key) {
  if (typeof key !== 'string') return new Date();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function startOfAdminWeek(date) {
  const dow = date.getDay() === 0 ? 6 : date.getDay() - 1;
  return addDays(date, -dow);
}

function dateKeysBetween(from, to) {
  const keys = [];
  let cursor = parseAdminDateKey(from);
  const end = parseAdminDateKey(to);
  while (cursor <= end) {
    keys.push(getAdminDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function formatAdminClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

function emptyAnalysisCategories() {
  return { study: 0, composite: 0, rest: 0, other: 0 };
}

function addBucketSecondsToCategories(categories, bucketMap = {}, secondsFallback = 0, fallbackBucket = 'other') {
  let assigned = 0;
  for (const [bucket, rawSeconds] of Object.entries(bucketMap || {})) {
    const seconds = Math.max(0, Number(rawSeconds) || 0);
    if (seconds <= 0) continue;
    if (bucket === 'study') categories.study += seconds;
    else if (bucket === 'composite' || bucket === 'pending_composite') categories.composite += seconds;
    else if (bucket === 'rest') categories.rest += seconds;
    else categories.other += seconds;
    assigned += seconds;
  }
  const fallbackSeconds = Math.max(0, Number(secondsFallback) || 0) - assigned;
  if (fallbackSeconds > 0) {
    if (fallbackBucket === 'study') categories.study += fallbackSeconds;
    else if (fallbackBucket === 'composite') categories.composite += fallbackSeconds;
    else if (fallbackBucket === 'rest') categories.rest += fallbackSeconds;
    else categories.other += fallbackSeconds;
  }
}

function classificationToCategory(classification) {
  if (classification === 'study') return 'study';
  if (classification === 'composite' || classification === 'pending_composite') return 'composite';
  if (classification === 'rest') return 'rest';
  return null;
}

function dominantCategory(categories) {
  let best = 'other';
  let bestSeconds = -1;
  for (const key of Object.keys(categories || {})) {
    const seconds = Number(categories?.[key] || 0);
    if (seconds > bestSeconds) {
      best = key;
      bestSeconds = seconds;
    }
  }
  return best;
}

function targetStatusFromStat(stat) {
  const classification = stat?.targetClassificationAtTime;
  if (classification === 'pending_composite') return '待归类';
  if (classification === 'blocked' || classification === 'restricted') return '已限制';
  return '正常';
}

function makeFallbackTargetStat(domain, ds = {}, config, storage) {
  const classification = classifyDomain(domain, config, storage);
  return {
    targetKey: `fallback:domain:${domain}`,
    managedTargetId: null,
    managedTargetType: null,
    managedTargetNamespace: null,
    managedTargetValue: null,
    managedTargetLabelAtTime: null,
    targetClassificationAtTime: classification === 'pending_composite' ? 'pending_composite' : null,
    fallbackDomain: domain,
    isFallback: true,
    activeSeconds: Math.max(0, Number(ds.activeSeconds) || 0),
    backgroundMediaSeconds: Math.max(0, Number(ds.backgroundMediaSeconds) || 0),
    pipSeconds: Math.max(0, Number(ds.pipSeconds) || 0),
    activeByQuotaBucket: ds.activeByMode || {},
    backgroundMediaByQuotaBucket: ds.backgroundMediaByMode || {},
    pipByQuotaBucket: ds.pipByMode || {},
    firstSeenAt: ds.firstSeenAt || null,
    lastSeenAt: ds.lastSeenAt || null,
  };
}

function dayTargetStats(dayStats, config, storage) {
  if (dayStats?.targets && Object.keys(dayStats.targets).length > 0) {
    return Object.entries(dayStats.targets).map(([targetKey, stat]) => ({ targetKey, ...stat }));
  }
  return Object.entries(dayStats?.domains || {}).map(([domain, ds]) => makeFallbackTargetStat(domain, ds, config, storage));
}

function mediaClassTotalSeconds(stats = {}) {
  return ['foregroundAudioSeconds', 'backgroundAudioSeconds', 'foregroundVideoSeconds', 'backgroundVideoSeconds', 'pipSeconds']
    .reduce((sum, key) => sum + Math.max(0, Number(stats?.[key]) || 0), 0);
}

function mediaDomainTotalSeconds(mediaStats = {}) {
  const directTotal = Math.max(0, Number(mediaStats?.totalSeconds) || 0) || mediaClassTotalSeconds(mediaStats);
  if (directTotal > 0) return directTotal;
  return Object.values(mediaStats?.byMode || {}).reduce((sum, modeStats) => {
    return sum + (Math.max(0, Number(modeStats?.totalSeconds) || 0) || mediaClassTotalSeconds(modeStats));
  }, 0);
}

function applyTargetStatToCategories(categories, stat) {
  const activeSeconds = Math.max(0, Number(stat?.activeSeconds) || 0);
  const fallbackCategory = classificationToCategory(stat?.targetClassificationAtTime) || 'other';
  addBucketSecondsToCategories(categories, stat?.activeByQuotaBucket || {}, activeSeconds, fallbackCategory);
}

function aggregateTargetStatsByDate(dailyStats, dateKeys, config, storage) {
  const map = new Map();
  for (const date of dateKeys) {
    const dayStats = dailyStats?.[date] || {};
    const stats = dayTargetStats(dayStats, config, storage);
    for (const stat of stats) {
      const key = stat.targetKey || stat.managedTargetId || `fallback:domain:${stat.fallbackDomain || 'unknown'}`;
      const row = map.get(key) || {
        key,
        label: stat.managedTargetLabelAtTime || stat.managedTargetValue || stat.fallbackDomain || key,
        fallbackDomain: stat.fallbackDomain || null,
        managedTargetId: stat.managedTargetId || null,
        managedTargetType: stat.managedTargetType || null,
        managedTargetNamespace: stat.managedTargetNamespace || null,
        managedTargetValue: stat.managedTargetValue || null,
        targetClassificationAtTime: stat.targetClassificationAtTime || null,
        isFallback: !!stat.isFallback,
        categories: emptyAnalysisCategories(),
        seconds: 0,
        firstSeenAt: null,
        lastSeenAt: null,
      };
      const statCategories = emptyAnalysisCategories();
      applyTargetStatToCategories(statCategories, stat);
      for (const category of ANALYSIS_CATEGORY_KEYS) row.categories[category] += statCategories[category];
      const statTotal = ANALYSIS_CATEGORY_KEYS.reduce((sum, category) => sum + statCategories[category], 0);
      row.seconds += statTotal;
      if (stat.firstSeenAt && (!row.firstSeenAt || stat.firstSeenAt < row.firstSeenAt)) row.firstSeenAt = stat.firstSeenAt;
      if (stat.lastSeenAt && (!row.lastSeenAt || stat.lastSeenAt > row.lastSeenAt)) row.lastSeenAt = stat.lastSeenAt;
      map.set(key, row);
    }
  }
  return map;
}

function targetRowsForAnalysis(dailyStats, selectedDateKey, weekDateKeys, rangeDateKeys, config, storage) {
  const todayMap = aggregateTargetStatsByDate(dailyStats, [selectedDateKey], config, storage);
  const weekMap = aggregateTargetStatsByDate(dailyStats, weekDateKeys, config, storage);
  const rangeMap = aggregateTargetStatsByDate(dailyStats, rangeDateKeys, config, storage);
  const allKeys = new Set([...todayMap.keys(), ...weekMap.keys(), ...rangeMap.keys()]);
  return [...allKeys].map((key) => {
    const range = rangeMap.get(key) || weekMap.get(key) || todayMap.get(key);
    const today = todayMap.get(key);
    const week = weekMap.get(key);
    const category = dominantCategory(range?.categories || {});
    return {
      key,
      label: range?.label || key,
      category,
      categoryLabel: ANALYSIS_CATEGORY_LABELS[category],
      todaySeconds: today?.seconds || 0,
      weekSeconds: week?.seconds || 0,
      rangeSeconds: range?.seconds || 0,
      limitLabel: '—',
      status: targetStatusFromStat(range),
      fallbackDomain: range?.fallbackDomain || null,
      managedTargetId: range?.managedTargetId || null,
      managedTargetType: range?.managedTargetType || null,
      managedTargetNamespace: range?.managedTargetNamespace || null,
      managedTargetValue: range?.managedTargetValue || null,
      targetClassificationAtTime: range?.targetClassificationAtTime || null,
      isFallback: !!range?.isFallback,
      lastSeenAt: range?.lastSeenAt || null,
      categories: range?.categories || emptyAnalysisCategories(),
    };
  }).filter(row => row.rangeSeconds > 0 || row.todaySeconds > 0 || row.weekSeconds > 0)
    .sort((a, b) => b.rangeSeconds - a.rangeSeconds || a.label.localeCompare(b.label));
}

function categoryRowsForAnalysis(categoryTotals) {
  return ANALYSIS_CATEGORY_KEYS.map((key) => ({
    key,
    label: ANALYSIS_CATEGORY_LABELS[key],
    seconds: Math.max(0, Number(categoryTotals?.[key]) || 0),
    limitLabel: key === 'composite' || key === 'rest' ? '按配额管理' : '—',
    status: '正常',
  }));
}

function dailyCategoryTotals(dayStats, config, storage) {
  const categories = emptyAnalysisCategories();
  for (const stat of dayTargetStats(dayStats || {}, config, storage)) {
    applyTargetStatToCategories(categories, stat);
  }
  return categories;
}

function buildDailySeries(dailyStats, dateKeys, config, storage) {
  return dateKeys.map((date) => ({
    key: date,
    label: date.slice(5),
    categories: dailyCategoryTotals(dailyStats?.[date], config, storage),
  }));
}

function buildHourlySeries(hourlyStats, dateKey, config, storage) {
  const rows = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourKeyPrefix = `${dateKey}T${String(hour).padStart(2, '0')}`;
    const entry = Object.entries(hourlyStats || {}).find(([hourKey, hs]) =>
      hourKey.startsWith(hourKeyPrefix) || (hs?.date === dateKey && Number(hs?.hour) === hour)
    );
    rows.push({
      key: `${dateKey}-${hour}`,
      hour,
      label: `${hour}时`,
      categories: dailyCategoryTotals(entry?.[1], config, storage),
    });
  }
  return rows;
}

function sumSeriesCategories(series) {
  const keys = Array.from(new Set((series || []).flatMap((row) => Object.keys(row.categories || {}))));
  const totals = {};
  for (const key of keys) totals[key] = 0;
  for (const row of series || []) {
    for (const key of keys) totals[key] += Math.max(0, Number(row.categories?.[key]) || 0);
  }
  return totals;
}

function buildUsageAnalysisView(storage, config, options = {}) {
  const dailyStats = storage[DAILY_USAGE_STATS_KEY] || {};
  const hourlyStats = storage[HOURLY_USAGE_STATS_KEY] || {};
  const anchor = options.date ? parseAdminDateKey(options.date) : new Date();
  const mode = options.mode === 'week' ? 'week' : 'day';
  const selectedDateKey = getAdminDateKey(anchor);
  const weekStart = startOfAdminWeek(anchor);
  const weekEnd = addDays(weekStart, 6);
  const weekDateKeys = dateKeysBetween(getAdminDateKey(weekStart), getAdminDateKey(weekEnd));
  const rangeDateKeys = mode === 'week' ? weekDateKeys : [selectedDateKey];
  const chartSeries = mode === 'week'
    ? buildDailySeries(dailyStats, weekDateKeys, config, storage)
    : buildHourlySeries(hourlyStats, selectedDateKey, config, storage);
  const totalSeries = buildDailySeries(dailyStats, rangeDateKeys, config, storage);
  const categoryTotals = sumSeriesCategories(totalSeries);
  const targetRows = targetRowsForAnalysis(dailyStats, selectedDateKey, weekDateKeys, rangeDateKeys, config, storage);
  const pendingRows = targetRows.filter(row => row.status === '待归类');
  const range = mode === 'week'
    ? { mode, from: getAdminDateKey(weekStart), to: getAdminDateKey(weekEnd), label: `${getAdminDateKey(weekStart).slice(5)} — ${getAdminDateKey(weekEnd).slice(5)}` }
    : { mode, from: selectedDateKey, to: selectedDateKey, label: selectedDateKey };
  return {
    meta: {
      source: 'chrome.storage.local',
      readOnly: true,
      updatedAt: Date.now(),
      syncLabel: `本机数据：今天 ${formatAdminClock()}`,
      deviceScope: {
        selected: 'local',
        label: '这台电脑',
        options: [{ id: 'local', label: '这台电脑' }],
      },
    },
    kind: 'web',
    categoryKeys: ANALYSIS_CATEGORY_KEYS,
    totalLabel: '网页使用时间',
    targetColumnLabel: '管理对象',
    categoryColumnLabel: '分类',
    searchTargetPlaceholder: '搜索管理对象',
    range,
    totalSeconds: ANALYSIS_CATEGORY_KEYS.reduce((sum, key) => sum + categoryTotals[key], 0),
    categoryTotals,
    chartSeries,
    weekSummarySeries: buildDailySeries(dailyStats, weekDateKeys, config, storage),
    targetRows,
    categoryRows: categoryRowsForAnalysis(categoryTotals),
    pendingRows,
  };
}

function emptyMediaAnalysisCategories() {
  return { foregroundAudio: 0, backgroundAudio: 0, foregroundVideo: 0, backgroundVideo: 0, pip: 0 };
}

function applyMediaStatsToCategories(categories, mediaStats = {}) {
  const direct = {
    foregroundAudio: Math.max(0, Number(mediaStats?.foregroundAudioSeconds) || 0),
    backgroundAudio: Math.max(0, Number(mediaStats?.backgroundAudioSeconds) || 0),
    foregroundVideo: Math.max(0, Number(mediaStats?.foregroundVideoSeconds) || 0),
    backgroundVideo: Math.max(0, Number(mediaStats?.backgroundVideoSeconds) || 0),
    pip: Math.max(0, Number(mediaStats?.pipSeconds) || 0),
  };
  const directTotal = MEDIA_ANALYSIS_CATEGORY_KEYS.reduce((sum, key) => sum + direct[key], 0);
  if (directTotal > 0) {
    for (const key of MEDIA_ANALYSIS_CATEGORY_KEYS) categories[key] += direct[key];
    return;
  }
  for (const modeStats of Object.values(mediaStats?.byMode || {})) {
    applyMediaStatsToCategories(categories, modeStats);
  }
}

function dayMediaCategoryTotals(dayMediaStats = {}) {
  const categories = emptyMediaAnalysisCategories();
  for (const mediaStats of Object.values(dayMediaStats?.domains || {})) {
    applyMediaStatsToCategories(categories, mediaStats);
  }
  return categories;
}

function buildMediaDailySeries(dailyMediaStats, dateKeys) {
  return dateKeys.map((date) => ({
    key: date,
    label: date.slice(5),
    categories: dayMediaCategoryTotals(dailyMediaStats?.[date]),
  }));
}

function buildMediaHourlySeries(hourlyMediaStats, dateKey) {
  const rows = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourKeyPrefix = `${dateKey}T${String(hour).padStart(2, '0')}`;
    const entry = Object.entries(hourlyMediaStats || {}).find(([hourKey, hs]) =>
      hourKey.startsWith(hourKeyPrefix) || (hs?.date === dateKey && Number(hs?.hour) === hour)
    );
    rows.push({
      key: `${dateKey}-${hour}`,
      hour,
      label: `${hour}时`,
      categories: dayMediaCategoryTotals(entry?.[1]),
    });
  }
  return rows;
}

function aggregateMediaStatsByDate(dailyMediaStats, dateKeys) {
  const map = new Map();
  for (const date of dateKeys) {
    for (const [domain, mediaStats] of Object.entries(dailyMediaStats?.[date]?.domains || {})) {
      const key = `media:domain:${domain}`;
      const row = map.get(key) || {
        key,
        label: domain,
        fallbackDomain: domain,
        managedTargetType: 'media',
        managedTargetNamespace: null,
        managedTargetValue: domain,
        isFallback: true,
        categories: emptyMediaAnalysisCategories(),
        seconds: 0,
        firstSeenAt: null,
        lastSeenAt: null,
      };
      const statCategories = emptyMediaAnalysisCategories();
      applyMediaStatsToCategories(statCategories, mediaStats);
      for (const category of MEDIA_ANALYSIS_CATEGORY_KEYS) row.categories[category] += statCategories[category];
      const statTotal = MEDIA_ANALYSIS_CATEGORY_KEYS.reduce((sum, category) => sum + statCategories[category], 0);
      row.seconds += statTotal;
      if (mediaStats.firstSeenAt && (!row.firstSeenAt || mediaStats.firstSeenAt < row.firstSeenAt)) row.firstSeenAt = mediaStats.firstSeenAt;
      if (mediaStats.lastSeenAt && (!row.lastSeenAt || mediaStats.lastSeenAt > row.lastSeenAt)) row.lastSeenAt = mediaStats.lastSeenAt;
      map.set(key, row);
    }
  }
  return map;
}

function mediaRowsForAnalysis(dailyMediaStats, selectedDateKey, weekDateKeys, rangeDateKeys) {
  const todayMap = aggregateMediaStatsByDate(dailyMediaStats, [selectedDateKey]);
  const weekMap = aggregateMediaStatsByDate(dailyMediaStats, weekDateKeys);
  const rangeMap = aggregateMediaStatsByDate(dailyMediaStats, rangeDateKeys);
  const allKeys = new Set([...todayMap.keys(), ...weekMap.keys(), ...rangeMap.keys()]);
  return [...allKeys].map((key) => {
    const range = rangeMap.get(key) || weekMap.get(key) || todayMap.get(key);
    const today = todayMap.get(key);
    const week = weekMap.get(key);
    const category = dominantCategory(range?.categories || {});
    return {
      key,
      label: range?.label || key,
      category,
      categoryLabel: ANALYSIS_CATEGORY_LABELS[category],
      todaySeconds: today?.seconds || 0,
      weekSeconds: week?.seconds || 0,
      rangeSeconds: range?.seconds || 0,
      limitLabel: '—',
      status: '正常',
      fallbackDomain: range?.fallbackDomain || null,
      managedTargetType: 'media',
      isFallback: true,
      lastSeenAt: range?.lastSeenAt || null,
      categories: range?.categories || emptyMediaAnalysisCategories(),
    };
  }).filter(row => row.rangeSeconds > 0 || row.todaySeconds > 0 || row.weekSeconds > 0)
    .sort((a, b) => b.rangeSeconds - a.rangeSeconds || a.label.localeCompare(b.label));
}

function mediaCategoryRowsForAnalysis(categoryTotals) {
  return MEDIA_ANALYSIS_CATEGORY_KEYS.map((key) => ({
    key,
    label: ANALYSIS_CATEGORY_LABELS[key],
    seconds: Math.max(0, Number(categoryTotals?.[key]) || 0),
    limitLabel: '—',
    status: '正常',
  }));
}

function buildMediaUsageAnalysisView(storage, options = {}) {
  const dailyMediaStats = storage[DAILY_MEDIA_STATS_KEY] || {};
  const hourlyMediaStats = storage[HOURLY_MEDIA_STATS_KEY] || {};
  const anchor = options.date ? parseAdminDateKey(options.date) : new Date();
  const mode = options.mode === 'week' ? 'week' : 'day';
  const selectedDateKey = getAdminDateKey(anchor);
  const weekStart = startOfAdminWeek(anchor);
  const weekEnd = addDays(weekStart, 6);
  const weekDateKeys = dateKeysBetween(getAdminDateKey(weekStart), getAdminDateKey(weekEnd));
  const rangeDateKeys = mode === 'week' ? weekDateKeys : [selectedDateKey];
  const chartSeries = mode === 'week'
    ? buildMediaDailySeries(dailyMediaStats, weekDateKeys)
    : buildMediaHourlySeries(hourlyMediaStats, selectedDateKey);
  const totalSeries = buildMediaDailySeries(dailyMediaStats, rangeDateKeys);
  const categoryTotals = sumSeriesCategories(totalSeries);
  const targetRows = mediaRowsForAnalysis(dailyMediaStats, selectedDateKey, weekDateKeys, rangeDateKeys);
  const range = mode === 'week'
    ? { mode, from: getAdminDateKey(weekStart), to: getAdminDateKey(weekEnd), label: `${getAdminDateKey(weekStart).slice(5)} — ${getAdminDateKey(weekEnd).slice(5)}` }
    : { mode, from: selectedDateKey, to: selectedDateKey, label: selectedDateKey };
  return {
    meta: {
      source: 'chrome.storage.local',
      readOnly: true,
      updatedAt: Date.now(),
      syncLabel: `本机数据：今天 ${formatAdminClock()}`,
      deviceScope: {
        selected: 'local',
        label: '这台电脑',
        options: [{ id: 'local', label: '这台电脑' }],
      },
    },
    kind: 'media',
    categoryKeys: MEDIA_ANALYSIS_CATEGORY_KEYS,
    totalLabel: '媒体使用时间',
    targetColumnLabel: '媒体来源',
    categoryColumnLabel: '媒体类型',
    searchTargetPlaceholder: '搜索媒体来源',
    range,
    totalSeconds: MEDIA_ANALYSIS_CATEGORY_KEYS.reduce((sum, key) => sum + categoryTotals[key], 0),
    categoryTotals,
    chartSeries,
    weekSummarySeries: buildMediaDailySeries(dailyMediaStats, weekDateKeys),
    targetRows,
    categoryRows: mediaCategoryRowsForAnalysis(categoryTotals),
    pendingRows: [],
  };
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

export async function getAdminUsageAnalysisView(options = {}) {
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
  const analysisView = buildUsageAnalysisView(storage, config, options);
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
    ...analysisView,
    legacy: {
      todayRangeData,
      weekRangeData,
      todayData,
      weekData,
      todayOverview,
      weekOverview,
    },
  };
}

export async function getAdminMediaUsageAnalysisView(options = {}) {
  const storage = await readAdminStatsStorage();
  return {
    ok: true,
    source: 'admin_read_model',
    ...buildMediaUsageAnalysisView(storage, options),
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
