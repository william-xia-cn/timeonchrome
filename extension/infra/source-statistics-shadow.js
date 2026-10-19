import { readQuotaReadModelV2 } from '../core/quota-read-model-v2.js';
import { PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY, isProfileAccountShadowScopeCurrent } from '../core/profile-account-shadow-v2.js';
import * as sourceStatisticsContract from '../core/shared-contracts/1.58.0/source-statistics.js';
import { readSharedAccessPolicyContext } from './shared-access-policy-reader.js';
import { readCloudSourceStatistics } from './cloud-sync.js';
import { readSourceStatisticsNativeContext, requestQuotaBucketsExchange } from './native-host-client.js';
import { readApplicationStatisticsSourceProof } from './shared-web-reusable-binding.js';
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
function validApplicationSources(value, context, range, now) {
  try {
    sourceStatisticsContract.validateQuotaBucketsSources(value, { childId: context.childId, ...range });
    return [value.local, value.other].every(snapshot => snapshot === null
      || validSnapshot(snapshot, expected('application', context.childId, range), now)) ? value : null;
  } catch (_) { return null; }
}
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

export function buildWebSourceBreakdown({ fromDate, toDate, quotaModels, context, profileAccountCache, readAtMs = Date.now() }) {
  const dates = sourceStatisticsContract.sourceStatisticsDates(fromDate, toDate);
  const weekEnd = dayAt(Date.parse(`${fromDate}T00:00:00+08:00`) + 6 * 86_400_000);
  const amount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const buckets = (projection, complete) => projection?.byQuotaBucket && Object.fromEntries(
    ['study', 'composite', 'rest'].map(key => [key,
      Object.hasOwn(projection.byQuotaBucket, key) ? amount(projection.byQuotaBucket[key]) : complete === true ? 0 : null]));
  const cache = profileAccountCache, snapshot = cache?.current;
  const scoped = isProfileAccountShadowScopeCurrent(cache, context, fromDate, weekEnd, readAtMs, { allowExpired: true });
  const inventory = scoped ? snapshot.completeness : null;
  const listNames = ['expectedDevices', 'missingDevices', 'incompatibleDevices', 'staleDevices', 'incompleteDevices'];
  const inventoryKnown = inventory?.inventoryAvailable === true && listNames.every(key => Array.isArray(inventory[key])
    && inventory[key].every(id => typeof id === 'string' && id.length > 0)
    && new Set(inventory[key]).size === inventory[key].length);
  const accounts = scoped ? snapshot.deviceAccounts.filter(row => row?.deviceId && row.deviceId !== context.deviceId) : [];
  const otherIds = new Set([...accounts.map(row => row.deviceId), ...(inventoryKnown
    ? inventory.expectedDevices.filter(id => id !== context.deviceId) : [])]);
  const modelsMatchSnapshot = Array.isArray(quotaModels) && quotaModels.length === dates.length && quotaModels.every((model, index) =>
    model?.ok === true && model.date === dates[index] && model.weekStart === fromDate && model.weekEnd === weekEnd
    && model.otherDevices?.snapshotId === snapshot?.snapshotId);
  const none = inventoryKnown && modelsMatchSnapshot && otherIds.size === 0 && listNames.slice(1)
    .every(key => inventory[key].every(id => id === context.deviceId));
  const localDays = [], otherDays = [];
  let knownOther = false;
  for (const [index, date] of dates.entries()) {
    const model = quotaModels?.[index]?.date === date ? quotaModels[index] : null;
    const local = model?.local?.today;
    const localComplete = typeof local?.complete === 'boolean' ? local.complete : null;
    const localBuckets = buckets(local, localComplete);
    localDays.push({ date, bucketsSeconds: localBuckets || null, complete: localComplete,
      settledThroughMs: null, readAtMs, reasonCodes: localComplete === false ? ['WEB_LOCAL_DAY_INCOMPLETE'] : [] });
    const dayAccounts = accounts.filter(row => row.date === date && row.quotaProjection);
    const otherReadable = scoped && model?.ok === true && model.weekStart === fromDate && model.weekEnd === weekEnd
      && model.otherDevices?.snapshotId === snapshot.snapshotId;
    // Consume the published result. Missing devices/increments are cloud diagnostics.
    const otherComplete = otherReadable && dayAccounts.every(row => row.complete === true);
    const otherBuckets = otherReadable ? buckets(model.otherDevices.today, true) || null : null;
    knownOther ||= !!otherBuckets;
    otherDays.push({ date, bucketsSeconds: otherBuckets, complete: otherReadable ? otherComplete : null,
      settledThroughMs: null, readAtMs, reasonCodes: otherReadable && !otherComplete ? ['SOURCE_UNAVAILABLE'] : [] });
  }
  return { snapshotId: scoped ? snapshot.snapshotId : null, local: { fromDate, toDate, readAtMs, days: localDays },
    other: none ? null : { fromDate, toDate, readAtMs, days: otherDays },
    otherState: none ? 'none' : knownOther ? 'available' : 'unknown' };
}

const status = selected => ({ origin: selected.origin, missing: !selected.snapshot,
  complete: !!selected.snapshot && selected.snapshot.days.every(day => day.complete),
  readAtMs: selected.snapshot?.readAtMs ?? null, days: selected.snapshot?.days ?? [] });

export function createSourceStatisticsShadow({ readContext = readSharedAccessPolicyContext,
  nativeContext = readSourceStatisticsNativeContext, nativeExchange = requestQuotaBucketsExchange,
  readSourceProof = readApplicationStatisticsSourceProof,
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
    cached.applicationSources = cached.application && ['native', 'cloud', 'last_known_good'].includes(cached.applicationOrigin)
      ? validApplicationSources(cached.applicationSources, context, range, now()) : null;
    return cached;
  }
  async function readWeb(context, range) {
    const quotaModels = await Promise.all(range.dates.map(date => Promise.resolve()
      .then(() => readModel({ date, now: now() })).catch(() => null)));
    const data = await storage.get(PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY).catch(() => ({}));
    const webSources = buildWebSourceBreakdown({ ...range, quotaModels, context,
      profileAccountCache: data[PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY], readAtMs: now() });
    try {
      const snapshot = await buildWebQuotaBucketsSnapshot({ childId: context.childId, ...range, quotaModels, readAtMs: now() });
      return { snapshot, webSources, origin: 'local_plus_cloud_other', errorCode: null };
    } catch (_) {
      return { snapshot: null, webSources, origin: 'unavailable', errorCode: 'source_statistics_web_unavailable' };
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
        return { snapshot: result.snapshot, origin: 'native',
          applicationSources: validApplicationSources(result.applicationSources, context, range, now()), nativeAttempt: { ...attempt },
          nativeConnectionGeneration: result.connectionGeneration, errorCode: null };
      }
      errorCode = result?.ok && result.snapshot === null ? 'source_statistics_application_unavailable'
        : result?.ok ? 'source_statistics_native_context_changed'
        : result?.errorCode || 'source_statistics_native_invalid_response';
    } else errorCode = native?.errorCode || 'source_statistics_native_context_unavailable';
    attempt.accepted = false; attempt.errorCode = errorCode;
    const nativeAttempt = { ...attempt };
    // Reuse an existing current proof only; cloud fallback never initiates a bind.
    const sourceProof = await Promise.resolve().then(() => readSourceProof(context)).catch(() => null);
    const response = await Promise.resolve().then(() => cloudRead({ deviceToken: context.deviceToken,
      apiBase: context.apiBase, childId: context.childId, signal }, { schemaVersion: 2, source: 'application',
      fromDate: range.fromDate, toDate: range.toDate, scope: 'all', includeSources: true,
      ...(sourceProof ? { sourceProof } : {}) }))
      .catch(() => ({ ok: false, errorCode: 'source_statistics_application_unavailable' }));
    if (response?.ok && validSnapshot(response.snapshot, expected('application', context.childId, range), now())) {
      return { snapshot: response.snapshot, origin: 'cloud',
        applicationSources: validApplicationSources(response.applicationSources, context, range, now()), nativeAttempt, errorCode: null };
    }
    return { snapshot: cached.application || null,
      applicationSources: cached.applicationSources || null,
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
        web: web.snapshot, webSources: web.webSources, application: application.snapshot, applicationSources: application.applicationSources || null,
        webOrigin: web.origin, applicationOrigin: application.origin });
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
