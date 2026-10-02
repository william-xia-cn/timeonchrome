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
    week: { fromDate: '2026-09-28', restUsedMs: 30000, restRemainingMs: null },
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
  const web = { schemaVersion: 1, source: 'web', sourceKey: 'device-a', date: '2026-10-02',
    revision: 'web-2', policyRevision: 'policy-4', complete: true };
  const completeState = { ...state, complete: true, reasonCodes: [], offline: false };
  assert.equal(inspectWebContributionInSharedStateV1(completeState, web, { weekStart: '2026-09-28' }).ok, true);
  assert.equal(inspectWebContributionInSharedStateV1(state, web).reasonCode, 'SHARED_STATE_INCOMPLETE');
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
