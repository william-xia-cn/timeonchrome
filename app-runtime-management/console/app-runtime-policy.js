(function initializeAppRuntimePolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimePolicy = api;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const categories = ['study', 'composite', 'restrictedEntertainment', 'unclassified', 'blocked'];
  const defaultPolicy = () => ({
    version: 0,
    effectiveAtMs: null,
    classifications: [],
    quotas: {
      dailyCategoryMinutes: { study: null, composite: null, restrictedEntertainment: null, unclassified: null },
      weeklyRestrictedEntertainmentMinutes: null,
      perApplicationDailyMinutes: [],
    },
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
    };
    result.classifications.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    result.quotas.perApplicationDailyMinutes.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
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
  function exportPayload(policy) {
    const normalized = normalize(policy);
    return { schemaVersion: 1, classifications: normalized.classifications, quotas: normalized.quotas };
  }
  function importDiff(current, incoming) {
    if (!incoming || incoming.schemaVersion !== 1) throw new Error('不支持的配置文件');
    const before = normalize(current);
    const after = normalize(incoming);
    const beforeMap = new Map(before.classifications.map((item) => [keyOf(item), item.classification]));
    const afterMap = new Map(after.classifications.map((item) => [keyOf(item), item.classification]));
    let added = 0; let changed = 0; let removed = 0;
    for (const [key, value] of afterMap) beforeMap.has(key) ? changed += Number(beforeMap.get(key) !== value) : added += 1;
    for (const key of beforeMap.keys()) removed += Number(!afterMap.has(key));
    return { policy: after, added, changed, removed, quotasChanged: JSON.stringify(before.quotas) !== JSON.stringify(after.quotas) };
  }
  return { categories, defaultPolicy, normalize, classify, withQuotas, exportPayload, importDiff, keyOf };
});
