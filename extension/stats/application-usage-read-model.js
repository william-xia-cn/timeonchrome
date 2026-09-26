// Page-safe adapter: receives Service-owned statistics, never reads or settles raw segments.
const MESSAGE = 'TIMEONCHROME_APPLICATION_USAGE_READ';
const DAY = 86_400_000;
const cache = new Map();
const inFlight = new Map();
export const APPLICATION_CATEGORY_LABELS = {
  study: '学习', composite: '复合', restrictedEntertainment: '受限娱乐',
  unclassified: '未归类', blocked: '黑名单', unknown: '历史分类未知',
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
  })[code] || '应用用量暂时无法读取，请重试。';
}
function invalid() { throw new Error('native_invalid_response'); }
const ms = value => Number.isSafeInteger(value) && value >= 0;
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
async function send(query, recheck = false) {
  let response;
  try { response = await chrome.runtime.sendMessage({ type: MESSAGE, query, recheck }); }
  catch (_) { throw new Error('native_host_unavailable'); }
  if (!response?.ok) throw new Error(response?.errorCode || 'application_usage_unavailable');
  return response.applicationUsage;
}
async function readWeek(dates, force, recheck) {
  const from = dates[0], to = dates[6], key = from;
  const previous = cache.get(key);
  if (!force && previous && Date.now() - previous.readAtMs < 30_000) return previous;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let offset = 0, snapshot = null;
        const rows = [], seen = new Set();
        do {
          const page = validateApplicationUsagePage(await send({ fromDate: from, toDate: to, offset,
            ...(snapshot ? { expectedRevision: snapshot.revision } : {}) }, recheck && offset === 0), from, to);
          if (snapshot && (page.revision !== snapshot.revision || JSON.stringify(page.days) !== JSON.stringify(snapshot.days)
            || page.totalMs !== snapshot.totalMs || page.complete !== snapshot.complete
            || page.computedAtMs !== snapshot.computedAtMs)) throw new Error('application_usage_revision_changed');
          snapshot ||= page;
          for (const row of page.applications) {
            if (seen.has(row.key)) invalid();
            seen.add(row.key); rows.push(row);
          }
          if (page.nextOffset != null && (page.applications.length !== 100 || page.nextOffset !== offset + 100)) invalid();
          offset = page.nextOffset ?? null;
        } while (offset !== null);
        if (previous && snapshot.computedAtMs < previous.computedAtMs) invalid();
        const complete = { ...snapshot, applications: rows, readAtMs: Date.now() };
        if (cache.size >= 2 && !cache.has(key)) cache.delete(cache.keys().next().value);
        cache.set(key, complete); // Only publish a fully validated, single-revision response.
        return complete;
      } catch (error) {
        if (error.message !== 'application_usage_revision_changed' || attempt === 1) throw error;
      }
    }
  })();
  inFlight.set(key, promise);
  try { return await promise; } finally { inFlight.delete(key); }
}
const uiCategories = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [uiKey(key), value / 1000]));
export async function getAdminApplicationUsageAnalysisView({ mode = 'day', date, force = false, recheck = false } = {}) {
  const today = dateKey(Date.now()), selected = date || today;
  const selectedDates = weekDates(selected), currentDates = weekDates(today);
  let snapshot, current, warning = null;
  try {
    snapshot = await readWeek(selectedDates, force, recheck);
    current = selectedDates[0] === currentDates[0] ? snapshot : await readWeek(currentDates, force, false);
  } catch (error) {
    snapshot = cache.get(selectedDates[0]); current = cache.get(currentDates[0]);
    if (!snapshot || !current) throw error;
    warning = applicationUsageErrorMessage(error.message);
  }
  const selectedDays = mode === 'week' ? snapshot.days : snapshot.days.filter(d => d.date === selected);
  const unavailable = selectedDays.some(d => !d.complete);
  const categoryTotals = {};
  for (const day of selectedDays) for (const [key, value] of Object.entries(day.categoriesMs)) {
    categoryTotals[uiKey(key)] = (categoryTotals[uiKey(key)] || 0) + value / 1000;
  }
  const knownRows = new Map([...current.applications, ...snapshot.applications].map(row => [row.key, row]));
  const targetRows = [...knownRows.values()].map(row => {
    const chosen = snapshot.applications.find(r => r.key === row.key);
    const thisWeek = current.applications.find(r => r.key === row.key);
    const labels = (chosen || row).classifications.map(c => APPLICATION_CATEGORY_LABELS[c]);
    return { key: row.key, label: row.name, category: uiKey((chosen || row).classifications[0] || 'unknown'),
      categoryLabel: labels.join('／'), categoryKeys: (chosen || row).classifications.map(uiKey),
      managedTargetType: '应用', rangeSeconds: unavailable ? null : selectedDays.reduce((n, d) => n + (chosen?.dailyMs[d.date] || 0), 0) / 1000,
      todaySeconds: current.days.find(d => d.date === today)?.complete ? (thisWeek?.dailyMs[today] || 0) / 1000 : null,
      weekSeconds: current.complete ? (thisWeek?.totalMs || 0) / 1000 : null,
      limitLabel: '不适用', status: '独立应用统计，不计网页配额' };
  }).filter(row => (row.rangeSeconds || row.todaySeconds || row.weekSeconds)).sort((a, b) => (b.rangeSeconds || 0) - (a.rangeSeconds || 0));
  const series = days => days.map(d => ({ label: d.date.slice(5), categories: d.complete ? uiCategories(d.categoriesMs) : {},
    totalSeconds: d.complete ? d.totalMs / 1000 : null }));
  const incomplete = snapshot.days.filter(d => !d.complete).map(d => d.date).join('、');
  const settled = snapshot.lastSettledAtMs ? new Date(snapshot.lastSettledAtMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '尚无已结算记录';
  return { kind: 'application', range: { mode, from: mode === 'week' ? selectedDates[0] : selected,
    to: mode === 'week' ? selectedDates[6] : selected, label: mode === 'week' ? `${selectedDates[0]} — ${selectedDates[6]}` : selected },
    totalLabel: '应用主使用时间', totalSeconds: unavailable ? null : selectedDays.reduce((n, d) => n + d.totalMs, 0) / 1000,
    categoryKeys: Object.keys(APPLICATION_CATEGORY_LABELS).map(uiKey), categoryTotals,
    categoryRows: Object.entries(APPLICATION_CATEGORY_LABELS).map(([key, label]) => ({ key: uiKey(key), label,
      seconds: unavailable ? null : (categoryTotals[uiKey(key)] || 0), limitLabel: '不适用', status: '独立应用统计，不计网页配额' })),
    targetRows, chartSeries: mode === 'week' ? series(snapshot.days) : selectedDays[0].hours.map(h => ({ label: `${h.hour}`, categories: unavailable ? {} : uiCategories(h.categoriesMs), totalSeconds: unavailable ? null : h.totalMs / 1000 })),
    weekSummarySeries: series(snapshot.days), targetColumnLabel: '应用', categoryColumnLabel: '历史管理分类',
    limitColumnLabel: '网页配额', searchTargetPlaceholder: '搜索应用名称',
    warning, incompleteDates: incomplete,
    meta: { syncLabel: `${warning ? '缓存／连接中断 · ' : ''}本机当前 Windows 用户 · 最近读取 ${new Date(snapshot.readAtMs).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} · 已结算至 ${settled}${incomplete ? ' · 不完整日期：' + incomplete : ''}` } };
}
