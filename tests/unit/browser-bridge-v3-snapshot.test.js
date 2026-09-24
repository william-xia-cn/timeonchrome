'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../extension/infra/browser-bridge-v3-snapshot.js'), 'utf8')
  .replace(/import .* from .*;\r?\n/g, '');
const counters = { calls: 0 };
const quotaSource = fs.readFileSync(path.join(__dirname, '../../extension/core/quota-read-model-v2.js'), 'utf8')
  .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
  .replace(/export\s+async\s+function\s+/g, 'async function ')
  .replace(/export\s+function\s+/g, 'function ')
  .replace(/export\s+const\s+/g, 'const ');
const realProjection = new Function('budgetedLocalSet', 'getBeijingWeekPeriod',
  'PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY', 'chrome',
  `${quotaSource}\nreturn buildLocalQuotaProjectionV2;`)(async () => {}, () => ({}), '', { storage: { local: {} } });
global.buildLocalQuotaProjectionV2 = (stats, options) => {
  counters.calls += 1;
  return realProjection(stats, options);
};
global.getBeijingWeekPeriod = () => ({ weekStart: '2026-09-21', weekEnd: '2026-09-27' });
const usageSource = fs.readFileSync(path.join(__dirname, '../../extension/core/usage-segments.js'), 'utf8')
  .replace(/^\s*import .*?;\s*$/gm, '')
  .replace(/export\s+async\s+function\s+/g, 'async function ')
  .replace(/export\s+function\s+/g, 'function ')
  .replace(/export\s+const\s+/g, 'const ')
  .replace(/export\s*\{[^}]*\};?\s*$/gm, '');
global.splitSegmentByLocalHour = new Function('sanitizeIncognitoForPersistence', 'budgetedLocalSet',
  'runStorageMutation', `${usageSource}\nreturn splitSegmentByLocalHour;`)(null, null, null);
global.getSyncState = () => ({ deviceId: 'device-1' });
global.readDeviceCorrectionEvidenceWeek = async () => ({
  weekStart: '2026-09-21', weekEnd: '2026-09-27', revision: 'empty', items: [],
});

(async () => {
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const base = {
    statsByDate: { '2026-09-21': {
      domains: { 'study.example': { activeSeconds: 3 } },
      targets: { study: { activeByQuotaBucket: { study: 3 } } },
    } },
    segmentsById: { one: {
      id: 'one', channel: 'active', startMs: Date.parse('2026-09-20T16:00:00Z'),
      endMs: Date.parse('2026-09-20T16:00:03Z'), durationSeconds: 3,
      quotaBucketAtTime: 'study',
    } },
    correctionEvidence: { weekStart: '2026-09-21', weekEnd: '2026-09-27', revision: 'empty', items: [] },
    weekStart: '2026-09-21', weekEnd: '2026-09-27', throughDate: '2026-09-21', now: 1789948800000,
  };
  const [complete] = await module.buildAuthoritativeDailySnapshots(base);
  assert.equal(complete.complete, true);
  assert.equal(complete.activeSeconds, 3);
  assert.deepEqual(complete.quotaBucketSeconds, { study: 3 });
  assert.equal(complete.intervals.length, 1);
  assert.equal(counters.calls, 1);
  const [replayed] = await module.buildAuthoritativeDailySnapshots({ ...base, now: base.now + 1 });
  assert.equal(replayed.snapshotRevision, complete.snapshotRevision);
  const [missing] = await module.buildAuthoritativeDailySnapshots({ ...base, correctionEvidence: null });
  assert.equal(missing.complete, false);
  assert.ok(missing.incompleteReasonCodes.includes('CORRECTION_EVIDENCE_UNAVAILABLE'));
  const [mismatch] = await module.buildAuthoritativeDailySnapshots({
    ...base, statsByDate: { '2026-09-21': {
      domains: { 'study.example': { activeSeconds: 4 } },
      targets: { study: { activeByQuotaBucket: { study: 4 } } },
    } },
  });
  assert.equal(mismatch.complete, false);
  assert.ok(mismatch.incompleteReasonCodes.includes('EVIDENCE_TOTAL_MISMATCH'));
  const [overlap] = await module.buildAuthoritativeDailySnapshots({
    ...base, statsByDate: { '2026-09-21': {
      domains: { 'study.example': { activeSeconds: 6 } },
      targets: { study: { activeByQuotaBucket: { study: 6 } } },
    } },
    segmentsById: { ...base.segmentsById, two: { ...base.segmentsById.one, id: 'two' } },
  });
  assert.equal(overlap.complete, false);
  assert.ok(overlap.incompleteReasonCodes.includes('ACTIVE_INTERVAL_OVERLAP'));
  assert.equal(overlap.intervals.length, 0);
  const correction = {
    id: 'correction-1', deviceId: 'device-1', segmentId: 'one', date: '2026-09-21',
    channel: 'active', originalMode: 'study', originalQuotaBucket: 'study',
    effectiveMode: 'rest', effectiveQuotaBucket: 'rest', durationSeconds: 3,
  };
  const [corrected] = await module.buildAuthoritativeDailySnapshots({
    ...base,
    compactCorrections: [correction],
    correctionEvidence: { ...base.correctionEvidence, revision: 'correction-1', items: [correction] },
  });
  assert.equal(corrected.complete, true);
  assert.deepEqual(corrected.quotaBucketSeconds, { rest: 3 });
  assert.equal(corrected.intervals[0].quotaBucket, 'rest');
  const [missingCorrectedSegment] = await module.buildAuthoritativeDailySnapshots({
    ...base, compactCorrections: [correction],
    correctionEvidence: { ...base.correctionEvidence, revision: 'correction-1', items: [correction] },
    segmentsById: {},
  });
  assert.equal(missingCorrectedSegment.complete, false);
  assert.ok(missingCorrectedSegment.incompleteReasonCodes.includes('CORRECTION_SEGMENT_MISSING'));
  const crossMidnight = { ...base.segmentsById.one, id: 'cross-midnight',
    timezone: '+08:00', startMs: Date.parse('2026-09-21T15:59:58Z'),
    endMs: Date.parse('2026-09-21T16:00:02Z'), durationSeconds: 4 };
  const crossStats = {
    '2026-09-21': { domains: { 'study.example': { activeSeconds: 2 } },
      targets: { study: { activeByQuotaBucket: { study: 2 } } } },
    '2026-09-22': { domains: { 'study.example': { activeSeconds: 2 } },
      targets: { study: { activeByQuotaBucket: { study: 2 } } } },
  };
  const crossDays = await module.buildAuthoritativeDailySnapshots({
    ...base, statsByDate: crossStats, segmentsById: { 'cross-midnight': crossMidnight },
    throughDate: '2026-09-22',
  });
  assert.deepEqual(crossDays.map((day) => day.activeSeconds), [2, 2]);
  assert.deepEqual(crossDays.map((day) => day.complete), [true, true]);
  assert.deepEqual(crossDays.map((day) => day.intervals[0]?.creditedSeconds), [2, 2]);
  console.log('[Browser Bridge v3 snapshot] 21/21 passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
