import { getEffectiveQuotaForDate } from '../core/quota-config.js';
import { readQuotaReadModelV2 } from '../core/quota-read-model-v2.js';
import { combineOwnAndOtherStatistics, projectSharedQuotaSeconds, sourceStatisticsDates, validateSourceStatisticsSnapshot } from '../core/shared-contracts/1.39.1/source-statistics.js';
import { readSharedAccessPolicyContext } from './shared-access-policy-reader.js';
import { readCloudSourceStatistics } from './cloud-sync.js';
import { readSourceStatisticsNativeContext, requestSourceStatisticsExchange } from './native-host-client.js';
import { getConfig } from './storage.js';
import { budgetedLocalSet } from './storage-budget.js';

export const SOURCE_STATISTICS_SHADOW_KEY = 'source_statistics_shadow_v1';
export const SOURCE_STATISTICS_SHADOW_CACHE_KEY = 'source_statistics_shadow_cache_v1';
export const SOURCE_STATISTICS_SHADOW_ALARM = 'source_statistics_shadow_refresh';
const REFRESH_INTERVAL_MINUTES = 5;
const CACHE_MAX_AGE_MS = 8 * 86_400_000;
const OFFSET_MS = 8 * 60 * 60 * 1000;
const sha256 = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const dayAt = time => new Date(time + OFFSET_MS).toISOString().slice(0, 10);
const isSnapshot = (value, expected) => {
  try { validateSourceStatisticsSnapshot(value, expected); return true; } catch (_) { return false; }
};
async function withTimeout(promise, timeoutMs, errorCode) {
  let timer;
  try { return await Promise.race([Promise.resolve(promise), new Promise(resolve => {
    timer = setTimeout(() => resolve({ ok: false, errorCode }), timeoutMs);
  })]); } finally { clearTimeout(timer); }
}

export function sourceStatisticsWeekRange(now = Date.now()) {
  const today = dayAt(now);
  const beijingMidnight = Date.parse(`${today}T00:00:00+08:00`);
  const mondayOffset = (new Date(beijingMidnight + OFFSET_MS).getUTCDay() + 6) % 7;
  const fromDate = dayAt(beijingMidnight - mondayOffset * 86_400_000);
  return { fromDate, toDate: today, dates: sourceStatisticsDates(fromDate, today) };
}

function dayProjection(model, date) {
  const local = model?.local?.today;
  if (!model?.ok || model.date !== date || !local) return null;
  const buckets = local.byQuotaBucket || {};
  const values = [local.onlineSeconds, buckets.study ?? 0, buckets.composite ?? 0, buckets.rest ?? 0];
  const usable = values.every(value => Number.isSafeInteger(value) && value >= 0);
  const complete = local.complete === true && usable;
  const reasonCodes = complete ? [] : [...new Set([
    ...(local.complete === true ? [] : ['WEB_LOCAL_DAY_INCOMPLETE']),
    ...(!usable ? ['WEB_QUOTA_READ_UNAVAILABLE'] : []),
  ])].sort();
  return {
    date,
    totalSeconds: usable ? local.onlineSeconds : null,
    categoriesSeconds: usable ? { study: buckets.study ?? 0, composite: buckets.composite ?? 0, rest: buckets.rest ?? 0 } : {},
    settledThroughMs: null,
    complete,
    reasonCodes: usable ? reasonCodes : [...new Set([...reasonCodes, 'WEB_QUOTA_READ_UNAVAILABLE'])].sort(),
  };
}

export async function buildLocalWebSourceSnapshot({ childId, fromDate, toDate, quotaModels, ownSourceKeys, readAtMs = Date.now() }) {
  const dates = sourceStatisticsDates(fromDate, toDate);
  if (typeof childId !== 'string' || !childId || !Array.isArray(quotaModels) || quotaModels.length !== dates.length
    || !Array.isArray(ownSourceKeys)) {
    throw new Error('SOURCE_STATISTICS_WEB_CONTEXT_INVALID');
  }
  const includedSourceKeys = [...new Set(ownSourceKeys)].sort();
  if (includedSourceKeys.length !== ownSourceKeys.length || !includedSourceKeys.length)
    throw new Error('SOURCE_STATISTICS_WEB_IDENTITY_INCOMPLETE');
  const days = dates.map((date, index) => dayProjection(quotaModels[index], date)
    || { date, totalSeconds: null, categoriesSeconds: {}, settledThroughMs: null, complete: false, reasonCodes: ['WEB_QUOTA_READ_UNAVAILABLE'] });
  const revision = await sha256(JSON.stringify({ childId, fromDate, toDate, includedSourceKeys, days }));
  const snapshot = { schemaVersion: 1, durationUnit: 'seconds', source: 'web', childId, fromDate, toDate,
    revision, readAtMs, includedSourceKeys, excludedSourceKeys: [], days };
  validateSourceStatisticsSnapshot(snapshot, { source: 'web', childId, fromDate, toDate });
  return snapshot;
}

function expected(source, childId, range) {
  return { source, childId, fromDate: range.fromDate, toDate: range.toDate };
}

function sameKeys(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const left = [...a].sort(), right = [...b].sort();
  return left.every((key, index) => key === right[index]);
}

async function mergeLastGoodDays(fresh, lastGood, source, childId, range, now, freshOrigin, lastGoodOrigin, lastGoodMeta = {}) {
  if (!fresh) return lastGood && isSnapshot(lastGood, expected(source, childId, range))
    ? { snapshot: lastGood, origin: lastGoodOrigin, stale: true,
      dayOrigins: Object.fromEntries(lastGood.days.map(day => [day.date,
        { ...(lastGoodMeta[day.date] || {}), sourceOrigin: lastGoodMeta[day.date]?.sourceOrigin
          || lastGoodMeta[day.date]?.origin || lastGoodOrigin,
        origin: lastGoodOrigin, readAtMs: lastGoodMeta[day.date]?.readAtMs ?? lastGood.readAtMs }])) }
    : { snapshot: null, origin: 'unavailable', stale: false, dayOrigins: {} };
  if (!lastGood || !isSnapshot(lastGood, expected(source, childId, range))
    || !sameKeys(fresh.includedSourceKeys, lastGood.includedSourceKeys)
    || !sameKeys(fresh.excludedSourceKeys, lastGood.excludedSourceKeys)) {
    return { snapshot: fresh, origin: freshOrigin, stale: false,
      dayOrigins: Object.fromEntries(fresh.days.map(day => [day.date, { origin: freshOrigin, readAtMs: fresh.readAtMs }])) };
  }
  let substituted = false;
  const dayOrigins = {};
  const days = fresh.days.map((day, index) => {
    if (day.totalSeconds === null && lastGood.days[index]?.totalSeconds !== null) {
      substituted = true;
    dayOrigins[day.date] = { ...(lastGoodMeta[day.date] || {}),
      sourceOrigin: lastGoodMeta[day.date]?.sourceOrigin || lastGoodMeta[day.date]?.origin || lastGoodOrigin,
      origin: lastGoodOrigin, readAtMs: lastGoodMeta[day.date]?.readAtMs ?? lastGood.readAtMs };
      return lastGood.days[index];
    }
    dayOrigins[day.date] = { origin: freshOrigin, readAtMs: fresh.readAtMs };
    return day;
  });
  if (!substituted) return { snapshot: fresh, origin: freshOrigin, stale: false, dayOrigins };
  const revision = await sha256(JSON.stringify({ fresh: fresh.revision, lastGood: lastGood.revision, days }));
  const snapshot = { ...fresh, revision, readAtMs: Math.max(now, fresh.readAtMs, lastGood.readAtMs), days };
  validateSourceStatisticsSnapshot(snapshot, expected(source, childId, range));
  return { snapshot, origin: 'fresh_with_last_known_good_days', stale: true, dayOrigins };
}

function singleDay(snapshot, date) {
  if (!snapshot) return null;
  const day = snapshot.days.find(item => item.date === date);
  if (!day) return null;
  return { ...snapshot, fromDate: date, toDate: date, revision: `${snapshot.revision}:${date}`, days: [day] };
}

function policyForDate(config, date) {
  const quota = getEffectiveQuotaForDate(config, date);
  return { schemaVersion: 1, dailyMinutes: Object.fromEntries(Object.entries(quota.daily).map(([weekday, limits]) => [weekday, {
    study: limits.studyMinutes, composite: limits.compositeMinutes, rest: limits.restMinutes,
  }])) };
}

function projectDays(web, application, config, dates) {
  return dates.map(date => {
    try { return projectSharedQuotaSeconds(policyForDate(config, date), date,
      singleDay(web?.snapshot, date), singleDay(application?.snapshot, date)); }
    catch (_) { return null; }
  });
}

function sourceStatus(selected) {
  if (!selected?.snapshot) return { origin: 'unavailable', complete: false, readAtMs: null, days: [] };
  const snapshot = selected.snapshot;
  return { origin: selected.origin, complete: snapshot.days.every(day => day.complete), readAtMs: snapshot.readAtMs,
    stale: selected.stale === true,
    days: snapshot.days.map(day => ({ date: day.date, totalSeconds: day.totalSeconds,
      categoriesSeconds: day.categoriesSeconds, complete: day.complete, reasonCodes: day.reasonCodes,
      settledThroughMs: day.settledThroughMs, origin: selected.dayOrigins?.[day.date]?.origin || selected.origin,
      readAtMs: selected.dayOrigins?.[day.date]?.readAtMs ?? snapshot.readAtMs,
      localReadAtMs: selected.dayOrigins?.[day.date]?.localReadAtMs ?? null,
      cloudReadAtMs: selected.dayOrigins?.[day.date]?.cloudReadAtMs ?? null,
      cloudOrigin: selected.dayOrigins?.[day.date]?.cloudOrigin ?? null })) };
}

export function createSourceStatisticsShadow({ readContext, nativeContext, nativeExchange, cloudRead,
  readModel, readConfiguration, storage, write, isEnabled = () => true, now = Date.now } = {}) {
  let active = true, generation = 0, busy = false, controller = null, lastRunAt = 0;
  let getContext = readContext;
  if (!getContext) getContext = readSharedAccessPolicyContext;
  nativeContext ||= readSourceStatisticsNativeContext;
  nativeExchange ||= requestSourceStatisticsExchange;
  cloudRead ||= readCloudSourceStatistics;
  readModel ||= readQuotaReadModelV2;
  readConfiguration ||= getConfig;
  storage ||= chrome.storage.local;
  write ||= budgetedLocalSet;

  async function currentContext() {
    const [cloud, native] = await Promise.all([getContext(), nativeContext()]);
    if (!cloud?.deviceToken || !cloud?.apiBase || !cloud?.childId || !cloud?.scopeHash)
      throw Error('source_statistics_identity_unavailable');
    return { cloud, native: native?.ok ? native : null };
  }

  async function readCache(childId, scopeHash, range) {
    const record = (await storage.get(SOURCE_STATISTICS_SHADOW_CACHE_KEY))[SOURCE_STATISTICS_SHADOW_CACHE_KEY];
    if (!record || record.schemaVersion !== 1 || record.childId !== childId || record.scopeHash !== scopeHash
      || record.fromDate !== range.fromDate || record.toDate !== range.toDate) return null;
    const freshEnough = snapshot => isSnapshot(snapshot, expected(snapshot?.source, childId, range))
      && now() - snapshot.readAtMs <= CACHE_MAX_AGE_MS;
    return { ...record,
      web: freshEnough(record.web) ? record.web : null,
      webOther: freshEnough(record.webOther) ? record.webOther : null,
      application: freshEnough(record.application) ? record.application : null };
  }

  async function readQuotaModels(range, epoch, signal) {
    const models = await Promise.all(range.dates.map(date => readModel({ date, now: now() })));
    return epoch === generation && !signal.aborted ? models : null;
  }

  async function fetchWeb(range, context, cached, epoch, signal) {
    const [otherResult, models] = await Promise.all([
      cloudRead({ deviceToken: context.cloud.deviceToken, apiBase: context.cloud.apiBase, signal },
        { source: 'web', fromDate: range.fromDate, toDate: range.toDate, scope: 'other' }),
      readQuotaModels(range, epoch, signal),
    ]);
    if (!models || epoch !== generation || signal.aborted) return { selected: null, nativeSnapshot: null, otherSnapshot: null, errorCode: 'source_statistics_context_changed' };
    const otherFresh = otherResult?.ok && isSnapshot(otherResult.snapshot, expected('web', context.cloud.childId, range));
    const otherSelected = await mergeLastGoodDays(otherFresh ? otherResult.snapshot : null, cached?.webOther,
      'web', context.cloud.childId, range, now(), 'cloud_other', 'last_known_good', cached?.webOtherDayOrigins);
    const otherSnapshot = otherSelected.snapshot;
    const ownSourceKeys = otherSnapshot?.excludedSourceKeys || [];
    if (!otherSnapshot || !ownSourceKeys.length) return { selected: null, nativeSnapshot: null,
      otherSnapshot: otherSnapshot || null, otherSelected,
      errorCode: otherResult?.ok ? 'source_statistics_web_identity_unavailable'
        : otherResult?.errorCode || 'source_statistics_web_identity_unavailable' };
    try {
      const local = await buildLocalWebSourceSnapshot({ childId: context.cloud.childId, fromDate: range.fromDate,
        toDate: range.toDate, quotaModels: models, ownSourceKeys, readAtMs: now() });
      const snapshot = await combineOwnAndOtherStatistics(local, otherSnapshot);
      const dayOrigins = Object.fromEntries(snapshot.days.map(day => [day.date, {
        origin: otherSelected.dayOrigins?.[day.date]?.origin || 'cloud_other',
        readAtMs: Math.max(local.readAtMs, otherSelected.dayOrigins?.[day.date]?.readAtMs || otherSnapshot.readAtMs),
        localReadAtMs: local.readAtMs,
        cloudReadAtMs: otherSelected.dayOrigins?.[day.date]?.readAtMs || otherSnapshot.readAtMs,
        cloudOrigin: otherSelected.dayOrigins?.[day.date]?.origin || 'cloud_other',
      }]));
      const selected = { snapshot, origin: 'local_plus_cloud_other', stale: otherSelected.stale,
        dayOrigins, localSnapshot: local, otherSnapshot };
      return { selected, nativeSnapshot: snapshot, otherSnapshot, otherSelected,
        errorCode: otherFresh ? null : otherResult?.errorCode || null };
    } catch (_) { return { selected: null, nativeSnapshot: null, otherSnapshot, otherSelected, errorCode: 'source_statistics_web_unavailable' }; }
  }

  async function fetchApplication(range, context, web, cached, epoch, signal) {
    let fresh = null, origin = null, errorCode = null, nativeConnectionGeneration = null;
    if (context.native) {
      const result = await withTimeout(Promise.resolve().then(() => nativeExchange({ fromDate: range.fromDate,
        toDate: range.toDate, webStatistics: web?.nativeSnapshot || null })), 12_000,
      'source_statistics_native_timeout').catch(() => ({ ok: false, errorCode: 'source_statistics_native_unavailable' }));
      if (epoch !== generation || signal.aborted) return { selected: null, errorCode: 'source_statistics_context_changed' };
      if (result?.ok && isSnapshot(result.snapshot, expected('application', context.cloud.childId, range))) {
        const currentNative = await nativeContext();
        if (currentNative?.ok && currentNative.connectionGeneration === result.connectionGeneration) {
          fresh = result.snapshot;
          origin = 'native';
          nativeConnectionGeneration = result.connectionGeneration;
        }
      } else errorCode = result?.errorCode || 'source_statistics_native_unavailable';
    }
    if (!fresh) {
      const response = await cloudRead({ deviceToken: context.cloud.deviceToken, apiBase: context.cloud.apiBase, signal },
        { source: 'application', fromDate: range.fromDate, toDate: range.toDate, scope: 'all' });
      if (epoch !== generation || signal.aborted) return { selected: null, errorCode: 'source_statistics_context_changed' };
      if (response?.ok && isSnapshot(response.snapshot, expected('application', context.cloud.childId, range))) {
        fresh = response.snapshot;
        origin = 'cloud';
        errorCode = null;
      } else errorCode = response?.errorCode || errorCode || 'source_statistics_application_unavailable';
    }
    const selected = await mergeLastGoodDays(fresh, cached?.application, 'application', context.cloud.childId,
      range, now(), origin || 'unavailable', cached?.applicationOrigin || 'last_known_good', cached?.applicationDayOrigins);
    if (origin === 'native' && selected.snapshot) selected.nativeContextGeneration = nativeConnectionGeneration;
    return { selected, errorCode };
  }

  async function writeBestEffort(key, value) {
    try { await write({ [key]: value }, { priority: 'derived', source: 'source_statistics_shadow' }); } catch (_) {}
  }

  async function refresh({ force = false } = {}) {
    if (!active || !isEnabled() || busy || !force && now() - lastRunAt < REFRESH_INTERVAL_MINUTES * 60_000)
      return { ok: false, skipped: true };
    busy = true;
    lastRunAt = now();
    const epoch = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    try {
      const range = sourceStatisticsWeekRange(now());
      const context = await currentContext();
      const cached = await readCache(context.cloud.childId, context.cloud.scopeHash, range);
      const [web, config] = await Promise.all([fetchWeb(range, context, cached, epoch, signal), readConfiguration()]);
      if (epoch !== generation || signal.aborted) return { ok: false, errorCode: 'source_statistics_context_changed' };
      const application = await fetchApplication(range, context, web, cached, epoch, signal);
      if (epoch !== generation || signal.aborted) return { ok: false, errorCode: 'source_statistics_context_changed' };
      const [latestContext, latestNative] = await Promise.all([getContext(), nativeContext()]);
      if (!latestContext || latestContext.childId !== context.cloud.childId || latestContext.scopeHash !== context.cloud.scopeHash
        || latestContext.apiBase !== context.cloud.apiBase) return { ok: false, errorCode: 'source_statistics_context_changed' };
      if (!application.selected?.stale && application.selected?.origin === 'native'
        && latestNative?.connectionGeneration !== application.selected.nativeContextGeneration) {
        return { ok: false, errorCode: 'source_statistics_context_changed' };
      }
      const webSelected = web.selected?.snapshot ? web.selected : cached?.web ? {
        snapshot: cached.web, origin: 'last_known_good', stale: true,
        dayOrigins: cached.webDayOrigins || Object.fromEntries(cached.web.days.map(day => [day.date, { origin: 'last_known_good', readAtMs: cached.web.readAtMs }])),
      } : web.selected;
      const applicationSelected = application.selected?.snapshot ? application.selected : cached?.application ? {
        snapshot: cached.application, origin: 'last_known_good', stale: true,
        dayOrigins: cached.applicationDayOrigins || Object.fromEntries(cached.application.days.map(day => [day.date, { origin: 'last_known_good', readAtMs: cached.application.readAtMs }])),
      } : application.selected;
      const projected = projectDays(webSelected, applicationSelected, config, range.dates);
      const projectedAvailable = projected.map((day, index) => ({ date: range.dates[index], complete: day?.complete === true,
        reasonCodes: day?.reasonCodes || ['SOURCE_UNAVAILABLE'], usedSeconds: day?.usedSeconds || null,
        remainingSeconds: day?.remainingSeconds || null, borrowedRestSeconds: day?.borrowedRestSeconds ?? null }));
      const weeklyComplete = projected.length > 0 && projected.every(day => day?.complete === true);
      const weeklyRestSeconds = weeklyComplete ? projected.reduce((sum, day) => sum + day.usedSeconds.rest, 0) : null;
      const weeklyLimitMinutes = getEffectiveQuotaForDate(config, range.toDate).todayEffectiveQuota.weeklyRestMinutes;
      const report = { schemaVersion: 1, status: webSelected?.snapshot && applicationSelected?.snapshot ? 'available' : 'incomplete',
        fromDate: range.fromDate, toDate: range.toDate, readAtMs: now(),
        source: { web: sourceStatus(webSelected), application: sourceStatus(applicationSelected) },
        webErrorCode: web.errorCode, applicationErrorCode: application.errorCode,
        daily: projectedAvailable,
        weeklyRestSeconds, weeklyRestLimitSeconds: weeklyLimitMinutes === null ? null : weeklyLimitMinutes * 60,
        weeklyRemainingSeconds: weeklyRestSeconds === null || weeklyLimitMinutes === null ? null : Math.max(0, weeklyLimitMinutes * 60 - weeklyRestSeconds),
        weeklyComplete };
      if (epoch !== generation || signal.aborted) return { ok: false, errorCode: 'source_statistics_context_changed' };
      await writeBestEffort(SOURCE_STATISTICS_SHADOW_KEY, report);
      if (webSelected?.snapshot || applicationSelected?.snapshot) {
        const next = { schemaVersion: 1, childId: context.cloud.childId, scopeHash: context.cloud.scopeHash,
          fromDate: range.fromDate, toDate: range.toDate,
          web: webSelected?.snapshot || cached?.web || null,
          webOther: web.otherSnapshot || cached?.webOther || null,
          webOtherDayOrigins: web.otherSelected?.dayOrigins || cached?.webOtherDayOrigins || null,
          application: applicationSelected?.snapshot || cached?.application || null,
          applicationOrigin: applicationSelected?.origin || cached?.applicationOrigin || 'unavailable',
          webDayOrigins: webSelected?.dayOrigins || cached?.webDayOrigins || null,
          applicationDayOrigins: applicationSelected?.dayOrigins || cached?.applicationDayOrigins || null };
        await writeBestEffort(SOURCE_STATISTICS_SHADOW_CACHE_KEY, next);
      }
      return { ok: true, report };
    } catch (error) {
      if (epoch !== generation) return { ok: false, errorCode: 'source_statistics_context_changed' };
      const report = { schemaVersion: 1, status: 'unavailable', readAtMs: now(),
        errorCode: error?.message || 'source_statistics_unavailable', daily: [], weeklyRestSeconds: null,
        weeklyRemainingSeconds: null, weeklyComplete: false };
      await writeBestEffort(SOURCE_STATISTICS_SHADOW_KEY, report);
      return { ok: false, errorCode: report.errorCode };
    } finally { if (epoch === generation) { busy = false; controller = null; } }
  }

  function invalidate() {
    generation++;
    controller?.abort();
    controller = null;
    busy = false;
    lastRunAt = 0;
  }
  return { refresh, invalidate, configure(value) { active = value === true; invalidate(); }, inspect: () => ({ active, busy }) };
}

let shadow = null;
export function initSourceStatisticsShadow({ isEnabled = () => false } = {}) {
  if (shadow) return shadow;
  shadow = createSourceStatisticsShadow({ isEnabled });
  chrome.alarms.create(SOURCE_STATISTICS_SHADOW_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  const run = () => { void shadow.refresh().catch(() => {}); };
  chrome.runtime.onStartup.addListener(run);
  chrome.runtime.onInstalled.addListener(run);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !['cloud_profile_id', 'cloud_device_id', 'cloud_device_token'].some(key => Object.hasOwn(changes, key))) return;
    shadow.invalidate();
    run();
  });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm?.name === SOURCE_STATISTICS_SHADOW_ALARM) run(); });
  run();
  return shadow;
}

export function refreshSourceStatisticsShadow(options) {
  return shadow?.refresh(options) || Promise.resolve({ ok: false, skipped: true });
}
