// Run with: node tests/unit/sync-retry-policy.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'extension', 'infra', 'sync-retry-policy.js'),
  'utf8'
).replace(/export\s+const\s+/g, 'const ').replace(/export\s+function\s+/g, 'function ');
const api = new Function(`${source}\nreturn { EXHAUSTED_AUTO_RETRY_COOLDOWN_MS, isSyncRetryCandidate };`)();

function check(name, condition) {
  if (!condition) throw new Error(name);
}

const now = 2_000_000_000;
check('ordinary retry remains eligible', api.isSyncRetryCandidate({ retryCount: 2, lastAttemptAt: now, now, maxAttempts: 3 }));
check('legacy exhausted item without attempt timestamp gets one recovery try', api.isSyncRetryCandidate({ retryCount: 3, lastAttemptAt: 0, now, maxAttempts: 3 }));
check('recent exhausted item is deferred', !api.isSyncRetryCandidate({ retryCount: 3, lastAttemptAt: now - 1000, now, maxAttempts: 3 }));
check('cooled exhausted item retries automatically', api.isSyncRetryCandidate({ retryCount: 3, lastAttemptAt: now - api.EXHAUSTED_AUTO_RETRY_COOLDOWN_MS, now, maxAttempts: 3 }));
check('manual force bypasses cooldown', api.isSyncRetryCandidate({ retryCount: 99, lastAttemptAt: now, force: true, now, maxAttempts: 3 }));

console.log('[Sync Retry Policy] 5/5 passed');
