'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const SHA = '7ceab64bbe1f5c5e997edbd872c705d03cd5fb56';
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function run() {
  const read = file => execFileSync('git', ['show', `${SHA}:app-runtime-management/contracts/${file}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const vectors = JSON.parse(read('shared-reminder-lifecycle.vectors.json'));
  const service = await load(ts.transpileModule(read('shared-reminder-lifecycle.ts'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const coreSource = fs.readFileSync(path.join(root, 'extension/core/shared-browser-execution.js'), 'utf8');
  const core = await load(coreSource);
  const identity = value => Object.fromEntries(['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision'].map(key => [key, value[key]]));
  const basePermit = { ...identity(vectors.state), executionId: 'execution-1', leaseId: 'fixture-lease',
    activityId: 'fixture-activity', targetSource: 'browser', effect: 'request-normal-close', maxAgeMs: 5000 };
  const baseAck = { ...identity(vectors.state), executionId: basePermit.executionId, leaseId: basePermit.leaseId,
    activityId: basePermit.activityId, outcome: 'completed' };
  for (const vector of vectors.browserExecution.cases) {
    const permit = { ...basePermit, ...vector.permitPatch };
    const state = { ...vectors.state, ...vectors.browserExecution.statePatch, ...vector.statePatch };
    const context = { ...vectors.context, nowMs: 10000, monotonicNowMs: 10000, ...vector.contextPatch, state };
    const browser = { ...vectors.browserActivity.context, bootId: context.bootId, monotonicNowMs: context.monotonicNowMs,
      current: { message: vectors.browserActivity.message, receivedMonotonicMs: context.monotonicNowMs, bootId: context.bootId },
      ...vector.browserPatch };
    const consumer = { ...vectors.browserExecution.consumer, ...vector.consumerPatch,
      reminder: { ...identity(state), ...vector.reminderPatch }, attemptedIds: new Set(vector.attempted ? [permit.executionId] : []) };
    const ack = { ...baseAck, ...vector.ackPatch };
    const execute = () => vector.operation === 'consumer' ? service.sharedBrowserExecutionEligibility(permit, consumer)
      : vector.operation === 'ack' ? service.acknowledgeSharedBrowserExecution(permit, ack,
        vector.existing ? baseAck : null, vector.authenticatedLeaseCurrent !== false)
        : service.authorizeSharedBrowserExecution(context, browser, { ...vectors.browserExecution.target, ...vector.targetPatch });
    if (vector.error) assert.throws(execute, error => error.message === vector.error, vector.name);
    else {
      const result = execute();
      if (vector.operation === 'consumer') {
        assert.equal(result.reasonCode, vector.expectReason, vector.name);
        assert.deepEqual(core.sharedBrowserExecutionEligibility(permit, consumer), result, vector.name);
      } else if (vector.operation === 'ack') {
        assert.equal(result.duplicate, vector.expectDuplicate, vector.name);
        assert.equal(core.validateSharedBrowserExecutionOutcome(permit, ack).ok, true);
      } else {
        assert.equal(result?.effect ?? null, vector.expectEffect, vector.name);
        if (result) assert.equal(core.validateSharedBrowserExecution(result).ok, true);
        if (vector.expectMaxAgeMs) assert.equal(result.maxAgeMs, vector.expectMaxAgeMs);
      }
    }
    if (vector.operation === 'ack' && !vector.existing
      && ['SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED', 'SHARED_BROWSER_EXECUTION_RESULT_CONFLICT'].includes(vector.error)) {
      assert.equal(core.validateSharedBrowserExecutionOutcome(permit, ack).ok, false);
    }
  }
  for (const vector of vectors.cases) {
    const state = { ...vectors.state, ...vector.statePatch };
    const context = { ...vectors.context, ...vector.contextPatch, state };
    const input = { ...identity(state), ...vector.message };
    const execute = () => vector.operation === 'ack' ? service.acknowledgeSharedReminderDelivery(context, input)
      : vector.operation === 'resolve' ? service.resolveSharedReminder(context, input) : service.expireSharedReminder(context);
    if (vector.error) assert.throws(execute, error => error.message === vector.error, vector.name);
    else {
      const result = execute();
      for (const [field, value] of Object.entries(vector.expect)) assert.deepEqual(
        ['status', 'resolution', 'visibleAtMs'].includes(field) ? result.state[field] : result[field], value, vector.name);
    }
  }
  for (const vector of vectors.browserActivity.cases) {
    const initial = { ...vectors.browserActivity.message, ...vector.messagePatch };
    const receipt = service.receiveSharedBrowserActivity(vectors.browserActivity.context, initial).receipt;
    const context = { ...vectors.browserActivity.context, current: receipt, ...vector.contextPatch };
    const next = { ...initial, ...vector.nextPatch };
    const execute = () => vector.operation === 'validate' ? service.validateSharedBrowserActivity(next)
      : vector.operation === 'receive' ? service.receiveSharedBrowserActivity(context, next)
        : service.sharedBrowserReminderEligibility(context, vector.expectedActivityId);
    if (vector.error) assert.throws(execute, error => error.message === vector.error, vector.name);
    else {
      const result = execute();
      for (const [field, value] of Object.entries(vector.expect)) assert.equal(field === 'receivedMonotonicMs'
        ? result.receipt.receivedMonotonicMs : field === 'eligible' && result.receipt
          ? service.sharedBrowserReminderEligibility({ ...context, current: result.receipt }).eligible : result[field], value, vector.name);
    }
  }
  for (const bad of [{ ...basePermit, maxAgeMs: 0 }, { ...basePermit, maxAgeMs: 5001 },
    { ...basePermit, maxAgeMs: 1.5 }, { ...basePermit, url: 'private' }, { ...basePermit, targetSource: 'application' }]) {
    assert.equal(core.validateSharedBrowserExecution(bad).ok, false);
  }
  const preparationSource = fs.readFileSync(path.join(root, 'extension/product/shared-browser-execution-preparation.js'), 'utf8');
  const preparation = await load(coreSource + '\nconst requestSharedReminderLifecycle = async () => ({ok:false});\n'
    + 'const sharedReminderIdentity = value => Object.fromEntries(["schemaVersion","roundId","reminderId","deliveryId","policyRevision","stateRevision"].map(key=>[key,value[key]]));\n'
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
  assert(!/tabs\.(remove|update)|closeCurrentSession|dispatchModeEvent|budgetedLocalSet|storage\.(local|session)\.set/.test(preparationSource));
  console.log(`[Browser Execution Preparation] ${vectors.browserExecution.cases.length} execution / ${vectors.cases.length} lifecycle / ${vectors.browserActivity.cases.length} activity vectors and no-effect caller checks passed`);
}
run().catch(error => { console.error(error.message); console.error(error.stack?.split('\n').filter(line => !line.includes('data:text')).join('\n')); process.exit(1); });
