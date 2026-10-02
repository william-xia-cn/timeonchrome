const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/infra/shared-browser-execution-attempts.js'), 'utf8');
  const { createSharedBrowserExecutionAttemptStore: create } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const records = [];
  let queue = Promise.resolve();
  let fail = false;
  let lostResponse = false;
  const transaction = (mode, decide) => {
    const work = queue.then(() => {
      if (fail) throw Error('disk failure');
      const decision = decide(structuredClone(records));
      if (decision.record) records.push(structuredClone(decision.record));
      if (lostResponse) { lostResponse = false; throw Error('crash after commit'); }
      return decision.result;
    });
    queue = work.catch(() => {});
    return work;
  };
  const first = create({ transaction, now: () => 1000 });
  const restarted = create({ transaction, now: () => 2000 });
  const results = await Promise.all([first.claimAttempt('same', 'lease-a'), restarted.claimAttempt('same', 'lease-a')]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal((await restarted.claimAttempt('same', 'lease-b')).ok, false, 'disconnect/reconnect cannot regrant an ID');
  assert((await restarted.readAttemptedIds()).has('same'), 'new consumer sees persisted ID');
  fail = true;
  assert.equal((await first.claimAttempt('failed', 'lease-a')).ok, false);
  await assert.rejects(first.readAttemptedIds());
  assert(!records.some(record => record.executionId === 'failed'));
  fail = false; lostResponse = true;
  assert.equal((await first.claimAttempt('crashed', 'lease-a')).ok, false);
  assert.equal((await restarted.claimAttempt('crashed', 'lease-a')).ok, false, 'lost commit response cannot cause replay');
  while (records.length < 20) assert.equal((await first.claimAttempt(`id-${records.length}`, 'lease-a')).ok, true);
  assert.equal((await first.claimAttempt('overflow', 'lease-a')).errorCode, 'browser_execution_attempt_store_full');
  assert.equal(records.length, 20);
  assert.equal((await first.claimAttempt('x'.repeat(129), 'lease-a')).ok, false);
  records[0].url = 'must-not-store';
  assert.equal((await first.claimAttempt('corrupt', 'lease-a')).ok, false);
  await assert.rejects(first.readAttemptedIds());
  assert(source.includes("{ durability: 'strict' }"));
  assert(source.includes('store.add(decision.record)'));
  assert(!/tabs\.(remove|update)|dispatchModeEvent|closeCurrentSession/.test(source));
  console.log('[Execution attempts] transactional fixture: restart/reconnect/replay/commit failure/capacity/corruption passed; real IndexedDB not exercised');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
