// Suspect historical usage segment cleanup tests
// Run with: node tests/unit/suspect-segments.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys === null) return { ...this.data };
    const result = {};
    if (Array.isArray(keys)) {
      for (const key of keys) result[key] = this.data[key];
      return result;
    }
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (keys && typeof keys === 'object') {
      for (const key of Object.keys(keys)) result[key] = this.data[key] ?? keys[key];
    }
    return result;
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key];
  }
}

const mockLocal = new MockStorage();
global.chrome = { storage: { local: mockLocal, session: mockLocal } };

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
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

const suspect = loadProdModule('core/suspect-segments.js', [
  'evaluateSuspectSegment',
  'scanSuspectSegments',
]);

const usage = loadProdModule('core/usage-segments.js', [
  'buildUsageSegment',
  'appendUsageSegments',
  'getAllUsageSegments',
  'getDailyUsageStats',
  'rebuildDailyUsageStats',
  'markSuspectUsageSegments',
], {
  evaluateSuspectSegment: suspect.evaluateSuspectSegment,
});

let passed = 0;
let failed = 0;
function check(label, condition, details = '') {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${details ? `: ${details}` : ''}`);
  }
}
function eq(label, actual, expected) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(name) { console.log(`\n[${name}]`); }

const DAY = '2026-05-11';
const DAY_START = new Date('2026-05-11T00:00:00+08:00').getTime();

function makeSegment(overrides = {}) {
  return usage.buildUsageSegment({
    profileId: 'p-test',
    deviceId: 'd-test',
    timezone: 'Asia/Shanghai',
    startMs: DAY_START + 60_000,
    endMs: DAY_START + 240_000,
    domain: 'normal.test',
    channel: 'active',
    mode: 'study',
    sourceState: 'ACTIVE',
    settlementReason: 'periodic_checkpoint',
    ...overrides,
  });
}

async function seedSegments(segments, extra = {}) {
  const all = {};
  const index = {};
  for (const segment of segments) {
    all[segment.id] = segment;
    if (!index[segment.date]) index[segment.date] = [];
    index[segment.date].push(segment.id);
  }
  await mockLocal.set({
    usage_segments_v1: all,
    usage_segments_index_v1: index,
    ...extra,
  });
}

(async () => {
  section('Rules');
  const desmos = makeSegment({
    domain: 'www.desmos.com',
    startMs: new Date('2026-05-11T14:39:05+08:00').getTime(),
    endMs: new Date('2026-05-12T10:11:13+08:00').getTime(),
    durationSeconds: Math.floor((new Date('2026-05-12T10:11:13+08:00').getTime() - new Date('2026-05-11T14:39:05+08:00').getTime()) / 1000),
    settlementReason: 'tab_close',
  });
  check('active 19.5h tab_close is suspect', suspect.evaluateSuspectSegment(desmos).suspect);
  eq('19.5h reason', suspect.evaluateSuspectSegment(desmos).reason, 'active_cross_day_over_30m');

  const activeLong = makeSegment({ domain: 'long-active.test', durationSeconds: 3 * 60 * 60 + 1, endMs: DAY_START + 60_000 + (3 * 60 * 60 + 1) * 1000 });
  eq('active >3h reason', suspect.evaluateSuspectSegment(activeLong).reason, 'active_over_3h');

  const staleLong = makeSegment({ durationSeconds: 31 * 60, endMs: DAY_START + 60_000 + 31 * 60 * 1000, settlementReason: 'recovery_stale_close' });
  eq('recovery stale >30m reason', suspect.evaluateSuspectSegment(staleLong).reason, 'stale_recovery_tab_close_over_30m');

  const normal = makeSegment();
  check('normal 180s checkpoint is not suspect', !suspect.evaluateSuspectSegment(normal).suspect);

  const subSecond = makeSegment({ durationSeconds: 0, endMs: DAY_START + 60_500 });
  check('sub-second segment is evaluated and not suspect', !suspect.evaluateSuspectSegment(subSecond).suspect);
  eq('sub-second evidence keeps durationSeconds=0', suspect.evaluateSuspectSegment(subSecond).evidence.durationSeconds, 0);

  const bg = makeSegment({ channel: 'backgroundMedia', sourceState: 'BACKGROUND_ACTIVE', durationSeconds: 4 * 60 * 60, endMs: DAY_START + 60_000 + 4 * 60 * 60 * 1000 });
  check('backgroundMedia 4h is not suspect', !suspect.evaluateSuspectSegment(bg).suspect);

  const pip = makeSegment({ channel: 'pip', sourceState: 'PIP_ACTIVE', durationSeconds: 2 * 60 * 60, endMs: DAY_START + 60_000 + 2 * 60 * 60 * 1000 });
  check('pip 2h is not suspect', !suspect.evaluateSuspectSegment(pip).suspect);

  section('Dry run');
  mockLocal.reset();
  await seedSegments([normal, activeLong], {
    daily_usage_stats_v1: {},
    segment_sync_outbox_v1: { dirtySegmentIds: ['existing'], retryCounts: {}, lastErrors: {} },
    stats_sync_outbox_v1: { dirtyDates: ['2026-05-10'], retryCounts: {}, lastErrors: {} },
  });
  const beforeDry = JSON.stringify(mockLocal.data);
  const dry = await usage.markSuspectUsageSegments({ dryRun: true });
  const afterDry = JSON.stringify(mockLocal.data);
  eq('dryRun ok', dry.ok, true);
  eq('dryRun flag', dry.dryRun, true);
  eq('dryRun would mark one', dry.markedCount, 1);
  eq('dryRun does not write', afterDry, beforeDry);

  section('Actual run and rebuild');
  const actual = await usage.markSuspectUsageSegments({ dryRun: false });
  eq('actual ok', actual.ok, true);
  eq('actual marked one', actual.markedCount, 1);
  check('actual rebuilt affected date', actual.rebuiltDates.includes(DAY));

  const all = await usage.getAllUsageSegments();
  check('original suspect segment remains', !!all[activeLong.id]);
  eq('suspect flag set', all[activeLong.id].suspect, true);
  eq('normal flag absent', all[normal.id].suspect, undefined);

  const day = await usage.getDailyUsageStats(DAY);
  eq('rebuild excludes suspect active seconds', day.domains['normal.test'].activeSeconds, 180);
  check('suspect domain excluded', !day.domains[activeLong.domain] || day.domains[activeLong.domain].activeSeconds === 0);
  eq('segmentsCount counts included only', day.segmentsCount, 1);
  check('suspect cleanup marker written', !!day.suspectCleanup?.excludeSuspect);

  const outboxes = await chrome.storage.local.get(['segment_sync_outbox_v1', 'stats_sync_outbox_v1']);
  eq('segment outbox not dirtied', JSON.stringify(outboxes.segment_sync_outbox_v1), JSON.stringify({ dirtySegmentIds: ['existing'], retryCounts: {}, lastErrors: {} }));
  eq('stats outbox not dirtied', JSON.stringify(outboxes.stats_sync_outbox_v1), JSON.stringify({ dirtyDates: ['2026-05-10'], retryCounts: {}, lastErrors: {} }));

  section('Idempotency and media preservation');
  const second = await usage.markSuspectUsageSegments({ dryRun: false });
  eq('second run marks zero new segments', second.markedCount, 0);

  mockLocal.reset();
  await seedSegments([activeLong]);
  const onlySuspect = await usage.markSuspectUsageSegments({ dryRun: false });
  eq('all-suspect run marks one', onlySuspect.markedCount, 1);
  const emptyDay = await usage.getDailyUsageStats(DAY);
  eq('all-suspect rebuild keeps empty domains', Object.keys(emptyDay.domains).length, 0);
  check('all-suspect rebuild writes authoritative cleanup marker', !!emptyDay.suspectCleanup?.excludeSuspect);

  mockLocal.reset();
  await seedSegments([normal, bg, pip]);
  await usage.rebuildDailyUsageStats(DAY, { excludeSuspect: true, forceWriteEmpty: true });
  const mediaDay = await usage.getDailyUsageStats(DAY);
  eq('normal active kept', mediaDay.domains['normal.test'].activeSeconds, 180);
  eq('backgroundMedia kept', mediaDay.domains[bg.domain].backgroundMediaSeconds, bg.durationSeconds);
  eq('pip kept', mediaDay.domains[pip.domain].pipSeconds, pip.durationSeconds);

  console.log(`\nSuspect segment tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
