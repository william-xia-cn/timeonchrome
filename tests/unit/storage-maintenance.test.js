// storage-maintenance.test.js
// Run with: node tests/unit/storage-maintenance.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys == null) return { ...this.data };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    return Object.fromEntries(Object.entries(keys || {}).map(([key, fallback]) => [key, this.data[key] ?? fallback]));
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete this.data[key]); }
  async getBytesInUse() { return new TextEncoder().encode(JSON.stringify(this.data)).length; }
}

const mockLocal = new MockStorage();
global.chrome = { storage: { local: mockLocal }, runtime: { getManifest: () => ({ version: 'test' }) } };

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  return new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`)(injected);
}

const usageApi = loadProdModule('core/usage-segments.js', [
  'compactUsageSyncOutboxes', 'pruneUploadedUsageSegments', 'pruneUploadedUsageAggregates',
  'dropOldestPendingUsageSegments', 'normalizeUploadErrorCode', 'splitSegmentByLocalHour',
  'rebuildDailyUsageStats', 'rebuildHourlyUsageStats',
], { evaluateSuspectSegment: () => ({ suspect: false }), sanitizeIncognitoForPersistence: (value) => value });
const mediaApi = loadProdModule('runtime/media-session.js', [
  'pruneMediaStorage', 'dropOldestPendingMediaSegments', 'splitMediaSegmentByLocalHour',
], {
  getCachedEffectiveMode: () => 'study',
  resolveSettlementIdentity: async () => ({ profileId: 'p1', deviceId: 'd1' }),
  logFallbackEventBestEffort: async () => {},
  sanitizeIncognitoForPersistence: (value) => value,
  normalizeUploadErrorCode: usageApi.normalizeUploadErrorCode,
});
const clientApi = loadProdModule('infra/client-logs.js', ['pruneClientLogsForStoragePressure'], {
  sanitizeIncognitoForPersistence: (value) => value,
});
const maintenance = loadProdModule('infra/storage-maintenance.js', ['runV1StorageMaintenance', 'runStoragePressureGuard'], {
  ...usageApi,
  ...mediaApi,
  ...clientApi,
  logClientEventBestEffort: async () => {},
  STORAGE_PRESSURE_BYTES: 7 * 1024 * 1024,
  STORAGE_TARGET_BYTES: Math.floor(6.5 * 1024 * 1024),
  STORAGE_HARD_LIMIT_BYTES: 8 * 1024 * 1024,
  STORAGE_EMERGENCY_RESERVE_BYTES: 64 * 1024,
  withStorageBudgetBypass: async (task) => task(),
});

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

function localDateAndHour(epochMs) {
  const local = new Date(epochMs + 8 * 60 * 60 * 1000);
  const date = local.toISOString().slice(0, 10);
  return { date, hourKey: `${date}T${String(local.getUTCHours()).padStart(2, '0')}` };
}

async function testPressureCleanupAndOutboxCompaction() {
  const now = Date.now();
  const currentLegacyStatsKey = `stats_${(new Date(now)).toISOString().slice(0, 10)}`;
  const oldId = 'seg-20200101-deadbeefdeadbeef';
  const uploadedId = 'seg-20200101-feedfacefeedface';
  await chrome.storage.local.set({
    client_logs_v1: [
      ...Array.from({ length: 20 }, (_, index) => ({ id: `recent-${index}`, timestamp: now - index, level: 'warning', uploadStatus: 'pending' })),
      { id: 'expired', timestamp: now - 4 * 86400000, level: 'error', uploadStatus: 'pending' },
      { id: 'uploaded', timestamp: now, level: 'error', uploadStatus: 'uploaded' },
    ],
    __timingTrace: Array.from({ length: 90 }, (_, index) => ({ at: index })),
    debug_focus_ledger_v1: [{ time: now }],
    mode_effect_trace_v1: [{ atMs: now }],
    event_log_v1: Array.from({ length: 30 }, (_, index) => ({ type: index % 2 ? 'END' : 'START', time: now - index * 1000 })),
    timing_checkpoint_health_v1: { foreground: { status: 'error' } },
    foreground_page_diagnostics_v1: { last: 'diagnostic' },
    'stats_2020-01-01': { legacy: true },
    [currentLegacyStatsKey]: { legacy: true },
    daily_usage_stats_v1: { '2020-01-01': { date: '2020-01-01', uploadedAt: now } },
    hourly_usage_stats_v1: { '2020-01-01T08': { hourKey: '2020-01-01T08', uploadedAt: now } },
    stats_sync_outbox_v1: { dirtyDates: [], retryCounts: {}, lastErrors: {} },
    target_stats_sync_outbox_v1: { dirtyDates: [], retryCounts: {}, lastErrors: {} },
    hourly_stats_sync_outbox_v1: { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} },
    hourly_target_stats_sync_outbox_v1: { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} },
    media_facts_v1: { 1: { tabId: 1 } },
    media_frame_facts_v1: { '1::tab': { tabId: 1 } },
    usage_segments_v1: {
      [oldId]: { id: oldId, startMs: 1, endMs: 2, uploadedAt: null },
      [uploadedId]: { id: uploadedId, startMs: 1, endMs: 2, uploadedAt: now },
    },
    usage_segments_index_v1: { '2020-01-01': [oldId, oldId, uploadedId, 'missing'] },
    segment_sync_outbox_v1: {
      dirtySegmentIds: [oldId, oldId, 'missing'],
      retryCounts: { [oldId]: 5000, missing: 1 },
      lastErrors: { [oldId]: '<html>503 Service Unavailable</html>'.repeat(1000), missing: 'missing' },
    },
  });

  const result = await maintenance.runStoragePressureGuard('unit_pressure');
  const storage = await chrome.storage.local.get(null);
  check('pressure guard reports pressure', result.pressure === true);
  check('expired and uploaded client logs are removed', storage.client_logs_v1.length === 20, String(storage.client_logs_v1.length));
  check('pure traces are cleared', storage.__timingTrace.length === 0 && storage.debug_focus_ledger_v1.length === 0 && storage.mode_effect_trace_v1.length === 0);
  check('checkpoint diagnostics are cleared', Object.keys(storage.timing_checkpoint_health_v1 || {}).length === 0);
  check('pressure removes only old dated legacy stats', !storage['stats_2020-01-01'] && Boolean(storage[currentLegacyStatsKey]));
  check('pressure removes old uploaded daily and hourly aggregates', !storage.daily_usage_stats_v1['2020-01-01'] && !storage.hourly_usage_stats_v1['2020-01-01T08']);
  check('inactive media facts are cleared', Object.keys(storage.media_facts_v1 || {}).length === 0);
  check('pending usage segment is preserved and deduplicated', JSON.stringify(storage.segment_sync_outbox_v1.dirtySegmentIds) === JSON.stringify([oldId]));
  check('long 503 error is compressed', storage.segment_sync_outbox_v1.lastErrors[oldId] === 'http_503');
  check('retry metadata is capped', storage.segment_sync_outbox_v1.retryCounts[oldId] === 1000);
  check('old uploaded segment is pruned', !storage.usage_segments_v1[uploadedId]);
  check('old pending segment remains', Boolean(storage.usage_segments_v1[oldId]));
  check('privacy-safe storage diagnostics are bounded', storage.storage_diagnostics_v1.keys.length <= 30 && storage.storage_diagnostics_v1.keys.every((item) => Object.keys(item).every((key) => ['key', 'bytes', 'count', 'pending'].includes(key))));
}

async function testSevenMegabytePressureTarget() {
  mockLocal.reset();
  const tenDaysAgo = Date.now() - 10 * 86400000;
  const date = new Date(tenDaysAgo).toISOString().slice(0, 10);
  const ids = Array.from({ length: 4 }, (_, index) => `seg-${date.replace(/-/g, '')}-${String(index + 1).repeat(16)}`);
  const pendingId = `seg-${date.replace(/-/g, '')}-aaaaaaaaaaaaaaaa`;
  const segments = Object.fromEntries(ids.map((id) => [id, {
    id, startMs: tenDaysAgo, endMs: tenDaysAgo + 1000, uploadedAt: Date.now(), payload: 'x'.repeat(2 * 1024 * 1024),
  }]));
  segments[pendingId] = { id: pendingId, startMs: tenDaysAgo, endMs: tenDaysAgo + 1000, uploadedAt: null, payload: 'y'.repeat(256 * 1024) };
  await chrome.storage.local.set({
    usage_segments_v1: segments,
    usage_segments_index_v1: { [date]: [...ids, pendingId] },
    segment_sync_outbox_v1: { dirtySegmentIds: [pendingId], retryCounts: {}, lastErrors: {} },
  });
  const result = await maintenance.runV1StorageMaintenance({ reason: 'unit_over_7mb' });
  const storage = await chrome.storage.local.get(null);
  check('7MB threshold enters pressure mode', result.pressure === true && result.beforeBytes > 7 * 1024 * 1024, JSON.stringify(result));
  check('pressure maintenance reaches 6.5MB target', result.afterBytes < 6.5 * 1024 * 1024, JSON.stringify(result));
  check('uploaded segments older than seven days are pruned', ids.every((id) => !storage.usage_segments_v1[id]));
  check('ordinary pressure never deletes pending usage', Boolean(storage.usage_segments_v1[pendingId]));
}

async function testEmergencyLossOrderAndProtectedData() {
  mockLocal.reset();
  const now = Date.now();
  const { date, hourKey } = localDateAndHour(now);
  const usageId = `seg-${date.replace(/-/g, '')}-bbbbbbbbbbbbbbbb`;
  const mediaId = `mseg-${date.replace(/-/g, '')}-cccccccccccccccc`;
  await chrome.storage.local.set({
    guardian_config: { protected: true },
    storage_emergency_loss_v1: Array.from({ length: 20 }, (_, index) => ({ at: now - index, type: 'old', dropped: 1, oldestAt: now - index, newestAt: now - index, reason: 'old' })),
    session_v1: { state: 'ACTIVE', startTime: now },
    site_classification_requests_v1: [
      { id: 'auto', status: 'pending', recordSource: 'auto_unclassified_access', syncStatus: 'uploaded', updatedAt: now - 4 * 86400000 },
      { id: 'manual', status: 'pending', recordSource: 'manual_learning_request', manualRequestedAt: now },
      { id: 'rejected', status: 'rejected', recordSource: 'auto_unclassified_access', syncStatus: 'uploaded' },
    ],
    media_segments_v1: {
      [mediaId]: { id: mediaId, date, timezone: 'Asia/Shanghai', startMs: now, endMs: now + 1000, payload: 'm'.repeat(2 * 1024 * 1024) },
    },
    daily_media_stats_v1: { [date]: { date, totalSeconds: 1 } },
    hourly_media_stats_v1: { [hourKey]: { hourKey, date, totalSeconds: 1 } },
    media_segment_sync_outbox_v1: { pendingIds: [mediaId], retryCounts: {}, lastErrors: {} },
    media_stats_sync_outbox_v1: { dirtyDates: [date], retryCounts: {}, lastErrors: {} },
    hourly_media_stats_sync_outbox_v1: { dirtyHourKeys: [hourKey], retryCounts: {}, lastErrors: {} },
    usage_segments_v1: {
      [usageId]: { id: usageId, date, timezone: 'Asia/Shanghai', startMs: now, endMs: now + 1000, durationSeconds: 1, payload: 'u'.repeat(7 * 1024 * 1024) },
    },
    usage_segments_index_v1: { [date]: [usageId] },
    daily_usage_stats_v1: { [date]: { date, totalSeconds: 1 } },
    hourly_usage_stats_v1: { [hourKey]: { hourKey, date, totalSeconds: 1 } },
    segment_sync_outbox_v1: { dirtySegmentIds: [usageId], retryCounts: {}, lastErrors: {} },
    stats_sync_outbox_v1: { dirtyDates: [date], retryCounts: {}, lastErrors: {} },
    target_stats_sync_outbox_v1: { dirtyDates: [date], retryCounts: {}, lastErrors: {} },
    hourly_stats_sync_outbox_v1: { dirtyHourKeys: [hourKey], retryCounts: {}, lastErrors: {} },
    hourly_target_stats_sync_outbox_v1: { dirtyHourKeys: [hourKey], retryCounts: {}, lastErrors: {} },
  });

  const result = await maintenance.runV1StorageMaintenance({ reason: 'unit_emergency', pressure: true, emergency: true });
  const storage = await chrome.storage.local.get(null);
  const auditTypes = (storage.storage_emergency_loss_v1 || []).map((entry) => entry.type);
  check('emergency reaches 6.5MB target', result.afterBytes < 6.5 * 1024 * 1024, JSON.stringify(result));
  check('pending media is discarded before final usage fallback', result.droppedMedia === 1 && result.droppedUsage === 1, JSON.stringify(result));
  check('loss audit records media and usage without content fields', auditTypes.includes('media_segments_v1') && auditTypes.includes('usage_segments_v1') && JSON.stringify(storage.storage_emergency_loss_v1).length < 8 * 1024, JSON.stringify(storage.storage_emergency_loss_v1));
  check('loss audit rolls overflow into cumulative count', storage.storage_emergency_loss_v1.length <= 20 && auditTypes.includes('cumulative') && storage.storage_emergency_loss_v1[0].dropped >= 2);
  check('dropped segment ids are removed from outboxes and index', !storage.media_segment_sync_outbox_v1.pendingIds.includes(mediaId) && !storage.segment_sync_outbox_v1.dirtySegmentIds.includes(usageId) && !storage.usage_segments_index_v1?.[date]);
  check('aggregates remain dirty after raw usage loss', storage.stats_sync_outbox_v1.dirtyDates.includes(date) && storage.target_stats_sync_outbox_v1.dirtyDates.includes(date) && storage.hourly_stats_sync_outbox_v1.dirtyHourKeys.includes(hourKey));
  const compactedJson = JSON.stringify(storage.usage_compacted_facts_v1 || {});
  check('usage loss preserves unattributed compacted total without domain or content', compactedJson.includes('"seconds":1') && !compactedJson.includes('payload') && !compactedJson.includes('bbbbbbbbbbbbbbbb'));
  await usageApi.rebuildDailyUsageStats(date, { forceWriteEmpty: true });
  const rebuilt = (await chrome.storage.local.get('daily_usage_stats_v1')).daily_usage_stats_v1[date];
  check('daily rebuild restores compacted total without synthetic domain', rebuilt.compactedSeconds === 1 && Object.keys(rebuilt.domains || {}).length === 0);
  check('config and active session are protected', storage.guardian_config.protected === true && storage.session_v1.state === 'ACTIVE');
  check('manual and decision requests are protected while stale auto record is removed', !storage.site_classification_requests_v1.some((item) => item.id === 'auto') && storage.site_classification_requests_v1.some((item) => item.id === 'manual') && storage.site_classification_requests_v1.some((item) => item.id === 'rejected'));
}

async function run() {
  await testPressureCleanupAndOutboxCompaction();
  await testSevenMegabytePressureTarget();
  await testEmergencyLossOrderAndProtectedData();
  console.log('[Storage Maintenance] 30/30 passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});