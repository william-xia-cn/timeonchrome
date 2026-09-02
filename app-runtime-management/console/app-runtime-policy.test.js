const assert = require('node:assert/strict');
const policy = require('./app-runtime-policy.js');

const base = policy.defaultPolicy();
assert.equal(base.quotas.dailyCategoryMinutes.study, null);
const classified = policy.classify(base, { platform: 'windows', runtimeIdentity: 'app:a', displayName: 'A' }, 'study');
assert.equal(classified.classifications[0].classification, 'study');
const replaced = policy.classify(classified, { platform: 'windows', runtimeIdentity: 'app:a', displayName: 'A2' }, 'blocked');
assert.equal(replaced.classifications.length, 1);
assert.equal(replaced.classifications[0].classification, 'blocked');
const diff = policy.importDiff(base, policy.exportPayload(replaced));
assert.deepEqual({ added: diff.added, changed: diff.changed, removed: diff.removed }, { added: 1, changed: 0, removed: 0 });
assert.throws(() => policy.importDiff(base, { schemaVersion: 2 }), /不支持/);
console.log('app-runtime-policy tests passed');
