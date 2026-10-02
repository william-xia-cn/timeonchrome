// Run with: node tests/unit/shared-reminder-result.test.js

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function run() {
  const modulePath = path.join(__dirname, '..', '..', 'extension', 'core', 'shared-reminder-result.js');
  const { buildSharedReminderResultsV1: build, validateSharedReminderResultV1: validate } = await import(pathToFileURL(modulePath).href);
  const prompt = { token: 'opaque-prompt', shownAt: 1000,
    reminders: [{ scope: 'daily' }, { scope: 'weekly' }] };
  const versions = { policyRevision: 'profile-config:12', stateRevision: 'shared:8' };
  const continued = build(prompt, { reason: 'user_continue', at: 1100 }, versions);
  assert.equal(continued.ok, true);
  assert.deepEqual(continued.results.map((row) => row.kind), ['daily', 'weekly']);
  assert.deepEqual(continued.results.map((row) => row.reminderId),
    ['opaque-prompt:daily', 'opaque-prompt:weekly']);
  assert.equal(continued.results[0].action, 'continue');
  assert.equal(continued.results[0].delivery, 'visible');
  assert.equal(continued.results[0].visibleAtMs, 1000);
  assert.equal(build(prompt, { reason: 'user_end', at: 1100 }, versions).results[0].action, 'end_rest');
  assert.equal(build(prompt, { reason: 'timeout_continue', at: 61000 }, versions).results[0].action,
    'timeout_continue');
  assert.equal(build(prompt, { reason: 'timeout', at: 61000 }, versions).results[0].action,
    'timeout_end');
  const failed = build({ ...prompt, shownAt: undefined },
    { reason: 'delivery_failed_continue', at: 1100 }, versions);
  assert.equal(failed.ok, true);
  assert.equal(failed.results[0].delivery, 'failed');
  assert.equal(failed.results[0].visibleAtMs, null);
  assert.equal(build({ ...prompt, shownAt: undefined }, { reason: 'timeout', at: 61000 }, versions).ok, false);
  assert.equal(build(prompt, { reason: 'unknown', at: 1100 }, versions).ok, false);
  assert.equal(build({ ...prompt, reminders: [{ scope: 'daily' }, { scope: 'daily' }] },
    { reason: 'user_continue', at: 1100 }, versions).ok, false);
  assert.equal(build(prompt, { reason: 'timeout', at: 2000 }, versions).ok, false);
  assert.equal(validate({ ...continued.results[0], url: 'https://private.test' }).ok, false);
  assert.equal(validate({ ...continued.results[0], visibleAtMs: null }).ok, false);
  assert.equal(validate({ ...continued.results[0], reminderId: '' }).ok, false);
  assert.equal(validate({ ...continued.results[0], stateRevision: 'x'.repeat(129) }).ok, false);
  console.log('[Shared reminder result] passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
