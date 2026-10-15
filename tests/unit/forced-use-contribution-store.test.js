'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../extension');
function compiled(relative, dependencies = {}, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => dependencies[name], ...globals });
  return exports;
}
const core = compiled('core/forced-use-contribution.js');
const data = {
  cloud_profile_id: 'child-1', cloud_device_id: 'device-1',
};
const storage = {
  get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])),
  set: async items => { Object.assign(data, items); },
};
const segment = { id: 'seg-1', profileId: 'child-1', deviceId: 'device-1', date: '2026-10-15',
  startMs: Date.parse('2026-10-15T02:00:00Z'), endMs: Date.parse('2026-10-15T02:03:00Z'),
  durationSeconds: 180, channel: 'active', domain: 'example.com' };
let settled = [];
let listener = null;
const store = compiled('infra/forced-use-contribution-store.js', {
  '../core/forced-use-contribution.js': core,
  '../core/usage-segments.js': {
    getUsageSegmentsByDate: async date => settled.filter(row => row.date === date),
    subscribePersistedUsageSegments: callback => { listener = callback; return () => { listener = null; }; },
  },
  './storage-budget.js': {
    runStorageMutation: async callback => callback(storage),
  },
  '../product/forced-use-prompt.js': { FORCED_USE_PROMPT_KEY: 'forced_use_prompt_state_v1' },
}, { chrome: { storage: { local: storage, session: storage } }, Date });

(async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(await store.readForcedUseDay({ profileId: 'child-1',
    deviceId: 'device-1', date: '2026-10-15' }))),
  { ok: false, reason: 'derived_state_unavailable' });
  assert.equal((await store.ensureForcedUseContributions()).ok, true);
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 0);
  const now = Date.parse('2026-10-15T02:03:00Z');
  assert.equal((await store.recordConfirmedForcedUseInterval({ ruleId: 'rule-1', causes: ['schedule'], domain: 'example.com',
    startMs: segment.startMs, endMs: segment.endMs }, now)).ok, true);
  settled = [segment];
  assert.equal((await store.reconcileForcedUseContributions(now)).contributed, 1);
  assert.equal((await store.reconcileForcedUseContributions(now)).contributed, 0);
  const total = await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1', date: '2026-10-15' });
  assert.equal(total.ok, true);
  assert.equal(total.seconds, 180);
  assert.equal(total.byRuleSeconds['rule-1'], 180);
  assert.equal(total.byCauseSeconds.schedule, 180);
  const addedCause = await store.recordConfirmedForcedUseInterval({ ruleId: 'rule-1',
    causes: ['dailyRest'], domain: 'example.com', startMs: segment.startMs, endMs: segment.endMs }, now);
  assert.equal(addedCause.derivedReady, true);
  const revised = await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1', date: '2026-10-15' });
  assert.equal(revised.seconds, 180);
  assert.equal(revised.byCauseSeconds.schedule, 180);
  assert.equal(revised.byCauseSeconds.dailyRest, 180);
  assert.equal((await store.recordConfirmedForcedUseInterval({ ruleId: 'rule-1', causes: ['dailyRest'],
    domain: 'example.com', startMs: segment.startMs, endMs: segment.endMs }, now)).duplicate, true);
  assert.equal((await store.recordConfirmedForcedUseInterval({ ruleId: 'rule-1', causes: ['future'],
    domain: 'example.com', startMs: segment.startMs, endMs: now + 1000 }, now)).reason, 'interval_invalid');
  assert.equal((await store.readForcedUseDay({ profileId: 'child-2', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 0);
  settled = [];
  assert.equal((await store.reconcileForcedUseContributions(now)).reason, 'raw_evidence_missing');
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).reason, 'derived_evidence_incomplete');
  settled = [segment];
  assert.equal((await store.reconcileForcedUseContributions(now)).ok, true);
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 180);
  const unsubscribe = store.initForcedUseContributionObserver();
  assert.equal(typeof listener, 'function');
  listener([segment]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 180);
  data.forced_use_prompt_state_v1 = { grants: [{ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15', ruleId: 'rule-1', domain: 'example.com',
    causes: ['dailyComposite'], startMs: segment.startMs, endMs: null }] };
  listener([segment]);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).byCauseSeconds.dailyComposite, 180);
  data.forced_use_prompt_state_v1.grants[0].endMs = now;
  const normalSegment = { ...segment, id: 'seg-after-retire', startMs: now,
    endMs: now + 180000, durationSeconds: 180 };
  settled = [segment, normalSegment];
  listener([normalSegment]);
  await new Promise(resolve => setTimeout(resolve, 30));
  const afterRetire = await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' });
  assert.equal(afterRetire.seconds, 180);
  assert.equal(data[store.FORCED_USE_CONTRIBUTIONS_KEY].bySegment['seg-after-retire'], undefined);
  unsubscribe();
  assert.equal(listener, null);
  const recoveryNow = now + 360000;
  const missedSegment = { ...segment, id: 'seg-missed-by-observer', startMs: recoveryNow - 180000,
    endMs: recoveryNow, durationSeconds: 180 };
  settled = [segment, normalSegment, missedSegment];
  data.forced_use_prompt_state_v1.grants = [{ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15', ruleId: 'rule-1', domain: 'example.com', causes: ['timeWindow'],
    startMs: missedSegment.startMs, endMs: recoveryNow }];
  assert.equal((await store.recoverForcedUseIntervalsFromGrants(recoveryNow)).recovered, 1);
  const recovered = await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' });
  assert.equal(recovered.seconds, 360);
  assert.equal(recovered.byCauseSeconds.timeWindow, 180);
  const intervalCount = data[store.FORCED_USE_INTERVALS_KEY].intervals.length;
  assert.equal((await store.recoverForcedUseIntervalsFromGrants(recoveryNow)).recovered, 0);
  assert.equal(data[store.FORCED_USE_INTERVALS_KEY].intervals.length, intervalCount);
  const restartStart = recoveryNow + 1000;
  const restartAt = restartStart + 180000;
  const durableGrant = { profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15', ruleId: 'rule-1', domain: 'example.com',
    causes: ['schedule'], startMs: restartStart, endMs: null };
  assert.equal((await store.persistForcedUseGrantEvidence(durableGrant, restartStart)).ok, true);
  assert.equal((await store.persistForcedUseGrantEvidence(durableGrant, restartStart)).duplicate, true);
  assert.equal(data[store.FORCED_USE_GRANT_ENROLLMENT_KEY].date, '2026-10-15');
  data[store.FORCED_USE_GRANT_JOURNAL_KEY].grants.push({
    ...data[store.FORCED_USE_GRANT_JOURNAL_KEY].grants[0], profileId: 'previous-profile' });
  const restartSegment = { ...segment, id: 'seg-after-browser-restart',
    startMs: restartStart, endMs: restartAt, durationSeconds: 180 };
  settled.push(restartSegment);
  delete data.forced_use_prompt_state_v1;
  assert.equal((await store.recoverForcedUseIntervalsFromGrants(restartAt)).recovered, 1);
  assert.equal(data[store.FORCED_USE_GRANT_JOURNAL_KEY].grants[0].closeIntentAt, restartAt);
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 540);
  assert.equal((await store.readForcedUseDay({ profileId: 'previous-profile', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 0);
  const afterRestart = { ...segment, id: 'seg-after-restart-normal',
    startMs: restartAt, endMs: restartAt + 180000, durationSeconds: 180 };
  settled.push(afterRestart);
  assert.equal((await store.recoverForcedUseIntervalsFromGrants(afterRestart.endMs)).recovered, 0);
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 540);
  assert.equal((await store.persistForcedUseGrantEvidence(durableGrant, afterRestart.endMs)).reason,
    'grant_evidence_closed');
  data.forced_use_prompt_state_v1 = { grants: [{ ...durableGrant, durableEvidence: true }] };
  const stopObserver = store.initForcedUseContributionObserver();
  listener([afterRestart]);
  await new Promise(resolve => setTimeout(resolve, 30));
  stopObserver();
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).seconds, 540);
  delete data.forced_use_prompt_state_v1;
  const journalCopy = data[store.FORCED_USE_GRANT_JOURNAL_KEY];
  delete data[store.FORCED_USE_GRANT_JOURNAL_KEY];
  assert.equal((await store.recoverForcedUseIntervalsFromGrants(afterRestart.endMs)).reason,
    'grant_journal_missing');
  data[store.FORCED_USE_GRANT_JOURNAL_KEY] = journalCopy;
  data.forced_use_prompt_state_v1 = { grants: [{ ...durableGrant, durableEvidence: true }] };
  data[store.FORCED_USE_GRANT_JOURNAL_KEY] = { schemaVersion: 1, grants: [] };
  assert.equal((await store.closeForcedUseGrantEvidence('example.com', afterRestart.endMs)).reason,
    'grant_journal_missing');
  data[store.FORCED_USE_GRANT_JOURNAL_KEY] = journalCopy;
  delete data.forced_use_prompt_state_v1;
  assert.equal((await store.recordConfirmedForcedUseInterval({ ruleId: 'bad', causes: ['schedule'], domain: 'example.com',
    startMs: now, endMs: Date.parse('2026-10-16T02:00:00Z') }, now)).reason, 'interval_invalid');
  await store.markDerivedIncomplete({ irrecoverable: true, date: '2026-10-15' });
  assert.equal((await store.reconcileForcedUseContributions(now)).ok, true);
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).reason, 'derived_evidence_incomplete');
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-16' })).seconds, 0);
  const savedIntervals = data[store.FORCED_USE_INTERVALS_KEY];
  data[store.FORCED_USE_INTERVALS_KEY] = { schemaVersion: 1, intervals: [{}] };
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).ok, false);
  data[store.FORCED_USE_INTERVALS_KEY] = savedIntervals;
  const savedContributions = data[store.FORCED_USE_CONTRIBUTIONS_KEY];
  data[store.FORCED_USE_CONTRIBUTIONS_KEY] = { schemaVersion: 1,
    bySegment: { bad: { sourceSegmentId: 'bad', seconds: '180' } } };
  assert.equal((await store.readForcedUseDay({ profileId: 'child-1', deviceId: 'device-1',
    date: '2026-10-15' })).reason, 'derived_state_invalid');
  data[store.FORCED_USE_CONTRIBUTIONS_KEY] = savedContributions;
  delete data[store.FORCED_USE_INTERVALS_KEY];
  delete data[store.FORCED_USE_CONTRIBUTIONS_KEY];
  assert.equal((await store.ensureForcedUseContributions()).reason, 'derived_state_lost');
  console.log('forced-use-contribution-store: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
