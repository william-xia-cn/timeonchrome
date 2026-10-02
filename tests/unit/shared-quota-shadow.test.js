// Run with: node tests/unit/shared-quota-shadow.test.js

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function loadFunction(file, name) {
  const source = read(file).replace(/export (async )?function /g, '$1function ');
  return vm.runInNewContext(`(() => { ${source}\nreturn ${name}; })()`);
}
const context = {
  buildWebSharedQuotaContributionV1: loadFunction('core/shared-web-contribution.js', 'buildWebSharedQuotaContributionV1'),
  inspectWebContributionInSharedStateV1: loadFunction('core/shared-quota-state.js', 'inspectWebContributionInSharedStateV1'),
  requestSharedQuotaState: () => ({ ok: false }),
};
const source = read('infra/shared-quota-shadow.js')
  .replace(/^import .*;\r?\n/gm, '').replace(/export (async )?function /g, '$1function ');
vm.runInNewContext(`${source}\nthis.inspect = inspectSharedQuotaShadowV1;`, context);

const snapshot = {
  date: '2026-10-02', snapshotRevision: 'web-rev-2', statisticsRevision: 'stats-rev',
  correctionRevision: 'correction-rev', activeSeconds: 90,
  quotaBucketSeconds: { rest: 60, other: 30 }, complete: true, incompleteReasonCodes: [],
};
const options = { snapshot, sourceKey: 'opaque-device', policyRevision: 'policy-4', weekStart: '2026-09-28' };
const state = {
  schemaVersion: 1, policyRevision: 'policy-4', revision: 'shared-rev-3', computedAtMs: 100,
  settledAtMs: 90, complete: true, reasonCodes: [], offline: false,
  sources: [{ source: 'web', sourceKey: 'opaque-device', date: '2026-10-02', revision: 'web-rev-2' }],
  day: { date: '2026-10-02', usedMs: { study: 0, composite: 0, rest: 60000 },
    remainingMs: { study: null, composite: null, rest: null }, borrowedRestMs: 0 },
  week: { fromDate: '2026-09-28', toDate: '2026-10-02', complete: true, reasonCodes: [], restUsedMs: 60000, restRemainingMs: null },
};

async function run() {
  let readCount = 0;
  const matched = await context.inspect({ ...options, readState: async (query) => {
    readCount++;
    assert.equal(query.date, snapshot.date);
    assert.equal(query.weekStart, options.weekStart);
    assert.equal(query.policyRevision, options.policyRevision);
    return { ok: true, state };
  } });
  assert.equal(matched.ok, true);
  assert.equal(matched.status, 'matched');
  assert.equal(matched.webRevision, 'web-rev-2');
  assert.equal(readCount, 1);
  assert.equal(snapshot.quotaBucketSeconds.other, 30);

  const incomplete = await context.inspect({ ...options,
    snapshot: { ...snapshot, complete: false, incompleteReasonCodes: ['SOURCE_ABSENT'] },
    readState: () => { readCount++; throw new Error('must not read'); },
  });
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(readCount, 1);
  assert.equal((await context.inspect({ ...options, readState: async () => ({ ok: false,
    errorCode: 'shared_quota_unavailable' }) })).status, 'unavailable');
  assert.equal((await context.inspect({ ...options, readState: async () => { throw new Error('private'); } })).reasonCode,
    'shared_quota_unavailable');
  assert.equal((await context.inspect({ ...options, readState: async () => ({ ok: true,
    state: { ...state, sources: [{ ...state.sources[0], revision: 'old-web-rev' }] } }) })).reasonCode,
    'WEB_SOURCE_REVISION_MISMATCH');
  assert.equal((await context.inspect({ ...options, readState: async () => ({ ok: true,
    state: { ...state, complete: false, reasonCodes: ['APP_OFFLINE'] } }) })).status, 'incomplete');
  assert.equal((await context.inspect({ ...options, readState: async () => ({ ok: true,
    state: { ...state, policyRevision: 'old-policy' } }) })).status, 'stale');
  assert.equal((await context.inspect({ ...options, readState: async () => ({ ok: true,
    state: { ...state, week: { ...state.week, toDate: '2026-10-04' } } }) })).status, 'stale');
  assert.equal((await context.inspect({ ...options, readState: async () => ({ ok: true,
    state: { ...state, complete: false, reasonCodes: ['WEEK_PENDING'],
      week: { ...state.week, complete: false, reasonCodes: ['WEB_COVERAGE_MISSING'] } } }) })).status, 'incomplete');
  assert.equal((await context.inspect({ ...options, weekStart: 'bad' })).status, 'invalid_input');
  console.log('[Shared quota shadow] passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
