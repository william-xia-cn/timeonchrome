import { readQuotaReadModelV2 } from '../core/quota-read-model-v2.js';
import * as sourceStatisticsContract from '../core/shared-contracts/1.55.0/source-statistics.js';
import { readSharedAccessPolicyContext } from './shared-access-policy-reader.js';
import { readCloudSourceStatistics } from './cloud-sync.js';
import { readSourceStatisticsNativeContext, requestQuotaBucketsExchange } from './native-host-client.js';
import { budgetedLocalSet } from './storage-budget.js';

export const SOURCE_STATISTICS_SHADOW_KEY = 'source_statistics_shadow_v1';
export const SOURCE_STATISTICS_SHADOW_CACHE_KEY = 'source_statistics_shadow_cache_v1';
export const SOURCE_STATISTICS_SHADOW_ALARM = 'source_statistics_shadow_refresh';
const REFRESH_INTERVAL_MINUTES = 5;
const CACHE_MAX_AGE_MS = 8 * 86_400_000;
const OFFSET_MS = 28_800_000;
const dayAt = time => new Date(time + OFFSET_MS).toISOString().slice(0, 10);
const expected = (source, childId, range) => ({ source, childId, fromDate: range.fromDate, toDate: range.toDate });
const validSnapshot = (value, scope, now) => {
  try {
    sourceStatisticsContract.validateQuotaBucketsSnapshot(value, scope);
    return value.readAtMs <= now + 300_000 && now - value.readAtMs <= CACHE_MAX_AGE_MS;
  } catch (_) { return false; }
};
async function withTimeout(promise, timeoutMs, errorCode) {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => {
    timer = setTimeout(() => resolve({ ok: false, errorCode }), timeoutMs);
  })]); } finally { clearTimeout(timer); }
}

export function sourceStatisticsWeekRange(now = Date.now()) {
  const today = dayAt(now), midnight = Date.parse(`${today}T00:00:00+08:00`);
  const mondayOffset = (new Date(midnight + OFFSET_MS).getUTCDay() + 6) % 7;
  const fromDate = dayAt(midnight - mondayOffset * 86_400_000);
  return { fromDate, toDate: today, dates: sourceStatisticsContract.sourceStatisticsDates(fromDate, today) };
}

export async function buildWebQuotaBucketsSnapshot({ childId, fromDate, toDate, quotaModels, readAtMs = Date.now() }) {
  const dates = sourceStatisticsContract.sourceStatisticsDates(fromDate, toDate);
  if (!Array.isArray(quotaModels) || quotaModels.length !== dates.length) throw Error('source_statistics_web_unavailable');
  const days = dates.map((date, index) => {
    const model = quotaModels[index], usage = model?.usage;
    if (!model?.ok || model.date !== date || !usage) throw Error('source_statistics_web_unavailable');
    const bucketsSeconds = { study: usage.studySeconds, composite: usage.compositeSeconds, rest: usage.restSeconds };
    if (!Object.values(bucketsSeconds).every(value => Number.isSafeInteger(value) && value >= 0)) {
      throw Error('source_statistics_web_unavailable');
    }
    const complete = model.completeness?.complete === true;
    return { date, bucketsSeconds, settledThroughMs: null, complete,
      reasonCodes: complete ? [] : ['WEB_QUOTA_READ_INCOMPLETE'] };
  });
  const snapshot = { schemaVersion: 2, durationUnit: 'seconds', source: 'web', childId,
    fromDate, toDate, readAtMs, days };
  sourceStatisticsContract.validateQuotaBucketsSnapshot(snapshot, { source: 'web', childId, fromDate, toDate });
  return snapshot;
}

const status = selected => ({ origin: selected.origin, missing: !selected.snapshot,
  complete: !!selected.snapshot && selected.snapshot.days.every(day => day.complete),
  readAtMs: selected.snapshot?.readAtMs ?? null, days: selected.snapshot?.days ?? [] });

export function createSourceStatisticsShadow({ readContext = readSharedAccessPolicyContext,
  nativeContext = readSourceStatisticsNativeContext, nativeExchange = requestQuotaBucketsExchange,
  cloudRead = readCloudSourceStatistics, readModel = readQuotaReadModelV2,
  storage = chrome.storage.local, write = budgetedLocalSet, isEnabled = () => false, now = Date.now } = {}) {
  let active = true, generation = 0, busy = false, controller = null, lastRunAt = 0;
  async function cloudContext() {
    const context = await readContext();
    if (!context?.deviceToken || !context.apiBase || !context.childId || !context.scopeHash) {
      throw Error('source_statistics_identity_unavailable');
    }
    return context;
  }
  async function readCache(context, range) {
    const data = await storage.get(SOURCE_STATISTICS_SHADOW_CACHE_KEY).catch(() => ({}));
    const record = data[SOURCE_STATISTICS_SHADOW_CACHE_KEY];
    if (record?.schemaVersion !== 2 || record.childId !== context.childId || record.scopeHash !== context.scopeHash
      || record.fromDate !== range.fromDate || record.toDate !== range.toDate) return {};
    const cached = { ...record };
    for (const source of ['web', 'application']) {
      if (!validSnapshot(cached[source], expected(source, context.childId, range), now())) cached[source] = null;
    }
    return cached;
  }
  async function readWeb(context, range) {
    try {
      const quotaModels = await Promise.all(range.dates.map(date => readModel({ date, now: now() })));
      const snapshot = await buildWebQuotaBucketsSnapshot({ childId: context.childId, ...range, quotaModels, readAtMs: now() });
      return { snapshot, origin: 'local_plus_cloud_other', errorCode: null };
    } catch (_) {
      return { snapshot: null, origin: 'unavailable', errorCode: 'source_statistics_web_unavailable' };
    }
  }
  async function readApplication(context, range, web, cached, signal) {
    let native, errorCode = null;
    const attempt = { sent: false, responseReceived: false, accepted: false,
      errorCode: null, startedAtMs: now(), connectionGeneration: null };
    try { native = await nativeContext({ prepare: true, quotaBuckets: true }); }
    catch (_) { native = { ok: false, errorCode: 'source_statistics_native_unavailable' }; }
    if (native?.ok && native.childId === context.childId) {
      attempt.connectionGeneration = native.connectionGeneration;
      const result = await withTimeout(Promise.resolve().then(() => nativeExchange({ fromDate: range.fromDate,
        toDate: range.toDate, webUsage: web.snapshot, expectedContextId: native.contextId, attempt })),
      12_000, 'source_statistics_native_timeout').catch(() => ({ ok: false, errorCode: 'source_statistics_native_unavailable' }));
      const latest = await nativeContext().catch(() => null);
      if (result?.ok && validSnapshot(result.snapshot, expected('application', context.childId, range), now())
        && latest?.ok && latest.childId === context.childId && latest.contextId === native.contextId
        && latest.connectionGeneration === result.connectionGeneration) {
        attempt.accepted = true; attempt.errorCode = null;
        return { snapshot: result.snapshot, origin: 'native', nativeAttempt: { ...attempt },
          nativeConnectionGeneration: result.connectionGeneration, errorCode: null };
      }
      errorCode = result?.ok && result.snapshot === null ? 'source_statistics_application_unavailable'
        : result?.ok ? 'source_statistics_native_context_changed'
        : result?.errorCode || 'source_statistics_native_invalid_response';
    } else errorCode = native?.errorCode || 'source_statistics_native_context_unavailable';
    attempt.accepted = false; attempt.errorCode = errorCode;
    const nativeAttempt = { ...attempt };
    const response = await Promise.resolve().then(() => cloudRead({ deviceToken: context.deviceToken,
      apiBase: context.apiBase, signal }, { schemaVersion: 2, source: 'application',
      fromDate: range.fromDate, toDate: range.toDate, scope: 'all' }))
      .catch(() => ({ ok: false, errorCode: 'source_statistics_application_unavailable' }));
    if (response?.ok && validSnapshot(response.snapshot, expected('application', context.childId, range), now())) {
      return { snapshot: response.snapshot, origin: 'cloud', nativeAttempt, errorCode: null };
    }
    return { snapshot: cached.application || null,
      origin: cached.application ? 'last_known_good' : 'unavailable', nativeAttempt,
      errorCode: response?.errorCode || errorCode || 'source_statistics_application_unavailable' };
  }
  async function writeBestEffort(key, value) {
    try { await write({ [key]: value }, { priority: 'derived', source: 'source_statistics_shadow' }); } catch (_) {}
  }
  async function refresh({ force = false } = {}) {
    if (!active || !isEnabled() || busy || !force && now() - lastRunAt < REFRESH_INTERVAL_MINUTES * 60_000) {
      return { ok: false, skipped: true };
    }
    busy = true; lastRunAt = now();
    const epoch = ++generation;
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    try {
      const range = sourceStatisticsWeekRange(now()), context = await cloudContext();
      const cached = await readCache(context, range);
      const web = await readWeb(context, range);
      if (epoch !== generation || signal.aborted) return { ok: false, errorCode: 'source_statistics_context_changed' };
      const application = await readApplication(context, range, web, cached, signal);
      const latest = await cloudContext();
      if (epoch !== generation || signal.aborted || latest.childId !== context.childId
        || latest.scopeHash !== context.scopeHash || latest.apiBase !== context.apiBase) {
        return { ok: false, errorCode: 'source_statistics_context_changed' };
      }
      if (application.origin === 'native') {
        const currentNative = await nativeContext();
        if (currentNative?.connectionGeneration !== application.nativeConnectionGeneration
          || currentNative.childId !== context.childId) return { ok: false, errorCode: 'source_statistics_context_changed' };
      }
      const report = { schemaVersion: 2, scopeHash: context.scopeHash,
        status: web.snapshot && application.snapshot ? 'available' : 'incomplete',
        fromDate: range.fromDate, toDate: range.toDate, readAtMs: now(),
        nativeAttempt: application.nativeAttempt, source: { web: status(web), application: status(application) },
        webErrorCode: web.errorCode, applicationErrorCode: application.errorCode };
      await writeBestEffort(SOURCE_STATISTICS_SHADOW_CACHE_KEY, { schemaVersion: 2, childId: context.childId,
        scopeHash: context.scopeHash, fromDate: range.fromDate, toDate: range.toDate,
        web: web.snapshot, application: application.snapshot, webOrigin: web.origin, applicationOrigin: application.origin });
      await writeBestEffort(SOURCE_STATISTICS_SHADOW_KEY, report);
      return { ok: true, report };
    } catch (_) { return { ok: false, errorCode: 'source_statistics_unavailable' }; }
    finally { if (epoch === generation) { busy = false; controller = null; } }
  }
  function invalidate() {
    generation++; controller?.abort(); controller = null; busy = false; lastRunAt = 0;
  }
  async function readSources(date) {
    if (!active || !isEnabled()) return { ok: false, errorCode: 'source_statistics_disabled' };
    const epoch = generation;
    try {
      const range = sourceStatisticsWeekRange(now());
      if (date !== range.toDate) return { ok: false, errorCode: 'source_statistics_period_changed' };
      const context = await cloudContext(), cached = await readCache(context, range);
      const web = await readWeb(context, range), latest = await cloudContext();
      if (epoch !== generation || latest.scopeHash !== context.scopeHash || latest.childId !== context.childId
        || latest.apiBase !== context.apiBase || date !== dayAt(now()) || !isEnabled()) {
        return { ok: false, errorCode: 'source_statistics_context_changed' };
      }
      return { ok: true, childId: context.childId, scopeHash: context.scopeHash,
        sourceStatistics: { web: web.snapshot, application: cached.application || null },
        missingSources: [!web.snapshot ? 'web' : null, !cached.application ? 'application' : null].filter(Boolean) };
    } catch (_) { return { ok: false, errorCode: 'source_statistics_unavailable' }; }
  }
  return { refresh, readSources, invalidate, configure(value) { active = value === true; invalidate(); },
    inspect: () => ({ active, busy }) };
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
    shadow.invalidate(); run();
  });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm?.name === SOURCE_STATISTICS_SHADOW_ALARM) run(); });
  run(); return shadow;
}
export function refreshSourceStatisticsShadow(options) {
  return shadow?.refresh(options) || Promise.resolve({ ok: false, skipped: true });
}
export function readCurrentSourceStatistics(date) {
  return shadow?.readSources(date) || Promise.resolve({ ok: false, errorCode: 'source_statistics_disabled' });
}
