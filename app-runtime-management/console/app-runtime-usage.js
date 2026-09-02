(function initializeAppRuntimeUsage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimeUsage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAppRuntimeUsage() {
  function mergeUsage(legacy = {}, accounting = {}) {
    const buckets = new Map();
    for (const bucket of [...(legacy.buckets || []), ...(accounting.buckets || [])]) {
      const startAtMs = Number(bucket.startAtMs);
      buckets.set(startAtMs, (buckets.get(startAtMs) || 0) + Number(bucket.durationMs || 0));
    }

    const applications = new Map();
    for (const application of legacy.applications || []) {
      applications.set(application.runtimeIdentity, {
        runtimeIdentity: application.runtimeIdentity,
        displayName: application.displayName || null,
        durationMs: Number(application.durationMs || 0),
      });
    }
    for (const application of accounting.applications || []) {
      const current = applications.get(application.runtimeIdentity) || {
        runtimeIdentity: application.runtimeIdentity,
        displayName: application.displayName || null,
        durationMs: 0,
      };
      current.displayName = application.displayName || current.displayName;
      current.durationMs += Number(application.unionMs || 0);
      applications.set(application.runtimeIdentity, current);
    }

    return {
      totalDurationMs: Number(legacy.totalDurationMs || 0) + Number(accounting.mainUsageTotalMs || 0),
      lastSyncAtMs: Math.max(Number(legacy.lastSyncAtMs || 0), Number(accounting.lastSyncAtMs || 0)) || null,
      buckets: [...buckets.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([startAtMs, durationMs]) => ({ startAtMs, durationMs })),
      applications: [...applications.values()].sort((left, right) => right.durationMs - left.durationMs),
    };
  }

  return { mergeUsage };
});
