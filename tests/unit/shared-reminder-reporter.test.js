'use strict';
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function run() {
  const { createSharedReminderReporterV1: create } = await import(pathToFileURL(path.join(__dirname,
    '../../extension/infra/shared-reminder-reporter.js')).href);
  const versions = { policyRevision: 'policy:1', stateRevision: 'state:1' };
  const prompt = { token: 'issued-test', shownAt: 1000, reminders: [{ scope: 'daily' }, { scope: 'weekly' }] };
  const resolution = { reason: 'user_end', at: 1100 };
  let time = 2000, calls = [], failed = true;
  const off = create({ sendResult: () => { throw Error('must not call'); } });
  assert.equal(off.enqueue(prompt, resolution, versions).skipped, true);
  assert.equal((await off.flush()).skipped, true);
  const reporter = create({ enabled: true, now: () => time, sendResult: async result => {
    calls.push(result);
    return failed ? { ok: false, errorCode: 'native_response_timeout' } : { ok: true };
  } });
  assert.equal(reporter.enqueue(prompt, resolution, versions).queued, 2);
  assert.equal(reporter.enqueue(prompt, resolution, versions).duplicate, true);
  assert.equal(reporter.enqueue(prompt, { reason: 'timeout', at: 61000 }, versions).errorCode,
    'shared_reminder_result_conflict');
  const first = reporter.flush();
  assert.equal(first, reporter.flush());
  assert.equal((await first).errorCode, 'native_response_timeout');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'end_rest');
  assert.equal(calls[0].delivery, 'visible');
  assert.equal(reporter.inspect().pendingCount, 2);
  // A later result must not bypass the failed first result during backoff.
  await reporter.flush();
  assert.equal(calls.length, 1);
  time += 60_000;
  failed = false;
  assert.equal((await reporter.flush()).pendingCount, 0);
  assert.deepEqual(calls.map(row => row.kind), ['daily', 'daily', 'weekly']);
  assert.equal(reporter.enqueue(prompt, resolution, versions).duplicate, true);
  await reporter.flush();
  assert.equal(calls.length, 3);
  assert.equal(reporter.inspect().acknowledgedCount, 2);
  let rejectedCalls = 0;
  const rejected = create({ enabled: true, now: () => time,
    sendResult: async () => { rejectedCalls++; return { ok: false, errorCode: 'shared_reminder_not_issued' }; } });
  rejected.enqueue(prompt, resolution, versions);
  assert.equal((await rejected.flush()).errorCode, 'shared_reminder_not_issued');
  time += 1_000_000;
  assert.equal((await rejected.flush()).ok, false);
  assert.equal(rejectedCalls, 2);
  assert.equal(rejected.inspect().blockedCount, 2);
  await rejected.flush();
  assert.equal(rejectedCalls, 2);
  const bounded = create({ enabled: true });
  for (let i = 0; i < 10; i++) assert.equal(bounded.enqueue({ ...prompt, token: `issued-${i}` }, resolution, versions).ok, true);
  assert.equal(bounded.enqueue({ ...prompt, token: 'overflow' }, resolution, versions).errorCode, 'shared_reminder_queue_full');
  assert.equal(bounded.inspect().pendingCount, 20);
  let backoffTime = 0, retries = 0;
  const backoff = create({ enabled: true, now: () => backoffTime, sendResult: async () => {
    retries++; return { ok: false, errorCode: 'native_post_failed' };
  } });
  backoff.enqueue({ ...prompt, reminders: [{ scope: 'daily' }] }, resolution, versions);
  await backoff.flush();
  for (const delay of [60_000, 120_000, 240_000, 480_000, 900_000, 900_000]) {
    const count = retries;
    backoffTime += delay - 1;
    await backoff.flush();
    assert.equal(retries, count);
    backoffTime++;
    await backoff.flush();
    assert.equal(retries, count + 1);
  }
  console.log('[Shared reminder reporter] passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
