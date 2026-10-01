// Run with: node tests/unit/shared-web-contribution.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'shared-web-contribution.js'), 'utf8')
  .replace(/export function /g, 'function ');
const context = {};
vm.runInNewContext(`${source}\nthis.project = buildWebSharedQuotaContributionV1;`, context);
const project = context.project;

const snapshot = {
  date: '2026-10-02', snapshotRevision: 'snapshot-1', statisticsRevision: 'stats-1',
  correctionRevision: 'correction-1', activeSeconds: 420,
  quotaBucketSeconds: { study: 60, composite: 120, rest: 180, other: 60 },
  complete: true, incompleteReasonCodes: [],
};
const options = { sourceKey: 'opaque-device', policyRevision: 'profile-config:12' };

const result = project(snapshot, options);
assert.strictEqual(result.ok, true);
assert.strictEqual(result.contribution.complete, true);
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.contribution.bucketsMs)), {
  study: 60000, composite: 120000, rest: 180000,
});
assert.strictEqual(result.contribution.revision, snapshot.snapshotRevision);
assert.strictEqual(result.contribution.policyRevision, options.policyRevision);
assert.strictEqual(result.contribution.settledAtMs, null);
assert.strictEqual(Object.hasOwn(result.contribution, 'chromeExcludedMs'), false);
assert.strictEqual(Object.hasOwn(result.contribution, 'chromeIncludedInApplicationMs'), false);
assert.strictEqual(snapshot.quotaBucketSeconds.other, 60);

const unknown = project({ ...snapshot, quotaBucketSeconds: { ...snapshot.quotaBucketSeconds, other: 0, unknown: 60 } }, options);
assert.strictEqual(unknown.ok, true);
assert.strictEqual(unknown.contribution.complete, false);
assert.ok(unknown.contribution.reasonCodes.includes('WEB_BUCKET_UNKNOWN'));
const mismatch = project({ ...snapshot, activeSeconds: 421 }, options);
assert.strictEqual(mismatch.contribution.complete, false);
assert.ok(mismatch.contribution.reasonCodes.includes('WEB_BUCKET_TOTAL_MISMATCH'));
const incomplete = project({ ...snapshot, complete: false, incompleteReasonCodes: ['EVIDENCE_TOTAL_MISMATCH'] }, options);
assert.strictEqual(incomplete.contribution.complete, false);
assert.ok(incomplete.contribution.reasonCodes.includes('WEB_SNAPSHOT_INCOMPLETE'));
assert.ok(incomplete.contribution.reasonCodes.includes('EVIDENCE_TOTAL_MISMATCH'));
assert.strictEqual(project({ ...snapshot, quotaBucketSeconds: { study: -1 } }, options).ok, false);
assert.strictEqual(project({ ...snapshot, activeSeconds: Number.MAX_SAFE_INTEGER }, options).ok, false);
assert.strictEqual(project(snapshot, { ...options, sourceKey: '' }).ok, false);

console.log('[Shared web contribution] passed');
