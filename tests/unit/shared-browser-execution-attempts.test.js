const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/infra/shared-browser-execution-attempts.js'), 'utf8');
  const fenceSource = fs.readFileSync(path.resolve(__dirname, '../../extension/infra/shared-browser-execution-fence.js'), 'utf8');
  const { createSharedBrowserExecutionAttemptStore: create, createBrowserExecutionFence, browserExecutionIdentityHash } =
    await import(`data:text/javascript;base64,${Buffer.from(fenceSource + '\n' + source.replace(/^import .*;\r?\n/gm, '')).toString('base64')}`);
  const records = [];
  let queue = Promise.resolve();
  let fail = false;
  let lostResponse = false;
  const transaction = (mode, decide) => {
    const work = queue.then(() => {
      if (fail) throw Error('disk failure');
      const decision = decide(structuredClone(records));
      if (decision.record) records.push(structuredClone(decision.record));
      if (decision.deleteId) records.splice(records.findIndex(record => record.executionId === decision.deleteId), 1);
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
  assert.equal((await first.retireAttempt({ ok: true })).ok, false, 'plain success cannot authorize deletion');
  records[0].url = 'must-not-store';
  assert.equal((await first.claimAttempt('corrupt', 'lease-a')).ok, false);
  await assert.rejects(first.readAttemptedIds());
  records.length = 0;
  const fence = createBrowserExecutionFence();
  const durable = create({ transaction, now: () => 1000, fence });
  const identity = id => ({ schemaVersion: 1, roundId: 'round', reminderId: 'reminder', deliveryId: 'delivery',
    policyRevision: 1, stateRevision: 1, executionId: id, leaseId: 'lease', activityId: 'activity' });
  const ack = async value => fence.acknowledge(await browserExecutionIdentityHash(value), value.executionId, value.leaseId, 'stale');
  for (let i = 0; i < 45; i++) {
    const value = identity(`acked-${i}`);
    const oldGeneration = fence.capture();
    assert.equal((await durable.claimAttempt(value.executionId, value.leaseId, value, oldGeneration)).ok, true);
    const proof = await ack(value);
    assert.equal((await durable.retireAttempt(proof)).retired, true);
    assert.equal((await durable.retireAttempt(proof)).retired, false, 'duplicate retirement is harmless');
    assert.equal((await durable.claimAttempt(value.executionId, value.leaseId, value, oldGeneration)).errorCode,
      'browser_execution_generation_changed', 'late old permit cannot revive retired ID');
  }
  assert.equal(records.length, 0, 'ACKed attempts run beyond capacity without accumulating tombstones');
  const queuedValue = identity('late-transaction');
  const queuedGeneration = fence.capture();
  let resume;
  queue = new Promise(resolve => { resume = resolve; });
  const queuedClaim = durable.claimAttempt(queuedValue.executionId, queuedValue.leaseId, queuedValue, queuedGeneration);
  await ack(queuedValue);
  resume();
  assert.equal((await queuedClaim).errorCode, 'browser_execution_generation_changed', 'queued IDB claim cannot revive an old request');
  assert.equal(records.length, 0);
  const value = identity('delete-failure');
  await durable.claimAttempt(value.executionId, value.leaseId, value);
  const proof = await ack(value);
  fail = true;
  assert.equal((await durable.retireAttempt(proof)).errorCode, 'browser_execution_retirement_failed');
  fail = false;
  assert((await durable.readAttemptedIds()).has(value.executionId));
  fence.invalidate();
  assert.equal((await durable.retireAttempt(proof)).ok, false, 'disconnect fences old proof');
  const restartedFence = createBrowserExecutionFence();
  const afterRestart = create({ transaction, fence: restartedFence });
  assert.equal(restartedFence.current(fence.capture()), false, 'new SW generation rejects old request token');
  assert.equal((await afterRestart.retireAttempt(proof)).ok, false, 'restart cannot inherit proof');
  assert.equal((await afterRestart.claimAttempt(value.executionId, value.leaseId, value)).ok, false);
  const restartProof = restartedFence.acknowledge(await browserExecutionIdentityHash(value), value.executionId, value.leaseId, 'stale');
  assert.equal((await afterRestart.retireAttempt(restartProof)).retired, true, 'fresh durable duplicate ACK permits retirement');
  const mismatch = identity('identity-conflict');
  await durable.claimAttempt(mismatch.executionId, mismatch.leaseId, mismatch);
  assert.equal((await durable.retireAttempt(await ack({ ...mismatch, activityId: 'wrong' }))).ok, false);
  assert((await durable.readAttemptedIds()).has(mismatch.executionId));
  while (records.length < 20) {
    const lost = identity(`lost-${records.length}`);
    assert.equal((await durable.claimAttempt(lost.executionId, lost.leaseId, lost)).ok, true);
  }
  assert.equal((await durable.claimAttempt('lost-overflow', 'lease', identity('lost-overflow'))).errorCode,
    'browser_execution_attempt_store_full', 'lost ACK retains tombstones and capacity refusal');
  assert(source.includes("{ durability: 'strict' }"));
  assert(source.includes('store.add(decision.record)'));
  assert(!/tabs\.(remove|update)|dispatchModeEvent|closeCurrentSession/.test(source));
  assert(source.includes('store.delete(decision.deleteId)'));
  console.log('[Execution attempts] fixture: 45 ACKed retirements, lost ACK/capacity, old generation, restart, deletion failure, duplicate ACK and identity conflict passed; real IndexedDB not exercised');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
