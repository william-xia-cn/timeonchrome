// Page-safe adapter: receives Service-owned statistics, never reads or settles raw segments.
const MESSAGE = 'TIMEONCHROME_APPLICATION_USAGE_READ';
const CONTEXT_MESSAGE = MESSAGE;
const DAY = 86_400_000;
const cache = new Map();
const inFlight = new Map();
export const APPLICATION_CATEGORY_LABELS = {
  study: '学习', composite: '复合', restrictedEntertainment: '受限娱乐',
  unclassified: '未归类', other: '其他', blocked: '黑名单', unknown: '历史分类未知', historicalUnknown: '历史分类未知',
};
const uiKey = key => `app_${key}`;
export function applicationUsageErrorMessage(code) {
  return ({ managed_marker_unavailable: '当前扩展未启用本地应用连接。网页和媒体使用不受影响。',
    native_host_unavailable: '未检测到本地组件。网页和媒体使用不受影响。',
    runtime_service_unavailable: '本地服务未运行，应用用量暂时无法更新。',
    application_usage_unsupported: '当前本地组件尚不支持读取应用用量，需要支持此功能的 Service 版本。',
    native_port_disconnected: '本地组件连接已断开，请稍后重新检查。',
    native_response_timeout: '读取应用用量超时，请重试。',
    application_usage_revision_changed: '应用统计版本发生变化，请重新读取。',
    application_usage_busy: '应用统计正在读取，请稍后重试。',
    application_usage_pending: '应用统计尚未完成发布或校验，请稍后刷新；不代表零用量。',
    application_usage_seconds_pending: '应用统计尚未完成发布或校验，请稍后刷新；不代表零用量。',
    application_usage_seconds_revision_changed: '应用统计版本发生变化，请重新读取。',
    application_usage_seconds_unavailable: '本地组件无法读取当前版本的应用统计，请检查组件状态。',
    application_usage_context_changed: '当前本地应用统计来源已变化，请重新读取。',
    native_invalid_response: '本地组件返回的应用统计未通过校验，请检查组件版本及诊断信息。',
  })[code] || '应用用量暂时无法读取，请重试。';
}
function invalid() { throw new Error('native_invalid_response'); }
const ms = value => Number.isSafeInteger(value) && value >= 0;
const seconds = value => Number.isSafeInteger(value) && value >= 0;
const dateKey = value => new Date(value + 8 * 3_600_000).toISOString().slice(0, 10);
const dateMs = key => Date.parse(`${key}T00:00:00+08:00`);
function weekDates(key) {
  const value = dateMs(key);
  if (!Number.isFinite(value) || dateKey(value) !== key) invalid();
  const weekday = new Date(value + 8 * 3_600_000).getUTCDay();
  const monday = value - ((weekday + 6) % 7) * DAY;
  return Array.from({ length: 7 }, (_, index) => dateKey(monday + index * DAY));
}
function categories(values, maximum) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) invalid();
  for (const [key, value] of Object.entries(values)) {
    if (!(key in APPLICATION_CATEGORY_LABELS) || !ms(value) || value > maximum) invalid();
  }
}
export function validateApplicationUsagePage(page, from, to) {
  const dates = Array.from({ length: (dateMs(to) - dateMs(from)) / DAY + 1 }, (_, i) => dateKey(dateMs(from) + i * DAY));
  if (!page || page.fromDate !== from || page.toDate !== to || !/^[a-f0-9]{64}$/.test(page.revision)
    || !ms(page.computedAtMs) || (page.lastSettledAtMs != null && !ms(page.lastSettledAtMs))
    || typeof page.complete !== 'boolean' || !Array.isArray(page.reasonCodes) || page.reasonCodes.length > 16
    || page.reasonCodes.some(c => typeof c !== 'string' || !/^[A-Z_]{1,64}$/.test(c))
    || !ms(page.totalMs) || page.totalMs > dates.length * DAY
    || !Array.isArray(page.days) || page.days.length !== dates.length
    || !Array.isArray(page.applications) || page.applications.length > 100
    || (page.nextOffset != null && (!Number.isInteger(page.nextOffset) || page.nextOffset < 1 || page.nextOffset > 20000))) invalid();
  if (page.attribution != null) {
    const value = page.attribution;
    if (typeof value.complete !== 'boolean'
      || (value.productAssociationVersion != null && !/^[a-f0-9]{64}$/.test(value.productAssociationVersion))
      || (value.classificationCorrectionVersion != null && !ms(value.classificationCorrectionVersion))
      || !Array.isArray(value.reasonCodes) || value.reasonCodes.length > 16
      || value.reasonCodes.some(code => typeof code !== 'string' || !/^[A-Z_]{1,64}$/.test(code))
      || (value.complete && value.reasonCodes.length)) invalid();
  }
  let sum = 0;
  page.days.forEach((day, i) => {
    if (day.date !== dates[i] || !ms(day.totalMs) || day.totalMs > DAY
      || typeof day.complete !== 'boolean' || !Array.isArray(day.reasonCodes)
      || day.reasonCodes.some(c => typeof c !== 'string' || !/^[A-Z_]{1,64}$/.test(c))
      || !Array.isArray(day.hours) || day.hours.length !== 24) invalid();
    categories(day.categoriesMs, DAY);
    day.hours.forEach((hour, index) => {
      if (hour.hour !== index || !ms(hour.totalMs) || hour.totalMs > 3_600_000) invalid();
      categories(hour.categoriesMs, 3_600_000);
    });
    if (day.hours.reduce((n, h) => n + h.totalMs, 0) !== day.totalMs) invalid();
    for (const [key, value] of Object.entries(day.categoriesMs)) {
      if (day.hours.reduce((n, h) => n + (h.categoriesMs[key] || 0), 0) !== value) invalid();
    }
    sum += day.totalMs;
  });
  if (sum !== page.totalMs || (page.complete && (page.reasonCodes.length || page.days.some(d => !d.complete)))) invalid();
  for (const row of page.applications) {
    if (!/^[a-f0-9]{64}$/.test(row.key) || typeof row.name !== 'string' || row.name.length > 160
      || /[\u0000-\u001f]/.test(row.name) || !ms(row.totalMs) || row.totalMs > dates.length * DAY
      || !Array.isArray(row.classifications) || row.classifications.length > 6
      || row.classifications.some(c => !(c in APPLICATION_CATEGORY_LABELS)) || !row.dailyMs
      || Object.keys(row.dailyMs).length !== dates.length) invalid();
    for (const date of dates) if (!ms(row.dailyMs[date]) || row.dailyMs[date] > DAY) invalid();
    if (dates.reduce((n, date) => n + row.dailyMs[date], 0) !== row.totalMs) invalid();
  }
  return page;
}
const SECOND_CATEGORIES = new Set(['study', 'composite', 'restrictedEntertainment', 'unclassified', 'other', 'blocked', 'historicalUnknown']);
function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
  return value;
}
function validReasons(value) {
  if (!Array.isArray(value) || value.length > 32 || new Set(value).size !== value.length
    || value.some(code => typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code))) invalid();
}
function secondCategoryMap(value, maximum) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  for (const [key, amount] of Object.entries(value)) {
    if (!SECOND_CATEGORIES.has(key) || !seconds(amount) || amount > maximum) invalid();
  }
  return value;
}
const sameCategoryMap = (left, right) => [...new Set([...Object.keys(left), ...Object.keys(right)])]
  .every(key => (left[key] ?? 0) === (right[key] ?? 0));
function secondsDates(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) invalid();
  const start = dateMs(from), end = dateMs(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || dateKey(start) !== from || dateKey(end) !== to
    || end < start || end - start > 6 * DAY) invalid();
  return Array.from({ length: (end - start) / DAY + 1 }, (_, i) => dateKey(start + i * DAY));
}
export function validateApplicationUsageSecondsQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['fromDate', 'toDate', 'offset', 'expectedRevision'].includes(key))) invalid();
  const dates = secondsDates(query.fromDate, query.toDate);
  if (!Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 20_000
    || (query.expectedRevision !== undefined && (typeof query.expectedRevision !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(query.expectedRevision)))
    || (query.offset > 0 && query.expectedRevision === undefined)) invalid();
  return dates;
}
export function validateApplicationUsageSecondsPage(page, query) {
  const dates = validateApplicationUsageSecondsQuery(query);
  const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/;
  exactObject(page, ['schemaVersion', 'durationUnit', 'fromDate', 'toDate', 'revision', 'computedAtMs', 'lastSettledAtMs',
    'complete', 'reasonCodes', 'totalSeconds', 'knownTotalSeconds', 'knownCategoriesSeconds', 'days', 'applications', 'nextOffset']);
  if (page.schemaVersion !== 2 || page.durationUnit !== 'seconds' || page.fromDate !== query.fromDate || page.toDate !== query.toDate
    || typeof page.complete !== 'boolean' || typeof page.revision !== 'string' || !revisionPattern.test(page.revision)
    || (query.expectedRevision !== undefined && page.revision !== query.expectedRevision)
    || (page.computedAtMs !== null && !seconds(page.computedAtMs))
    || (page.lastSettledAtMs !== null && !seconds(page.lastSettledAtMs))) invalid();
  validReasons(page.reasonCodes);
  if (!Array.isArray(page.days) || page.days.length !== dates.length || !Array.isArray(page.applications)
    || page.applications.length > 100) invalid();
  const totals = new Map(), completeByDate = new Map(), categoriesByDate = new Map();
  let knownTotal = 0, computedAtMs = null, lastSettledAtMs = null, allComplete = true;
  const allCategories = {};
  for (let index = 0; index < dates.length; index++) {
    const day = exactObject(page.days[index], ['date', 'status', 'generatedAtMs', 'settledThroughMs', 'complete', 'reasonCodes',
      'totalSeconds', 'categoriesSeconds', 'hours']);
    if (day.date !== dates[index] || !['available', 'pending_update', 'incomplete', 'unknown'].includes(day.status)
      || typeof day.complete !== 'boolean' || !Array.isArray(day.hours)) invalid();
    const total = day.totalSeconds;
    if (total !== null && (!seconds(total) || total > 86_400)) invalid();
    if ((day.generatedAtMs !== null && !seconds(day.generatedAtMs))
      || (day.settledThroughMs !== null && !seconds(day.settledThroughMs))) invalid();
    validReasons(day.reasonCodes);
    const categoryMap = secondCategoryMap(day.categoriesSeconds, total ?? 0);
    if ((day.status === 'unknown' && (total !== null || day.complete || day.hours.length !== 0
      || day.generatedAtMs !== null || day.settledThroughMs !== null))
      || (day.status !== 'unknown' && (total === null || day.generatedAtMs === null || day.hours.length !== 24))
      || (day.status === 'available' && !day.complete)
      || (day.status === 'incomplete' && day.complete)
      || (day.settledThroughMs !== null && (day.generatedAtMs === null || day.settledThroughMs > day.generatedAtMs))) invalid();
    let hourlyTotal = 0;
    const hourlyCategories = {};
    for (let hour = 0; hour < day.hours.length; hour++) {
      const row = exactObject(day.hours[hour], ['hour', 'totalSeconds', 'categoriesSeconds']);
      if (row.hour !== hour || !seconds(row.totalSeconds) || row.totalSeconds > 3600) invalid();
      hourlyTotal += row.totalSeconds;
      for (const [key, amount] of Object.entries(secondCategoryMap(row.categoriesSeconds, 3600))) {
        hourlyCategories[key] = (hourlyCategories[key] || 0) + amount;
      }
    }
    if (total !== null && (hourlyTotal !== total || !sameCategoryMap(categoryMap, hourlyCategories))) invalid();
    for (const [key, amount] of Object.entries(categoryMap)) allCategories[key] = (allCategories[key] || 0) + amount;
    if (total !== null) knownTotal += total;
    if (day.generatedAtMs !== null) computedAtMs = Math.max(computedAtMs ?? 0, day.generatedAtMs);
    if (day.settledThroughMs !== null) lastSettledAtMs = Math.max(lastSettledAtMs ?? 0, day.settledThroughMs);
    allComplete = allComplete && day.complete;
    totals.set(day.date, total); completeByDate.set(day.date, day.complete); categoriesByDate.set(day.date, categoryMap);
  }
  const topCategories = secondCategoryMap(page.knownCategoriesSeconds, dates.length * 86_400);
  if (page.complete !== allComplete || page.knownTotalSeconds !== knownTotal
    || page.totalSeconds !== (allComplete ? knownTotal : null) || page.computedAtMs !== computedAtMs
    || page.lastSettledAtMs !== lastSettledAtMs || !sameCategoryMap(topCategories, allCategories)) invalid();
  const products = new Set();
  for (const app of page.applications) {
    exactObject(app, ['key', 'name', 'classifications', 'totalSeconds', 'knownTotalSeconds', 'dailySeconds']);
    if (typeof app.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(app.key) || products.has(app.key)
      || typeof app.name !== 'string' || !app.name.length || app.name.length > 160 || /[\u0000-\u001f\u007f]/.test(app.name)
      || !Array.isArray(app.classifications) || !app.classifications.length || app.classifications.length > SECOND_CATEGORIES.size
      || new Set(app.classifications).size !== app.classifications.length
      || app.classifications.some(key => !SECOND_CATEGORIES.has(key))) invalid();
    products.add(app.key);
    const daily = exactObject(app.dailySeconds, dates);
    let productKnown = 0;
    for (const date of dates) {
      const amount = daily[date];
      if (amount !== null && (!seconds(amount) || amount > (totals.get(date) ?? 0))) invalid();
      if (amount === null && completeByDate.get(date)) invalid();
      if (amount !== null) productKnown += amount;
    }
    if (app.knownTotalSeconds !== productKnown
      || app.totalSeconds !== (allComplete ? productKnown : null)) invalid();
  }
  if (page.nextOffset !== null && (!Number.isSafeInteger(page.nextOffset) || page.nextOffset !== query.offset + 100
    || page.applications.length !== 100 || page.nextOffset > 20_000)) invalid();
  return page;
}
async function sendContext(recheck = false) {
  let response;
  try { response = await chrome.runtime.sendMessage({ type: CONTEXT_MESSAGE, contextOnly: true, recheck }); }
  catch (_) { throw new Error('native_host_unavailable'); }
  if (!response?.ok) throw new Error(response?.errorCode || 'application_usage_unavailable');
  if (!['seconds', 'milliseconds'].includes(response.readUnit) || typeof response.contextId !== 'string'
    || !response.contextId || typeof response.available !== 'boolean') invalid();
  return { readUnit: response.readUnit, contextId: response.contextId, available: response.available };
}
async function send(query, context, recheck = false) {
  let response;
  try { response = await chrome.runtime.sendMessage({ type: MESSAGE, query, recheck,
    expectedContextId: context.contextId, expectedReadUnit: context.readUnit }); }
  catch (_) { throw new Error('native_host_unavailable'); }
  if (!response?.ok) throw new Error(response?.errorCode || 'application_usage_unavailable');
  if (response.readUnit !== context.readUnit || response.contextId !== context.contextId) invalid();
  const page = context.readUnit === 'seconds' ? response.applicationUsageSeconds : response.applicationUsage;
  return { page, readUnit: response.readUnit };
}
async function readWeek(dates, context, force, recheck) {
  const from = dates[0], to = dates.at(-1), key = `${context.readUnit}/${context.contextId}/${from}/${to}`;
  const previous = cache.get(key);
  if (!force && previous && Date.now() - previous.readAtMs < 30_000) return previous;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let offset = 0, snapshot = null;
        const rows = [], seen = new Set();
        do {
          const query = { fromDate: from, toDate: to, offset,
            ...(snapshot ? { expectedRevision: snapshot.revision } : {}) };
          const received = await send(query, context, recheck && offset === 0);
          const page = received.readUnit === 'seconds' ? validateApplicationUsageSecondsPage(received.page, query)
            : validateApplicationUsagePage(received.page, from, to);
          if (snapshot && (page.revision !== snapshot.revision || JSON.stringify(page.days) !== JSON.stringify(snapshot.days)
            || (context.readUnit === 'seconds'
              ? page.totalSeconds !== snapshot.totalSeconds || page.knownTotalSeconds !== snapshot.knownTotalSeconds
                || JSON.stringify(page.knownCategoriesSeconds) !== JSON.stringify(snapshot.knownCategoriesSeconds)
              : page.totalMs !== snapshot.totalMs)
            || page.complete !== snapshot.complete || page.computedAtMs !== snapshot.computedAtMs
            || page.lastSettledAtMs !== snapshot.lastSettledAtMs)) {
            throw new Error(context.readUnit === 'seconds' ? 'application_usage_seconds_revision_changed' : 'application_usage_revision_changed');
          }
          snapshot ||= page;
          for (const row of page.applications) {
            if (seen.has(row.key)) invalid();
            seen.add(row.key); rows.push(row);
          }
          if (page.nextOffset != null && (page.applications.length !== 100 || page.nextOffset !== offset + 100)) invalid();
          offset = page.nextOffset ?? null;
        } while (offset !== null);
        if (previous && snapshot.computedAtMs != null && previous.computedAtMs != null
          && snapshot.computedAtMs < previous.computedAtMs) invalid();
        const complete = { ...snapshot, applications: rows, readAtMs: Date.now(), readUnit: context.readUnit, contextId: context.contextId };
        if (cache.size >= 4 && !cache.has(key)) cache.delete(cache.keys().next().value);
        cache.set(key, complete); // Only publish a fully validated, single-revision response.
        return complete;
      } catch (error) {
        if (!['application_usage_revision_changed', 'application_usage_seconds_revision_changed'].includes(error.message) || attempt === 1) throw error;
      }
    }
  })();
  inFlight.set(key, promise);
  try { return await promise; } finally { inFlight.delete(key); }
}
const uiCategories = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [uiKey(key), value]));
function dayCategories(day, unit) { return unit === 'seconds' ? day.categoriesSeconds : Object.fromEntries(
  Object.entries(day.categoriesMs).map(([key, value]) => [key, value / 1000])); }
function dayTotal(day, unit) { return unit === 'seconds' ? day.totalSeconds : day.totalMs / 1000; }
function productDaily(row, date, unit, snapshot) {
  if (!row) return snapshot.complete ? 0 : null;
  const value = unit === 'seconds' ? row.dailySeconds[date] : row.dailyMs[date] / 1000;
  return value == null ? null : value;
}
function productKnown(row, unit) {
  if (!row) return 0;
  return unit === 'seconds' ? row.knownTotalSeconds : row.totalMs / 1000;
}
function productTotal(row, unit, snapshot) {
  if (!snapshot || !row) return snapshot?.complete ? 0 : null;
  if (unit === 'seconds') return row.totalSeconds;
  return snapshot.complete ? row.totalMs / 1000 : null;
}
function summarySeries(snapshot) {
  if (!snapshot) return [];
  return snapshot.days.map(day => ({ label: day.date.slice(5), categories: snapshot.readUnit === 'seconds' || day.complete
    ? uiCategories(dayCategories(day, snapshot.readUnit)) : {},
    totalSeconds: day.complete ? dayTotal(day, snapshot.readUnit) : null }));
}
function rangeCacheKey(context, dates) { return `${context.readUnit}/${context.contextId}/${dates[0]}/${dates.at(-1)}`; }
export async function getAdminApplicationUsageAnalysisView({ mode = 'day', date, force = false, recheck = false } = {}) {
  const today = dateKey(Date.now()), selected = date || today;
  const selectedDates = weekDates(selected), currentDates = weekDates(today);
  const context = await sendContext(recheck);
  let snapshot, current, warning = null;
  const primaryDates = mode === 'week' ? selectedDates : [selected];
  const cachedRange = dates => cache.get(rangeCacheKey(context, dates));
  try {
    snapshot = await readWeek(primaryDates, context, force, recheck);
  } catch (error) {
    if (error.message === 'application_usage_context_changed') throw error;
    snapshot = cachedRange(primaryDates);
    if (!snapshot) throw error;
    warning = applicationUsageErrorMessage(error.message);
  }
  let selectedWeek;
  try {
    selectedWeek = mode === 'week' ? snapshot : await readWeek(selectedDates, context, force, false);
    current = selectedDates[0] === currentDates[0] ? selectedWeek : await readWeek(currentDates, context, force, false);
  } catch (error) {
    if (error.message === 'application_usage_context_changed') throw error;
    selectedWeek ||= cachedRange(selectedDates);
    current = cachedRange(currentDates);
    warning = [warning, `本周补充数据暂不可用：${applicationUsageErrorMessage(error.message)}`].filter(Boolean).join(' ');
  }
  const unit = snapshot.readUnit;
  const todaySnapshot = current || (selected === today ? snapshot : null);
  const selectedDays = mode === 'week' ? snapshot.days : snapshot.days.filter(day => day.date === selected);
  const unavailable = selectedDays.some(day => !day.complete);
  const categoryTotals = {};
  for (const day of selectedDays) for (const [key, value] of Object.entries(dayCategories(day, unit))) {
    categoryTotals[uiKey(key)] = (categoryTotals[uiKey(key)] || 0) + value;
  }
  const knownRows = new Map([...(current?.applications || []), ...snapshot.applications].map(row => [row.key, row]));
  const targetRows = [...knownRows.values()].map(row => {
    const chosen = snapshot.applications.find(item => item.key === row.key);
    const thisWeek = current?.applications.find(item => item.key === row.key);
    const todayRow = todaySnapshot?.applications.find(item => item.key === row.key);
    const selectedTotal = productTotal(chosen, unit, snapshot);
    const selectedKnown = productKnown(chosen, unit);
    const todayDay = todaySnapshot?.days.find(day => day.date === today);
    const todayValue = todayDay && (unit === 'seconds' || todayDay.complete)
      ? productDaily(todayRow, today, unit, todaySnapshot) : null;
    const weekValue = productTotal(thisWeek, current?.readUnit || unit, current);
    const labels = row.classifications.map(key => APPLICATION_CATEGORY_LABELS[key]);
    const partialLabel = unit === 'seconds' && !snapshot.complete ? `已知部分 ${selectedKnown} 秒；范围不完整` : '独立应用统计，不计网页配额';
    return { key: row.key, label: row.name, category: uiKey(row.classifications[0] || 'unknown'),
      categoryLabel: labels.join('／'), categoryKeys: row.classifications.map(uiKey), managedTargetType: '应用',
      rangeSeconds: selectedTotal, rangeKnownSeconds: selectedKnown,
      todaySeconds: todayValue, weekSeconds: weekValue, limitLabel: '不适用', status: partialLabel };
  }).filter(row => (row.rangeSeconds || row.rangeKnownSeconds || row.todaySeconds || row.weekSeconds))
    .sort((a, b) => (b.rangeKnownSeconds || 0) - (a.rangeKnownSeconds || 0));
  const incomplete = snapshot.days.filter(day => !day.complete).map(day => day.date).join('、');
  const knownTotalSeconds = unit === 'seconds' ? snapshot.knownTotalSeconds : snapshot.days.reduce((sum, day) => sum + day.totalMs / 1000, 0);
  const totalSeconds = unit === 'seconds' ? snapshot.totalSeconds
    : unavailable ? null : selectedDays.reduce((sum, day) => sum + day.totalMs, 0) / 1000;
  const categoryRows = Object.entries(APPLICATION_CATEGORY_LABELS).map(([key, label]) => ({ key: uiKey(key), label,
    seconds: unit === 'milliseconds' && unavailable ? null : (categoryTotals[uiKey(key)] || 0),
    limitLabel: '不适用', status: unit === 'seconds' && !snapshot.complete ? '已知分类用量；总量不完整' : '独立应用统计，不计网页配额' }));
  const series = summarySeries(snapshot);
  const chartSeries = mode === 'week' ? series : selectedDays[0].hours.map(hour => ({ label: `${hour.hour}`,
    categories: unit === 'seconds' ? uiCategories(hour.categoriesSeconds) : unavailable ? {} : uiCategories(Object.fromEntries(
      Object.entries(hour.categoriesMs).map(([key, value]) => [key, value / 1000]))),
    totalSeconds: unit === 'seconds' ? (selectedDays[0].complete ? hour.totalSeconds : null)
      : (unavailable ? null : hour.totalMs / 1000) }));
  const lastSettledAtMs = unit === 'seconds' ? snapshot.lastSettledAtMs : snapshot.lastSettledAtMs;
  const settled = lastSettledAtMs ? new Date(lastSettledAtMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '尚无已结算记录';
  const attribution = snapshot.attribution;
  const attributionLabel = unit === 'seconds' ? '整数秒统计来源' : !attribution ? '归属同步状态：旧版服务未提供'
    : attribution.complete ? '产品关联／分类已同步' : '产品关联／分类尚未同步完成（用量仍按已结算原账显示）';
  const associationLabel = attribution?.productAssociationVersion ? ` · 关联版本 ${attribution.productAssociationVersion.slice(0, 12)}` : '';
  const completenessLabel = unit === 'seconds' && !snapshot.complete
    ? ` · 已知用量 ${knownTotalSeconds} 秒；总量暂不完整` : '';
  return { kind: 'application', range: { mode, from: mode === 'week' ? selectedDates[0] : selected,
    to: mode === 'week' ? selectedDates[6] : selected, label: mode === 'week' ? `${selectedDates[0]} — ${selectedDates[6]}` : selected },
    totalLabel: '应用主使用时间', totalSeconds, knownTotalSeconds,
    categoryKeys: Object.keys(APPLICATION_CATEGORY_LABELS).map(uiKey), categoryTotals, categoryRows,
    targetRows, chartSeries, weekSummarySeries: selectedWeek ? summarySeries(selectedWeek) : selectedDates.map(day => ({ label: day.slice(5), categories: {}, totalSeconds: null })),
    targetColumnLabel: '应用', categoryColumnLabel: '历史管理分类', limitColumnLabel: '网页配额', searchTargetPlaceholder: '搜索应用名称',
    warning, weekUnavailable: !selectedWeek, incompleteDates: incomplete, attribution, readUnit: unit,
    meta: { syncLabel: `${warning ? '缓存／连接中断 · ' : ''}本机当前 Windows 用户 · 最近读取 ${new Date(snapshot.readAtMs).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} · 已结算至 ${settled}${incomplete ? ' · 不完整日期：' + incomplete : ''}${completenessLabel} · ${attributionLabel}${associationLabel}` } };
}
