const assert = require('node:assert/strict');
const { mergeUsage } = require('./app-runtime-usage.js');

const merged = mergeUsage(
  {
    totalDurationMs: 20_000,
    lastSyncAtMs: 100,
    buckets: [{ startAtMs: 0, durationMs: 20_000 }],
    applications: [{ runtimeIdentity: 'app:editor', displayName: 'Editor', durationMs: 20_000 }],
  },
  {
    mainUsageTotalMs: 70_000,
    lastSyncAtMs: 200,
    buckets: [{ startAtMs: 0, durationMs: 70_000 }, { startAtMs: 3_600_000, durationMs: 10_000 }],
    applications: [
      { runtimeIdentity: 'app:editor', displayName: 'Editor', unionMs: 30_000 },
      { runtimeIdentity: 'app:video', displayName: 'Video', unionMs: 40_000 },
    ],
    mediaPlaybackTotalMs: 999_000,
  },
);

assert.equal(merged.totalDurationMs, 90_000);
assert.equal(merged.lastSyncAtMs, 200);
assert.deepEqual(merged.buckets, [
  { startAtMs: 0, durationMs: 90_000 },
  { startAtMs: 3_600_000, durationMs: 10_000 },
]);
assert.deepEqual(merged.applications, [
  { runtimeIdentity: 'app:editor', displayName: 'Editor', durationMs: 50_000 },
  { runtimeIdentity: 'app:video', displayName: 'Video', durationMs: 40_000 },
]);
assert.equal(Object.hasOwn(merged, 'mediaPlaybackTotalMs'), false);

console.log('app-runtime usage merge tests passed');
