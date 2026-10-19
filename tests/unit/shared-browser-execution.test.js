'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
async function run() {
  const coreUrl = pathToFileURL(path.join(root, 'extension/core/shared-forced-use-runtime-v2.js')).href;
  const core = await import(coreUrl);
  const policyIdentity = { schemaVersion: 2, revision: 'profile-config:1', effectiveAtMs: 0, stage: 'shared', policyHash: 'a'.repeat(64) };
  const state = { schemaVersion: 2, roundId: 'round', reminderId: 'reminder', deliveryId: 'delivery',
    policyRevision: policyIdentity.revision, stateRevision: 'state', date: '2026-10-02' };
  const basePermit = { ...state, policyIdentity, executionId: 'execution-1', leaseId: 'fixture-lease',
    activityId: 'fixture-activity', targetSource: 'browser', effect: 'request-normal-close', maxAgeMs: 5000 };
  delete basePermit.date;
  const consumer = { connectionCurrent: true, leaseId: 'fixture-lease', activityId: 'fixture-activity',
    restEligible: true, policyIdentity, stateRevision: 'state', reminder: { ...basePermit },
    attemptedIds: new Set(), requestStartedMonotonicMs: 1000, monotonicNowMs: 1000 };
  const vectors = { state, browserExecution: { consumer } };
  for (const [patch, reason] of [
    [{ connectionCurrent: false }, 'SHARED_BROWSER_ACTIVITY_LEASE_CHANGED'],
    [{ leaseId: 'other' }, 'SHARED_BROWSER_ACTIVITY_LEASE_CHANGED'],
    [{ activityId: 'other' }, 'SHARED_BROWSER_ACTIVITY_CHANGED'],
    [{ restEligible: false }, 'SHARED_BROWSER_ACTIVITY_CHANGED'],
    [{ reminder: { ...state, roundId: 'other' } }, 'SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED'],
    [{ policyIdentity: { ...policyIdentity, policyHash: 'b'.repeat(64) } }, 'SHARED_REMINDER_SCOPE_CHANGED'],
    [{ stateRevision: 'other' }, 'SHARED_REMINDER_SCOPE_CHANGED'],
    [{ monotonicNowMs: 999 }, 'INVALID_SHARED_BROWSER_EXECUTION_CLOCK'],
    [{ monotonicNowMs: 6000 }, 'SHARED_BROWSER_EXECUTION_EXPIRED'],
    [{ attemptedIds: new Set([basePermit.executionId]) }, 'SHARED_BROWSER_EXECUTION_ALREADY_ATTEMPTED'],
  ]) assert.equal(core.sharedExecutionEligibilityV2(basePermit, { ...consumer, ...patch }).reasonCode, reason);
  for (const bad of [{ ...basePermit, schemaVersion: 1 }, { ...basePermit, maxAgeMs: 0 },
    { ...basePermit, maxAgeMs: 5001 }, { ...basePermit, maxAgeMs: 1.5 },
    { ...basePermit, url: 'private' }, { ...basePermit, targetSource: 'application' }])
    assert.equal(core.checkSharedExecutionV2(bad).ok, false);
  const preparationSource = fs.readFileSync(path.join(root, 'extension/product/shared-browser-execution-preparation.js'), 'utf8');
  const fenceSource = fs.readFileSync(path.join(root, 'extension/infra/shared-browser-execution-fence.js'), 'utf8');
  const preparation = await load(`import {checkSharedExecutionV2, sharedExecutionEligibilityV2} from '${coreUrl}';\n`
    + fenceSource + '\nconst requestSharedReminderLifecycle=async()=>({ok:false});\n'
    + 'const sharedBrowserExecutionAttempts={readAttemptedIds:async()=>new Set(),claimAttempt:async()=>({ok:false})};\n'
    + 'const sharedReminderIdentity=v=>Object.fromEntries(["schemaVersion","roundId","reminderId","deliveryId","policyRevision","stateRevision"].map(k=>[k,v[k]]));\n'
    + preparationSource.replace(/^import .*;\r?\n/gm, ''));
  const disabled = preparation.createSharedBrowserExecutionPreparation({ request: () => { throw Error('must not request'); } });
  assert.equal((await disabled.inspect(vectors.state.date)).skipped, true);
  let claims = 0;
  let clock = 1000;
  let current = { ...vectors.browserExecution.consumer };
  const attempted = new Set();
  const candidate = preparation.createSharedBrowserExecutionPreparation({ enabled: true, now: () => clock,
    request: async () => ({ ok: true, state: vectors.state, browserExecution: basePermit, requestStartedMonotonicMs: 1000 }),
    readContext: async () => current, readAttemptedIds: async () => attempted,
    claimAttempt: async id => { if (attempted.has(id)) return { ok: false }; attempted.add(id); claims++; return { ok: true }; } });
  assert.equal((await candidate.inspect(vectors.state.date)).eligible, true);
  assert.equal(claims, 0, 'inspection never claims or fabricates completed ACK');
  assert.equal((await candidate.claim(basePermit)).ok, true);
  assert.equal((await candidate.claim(basePermit)).ok, false); assert.equal(claims, 1);
  attempted.clear(); clock = 6000;
  assert.equal((await candidate.inspect(vectors.state.date)).reasonCode, 'SHARED_BROWSER_EXECUTION_EXPIRED');
  clock = 1000; await candidate.inspect(vectors.state.date); current = { ...current, connectionCurrent: false };
  assert.equal((await candidate.claim(basePermit)).errorCode, 'SHARED_BROWSER_ACTIVITY_LEASE_CHANGED'); assert.equal(claims, 1);
  current = { ...current, connectionCurrent: true };
  const delayed = preparation.createSharedBrowserExecutionPreparation({ enabled: true, now: () => clock,
    request: async () => ({ ok: true, state: vectors.state, browserExecution: basePermit, requestStartedMonotonicMs: 1000 }),
    readContext: async () => current, readAttemptedIds: async () => new Set(),
    claimAttempt: async () => { clock = 6000; return { ok: true }; } });
  await delayed.inspect(vectors.state.date);
  const expiredAfterCommit = await delayed.claim(basePermit);
  assert.equal(expiredAfterCommit.ok, false);
  assert.equal(expiredAfterCommit.registered, true);
  assert.equal(expiredAfterCommit.effectsEnabled, false);
  assert.equal(expiredAfterCommit.errorCode, 'SHARED_BROWSER_EXECUTION_EXPIRED');
  clock = 1000;
  await candidate.inspect(vectors.state.date);
  preparation.browserExecutionFence.invalidate();
  assert.equal((await candidate.claim(basePermit)).errorCode, 'browser_execution_generation_changed');
  let reply;
  const late = preparation.createSharedBrowserExecutionPreparation({ enabled: true, now: () => clock,
    request: () => new Promise(resolve => { reply = resolve; }), readContext: async () => current,
    readAttemptedIds: async () => new Set(), claimAttempt: async () => { throw Error('old reply cannot claim'); } });
  const inFlight = late.inspect(vectors.state.date);
  preparation.browserExecutionFence.invalidate();
  reply({ ok: true, state: vectors.state, browserExecution: basePermit, requestStartedMonotonicMs: 1000 });
  assert.equal((await inFlight).errorCode, 'browser_execution_generation_changed');
  assert(!/tabs\.(remove|update)|closeCurrentSession|dispatchModeEvent|budgetedLocalSet|storage\.(local|session)\.set/.test(preparationSource));
  console.log('[Browser Execution Preparation] current V2 permit, identity, clock, attempted-ID, fence and no-effect checks passed');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
