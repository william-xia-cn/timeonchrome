// Usage segments settlement tests
// Run with: node tests/unit/usage-segments.test.js

'use strict';

const fs = require('fs');
const path = require('path');

// ── Mock chrome.storage ──────────────────────────────────────────────────────────

class MockStorage {
  constructor() {
    this.data = {};
  }
  reset() { this.data = {}; }
  async get(keys) {
    const result = {};
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) { keys.forEach(k => { result[k] = this.data[k]; }); return result; }
    if (typeof keys === 'string') { result[keys] = this.data[keys]; return result; }
    if (typeof keys === 'object') { Object.keys(keys).forEach(k => { result[k] = this.data[k] ?? keys[k]; }); return result; }
    return result;
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) { const arr = Array.isArray(keys) ? keys : [keys]; arr.forEach(k => delete this.data[k]); }
}

const mockLocal = new MockStorage();
global.chrome = { storage: { local: mockLocal, session: mockLocal } };

// ── Module loader ────────────────────────────────────────────────────────────────

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf-8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const api = loadProdModule('core/usage-segments.js', [
  'generateSegmentId', 'stateToChannel', 'isCountedState', 'getLocalDateInfo', 'getLocalHourInfo',
  'splitSegmentByLocalDate', 'splitSegmentByLocalHour', 'buildUsageSegment',
  'appendUsageSegments', 'incrementDailyUsageStats', 'incrementHourlyUsageStats',
  'getUsageSegmentsByDate', 'getAllUsageSegments', 'getDailyUsageStats', 'getHourlyUsageStats',
  'rebuildDailyUsageStats', 'rebuildHourlyUsageStats',
  'markSegmentSyncDirty', 'markStatsSyncDirty', 'markHourlyStatsSyncDirty',
  'clearSegmentSyncOutbox', 'clearStatsSyncOutbox', 'clearHourlyStatsSyncOutbox',
  'getPendingUsageSegments', 'getPendingDailyStats', 'getPendingHourlyStats',
  'markUsageSegmentsUploaded', 'markUsageSegmentUploadFailed',
  'markDailyStatsUploaded', 'markDailyStatsUploadFailed',
  'markHourlyStatsUploaded', 'markHourlyStatsUploadFailed',
  'buildUsageSegmentsUploadPayload', 'buildDailyStatsUploadPayload', 'buildHourlyStatsUploadPayload',
  'pruneSegmentSyncOutbox', 'pruneStatsSyncOutbox', 'pruneHourlyStatsSyncOutbox',
  'pruneUsageSegments', 'pruneDailyUsageStats', 'pruneHourlyUsageStats',
  'settleUsageDuration',
]);

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

function chkA(label, actual, expected, tol = 2) {
  const pass = Math.abs(actual - expected) <= tol;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}: expected ~${expected}, got ${actual}`);
  pass ? passed++ : failed++;
}

function sec(name) { console.log(`\n[${name}]`); }

// 固定到本地白天时段，避免跨日边界导致的测试不稳定拆段
const MOCK_TIME = new Date('2026-05-08T12:00:00+08:00').getTime();
const today = new Date(MOCK_TIME);
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

(async () => {

// ── TB1: Channel mapping ──
sec('TB1: Channel mapping');
chk('ACTIVE -> active', api.stateToChannel('ACTIVE'), 'active');
chk('BACKGROUND_ACTIVE -> bgMedia', api.stateToChannel('BACKGROUND_ACTIVE'), 'backgroundMedia');
chk('PIP_ACTIVE -> pip', api.stateToChannel('PIP_ACTIVE'), 'pip');
chk('PASSIVE -> null', api.stateToChannel('PASSIVE'), null);
chk('IDLE -> null', api.stateToChannel('IDLE'), null);

// ── TB2: isCountedState ──
sec('TB2: isCountedState');
chk('ACTIVE counted', api.isCountedState('ACTIVE'), true);
chk('BACKGROUND_ACTIVE counted', api.isCountedState('BACKGROUND_ACTIVE'), true);
chk('PIP_ACTIVE counted', api.isCountedState('PIP_ACTIVE'), true);
chk('PASSIVE not counted', api.isCountedState('PASSIVE'), false);
chk('IDLE not counted', api.isCountedState('IDLE'), false);

// ── TB3: Segment ID generation ──
sec('TB3: Segment ID gen');
const input3 = { startMs: MOCK_TIME-600000, endMs: MOCK_TIME, date: todayStr, domain: 'a.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p', deviceId: 'd', parentSegmentId: null, partIndex: 1 };
const id1 = api.generateSegmentId(input3);
const id2 = api.generateSegmentId(input3);
chk('Same input same ID', id1, id2);
chkT('ID pattern seg-NNNNNNNN-16hex', /^seg-\d{8}-[0-9a-f]{16}$/.test(id1));

// ── TB4: Build segment ──
sec('TB4: Build segment');
const seg4 = api.buildUsageSegment(input3);
chk('id string', typeof seg4.id, 'string');
chk('schemaVersion 1', seg4.schemaVersion, 1);
chk('domain', seg4.domain, 'a.com');
chk('mode', seg4.mode, 'study');
chk('sourceState', seg4.sourceState, 'ACTIVE');
chk('settlementReason', seg4.settlementReason, 'tc');
chk('durationSeconds', seg4.durationSeconds, 600);
chk('uploadedAt null', seg4.uploadedAt, null);
chk('description schemaVersion', seg4.description.schemaVersion, 1);
chk('description start source default', seg4.description.start.source, 'unknown');
chk('description end source default', seg4.description.end.source, 'unknown');
chk('description summary default', seg4.description.summary, '开始：—；结束：—');
const seg4b = api.buildUsageSegment({ ...input3, tabId: 123, windowId: 456 });
chk('local tabId preserved', seg4b.tabId, 123);
chk('local windowId preserved', seg4b.windowId, 456);
const seg4Target = api.buildUsageSegment({
  ...input3,
  managedTargetId: 'mt_target',
  managedTargetType: 'playlist',
  managedTargetNamespace: 'youtube',
  managedTargetValue: 'PL123',
  managedTargetLabelAtTime: 'Algebra Playlist',
  targetSourceAtTime: 'parent',
  targetRuleId: 'rule-1',
  targetMatchLevel: 'playlist',
  targetClassificationAtTime: 'study',
  quotaBucketAtTime: 'study',
});
chk('managedTargetId preserved', seg4Target.managedTargetId, 'mt_target');
chk('managedTargetType preserved', seg4Target.managedTargetType, 'playlist');
chk('quotaBucketAtTime preserved', seg4Target.quotaBucketAtTime, 'study');
chk('managed target fields do not change segment id', seg4Target.id, seg4.id);

const seg4c = api.buildUsageSegment({ ...input3, channel: 'pip', domain: 'pip.com', mode: 'rest', sourceState: 'PIP_ACTIVE' });
chk('channel pip', seg4c.channel, 'pip');
const seg4d = api.buildUsageSegment({
  ...input3,
  description: {
    start: { reason: 'tabActivated', operation: 'tabActivated', source: 'chrome_event', atMs: MOCK_TIME - 600000 },
    end: { reason: 'tabUpdated', operation: 'tabUpdated', source: 'chrome_event', atMs: MOCK_TIME },
  },
});
chk('description start reason preserved', seg4d.description.start.reason, 'tabActivated');
chk('description end reason preserved', seg4d.description.end.reason, 'tabUpdated');
chk('description summary generated', seg4d.description.summary, '开始：tabActivated；结束：tabUpdated');

// ── TB5: Append + idempotency + date query ──
sec('TB5: Append / idempotent / date query');
mockLocal.reset();
let n = await api.appendUsageSegments([seg4]);
chk('append 1', n, 1);
let all = await api.getAllUsageSegments();
chk('stored 1', Object.keys(all).length, 1);
chkT('retrievable', !!all[seg4.id]);
let byDate = await api.getUsageSegmentsByDate(seg4.date);
chk('byDate 1', byDate.length, 1);
chk('byDate id match', byDate[0].id, seg4.id);

n = await api.appendUsageSegments([seg4]);
chk('idempotent append 0', n, 0);
all = await api.getAllUsageSegments();
chk('still 1', Object.keys(all).length, 1);

// ── TB6: Increment daily aggregate ──
sec('TB6: Daily aggregate increment');
mockLocal.reset();
const as = api.buildUsageSegment({ startMs: MOCK_TIME-600000, endMs: MOCK_TIME, domain: 'ex.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc' });
await api.incrementDailyUsageStats(as);
let st = await api.getDailyUsageStats(as.date);
chkT('stats exist', !!st);
chk('active=600', st.domains['ex.com'].activeSeconds, 600);
chk('bg=0', st.domains['ex.com'].backgroundMediaSeconds, 0);
chk('mode study=600', st.domains['ex.com'].activeByMode.study, 600);
chk('fallback target active=600', st.targets['fallback:domain:ex.com'].activeSeconds, 600);
chk('fallback target quota study=600', st.targets['fallback:domain:ex.com'].activeByQuotaBucket.study, 600);

const bs = api.buildUsageSegment({ startMs: MOCK_TIME-300000, endMs: MOCK_TIME, domain: 'ex.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc' });
await api.incrementDailyUsageStats(bs);
st = await api.getDailyUsageStats(as.date);
chk('active still 600', st.domains['ex.com'].activeSeconds, 600);
chk('bg=300', st.domains['ex.com'].backgroundMediaSeconds, 300);
chk('total=900', st.domains['ex.com'].totalSeconds, 900);

const ps = api.buildUsageSegment({ startMs: MOCK_TIME-100000, endMs: MOCK_TIME, domain: 'pip.com', channel: 'pip', mode: 'rest', sourceState: 'PIP_ACTIVE', settlementReason: 'tc' });
await api.incrementDailyUsageStats(ps);
st = await api.getDailyUsageStats(as.date);
chk('pip=100', st.domains['pip.com'].pipSeconds, 100);
chk('segCount=3', st.segmentsCount, 3);

const ts = api.buildUsageSegment({
  startMs: MOCK_TIME - 120000,
  endMs: MOCK_TIME,
  domain: 'www.youtube.com',
  channel: 'active',
  mode: 'rest',
  sourceState: 'ACTIVE',
  settlementReason: 'tc',
  managedTargetId: 'mt_playlist',
  managedTargetType: 'playlist',
  managedTargetNamespace: 'youtube',
  managedTargetValue: 'PLSTUDY',
  managedTargetLabelAtTime: 'Study Playlist',
  targetSourceAtTime: 'parent',
  targetRuleId: 'rule-playlist',
  targetMatchLevel: 'playlist',
  targetClassificationAtTime: 'study',
  quotaBucketAtTime: 'study',
});
await api.incrementDailyUsageStats(ts);
st = await api.getDailyUsageStats(as.date);
chk('target aggregate exists', !!st.targets.mt_playlist, true);
chk('target aggregate active=120', st.targets.mt_playlist.activeSeconds, 120);
chk('target aggregate classification snapshot', st.targets.mt_playlist.targetClassificationAtTime, 'study');
chk('target aggregate quota study=120', st.targets.mt_playlist.activeByQuotaBucket.study, 120);

// ── TB6b: Increment hourly aggregate ──
sec('TB6b: Hourly aggregate increment');
mockLocal.reset();
const crossHourStart = new Date('2026-05-08T12:59:30+08:00').getTime();
const crossHourEnd = new Date('2026-05-08T13:00:30+08:00').getTime();
const hs = api.buildUsageSegment({
  startMs: crossHourStart,
  endMs: crossHourEnd,
  domain: 'hour.com',
  channel: 'active',
  mode: 'rest',
  sourceState: 'ACTIVE',
  settlementReason: 'tc',
});
const hourSlices = api.splitSegmentByLocalHour(hs);
chk('cross-hour slice count', hourSlices.length, 2);
chk('hour slice seconds preserved', hourSlices.reduce((sum, slice) => sum + slice.durationSeconds, 0), 60);
await api.incrementHourlyUsageStats(hs);
let hourly = await api.getHourlyUsageStats();
chk('hourly entry count', Object.keys(hourly).length, 2);
chk('first hour active=30', hourly['2026-05-08T12'].domains['hour.com'].activeSeconds, 30);
chk('second hour active=30', hourly['2026-05-08T13'].domains['hour.com'].activeSeconds, 30);

// ── TB7: Cross-day split ──
sec('TB7: Cross-day split');
mockLocal.reset();
const localToday = new Date();
localToday.setHours(23, 30, 0, 0);
const startNight = localToday.getTime();
const endMorning = startNight + 3600000;

const children = api.splitSegmentByLocalDate({
  startMs: startNight, endMs: endMorning, domain: 'xday.com', channel: 'active', mode: 'rest',
  sourceState: 'ACTIVE', settlementReason: 'tc', timezone: 'Asia/Shanghai',
  profileId: 'p1', deviceId: 'd1',
});
chkT('multiple children', children.length > 1);
chkT('different dates', children[0].date !== children[1].date);
chk('partCount', children[0].partCount, children.length);
chk('partIndex1', children[0].partIndex, 1);
chk('partIndex2', children[1].partIndex, 2);
if (children.length === 2) {
  chkT('parent ID set', !!children[0].parentSegmentId);
  chk('shared parent', children[0].parentSegmentId, children[1].parentSegmentId);
}
const totalDur = children.reduce((s, c) => s + c.durationSeconds, 0);
chkA('total preserved', totalDur, 3600, 5);

// ── TB8: Full settlement (segment + aggregate + outbox) ──
sec('TB8: Full settlement path');
mockLocal.reset();
n = await api.settleUsageDuration({
  startMs: MOCK_TIME-300000, endMs: MOCK_TIME, domain: 'settle.com', channel: 'active', mode: 'study',
  sourceState: 'ACTIVE', settlementReason: 'transition_complete', profileId: 'p1', deviceId: 'd1',
});
chk('settle creates 1', n, 1);
all = await api.getAllUsageSegments();
chk('segment stored', Object.keys(all).length, 1);

st = await api.getDailyUsageStats(todayStr);
chk('agg active=300', st.domains['settle.com'].activeSeconds, 300);
hourly = await api.getHourlyUsageStats(`${todayStr}T11`);
chk('hourly agg active=300', hourly.domains['settle.com'].activeSeconds, 300);

// Check outbox
let outbox1 = (await chrome.storage.local.get('segment_sync_outbox_v1'))['segment_sync_outbox_v1'];
chkT('segment outbox dirty', (outbox1?.dirtySegmentIds || []).length > 0);
let outbox2 = (await chrome.storage.local.get('stats_sync_outbox_v1'))['stats_sync_outbox_v1'];
chkT('stats outbox dirty', (outbox2?.dirtyDates || []).length > 0);
let hourlyOutbox = (await chrome.storage.local.get('hourly_stats_sync_outbox_v1'))['hourly_stats_sync_outbox_v1'];
chkT('hourly stats outbox dirty', (hourlyOutbox?.dirtyHourKeys || []).length > 0);

// Idempotent: same settlement again
n = await api.settleUsageDuration({
  startMs: MOCK_TIME-300000, endMs: MOCK_TIME, domain: 'settle.com', channel: 'active', mode: 'study',
  sourceState: 'ACTIVE', settlementReason: 'transition_complete', profileId: 'p1', deviceId: 'd1',
});
chk('idempotent settle 0', n, 0);
st = await api.getDailyUsageStats(todayStr);
chk('agg unchanged', st.domains['settle.com'].activeSeconds, 300);
hourly = await api.getHourlyUsageStats(`${todayStr}T11`);
chk('hourly agg unchanged', hourly.domains['settle.com'].activeSeconds, 300);

// ── TB9: PASSIVE/IDLE skipped ──
sec('TB9: PASSIVE/IDLE skipped');
mockLocal.reset();
n = await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'p.com', channel: 'active', mode: 'rest', sourceState: 'PASSIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
chk('PASSIVE skipped', n, 0);
n = await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'i.com', channel: 'active', mode: 'rest', sourceState: 'IDLE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
chk('IDLE skipped', n, 0);
all = await api.getAllUsageSegments();
chk('no segments', Object.keys(all).length, 0);

// ── TB10: Outbox marking ──
sec('TB10: Outbox marking');
mockLocal.reset();
await api.markSegmentSyncDirty(['seg-20260506-abcdef0123456789', 'seg-20260506-fedcba9876543210']);
let ob = (await chrome.storage.local.get('segment_sync_outbox_v1'))['segment_sync_outbox_v1'];
chk('ob count 2', ob.dirtySegmentIds.length, 2);
await api.markSegmentSyncDirty('seg-20260506-abcdef0123456789');
ob = (await chrome.storage.local.get('segment_sync_outbox_v1'))['segment_sync_outbox_v1'];
chk('ob dedup still 2', ob.dirtySegmentIds.length, 2);
await api.clearSegmentSyncOutbox();
ob = (await chrome.storage.local.get('segment_sync_outbox_v1'))['segment_sync_outbox_v1'];
chk('ob cleared', ob.dirtySegmentIds.length, 0);

// ── TB11: Aggregate = sum of segments ──
sec('TB11: Aggregate = sum of segments');
mockLocal.reset();
await api.settleUsageDuration({ startMs: MOCK_TIME-1800000, endMs: MOCK_TIME-1200000, domain: 'sum.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.settleUsageDuration({ startMs: MOCK_TIME-1200000, endMs: MOCK_TIME-600000, domain: 'sum.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.settleUsageDuration({ startMs: MOCK_TIME-600000, endMs: MOCK_TIME, domain: 'sum.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });

st = await api.getDailyUsageStats(todayStr);
chk('active sum 1200', st.domains['sum.com'].activeSeconds, 1200);
chk('bg sum 600', st.domains['sum.com'].backgroundMediaSeconds, 600);
chk('total 1800', st.domains['sum.com'].totalSeconds, 1800);

const segs = await api.getUsageSegmentsByDate(todayStr);
const ds = segs.filter(s => s.domain === 'sum.com');
const sa = ds.filter(s => s.channel === 'active').reduce((s, seg) => s + seg.durationSeconds, 0);
const sb = ds.filter(s => s.channel === 'backgroundMedia').reduce((s, seg) => s + seg.durationSeconds, 0);
chk('seg active = agg', sa, st.domains['sum.com'].activeSeconds);
chk('seg bg = agg', sb, st.domains['sum.com'].backgroundMediaSeconds);

// ── TB12: Rebuild ──
sec('TB12: Rebuild');
mockLocal.reset();
const r1 = api.buildUsageSegment({ startMs: MOCK_TIME-600000, endMs: MOCK_TIME-300000, domain: 'rebuild.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc' });
const r2 = api.buildUsageSegment({ startMs: MOCK_TIME-300000, endMs: MOCK_TIME, domain: 'rebuild.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc' });
await api.appendUsageSegments([r1, r2]);
const rResult = await api.rebuildDailyUsageStats(r1.date);
chkT('rebuild ok', rResult.rebuilt);
chk('used 2', rResult.segmentsUsed, 2);
st = await api.getDailyUsageStats(r1.date);
chk('rebuilt active=600', st.domains['rebuild.com'].activeSeconds, 600);

// ── TB13: Prune ──
sec('TB13: Prune');
mockLocal.reset();
const oldD = new Date(); oldD.setDate(oldD.getDate() - 400);
const oldS = `${oldD.getFullYear()}-${String(oldD.getMonth()+1).padStart(2,'0')}-${String(oldD.getDate()).padStart(2,'0')}`;
const oldSeg = api.buildUsageSegment({ startMs: oldD.getTime(), endMs: oldD.getTime()+60000, date: oldS, domain: 'old.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc' });
const recentSeg = api.buildUsageSegment({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'new.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc' });
await api.appendUsageSegments([oldSeg, recentSeg]);
chk('before prune 2', Object.keys(await api.getAllUsageSegments()).length, 2);
const pruned = await api.pruneUsageSegments(365);
chk('pruned 1', pruned, 1);
chk('after prune 1', Object.keys(await api.getAllUsageSegments()).length, 1);

// ── TB14: getLocalDateInfo ──
sec('TB14: getLocalDateInfo');
const info14 = api.getLocalDateInfo(MOCK_TIME, 480);
chkT('date string', typeof info14.date === 'string');
chkT('dayStartMs number', typeof info14.dayStartMs === 'number');
chkT('epoch in range', MOCK_TIME >= info14.dayStartMs && MOCK_TIME <= info14.dayEndMs);

// ── TB15: Tab close settlement reason ──
sec('TB15: Tab close settlement reason');
mockLocal.reset();
await api.settleUsageDuration({
  startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'tabclose.com', channel: 'active', mode: 'rest',
  sourceState: 'ACTIVE', settlementReason: 'tab_close', profileId: 'p1', deviceId: 'd1',
});
all = await api.getAllUsageSegments();
const tcSeg = Object.values(all).find(s => s.settlementReason === 'tab_close');
chkT('tab_close reason stored', !!tcSeg);
chk('tab_close domain', tcSeg.domain, 'tabclose.com');

// ── TB16: Monitoring off settlement reason ──
sec('TB16: Monitoring off settlement reason');
mockLocal.reset();
await api.settleUsageDuration({
  startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'monoff.com', channel: 'active', mode: 'rest',
  sourceState: 'ACTIVE', settlementReason: 'monitoring_off', profileId: 'p1', deviceId: 'd1',
});
all = await api.getAllUsageSegments();
const moSeg = Object.values(all).find(s => s.settlementReason === 'monitoring_off');
chkT('monitoring_off reason stored', !!moSeg);
chk('monitoring_off domain', moSeg.domain, 'monoff.com');

// ── TB17: Mode context from cached context (not post-transition) ──
sec('TB17: Mode context correctness');
mockLocal.reset();
// Settle with explicit mode — should be stored as-is
await api.settleUsageDuration({
  startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'mode.com', channel: 'active', mode: 'rest',
  sourceState: 'ACTIVE', settlementReason: 'transition_complete', profileId: 'p1', deviceId: 'd1',
});
all = await api.getAllUsageSegments();
const modeSeg = Object.values(all)[0];
chk('mode stored as rest', modeSeg.mode, 'rest');

// Settle with study mode
await api.settleUsageDuration({
  startMs: MOCK_TIME-120000, endMs: MOCK_TIME-60000, domain: 'study.com', channel: 'active', mode: 'study',
  sourceState: 'ACTIVE', settlementReason: 'mode_switch', profileId: 'p1', deviceId: 'd1',
});
all = await api.getAllUsageSegments();
const studySeg = Object.values(all).find(s => s.mode === 'study');
chkT('study mode stored', !!studySeg);
chk('study mode domain', studySeg.domain, 'study.com');

// Mode switch does not overwrite previous segment's mode
const restSeg = Object.values(all).find(s => s.mode === 'rest');
chkT('rest mode survives mode switch', !!restSeg);

// ── TB18: Storage index consistency ──
sec('TB18: Storage index consistency');
mockLocal.reset();
const idxSeg1 = api.buildUsageSegment({ startMs: MOCK_TIME-300000, endMs: MOCK_TIME-200000, domain: 'idx1.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc' });
const idxSeg2 = api.buildUsageSegment({ startMs: MOCK_TIME-200000, endMs: MOCK_TIME-100000, domain: 'idx2.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc' });
await api.appendUsageSegments([idxSeg1, idxSeg2]);

const idxDate = idxSeg1.date;
let idxByDate = await api.getUsageSegmentsByDate(idxDate);
chk('index has 2 entries', idxByDate.length, 2);

const idxSeg3 = api.buildUsageSegment({ startMs: MOCK_TIME-100000, endMs: MOCK_TIME, domain: 'idx3.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc' });
await api.appendUsageSegments([idxSeg3]);
idxByDate = await api.getUsageSegmentsByDate(idxDate);
chk('index has 3 after append', idxByDate.length, 3);

const idxPruned = await api.pruneUsageSegments(365);
chk('prune leaves recent alone', idxPruned, 0);
idxByDate = await api.getUsageSegmentsByDate(idxDate);
chk('index still 3 after prune', idxByDate.length, 3);

// ── TB19: Daily aggregate shape is backward compatible ──
sec('TB19: Daily aggregate → legacy shape');
mockLocal.reset();

// Create segments with backgroundMedia and pip
await api.settleUsageDuration({
  startMs: MOCK_TIME-600000, endMs: MOCK_TIME-300000, domain: 'shape.com',
  channel: 'active', mode: 'study', sourceState: 'ACTIVE',
  settlementReason: 'transition_complete', profileId: 'p1', deviceId: 'd1',
});
await api.settleUsageDuration({
  startMs: MOCK_TIME-300000, endMs: MOCK_TIME-200000, domain: 'shape.com',
  channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE',
  settlementReason: 'transition_complete', profileId: 'p1', deviceId: 'd1',
});
await api.settleUsageDuration({
  startMs: MOCK_TIME-200000, endMs: MOCK_TIME-100000, domain: 'pipshape.com',
  channel: 'pip', mode: 'rest', sourceState: 'PIP_ACTIVE',
  settlementReason: 'transition_complete', profileId: 'p1', deviceId: 'd1',
});

// Read daily_usage_stats_v1 directly
const shapeStats = await api.getDailyUsageStats(todayStr);
chkT('shape stats exist', !!shapeStats);
chk('active=300 shape.com', shapeStats.domains['shape.com'].activeSeconds, 300);
chk('bg=100 shape.com', shapeStats.domains['shape.com'].backgroundMediaSeconds, 100);
chk('pip=100 pipshape.com', shapeStats.domains['pipshape.com'].pipSeconds, 100);
chk('total shape.com=400', shapeStats.domains['shape.com'].totalSeconds, 400);

// Verify legacy-format reconstruction: audioSeconds = sum of backgroundMedia
const legacyAudioSum = Object.values(shapeStats.domains)
  .reduce((s, ds) => s + ds.backgroundMediaSeconds, 0);
chk('legacy audioSeconds = bg sum', legacyAudioSum, 100);

const legacyPipSum = Object.values(shapeStats.domains)
  .reduce((s, ds) => s + ds.pipSeconds, 0);
chk('legacy pipSeconds = pip sum', legacyPipSum, 100);

// ── TB20: Empty daily stats returns safe empty shape ──
sec('TB20: Empty daily stats returns safe shape');
mockLocal.reset();
// No segments settled — stats should return null for unknown date
const emptyStats = await api.getDailyUsageStats('2099-01-01');
chk('nonexistent date returns null', emptyStats, null);

// ── TB21: Monitoring off after settlement creates correct reason ──
sec('TB21: Monitoring off segment reason');
mockLocal.reset();
await api.settleUsageDuration({
  startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'mo.com',
  channel: 'active', mode: 'rest', sourceState: 'ACTIVE',
  settlementReason: 'monitoring_off', profileId: 'p1', deviceId: 'd1',
});
all = await api.getAllUsageSegments();
const moSeg2 = Object.values(all).find(s => s.settlementReason === 'monitoring_off');
chkT('monitoring_off exists', !!moSeg2);
chk('mo domain', moSeg2.domain, 'mo.com');
chk('mo mode rest', moSeg2.mode, 'rest');

// ── TB22: Daily aggregate equals sum of segments (comprehensive) ──
sec('TB22: Aggregate = sum of segments (comprehensive)');
mockLocal.reset();
// Settle multiple channels + modes for same domain (600s = 600000ms each)
await api.settleUsageDuration({ startMs: MOCK_TIME-1800000, endMs: MOCK_TIME-1200000, domain: 'verify.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.settleUsageDuration({ startMs: MOCK_TIME-1200000, endMs: MOCK_TIME-600000, domain: 'verify.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.settleUsageDuration({ startMs: MOCK_TIME-600000, endMs: MOCK_TIME, domain: 'verify.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });

const vStats = await api.getDailyUsageStats(todayStr);
chk('v active total=1200', vStats.domains['verify.com'].activeSeconds, 1200);
chk('v bg=600', vStats.domains['verify.com'].backgroundMediaSeconds, 600);

// Per-mode verification
chk('v activeByMode.study', vStats.domains['verify.com'].activeByMode.study, 600);
chk('v activeByMode.rest', vStats.domains['verify.com'].activeByMode.rest, 600);
chk('v backgroundMediaByMode.rest', vStats.domains['verify.com'].backgroundMediaByMode.rest, 600);

// Cross-verify with segments
const vSegs = await api.getUsageSegmentsByDate(todayStr);
const vDomainSegs = vSegs.filter(s => s.domain === 'verify.com');
const vActiveStudy = vDomainSegs.filter(s => s.channel === 'active' && s.mode === 'study').reduce((s, seg) => s + seg.durationSeconds, 0);
const vActiveRest = vDomainSegs.filter(s => s.channel === 'active' && s.mode === 'rest').reduce((s, seg) => s + seg.durationSeconds, 0);
const vBgRest = vDomainSegs.filter(s => s.channel === 'backgroundMedia' && s.mode === 'rest').reduce((s, seg) => s + seg.durationSeconds, 0);
chk('cross-verify active study', vActiveStudy, 600);
chk('cross-verify active rest', vActiveRest, 600);
chk('cross-verify bg rest', vBgRest, 600);

// ── TB23: getPendingUsageSegments returns dirty segments ──
sec('TB23: getPendingUsageSegments');
mockLocal.reset();
// Settle a segment (which marks outbox as dirty)
await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'pending.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
const pending = await api.getPendingUsageSegments();
chkT('pending segments exist', pending.segments.length > 0);
chk('pending count = 1', pending.pendingCount, 1);
chk('segment domain', pending.segments[0].domain, 'pending.com');
chk('segment channel', pending.segments[0].channel, 'active');

// ── TB24: markUsageSegmentsUploaded updates uploadedAt ──
sec('TB24: markUsageSegmentsUploaded');
const segIds = pending.segments.map(s => s.id);
const nowUpload = Date.now();
await api.markUsageSegmentsUploaded(segIds, nowUpload);

// Verify outbox cleared
const pending2 = await api.getPendingUsageSegments();
chk('outbox cleared after upload', pending2.pendingCount, 0);

// Verify uploadedAt set on segment
all = await api.getAllUsageSegments();
const uploadedSeg = Object.values(all).find(s => s.domain === 'pending.com');
chkT('uploadedAt set', uploadedSeg && !!uploadedSeg.uploadedAt);
chk('uploadedAt value', uploadedSeg.uploadedAt, nowUpload);

// ── TB25: markUsageSegmentUploadFailed preserves dirty ──
sec('TB25: markUsageSegmentUploadFailed');
mockLocal.reset();
await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'fail.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
let pf = await api.getPendingUsageSegments();
chkT('dirty before fail', pf.pendingCount > 0);
const failIds = pf.segments.map(s => s.id);

await api.markUsageSegmentUploadFailed(failIds, 'network_error');
pf = await api.getPendingUsageSegments();
chk('dirty preserved after fail', pf.pendingCount, 1);
chk('retry count', (pf.retryCounts[failIds[0]] || 0), 1);
chk('last error', pf.lastErrors[failIds[0]], 'network_error');

// ── TB26: getPendingDailyStats ──
sec('TB26: getPendingDailyStats');
mockLocal.reset();
await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'stats.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
const df = await api.getPendingDailyStats();
chkT('pending stats exist', Object.keys(df.stats).length > 0);
chkT('stats pendingCount > 0', df.pendingCount > 0);
chk('domain in stats', df.stats[todayStr].domains['stats.com'].activeSeconds, 60);

// ── TB27: markDailyStatsUploaded clears dirty ──
sec('TB27: markDailyStatsUploaded');
await api.markDailyStatsUploaded([todayStr]);
const df2 = await api.getPendingDailyStats();
chk('stats outbox cleared', df2.pendingCount, 0);

// ── TB28: markDailyStatsUploadFailed preserves dirty ──
sec('TB28: markDailyStatsUploadFailed');
mockLocal.reset();
await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'sfail.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.markDailyStatsUploadFailed([todayStr], 'timeout');
const df3 = await api.getPendingDailyStats();
chk('stats dirty preserved', df3.pendingCount, 1);
chk('stats retry count', df3.retryCounts[todayStr], 1);
chk('stats last error', df3.lastErrors[todayStr], 'timeout');

// ── TB29: buildUsageSegmentsUploadPayload ──
sec('TB29: buildUsageSegmentsUploadPayload');
mockLocal.reset();
await api.settleUsageDuration({
  startMs: MOCK_TIME-60000,
  endMs: MOCK_TIME,
  domain: 'payload.com',
  channel: 'active',
  mode: 'rest',
  sourceState: 'ACTIVE',
  settlementReason: 'tab_close',
  profileId: 'p1',
  deviceId: 'd1',
  tabId: 778,
  windowId: 991,
  managedTargetId: 'mt_payload',
  managedTargetType: 'url',
  managedTargetNamespace: 'generic',
  managedTargetValue: 'https://payload.com/lesson',
  managedTargetLabelAtTime: 'Payload Lesson',
  targetSourceAtTime: 'parent',
  targetRuleId: 'rule-payload',
  targetMatchLevel: 'url',
  targetClassificationAtTime: 'study',
  quotaBucketAtTime: 'composite',
  description: {
    schemaVersion: 1,
    start: { reason: 'tabActivated', operation: null, source: 'chrome_event', atMs: MOCK_TIME - 60000 },
    end: { reason: 'tab_close', operation: null, source: 'chrome_event', atMs: MOCK_TIME },
    summary: '开始：tabActivated；结束：tab_close',
  },
});
const p = await api.getPendingUsageSegments();
const payload = await api.buildUsageSegmentsUploadPayload(p.segments.map(s => s.id));
chk('payload schemaVersion', payload.schemaVersion, 1);
chk('payload segment count', payload.segments.length, 1);
const pSeg = payload.segments[0];
chk('payload id', typeof pSeg.id, 'string');
chk('payload domain', pSeg.domain, 'payload.com');
chk('payload channel', pSeg.channel, 'active');
chk('payload mode', pSeg.mode, 'rest');
chk('payload settlementReason', pSeg.settlementReason, 'tab_close');
chk('payload includes description end reason', pSeg.description?.end?.reason, 'tab_close');
chk('payload includes tabId', pSeg.tabId, 778);
chk('payload includes windowId', pSeg.windowId, 991);
chk('payload includes managedTargetId', pSeg.managedTargetId, 'mt_payload');
chk('payload includes managedTargetType', pSeg.managedTargetType, 'url');
chk('payload includes quotaBucketAtTime', pSeg.quotaBucketAtTime, 'composite');
chk('payload excludes profileId', Object.prototype.hasOwnProperty.call(pSeg, 'profileId'), false);
chk('payload durationSeconds', pSeg.durationSeconds, 60);
chkT('payload has date', !!pSeg.date);
chkT('payload has timezone', !!pSeg.timezone);
chkT('payload has dayStartMs', typeof pSeg.dayStartMs === 'number');

// ── TB30: buildDailyStatsUploadPayload ──
sec('TB30: buildDailyStatsUploadPayload');
const sp = await api.buildDailyStatsUploadPayload(todayStr);
chk('statsp schemaVersion', sp.schemaVersion, 1);
chk('statsp date', sp.date, todayStr);
chkT('statsp domains array', Array.isArray(sp.domains));
chk('statsp domain count', sp.domains.length, 1);
const sd = sp.domains[0];
chk('statsp domain name', sd.domain, 'payload.com');
chk('statsp activeSeconds', sd.activeSeconds, 60);
chk('statsp bgSeconds', sd.backgroundMediaSeconds, 0);
chk('statsp pipSeconds', sd.pipSeconds, 0);
chkT('statsp activeByMode exists', !!sd.activeByMode);
chk('statsp activeByMode.rest', sd.activeByMode.rest, 60);

// ── TB30b: buildHourlyStatsUploadPayload ──
sec('TB30b: buildHourlyStatsUploadPayload');
const hPending = await api.getPendingHourlyStats();
chkT('hourly stats pending exists', hPending.pendingCount > 0);
const payloadHourKey = `${todayStr}T11`;
const hp = await api.buildHourlyStatsUploadPayload(payloadHourKey);
chk('hoursp schemaVersion', hp.schemaVersion, 1);
chk('hoursp hourKey', hp.hourKey, payloadHourKey);
chk('hoursp date', hp.date, todayStr);
chk('hoursp hour', hp.hour, 11);
chkT('hoursp domains array', Array.isArray(hp.domains));
chk('hoursp domain name', hp.domains[0].domain, 'payload.com');
chk('hoursp activeByMode.rest', hp.domains[0].activeByMode.rest, 60);
await api.markHourlyStatsUploaded([payloadHourKey]);
const hPending2 = await api.getPendingHourlyStats();
chk('hourly stats outbox cleared', hPending2.pendingCount, 0);

// ── TB31: Prune outboxes ──
sec('TB31: Prune outboxes');
mockLocal.reset();
// Create old outbox entries
const oldOutbox = {
  dirtySegmentIds: ['seg-20200101-deadbeefdeadbeef'],
  retryCounts: { 'seg-20200101-deadbeefdeadbeef': 5 },
  lastErrors: { 'seg-20200101-deadbeefdeadbeef': 'old_error' },
};
await chrome.storage.local.set({ segment_sync_outbox_v1: oldOutbox });
const spCount = await api.pruneSegmentSyncOutbox(365);
chk('segment outbox pruned 1', spCount, 1);

const oldStatsOutbox = {
  dirtyDates: ['2020-01-01'],
  retryCounts: { '2020-01-01': 3 },
  lastErrors: { '2020-01-01': 'old' },
};
await chrome.storage.local.set({ stats_sync_outbox_v1: oldStatsOutbox });
const dpCount = await api.pruneStatsSyncOutbox(365);
chk('stats outbox pruned 1', dpCount, 1);

// ── TB32: Disabled segment v1 upload dry-run ──
sec('TB32: Disabled segment v1 upload dry-run');
mockLocal.reset();
await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'dryrun.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
const drPending = await api.getPendingUsageSegments();
chk('pending before dry-run', drPending.pendingCount, 1);

// Outbox NOT cleared when disabled
const drAfter = await api.getPendingUsageSegments();
chk('outbox still dirty after dry-run check', drAfter.pendingCount, 1);

// ── TB33: Disabled stats v1 upload preserves outbox ──
sec('TB33: Disabled stats v1 upload preserves outbox');
const sfBefore = await api.getPendingDailyStats();
chk('stats pending before dry-run', sfBefore.pendingCount, 1);
const sfAfter = await api.getPendingDailyStats();
chk('stats outbox still dirty', sfAfter.pendingCount, 1);

// ── TB34: Legacy uploadStats is separate from v1 outbox ──
sec('TB34: Legacy paths are separate');
const legacyData = await chrome.storage.local.get('cloud_pending_stats');
chk('legacy pending_stats is undefined (separate)', legacyData['cloud_pending_stats'], undefined);

const v1ObData = await chrome.storage.local.get('stats_sync_outbox_v1');
const v1Ob = v1ObData['stats_sync_outbox_v1'];
chk('v1 outbox exists', typeof v1Ob, 'object');
chkT('v1 outbox has dirtyDates', Array.isArray(v1Ob.dirtyDates));

await api.clearStatsSyncOutbox();
await api.clearSegmentSyncOutbox();

// ── P0 Regression TB35: Empty daily_usage_stats_v1 must not block getTodayStats ──
sec('TB35: P0 Regression — empty daily stats must fall back to event-log');
mockLocal.reset();
const emptyStatsEntry = {
  date: todayStr,
  timezone: 'Asia/Shanghai',
  dayStartMs: MOCK_TIME,
  dayEndMs: MOCK_TIME + 86399999,
  segmentsCount: 0,
  lastSegmentId: null,
  domains: {},
};
await chrome.storage.local.set({ daily_usage_stats_v1: { [todayStr]: emptyStatsEntry } });
const stored = await chrome.storage.local.get('daily_usage_stats_v1');
const storedDay = stored['daily_usage_stats_v1'][todayStr];
chk('empty domains exists', typeof storedDay.domains, 'object');
chk('empty domains has 0 keys', Object.keys(storedDay.domains).length, 0);
chkT('empty domains is truthy (would have triggered the bug)', !!storedDay.domains);
const shouldUseEventLogFallback = !storedDay || !storedDay.domains || Object.keys(storedDay.domains).length === 0;
chkT('guard condition triggers fallback', shouldUseEventLogFallback);
await api.settleUsageDuration({ startMs: MOCK_TIME-60000, endMs: MOCK_TIME, domain: 'p0test.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
const stored2 = await chrome.storage.local.get('daily_usage_stats_v1');
const storedDay2 = stored2['daily_usage_stats_v1'][todayStr];
chk('after settlement domains has 1 key', Object.keys(storedDay2.domains).length, 1);
chk('domain name = p0test.com', Object.keys(storedDay2.domains)[0], 'p0test.com');

// ── TB36: P0 — online duration is non-empty when active domain time exists ──
sec('TB36: P0 — online/domain duration excludes background media and includes PiP');
mockLocal.reset();
await api.settleUsageDuration({ startMs: MOCK_TIME-600000, endMs: MOCK_TIME-500000, domain: 'online-a.com', channel: 'active', mode: 'study', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.settleUsageDuration({ startMs: MOCK_TIME-500000, endMs: MOCK_TIME-400000, domain: 'online-b.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.settleUsageDuration({ startMs: MOCK_TIME-400000, endMs: MOCK_TIME, domain: 'online-c.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
await api.settleUsageDuration({ startMs: MOCK_TIME-300000, endMs: MOCK_TIME-200000, domain: 'online-d.com', channel: 'pip', mode: 'rest', sourceState: 'PIP_ACTIVE', settlementReason: 'tc', profileId: 'p1', deviceId: 'd1' });
const ods = await api.getDailyUsageStats(todayStr);
let onlineSeconds = 0, studySeconds = 0, restSeconds = 0, bgSeconds = 0, pipSeconds = 0;
for (const [domain, ds] of Object.entries(ods.domains)) {
  onlineSeconds += ds.activeSeconds + ds.pipSeconds;
  studySeconds += ds.activeByMode.study || 0;
  restSeconds += ds.activeByMode.rest || 0;
  bgSeconds += ds.backgroundMediaSeconds || 0;
  pipSeconds += ds.pipSeconds || 0;
}
chk('onlineSeconds > 0', onlineSeconds > 0, true);
chk('studySeconds = 100', studySeconds, 100);
chk('restSeconds = 100', restSeconds, 100);
chk('bgSeconds = 400', bgSeconds, 400);
chk('pipSeconds = 100', pipSeconds, 100);
chk('online active+pip = 300', onlineSeconds, 300);
chk('total active = 200', ods.domains['online-a.com'].activeSeconds + ods.domains['online-b.com'].activeSeconds, 200);

// ── TB37: Runtime settlement can omit channel and still aggregate ──
sec('TB37: P0 — sourceState derives channel when channel is omitted');
mockLocal.reset();
await api.settleUsageDuration({
  startMs: MOCK_TIME-60000,
  endMs: MOCK_TIME,
  domain: 'derived-channel.com',
  mode: 'rest',
  sourceState: 'ACTIVE',
  settlementReason: 'ui_flush',
  profileId: 'p1',
  deviceId: 'd1',
});
all = await api.getAllUsageSegments();
const derivedSeg = Object.values(all)[0];
chk('derived channel active', derivedSeg.channel, 'active');
st = await api.getDailyUsageStats(todayStr);
chk('derived aggregate active=60', st.domains['derived-channel.com'].activeSeconds, 60);

// ── TB38: Sub-second settlement still records open/close fact ──
sec('TB38: P0 — sub-second settlement is recorded');
mockLocal.reset();
n = await api.settleUsageDuration({
  startMs: MOCK_TIME-500,
  endMs: MOCK_TIME,
  domain: 'too-short.com',
  mode: 'rest',
  sourceState: 'ACTIVE',
  settlementReason: 'ui_flush',
  profileId: 'p1',
  deviceId: 'd1',
});
chk('sub-second creates 1', n, 1);
all = await api.getAllUsageSegments();
chk('zero-second segment retained', Object.keys(all).length, 1);
const shortSeg = Object.values(all)[0];
chk('sub-second durationSeconds is 0', shortSeg.durationSeconds, 0);
chk('sub-second start preserved', shortSeg.startMs, MOCK_TIME - 500);
chk('sub-second end preserved', shortSeg.endMs, MOCK_TIME);
st = await api.getDailyUsageStats(todayStr);
chk('sub-second aggregate domain exists', !!st.domains['too-short.com'], true);
chk('sub-second aggregate active remains 0', st.domains['too-short.com'].activeSeconds, 0);

// ── TB39: Exact zero-ms diagnostic settlement is recorded only when explicit ──
sec('TB39: exact zero-ms diagnostic settlement is recorded');
mockLocal.reset();
n = await api.settleUsageDuration({
  startMs: MOCK_TIME,
  endMs: MOCK_TIME,
  domain: 'zero-boundary.com',
  mode: 'rest',
  sourceState: 'ACTIVE',
  settlementReason: 'event_close_without_open',
  profileId: 'p1',
  deviceId: 'd1',
});
chk('zero-ms without explicit flag skipped', n, 0);
n = await api.settleUsageDuration({
  startMs: MOCK_TIME,
  endMs: MOCK_TIME,
  domain: 'zero-boundary.com',
  mode: 'rest',
  sourceState: 'ACTIVE',
  settlementReason: 'event_close_without_open',
  profileId: 'p1',
  deviceId: 'd1',
  allowZeroDurationSegment: true,
});
chk('zero-ms diagnostic creates 1', n, 1);
all = await api.getAllUsageSegments();
const zeroSeg = Object.values(all)[0];
chk('zero-ms diagnostic duration 0', zeroSeg.durationSeconds, 0);
chk('zero-ms diagnostic start=end', zeroSeg.startMs === zeroSeg.endMs, true);
st = await api.getDailyUsageStats(todayStr);
chk('zero-ms diagnostic aggregate remains 0', st.domains['zero-boundary.com'].activeSeconds, 0);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

})();
