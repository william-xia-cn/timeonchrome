import { validateApplicationIdentityUsageQuery, validateApplicationIdentityUsageSnapshot } from '../core/shared-contracts/1.43.0/application-usage-seconds.js';
import { getAdminApplicationUsageAnalysisView, APPLICATION_CATEGORY_LABELS } from './application-usage-read-model.js';

const MESSAGE = 'TIMEONCHROME_APPLICATION_IDENTITY_USAGE_READ';
const BINDING_MESSAGE = 'TIMEONCHROME_APPLICATION_IDENTITY_BINDING_ENSURE';
const DAY_MS = 86_400_000;
const PAGE_SIZE = 100;
const cache = new Map();

function fail(code) { throw new Error(code); }
function dateKey(value) { return new Date(value + 28_800_000).toISOString().slice(0, 10); }
function dateMs(value) {
  const result = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(result) || dateKey(result) !== value) fail('application_identity_usage_query_invalid');
  return result;
}
function weekDates(value) {
  const start = dateMs(value);
  const weekday = new Date(start + 28_800_000).getUTCDay();
  const monday = start - ((weekday + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, index) => dateKey(monday + index * DAY_MS));
}
function sameBaseDays(left, right) {
  return JSON.stringify(left.map(({ date, status, baseRevision, manifestHash, totalSeconds, complete }) =>
    ({ date, status, baseRevision, manifestHash, totalSeconds, complete })))
    === JSON.stringify(right.map(({ date, status, baseRevision, manifestHash, totalSeconds, complete }) =>
      ({ date, status, baseRevision, manifestHash, totalSeconds, complete })));
}
function samePageSummary(first, next) {
  return first.revision === next.revision
    && JSON.stringify(first.base) === JSON.stringify(next.base)
    && JSON.stringify(first.product) === JSON.stringify(next.product);
}
async function contextRead(recheck) {
  let response;
  try { response = await chrome.runtime.sendMessage({ type: MESSAGE, contextOnly: true, recheck }); }
  catch (_) { fail('native_host_unavailable'); }
  if (!response?.ok || typeof response.contextId !== 'string' || !response.contextId) {
    fail(response?.errorCode || 'application_identity_usage_unavailable');
  }
  return response;
}
async function bindingRead() {
  let response;
  try { response = await chrome.runtime.sendMessage({ type: BINDING_MESSAGE }); }
  catch (_) { fail('application_identity_usage_binding_unavailable'); }
  if (!response?.ok || typeof response.bindingContextId !== 'string'
    || !/^[a-f0-9]{64}$/.test(response.bindingContextId)
    || !Number.isSafeInteger(response.expiresAtMs) || response.expiresAtMs <= Date.now()) {
    fail(response?.errorCode || 'application_identity_usage_binding_unavailable');
  }
  return response;
}
async function requestPage(query, contextId, bindingContextId, recheck) {
  try {
    validateApplicationIdentityUsageQuery(query);
    const response = await chrome.runtime.sendMessage({ type: MESSAGE, query, recheck,
      expectedContextId: contextId, expectedBindingContextId: bindingContextId });
    if (!response?.ok) fail(response?.errorCode || 'application_identity_usage_unavailable');
    if (response.contextId !== contextId) fail('application_identity_usage_context_changed');
    if (!response.snapshot) fail('application_identity_usage_invalid_response');
    if (query.expectedRevision && response.snapshot.revision !== query.expectedRevision) {
      fail('application_identity_usage_revision_changed');
    }
    validateApplicationIdentityUsageSnapshot(response.snapshot, query);
    return response.snapshot;
  } catch (error) {
    if (error?.message?.startsWith('application_identity_usage_') || error?.message === 'native_host_unavailable') throw error;
    fail('application_identity_usage_invalid_response');
  }
}
async function readSnapshot(fromDate, toDate, view, contextId, bindingContextId, recheck) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let first = null;
    const subjects = [];
    const keys = new Set();
    try {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const query = { fromDate, toDate, view, offset,
          ...(first && offset > 0 ? { expectedRevision: first.revision } : {}) };
        const page = await requestPage(query, contextId, bindingContextId, recheck && offset === 0);
        if (first && !samePageSummary(first, page)) fail('application_identity_usage_revision_changed');
        first ||= page;
        for (const subject of page.subjects) {
          if (keys.has(subject.key)) fail('application_identity_usage_invalid_response');
          keys.add(subject.key);
          subjects.push(subject);
        }
        if (page.nextOffset === null) return { ...first, subjects };
      }
    } catch (error) {
      if (error?.message !== 'application_identity_usage_revision_changed' || attempt === 1) throw error;
    }
  }
  fail('application_identity_usage_revision_changed');
}
async function readRange(fromDate, toDate, contextId, bindingContextId, recheck, force) {
  const key = `${contextId}/${bindingContextId}/${fromDate}/${toDate}`;
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.readAtMs < 30_000) return cached;
  const base = await readSnapshot(fromDate, toDate, 'base', contextId, bindingContextId, recheck);
  let product = null, productError = null;
  try { product = await readSnapshot(fromDate, toDate, 'product', contextId, bindingContextId, recheck); }
  catch (error) { productError = error?.message || 'application_identity_usage_unavailable'; }
  if (product && !sameBaseDays(base.base.days, product.base.days)) {
    product = null;
    productError = 'application_identity_usage_revision_changed';
  }
  const result = { base, product, productError, readAtMs: Date.now(), contextId, bindingContextId, fromDate, toDate };
  if (cache.size >= 4 && !cache.has(key)) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}
function dayValue(snapshot, subject, date) {
  const value = subject?.dailySeconds?.[date];
  if (value !== undefined) return value;
  return snapshot?.base?.complete ? 0 : null;
}
function productDayValue(range, subject, date) {
  const value = subject?.dailySeconds?.[date];
  if (value !== undefined) return value;
  const day = range?.product?.product?.days.find(item => item.date === date);
  return day?.status === 'available' && day.complete ? 0 : null;
}
function categoryLabel(key) { return APPLICATION_CATEGORY_LABELS[key] || '历史分类未知'; }
function baseRows(selected, current, today, mode) {
  const rows = new Map();
  for (const subject of [...(selected?.base?.subjects || []), ...(current?.base?.subjects || [])]) {
    if (!rows.has(subject.key)) rows.set(subject.key, subject);
  }
  return [...rows.values()].map(subject => {
    const selectedSubject = selected?.base?.subjects.find(item => item.key === subject.key);
    const currentSubject = current?.base?.subjects.find(item => item.key === subject.key);
    const identity = subject.key.startsWith('instance:') ? '基础实例' : '身份未识别';
    const selectedKnown = selectedSubject?.knownTotalSeconds ?? 0;
    return { key: subject.key, label: `${identity} · ${subject.key.slice(-8)}`,
      category: 'app_instance_total', categoryLabel: '基础实例账', managedTargetType: '本机应用实例',
      rangeSeconds: selectedSubject?.totalSeconds ?? (selected?.base?.base?.complete ? 0 : null),
      rangeKnownSeconds: selectedKnown, todaySeconds: dayValue(current?.base, currentSubject, today),
      weekSeconds: currentSubject?.totalSeconds ?? (current?.base?.base?.complete ? 0 : null),
      status: '产品身份未逐实例确认；不按名称推断',
      identityKind: subject.key.startsWith('instance:') ? 'instance' : 'observation' };
  });
}
function productRows(selected, current, today) {
  const map = new Map();
  for (const subject of [...(selected?.product?.subjects || []), ...(current?.product?.subjects || [])]) {
    if (!map.has(subject.key)) map.set(subject.key, subject);
  }
  return [...map.values()].map(subject => {
    const selectedSubject = selected?.product?.subjects.find(item => item.key === subject.key);
    const currentSubject = current?.product?.subjects.find(item => item.key === subject.key);
    const label = subject.name || `未识别产品 · ${subject.key.slice(-8)}`;
    return { key: subject.key, label, category: 'application_product', categoryLabel: '产品投影',
      managedTargetType: '独立产品投影',
      rangeSeconds: selectedSubject?.totalSeconds ?? (selected?.product && selected.product.base.complete
        && selected.product.product.days.every(day => day.status === 'available' && day.complete) ? 0 : null),
      rangeKnownSeconds: selectedSubject?.knownTotalSeconds ?? 0,
      todaySeconds: productDayValue(current, currentSubject, today),
      weekSeconds: currentSubject?.totalSeconds ?? (current?.product && current.product.product.days.every(day => day.status === 'available' && day.complete) ? 0 : null),
      status: subject.name ? '独立产品投影，不计入基础实例总量' : '产品名称未提供；不作推断' };
  });
}
function productCategories(range) {
  const days = range?.product?.product?.days || [];
  const keys = new Set(days.flatMap(day => Object.keys(day.categoriesSeconds || {})));
  const complete = days.length > 0 && days.every(day => day.status === 'available' && day.complete);
  return [...keys].map(key => {
    const seconds = days.reduce((sum, day) => sum + (day.status === 'available' ? day.categoriesSeconds[key] || 0 : 0), 0);
    return { key: `app_${key}`, sourceKey: key, label: categoryLabel(key), seconds: complete ? seconds : null,
      rangeKnownSeconds: seconds, status: '独立产品投影，不计入基础实例总量', limitLabel: '—' };
  });
}
function projectionStatus(ranges) {
  if (ranges.some(range => !range?.product)) return '产品身份投影不可用；基础实例用量仍有效';
  const days = ranges.flatMap(range => range.product.product.days);
  return days.every(day => day.status === 'available' && day.complete)
    ? '产品身份投影已验证；与基础实例账分开展示，不相加'
    : '产品身份投影部分不可用；未识别产品仍保留在基础实例账中';
}
function chartSeries(range, mode) {
  const days = range?.base?.base?.days || [];
  if (mode === 'week') return days.map(day => ({ label: day.date.slice(5),
    categories: day.totalSeconds == null ? {} : { app_instance_total: day.totalSeconds },
    totalSeconds: day.totalSeconds }));
  const day = days[0];
  return (day?.hours || []).map(hour => ({ label: String(hour.hour).padStart(2, '0'),
    categories: { app_instance_total: hour.totalSeconds }, totalSeconds: hour.totalSeconds }));
}
function completeDays(range) { return (range?.base?.base?.days || []).every(day => day.complete); }

export async function getAdminApplicationIdentityUsageAnalysisView({ mode = 'day', date, force = false, recheck = false } = {}) {
  const today = dateKey(Date.now()), selectedDate = date || today;
  const context = await contextRead(recheck);
  if (context.identitySupported !== true) {
    const legacy = await getAdminApplicationUsageAnalysisView({ mode, date: selectedDate, force, recheck });
    return { ...legacy, identityModel: false, legacyModel: true,
      meta: { ...legacy.meta, syncLabel: `旧版应用统计（未按基础实例与产品身份分层） · ${legacy.meta?.syncLabel || '本机数据'}` } };
  }
  const binding = await bindingRead();
  const selectedDates = mode === 'week' ? weekDates(selectedDate) : [selectedDate];
  const currentDates = weekDates(today);
  const selectedRange = await readRange(selectedDates[0], selectedDates.at(-1), context.contextId,
    binding.bindingContextId, recheck, force);
  let currentRange = selectedDates[0] === currentDates[0]
    && selectedDates.at(-1) === currentDates.at(-1) ? selectedRange : null;
  let currentRangeError = null;
  if (!currentRange) {
    try {
      currentRange = await readRange(currentDates[0], currentDates.at(-1), context.contextId,
        binding.bindingContextId, false, force);
    } catch (error) {
      if (error?.message === 'application_identity_usage_context_changed') throw error;
      const latestContext = await contextRead(false);
      if (latestContext.contextId !== context.contextId || latestContext.identitySupported !== true) {
        fail('application_identity_usage_context_changed');
      }
      currentRangeError = error?.message || 'application_identity_usage_unavailable';
    }
  }
  const latestBinding = await bindingRead();
  const latestContext = await contextRead(false);
  if (latestContext.contextId !== context.contextId || latestContext.identitySupported !== true
    || latestBinding.bindingContextId !== binding.bindingContextId) {
    fail('application_identity_usage_context_changed');
  }
  const base = selectedRange.base.base;
  const currentBase = currentRange?.base?.base || null;
  const selectedSubjects = selectedRange.base.subjects;
  const categoryRows = productCategories(selectedRange);
  const selectedProductDays = selectedRange.product?.product.days || [];
  const categoryTotals = {};
  for (const day of selectedProductDays) for (const [key, value] of Object.entries(day.categoriesSeconds || {})) {
    categoryTotals[`app_${key}`] = (categoryTotals[`app_${key}`] || 0) + value;
  }
  const currentProductDays = currentRange?.product?.product.days || [];
  const currentComplete = currentProductDays.length === 7 && currentProductDays.every(day => day.status === 'available' && day.complete);
  const currentCategoryTotals = {};
  for (const day of currentProductDays) for (const [key, value] of Object.entries(day.categoriesSeconds || {})) {
    currentCategoryTotals[`app_${key}`] = (currentCategoryTotals[`app_${key}`] || 0) + value;
  }
  const incompleteDates = base.days.filter(day => !day.complete).map(day => day.date).join('、');
  const totalSeconds = base.complete ? base.totalSeconds : null;
  const warning = [
    selectedRange.productError ? '产品身份投影读取失败；基础实例主用量保留。' : '',
    currentRangeError ? '本周补充读取失败；已保留所选范围数据，本周用量暂不可用。' : '',
  ].filter(Boolean).join('');
  return {
    kind: 'application', identityModel: true, modelVersion: 'application-identity-v3', readUnit: 'seconds',
    totalSeconds, knownTotalSeconds: base.knownTotalSeconds, baseComplete: base.complete,
    totalLabel: '基础实例主使用时间', range: { mode, from: selectedDates[0], to: selectedDates.at(-1),
      label: mode === 'week' ? `${selectedDates[0]} 至 ${selectedDates.at(-1)}` : selectedDate },
    categoryKeys: ['app_instance_total'], chartCategoryKeys: ['app_instance_total'],
    categoryTotals: { app_instance_total: base.knownTotalSeconds }, categoryRows,
    targetRows: productRows(selectedRange, currentRange, today),
    baseRows: baseRows(selectedRange, currentRange, today, mode),
    identityProductProjectionStatus: projectionStatus([selectedRange, currentRange]),
    identityProductCategoryTotals: categoryTotals,
    identityCurrentProductCategoryTotals: currentCategoryTotals,
    identityCurrentProductComplete: currentComplete,
    selectedRangeComplete: completeDays(selectedRange),
    currentRangeComplete: currentBase?.complete ?? false,
    incompleteDates,
    warning,
    meta: { syncLabel: `应用身份分层 · ${base.complete ? '本机统计完整' : '基础实例统计不完整'}` },
    chartSeries: mode === 'week' ? chartSeries(selectedRange, 'week') : chartSeries(selectedRange, 'day'),
    weekSummarySeries: currentRange ? chartSeries(currentRange, 'week') : [],
    weekUnavailable: !currentBase?.days?.length || !currentBase.days.some(day => day.status !== 'unknown'),
    selectedSubjectsCount: selectedSubjects.length,
    selectedProductComplete: selectedRange.product?.product.days.every(day => day.status === 'available' && day.complete) === true,
    identityProjectionError: selectedRange.productError,
    baseDays: base.days,
    currentBaseDays: currentBase?.days || [],
  };
}

export function resetApplicationIdentityUsageReadModelForTests() { cache.clear(); }
