(function initializeAppRuntimePolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimePolicy = api;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const categories = ['study', 'composite', 'restrictedEntertainment', 'unclassified', 'blocked'];
  const scheduleCategories = ['study', 'composite', 'restrictedEntertainment', 'unclassified'];
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const allOpenTimeWindows = () => Object.fromEntries(weekdays.map((day) => [day,
    Object.fromEntries(scheduleCategories.map((category) => [category, [{ start: '00:00', end: '24:00' }]])),
  ]));
  const defaultPolicy = () => ({
    version: 0,
    effectiveAtMs: null,
    classifications: [],
    quotas: {
      dailyCategoryMinutes: { study: null, composite: null, restrictedEntertainment: null, unclassified: null },
      weeklyRestrictedEntertainmentMinutes: null,
      perApplicationDailyMinutes: [],
    },
    timeWindows: allOpenTimeWindows(),
  });
  const keyOf = (value) => `${value.platform}\n${value.runtimeIdentity}`;
  function normalize(policy = {}) {
    const base = defaultPolicy();
    const result = {
      ...base,
      ...policy,
      classifications: Array.isArray(policy.classifications) ? policy.classifications.filter((item) =>
        item && ['windows', 'macos'].includes(item.platform) && item.runtimeIdentity && categories.includes(item.classification)) : [],
      quotas: {
        ...base.quotas,
        ...(policy.quotas || {}),
        dailyCategoryMinutes: { ...base.quotas.dailyCategoryMinutes, ...(policy.quotas?.dailyCategoryMinutes || {}) },
        perApplicationDailyMinutes: Array.isArray(policy.quotas?.perApplicationDailyMinutes)
          ? policy.quotas.perApplicationDailyMinutes : [],
      },
      timeWindows: normalizeTimeWindows(policy.timeWindows),
    };
    result.classifications.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    result.quotas.perApplicationDailyMinutes.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    return result;
  }
  function minute(value, allowEndOfDay = false) {
    if (allowEndOfDay && value === '24:00') return 1440;
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('时间段必须使用 HH:mm');
    const [hour, part] = value.split(':').map(Number);
    return hour * 60 + part;
  }
  function normalizeTimeWindows(value) {
    if (value == null) return allOpenTimeWindows();
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('时间段配置无效');
    const result = {};
    weekdays.forEach((day) => {
      if (!value[day] || typeof value[day] !== 'object') throw new Error(`缺少 ${day} 时间段`);
      result[day] = {};
      scheduleCategories.forEach((category) => {
        if (!Array.isArray(value[day][category])) throw new Error(`缺少 ${day}.${category} 时间段`);
        const windows = value[day][category].map((window) => {
          const start = minute(window?.start); const end = minute(window?.end, true);
          if (end <= start) throw new Error('时间段结束时间必须晚于开始时间');
          return { start: window.start, end: window.end, startMinute: start, endMinute: end };
        }).sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
        windows.slice(1).forEach((window, index) => {
          if (window.startMinute < windows[index].endMinute) throw new Error('同类应用时间段不能重叠');
        });
        result[day][category] = windows.map(({ start, end }) => ({ start, end }));
      });
    });
    return result;
  }
  function classify(policy, application, classification) {
    if (!categories.includes(classification)) throw new Error('无效的应用分类');
    const next = normalize(policy);
    const key = keyOf(application);
    next.classifications = next.classifications.filter((item) => keyOf(item) !== key);
    next.classifications.push({
      platform: application.platform,
      runtimeIdentity: application.runtimeIdentity,
      displayName: application.displayName || null,
      classification,
    });
    return normalize(next);
  }
  function withQuotas(policy, quotas) {
    return normalize({ ...policy, quotas });
  }
  function withTimeWindows(policy, timeWindows) {
    return normalize({ ...policy, timeWindows });
  }
  function exportPayload(policy) {
    const normalized = normalize(policy);
    return { schemaVersion: 2, classifications: normalized.classifications, quotas: normalized.quotas, timeWindows: normalized.timeWindows };
  }
  function importDiff(current, incoming) {
    if (!incoming || ![1, 2].includes(incoming.schemaVersion)) throw new Error('不支持的配置文件');
    const before = normalize(current);
    const after = normalize({ ...incoming, timeWindows: incoming.schemaVersion === 1 ? allOpenTimeWindows() : incoming.timeWindows });
    const beforeMap = new Map(before.classifications.map((item) => [keyOf(item), item.classification]));
    const afterMap = new Map(after.classifications.map((item) => [keyOf(item), item.classification]));
    let added = 0; let changed = 0; let removed = 0;
    for (const [key, value] of afterMap) beforeMap.has(key) ? changed += Number(beforeMap.get(key) !== value) : added += 1;
    for (const key of beforeMap.keys()) removed += Number(!afterMap.has(key));
    return {
      policy: after, added, changed, removed,
      quotasChanged: JSON.stringify(before.quotas) !== JSON.stringify(after.quotas),
      timeWindowsChanged: JSON.stringify(before.timeWindows) !== JSON.stringify(after.timeWindows),
    };
  }
  return { categories, scheduleCategories, weekdays, allOpenTimeWindows, defaultPolicy, normalize, classify, withQuotas, withTimeWindows, exportPayload, importDiff, keyOf };
});
