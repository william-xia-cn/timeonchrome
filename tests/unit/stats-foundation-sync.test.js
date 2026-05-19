// Stats Foundation v1 sync integration tests
// Tests controlled v1 sync pipeline: terminal settlement → outbox → payload → mock upload → outbox clearing
// Does NOT call remote D1. Uses in-memory mock storage and mock cloud responses.
// Run with: node tests/unit/stats-foundation-sync.test.js

'use strict';

const fs = require('fs');
const path = require('path');

// ── Mock storage ────────────────────────────────────────────────────────────────

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    const r = {};
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) { keys.forEach(k => { r[k] = this.data[k]; }); return r; }
    if (typeof keys === 'string') { r[keys] = this.data[keys]; return r; }
    if (typeof keys === 'object') { Object.keys(keys).forEach(k => { r[k] = this.data[k] ?? keys[k]; }); return r; }
    return r;
  }
  async set(obj) { Object.assign(this.data, obj); }
}

const mockLocal = new MockStorage();
global.chrome = { storage: { local: mockLocal, session: mockLocal } };

// ── Module loader ────────────────────────────────────────────────────────────────

function loadModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf-8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const keys = Object.keys(injected);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function chk(label, actual, expected) {
  const pass = actual === expected;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  pass ? passed++ : failed++;
}
function chkT(label, value) {
  const pass = !!value;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}: expected truthy, got ${JSON.stringify(value)}`);
  pass ? passed++ : failed++;
}
function sec(name) { console.log(`\n[${name}]`); }

// 固定到本地白天时段，避免跨日边界导致的测试不稳定拆段
const MOCK_TIME = new Date('2026-05-08T12:00:00+08:00').getTime();
const today = new Date(MOCK_TIME);
const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

// ═══════════════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════════════

(async () => {

// ── Load modules ──
const usageApi = loadModule('core/usage-segments.js', [
  'settleUsageDuration', 'buildUsageSegmentsUploadPayload', 'buildDailyStatsUploadPayload',
  'getPendingUsageSegments', 'getPendingDailyStats',
  'markUsageSegmentsUploaded', 'markUsageSegmentUploadFailed',
  'markDailyStatsUploaded', 'markDailyStatsUploadFailed',
  'markSegmentSyncDirty', 'markStatsSyncDirty',
  'getAllUsageSegments', 'getDailyUsageStats',
  'clearSegmentSyncOutbox', 'clearStatsSyncOutbox',
]);

// ── TB1: Full segment upload pipeline (settle → outbox → payload → mock upload → outbox cleared) ──
sec('TB1: Segment upload pipeline');
mockLocal.reset();

// Step 1: Settle a segment (creates segment + marks outbox dirty)
await usageApi.settleUsageDuration({
  startMs: MOCK_TIME - 600000, endMs: MOCK_TIME,
  domain: 'sync-seg.com', channel: 'active', mode: 'study',
  sourceState: 'ACTIVE', settlementReason: 'transition_complete',
  profileId: 'p1', deviceId: 'd1',
});

// Step 2: Verify outbox is dirty
let pending = await usageApi.getPendingUsageSegments();
chk('pending count = 1', pending.pendingCount, 1);
chk('segment domain', pending.segments[0].domain, 'sync-seg.com');
chk('segment channel', pending.segments[0].channel, 'active');
chk('segment uploadedAt is null', pending.segments[0].uploadedAt, null);

// Step 3: Build payload
const segIds = pending.segments.map(s => s.id);
const segPayload = await usageApi.buildUsageSegmentsUploadPayload(segIds);
chk('seg payload schemaVersion 1', segPayload.schemaVersion, 1);
chk('seg payload count 1', segPayload.segments.length, 1);
const sp = segPayload.segments[0];
chk('seg payload has id', typeof sp.id, 'string');
chk('seg payload domain', sp.domain, 'sync-seg.com');
chk('seg payload channel', sp.channel, 'active');
chkT('seg payload has date', !!sp.date);
chkT('seg payload has startMs', typeof sp.startMs === 'number');
chkT('seg payload has settlementReason', !!sp.settlementReason);

// Step 4: Simulate successful upload (mock cloud success)
const uploadTime = Date.now();
await usageApi.markUsageSegmentsUploaded(segIds, uploadTime);

// Step 5: Verify outbox cleared
pending = await usageApi.getPendingUsageSegments();
chk('pending count after upload = 0', pending.pendingCount, 0);

// Step 6: Verify uploadedAt is set on segment
const allSegs = await usageApi.getAllUsageSegments();
const uploadedSeg = Object.values(allSegs).find(s => s.domain === 'sync-seg.com');
chkT('uploadedAt set after upload', !!uploadedSeg?.uploadedAt);
chk('uploadedAt ts matches', uploadedSeg?.uploadedAt || 0, uploadTime);

// ── TB2: Segment upload idempotency (re-upload same segment) ──
sec('TB2: Segment upload idempotency');

// Re-mark dirty and re-upload — should be no-op for already-uploaded
await usageApi.markSegmentSyncDirty(segIds);
pending = await usageApi.getPendingUsageSegments();
chk('re-dirty: outbox has 1', pending.pendingCount, 1);

await usageApi.markUsageSegmentsUploaded(segIds, Date.now());
pending = await usageApi.getPendingUsageSegments();
chk('re-upload: outbox cleared', pending.pendingCount, 0);

const allSegs2 = await usageApi.getAllUsageSegments();
chk('still 1 segment total', Object.keys(allSegs2).length, 1);

// ── TB2b: Sub-second segments stay uploadable (durationSeconds=0, exact ms kept) ──
sec('TB2b: Sub-second segment upload payload');
mockLocal.reset();

await usageApi.settleUsageDuration({
  startMs: MOCK_TIME - 500, endMs: MOCK_TIME,
  domain: 'subsecond-sync.test', channel: 'active', mode: 'study',
  sourceState: 'ACTIVE', settlementReason: 'transition_complete',
  profileId: 'p1', deviceId: 'd1',
});

pending = await usageApi.getPendingUsageSegments();
chk('sub-second pending count = 1', pending.pendingCount, 1);
const shortPayload = await usageApi.buildUsageSegmentsUploadPayload(pending.segments.map(s => s.id));
chk('sub-second payload count 1', shortPayload.segments.length, 1);
chk('sub-second payload durationSeconds=0', shortPayload.segments[0].durationSeconds, 0);
chk('sub-second payload keeps exact ms span', shortPayload.segments[0].endMs - shortPayload.segments[0].startMs, 500);

// ── TB3: Segment upload failure preserves outbox ──
sec('TB3: Segment upload failure preserves outbox');
mockLocal.reset();

await usageApi.settleUsageDuration({
  startMs: MOCK_TIME - 300000, endMs: MOCK_TIME,
  domain: 'failretry.com', channel: 'backgroundMedia', mode: 'rest',
  sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'transition_complete',
  profileId: 'p1', deviceId: 'd1',
});

pending = await usageApi.getPendingUsageSegments();
const frIds = pending.segments.map(s => s.id);
chk('outbox has segment before fail', pending.pendingCount, 1);

// Simulate failure
await usageApi.markUsageSegmentUploadFailed(frIds, 'network_error');
pending = await usageApi.getPendingUsageSegments();
chk('outbox still dirty after fail', pending.pendingCount, 1);
chk('retry count = 1', pending.retryCounts[frIds[0]], 1);
chk('last error = network_error', pending.lastErrors[frIds[0]], 'network_error');

// Second failure
await usageApi.markUsageSegmentUploadFailed(frIds, 'timeout');
pending = await usageApi.getPendingUsageSegments();
chk('retry count = 2', pending.retryCounts[frIds[0]], 2);

// Successful upload clears it
await usageApi.markUsageSegmentsUploaded(frIds, Date.now());
pending = await usageApi.getPendingUsageSegments();
chk('outbox cleared after successful retry', pending.pendingCount, 0);
chk('segment retryCount cleared after success', pending.retryCounts[frIds[0]], undefined);
chk('segment lastError cleared after success', pending.lastErrors[frIds[0]], undefined);

// ── TB4: Daily stats upload pipeline ──
sec('TB4: Daily stats upload pipeline');
mockLocal.reset();

// Settle segments for 3 different channel+mode combos
await usageApi.settleUsageDuration({ startMs: MOCK_TIME-600000, endMs: MOCK_TIME-500000, domain: 'daily.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await usageApi.settleUsageDuration({ startMs: MOCK_TIME-500000, endMs: MOCK_TIME-400000, domain: 'daily.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await usageApi.settleUsageDuration({ startMs: MOCK_TIME-400000, endMs: MOCK_TIME, domain: 'daily.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });

// Verify stats outbox is dirty
let statsPending = await usageApi.getPendingDailyStats();
chk('stats outbox has entries', statsPending.pendingCount, 1);
chkT('stats for today exist', !!statsPending.stats[todayStr]);

// Verify daily_usage_stats_v1 has correct data
const dailyStats = await usageApi.getDailyUsageStats(todayStr);
chk('daily active total', dailyStats.domains['daily.com'].activeSeconds, 200);
chk('daily bg total', dailyStats.domains['daily.com'].backgroundMediaSeconds, 400);
chk('daily activeByMode.study', dailyStats.domains['daily.com'].activeByMode.study, 100);
chk('daily activeByMode.rest', dailyStats.domains['daily.com'].activeByMode.rest, 100);

// Build payload — should produce nested byMode shape
const statsPayload = await usageApi.buildDailyStatsUploadPayload(todayStr);
chk('stats payload schemaVersion 1', statsPayload.schemaVersion, 1);
chk('stats payload date = today', statsPayload.date, todayStr);
chkT('stats payload has domains', Array.isArray(statsPayload.domains));
chk('stats payload domain count', statsPayload.domains.length, 1);

const spDom = statsPayload.domains[0];
chk('stats payload domain name', spDom.domain, 'daily.com');
chk('stats payload has activeByMode', typeof spDom.activeByMode, 'object');
chk('stats payload activeByMode.study', spDom.activeByMode.study, 100);
chk('stats payload activeByMode.rest', spDom.activeByMode.rest, 100);
chk('stats payload has backgroundMediaByMode', typeof spDom.backgroundMediaByMode, 'object');
chk('stats payload backgroundMediaByMode.rest', spDom.backgroundMediaByMode.rest, 400);

// Simulate successful upload
await usageApi.markDailyStatsUploaded([todayStr]);

// Verify outbox cleared
statsPending = await usageApi.getPendingDailyStats();
chk('stats outbox cleared after upload', statsPending.pendingCount, 0);

// Verify daily_usage_stats_v1 is NOT deleted after upload
const dailyStatsAfter = await usageApi.getDailyUsageStats(todayStr);
chkT('daily stats still exist after upload', !!dailyStatsAfter);
chk('daily active still 200', dailyStatsAfter.domains['daily.com'].activeSeconds, 200);

// ── TB5: Daily stats upload failure preserves outbox ──
sec('TB5: Daily stats upload failure preserves outbox');
mockLocal.reset();

await usageApi.settleUsageDuration({ startMs: MOCK_TIME-300000, endMs: MOCK_TIME, domain: 'sfail.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });

statsPending = await usageApi.getPendingDailyStats();
chk('stats dirty before fail', statsPending.pendingCount, 1);

// Simulate failure
await usageApi.markDailyStatsUploadFailed([todayStr], 'server_error');
statsPending = await usageApi.getPendingDailyStats();
chk('stats still dirty after fail', statsPending.pendingCount, 1);
chk('stats retry count', statsPending.retryCounts[todayStr], 1);
chk('stats last error', statsPending.lastErrors[todayStr], 'server_error');

// Successful retry
await usageApi.markDailyStatsUploaded([todayStr]);
statsPending = await usageApi.getPendingDailyStats();
chk('stats cleared after retry', statsPending.pendingCount, 0);
chk('stats retryCount cleared after success', statsPending.retryCounts[todayStr], undefined);
chk('stats lastError cleared after success', statsPending.lastErrors[todayStr], undefined);

// ── TB6: Legacy path isolation ──
sec('TB6: Legacy path isolation');
mockLocal.reset();

// Settle segments — should NOT affect legacy cloud_pending_stats
await usageApi.settleUsageDuration({ startMs: MOCK_TIME-300000, endMs: MOCK_TIME, domain: 'legacy-test.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });

// Verify v1 outbox exists
const segOb = (await chrome.storage.local.get('segment_sync_outbox_v1'))['segment_sync_outbox_v1'];
chkT('segment v1 outbox exists', !!segOb);
chk('segment v1 outbox has dirty IDs', segOb.dirtySegmentIds.length, 1);

const statsOb = (await chrome.storage.local.get('stats_sync_outbox_v1'))['stats_sync_outbox_v1'];
chkT('stats v1 outbox exists', !!statsOb);
chk('stats v1 outbox has dirty dates', statsOb.dirtyDates.length, 1);

// Verify legacy cloud_pending_stats is NOT modified
const legacy = await chrome.storage.local.get('cloud_pending_stats');
chk('legacy cloud_pending_stats is undefined', legacy['cloud_pending_stats'], undefined);

// ── TB7: Controlled enablement — default disabled ──
sec('TB7: Controlled enablement — default disabled');
mockLocal.reset();

await usageApi.settleUsageDuration({ startMs: MOCK_TIME-300000, endMs: MOCK_TIME, domain: 'disabled.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });

// Without enablement, outbox is dirty but not cleared
pending = await usageApi.getPendingUsageSegments();
chk('pending before manual upload', pending.pendingCount, 1);
chk('uploadedAt still null', pending.segments[0].uploadedAt, null);

// Manually mark (simulating disabled default — only test harness clears it)
const dSegs = pending.segments.map(s => s.id);
await usageApi.markUsageSegmentsUploaded(dSegs, Date.now());
pending = await usageApi.getPendingUsageSegments();
chk('outbox cleared after test-controlled upload', pending.pendingCount, 0);

// ── TB8: Idempotent stats re-upload ──
sec('TB8: Idempotent stats re-upload');
mockLocal.reset();

await usageApi.settleUsageDuration({ startMs: MOCK_TIME-600000, endMs: MOCK_TIME, domain: 'idemstats.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });

statsPending = await usageApi.getPendingDailyStats();
chk('dirty before first upload', statsPending.pendingCount, 1);

// Upload 1
await usageApi.markDailyStatsUploaded([todayStr]);
statsPending = await usageApi.getPendingDailyStats();
chk('cleared after upload 1', statsPending.pendingCount, 0);

// Re-mark dirty and upload again (idempotent re-upload)
await usageApi.markStatsSyncDirty([todayStr]);
statsPending = await usageApi.getPendingDailyStats();
chk('dirty after re-mark', statsPending.pendingCount, 1);

await usageApi.markDailyStatsUploaded([todayStr]);
statsPending = await usageApi.getPendingDailyStats();
chk('cleared after re-upload', statsPending.pendingCount, 0);

// Verify daily_usage_stats_v1 still intact
const ds2 = await usageApi.getDailyUsageStats(todayStr);
chk('stats intact after re-upload', ds2.domains['idemstats.com'].activeSeconds, 600);

// ── Done ──
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

})();
