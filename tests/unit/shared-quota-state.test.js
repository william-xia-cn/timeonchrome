// Run with: node tests/unit/shared-quota-state.test.js
'use strict';

const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function run() {
  const modulePath = path.join(__dirname, '..', '..', 'extension', 'core', 'shared-quota-state.js');
  const { validateSharedQuotaStateV1, inspectWebContributionInSharedStateV1 } = await import(pathToFileURL(modulePath).href);
  const state = {
    schemaVersion: 1, policyRevision: 'policy-4', revision: 'total-12', computedAtMs: 5000,
    settledAtMs: 4900, complete: false, reasonCodes: ['APP_OFFLINE'], offline: true,
    sources: [
      { source: 'web', sourceKey: 'device-a', date: '2026-10-02', revision: 'web-2' },
      { source: 'application', sourceKey: 'device-a', date: '2026-10-02', revision: 'app-1' },
    ],
    day: { date: '2026-10-02', usedMs: { study: 120000, composite: 0, rest: 30000 },
      remainingMs: { study: 60000, composite: null, rest: 0 }, borrowedRestMs: 10000 },
    week: { fromDate: '2026-09-28', toDate: '2026-10-02', complete: true, reasonCodes: [], restUsedMs: 30000, restRemainingMs: null },
  };
  const expected = { date: '2026-10-02', weekStart: '2026-09-28', policyRevision: 'policy-4' };
  const validate = (value, options = expected) => validateSharedQuotaStateV1(value, options);

  assert.deepEqual(validate(state), { ok: true, state });
  assert.equal(validate({ ...state, schemaVersion: 2 }).ok, false);
  assert.equal(validate({ ...state, sources: [...state.sources, state.sources[0]] }).ok, false);
  assert.equal(validate({ ...state, day: { ...state.day, usedMs: { ...state.day.usedMs, rest: -1 } } }).ok, false);
  assert.equal(validate({ ...state, day: { ...state.day, borrowedRestMs: 30001 } }).ok, false);
  assert.equal(validate({ ...state, day: { ...state.day, usedMs: { ...state.day.usedMs, study: 1.5 } } }).ok, false);
  assert.equal(validate(state, { ...expected, date: '2026-10-03' }).errorCode, 'shared_quota_stale_state');
  assert.equal(validate(state, { ...expected, weekStart: '2026-10-05' }).errorCode, 'shared_quota_stale_state');
  assert.equal(validate(state, { ...expected, policyRevision: 'policy-5' }).errorCode, 'shared_quota_stale_state');
  for (const field of ['toDate', 'complete', 'reasonCodes']) {
    const week = { ...state.week }; delete week[field];
    assert.equal(validate({ ...state, week }).errorCode, 'shared_quota_invalid_state');
  }
  for (const toDate of ['2026-10-01', '2026-10-04', '2026-10-09']) {
    assert.equal(validate({ ...state, week: { ...state.week, toDate } }).errorCode, 'shared_quota_stale_state');
  }
  assert.equal(validate({ ...state, week: { ...state.week, fromDate: '2026-09-29' } }).errorCode, 'shared_quota_stale_state');
  assert.equal(validate({ ...state, day: { ...state.day, date: '2026-02-30' } }).errorCode, 'shared_quota_invalid_state');
  assert.equal(validate({ ...state, week: { ...state.week, toDate: '2026-02-30' } }).ok, false);
  assert.equal(validate({ ...state, week: { ...state.week, reasonCodes: [42] } }).ok, false);
  const partial = { ...state, complete: false, reasonCodes: ['WEEK_PENDING'],
    week: { ...state.week, complete: false, reasonCodes: ['WEB_COVERAGE_MISSING'] } };
  assert.deepEqual(validate(partial).state.week, partial.week, 'valid incomplete week stays incomplete');
  assert.equal(validate({ ...partial, complete: true, reasonCodes: [] }).errorCode, 'shared_quota_invalid_state');
  assert.equal(validate({ ...state, week: { ...state.week, reasonCodes: ['WEEK_PENDING'] } }).ok, false);
  for (const [date, fromDate] of [['2026-10-04', '2026-09-28'], ['2026-10-05', '2026-10-05'],
    ['2027-01-01', '2026-12-28']]) {
    const boundary = { ...state, day: { ...state.day, date }, week: { ...state.week, fromDate, toDate: date } };
    assert.equal(validate(boundary, { date, weekStart: fromDate }).ok, true);
  }
  const web = { schemaVersion: 1, source: 'web', sourceKey: 'device-a', date: '2026-10-02',
    revision: 'web-2', policyRevision: 'policy-4', complete: true };
  const completeState = { ...state, complete: true, reasonCodes: [], offline: false };
  assert.equal(inspectWebContributionInSharedStateV1(completeState, web, { weekStart: '2026-09-28' }).ok, true);
  assert.equal(inspectWebContributionInSharedStateV1(state, web).reasonCode, 'SHARED_STATE_INCOMPLETE');
  assert.equal(inspectWebContributionInSharedStateV1(partial, web).reasonCode, 'SHARED_STATE_INCOMPLETE');
  assert.equal(inspectWebContributionInSharedStateV1(completeState, { ...web, revision: 'web-3' }).reasonCode,
    'WEB_SOURCE_REVISION_MISMATCH');
  assert.equal(inspectWebContributionInSharedStateV1(completeState, { ...web, sourceKey: 'device-b' }).reasonCode,
    'WEB_SOURCE_MISSING');
  assert.equal(inspectWebContributionInSharedStateV1(completeState, { ...web, complete: false }).reasonCode,
    'WEB_CONTRIBUTION_INCOMPLETE');
  assert.equal(state.day.usedMs.study, 120000);
  console.log('[Shared quota state] passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
