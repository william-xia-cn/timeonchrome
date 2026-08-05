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
  async getBytesInUse() { return JSON.stringify(this.data).length; }
}

const mockLocal = new MockStorage();
global.chrome = { storage: { local: mockLocal } };

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
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const usageApi = loadProdModule('core/usage-segments.js', [
  'pruneSegmentSyncOutbox',
  'pruneStatsSyncOutbox',
  'pruneHourlyStatsSyncOutbox',
  'pruneTargetStatsSyncOutbox',
  'pruneHourlyTargetStatsSyncOutbox',
  'pruneUsageSegments',
  'pruneDailyUsageStats',
  'pruneHourlyUsageStats',
], { evaluateSuspectSegment: () => ({ suspect: false }), sanitizeIncognitoForPersistence: (value) => value });

const mediaApi = loadProdModule('runtime/media-session.js', [
  'pruneMediaStorage',
], {
  getCachedEffectiveMode: () => 'study',
  resolveSettlementIdentity: async () => ({ profileId: 'p1', deviceId: 'd1' }),
  logFallbackEventBestEffort: async () => {},
  sanitizeIncognitoForPersistence: (value) => value,
});

const maintenance = loadProdModule('infra/storage-maintenance.js', [
  'runV1StorageMaintenance',
  'runStoragePressureGuard',
], {
  ...usageApi,
  ...mediaApi,
  logClientEventBestEffort: async () => {},
});

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

async function run() {
  const manyLogs = Array.from({ length: 150 }, (_, index) => ({ timestamp: Date.now() - index, eventCode: `e${index}` }));
  const manyTrace = Array.from({ length: 90 }, (_, index) => ({ at: index }));
  const oldId = 'seg-20200101-deadbeefdeadbeef';
  await chrome.storage.local.set({
    client_logs_v1: manyLogs,
    __timingTrace: manyTrace,
    event_log_v1: Array.from({ length: 150 }, (_, index) => ({ ts: index })),
    timing_checkpoint_health_v1: { foreground: { status: 'error' } },
    foreground_page_diagnostics_v1: { last: 'diagnostic' },
    media_facts_v1: { 1: { tabId: 1 } },
    media_frame_facts_v1: { '1::tab': { tabId: 1 } },
    segment_sync_outbox_v1: {
      dirtySegmentIds: [oldId, oldId, 'missing-recent'],
      retryCounts: { [oldId]: 2, 'missing-recent': 1 },
      lastErrors: { [oldId]: 'old', 'missing-recent': 'missing' },
    },
  });

  const result = await maintenance.runStoragePressureGuard('unit_pressure');
  const storage = await chrome.storage.local.get(null);

  check('pressure guard reports pressure', result.pressure === true, JSON.stringify(result));
  check('client logs trimmed under pressure', storage.client_logs_v1.length === 100, String(storage.client_logs_v1.length));
  check('timing trace trimmed under pressure', storage.__timingTrace.length === 50, String(storage.__timingTrace.length));
  check('event log trimmed under pressure', storage.event_log_v1.length === 100, String(storage.event_log_v1.length));
  check('checkpoint health cleared under pressure', storage.timing_checkpoint_health_v1 === null, JSON.stringify(storage.timing_checkpoint_health_v1));
  check('media facts cleared under pressure', Object.keys(storage.media_facts_v1).length === 0, JSON.stringify(storage.media_facts_v1));
  check('usage outbox dirty ids pruned', storage.segment_sync_outbox_v1.dirtySegmentIds.length === 0, JSON.stringify(storage.segment_sync_outbox_v1));

  console.log('[Storage Maintenance] 7/7 passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});