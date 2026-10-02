'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const url = f => pathToFileURL(path.join(root, f)).href;
async function run() {
  const source = fs.readFileSync(path.join(root, 'extension/product/shared-browser-executor.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(
    `import {sharedBrowserExecutionEligibility} from '${url('extension/core/shared-browser-execution.js')}';\n`
    + `import {sharedReminderIdentity} from '${url('extension/core/shared-reminder-lifecycle.js')}';\n`
    + 'const createSharedBrowserExecutionPreparation=()=>null,readBrowserExecutionContext=()=>null,requestSharedReminderLifecycle=()=>null,readSharedBrowserCloseCapability=async()=>({available:false}),createSharedBrowserCloser=()=>{throw Error("no real close in unit")};\n'
    + source).toString('base64'));
  const state = { schemaVersion: 1, roundId: 'round', reminderId: 'reminder', deliveryId: 'delivery',
    policyRevision: 'policy', stateRevision: 'state', date: '2026-10-03', status: 'resolved', resolution: 'end_rest', timeoutAction: 'end' };
  const permit = { schemaVersion: 1, roundId: 'round', reminderId: 'reminder', deliveryId: 'delivery',
    policyRevision: 'policy', stateRevision: 'state', executionId: 'execution', leaseId: 'lease', activityId: 'activity',
    targetSource: 'browser', effect: 'request-normal-close', maxAgeMs: 5000 };
  const context = { connectionCurrent: true, leaseId: 'lease', activityId: 'activity', restEligible: true,
    policyRevision: 'policy', stateRevision: 'state' };
  let closes = 0, claims = 0, acks = 0, ackOk = false, live = { ...context };
  const executor = mod.createSharedBrowserExecutor({ enabled: true, effectsEnabled: true, now: () => 1000,
    readCapability: async () => ({ available: true }),
    preparation: { inspect: async () => ({ eligible: true, permit }), claim: async () => { claims++; return { ok: true }; } },
    readContext: async () => live, request: async (method, payload) => { acks++; assert.equal(method, 'acknowledgeBrowserExecution');
      assert.equal(payload.outcome, 'canceled'); return { ok: ackOk }; },
    closer: { close: async (target, effect, current) => { assert.equal(await current(), true); assert.equal(effect, 'request-normal-close'); closes++; return { outcome: 'canceled' }; } } });
  const target = { id: 1, windowId: 2, url: 'https://fixture.test' };
  assert.equal((await executor.execute(state, target)).outcome, 'canceled');
  ackOk = true; assert.equal((await executor.execute(state, target)).outcome, 'canceled');
  assert.equal(closes, 1); assert.equal(claims, 1); assert.equal(acks, 2, 'lost ACK retries the same result without closing again');
  const timeout = { ...state, resolution: 'timeout_end', timeoutAction: 'continue' };
  assert.equal((await executor.execute(timeout, target)).errorCode, 'shared_browser_execution_resolution_mismatch');
  assert.equal(closes, 1);
  live = { ...context, stateRevision: 'new-balance' };
  assert.equal((await executor.execute(state, target)).errorCode, 'shared_browser_execution_stale');
  assert.equal(closes, 1);
  assert.equal((await mod.createSharedBrowserExecutor({ enabled: true, effectsEnabled: false, preparation: {} }).execute(state, target)).skipped, true);
  const growth = { ...permit, stateRevision: 'latest', triggerStateRevision: state.stateRevision };
  const growthExecutor = mod.createSharedBrowserExecutor({ enabled: true, effectsEnabled: true, now: () => 1000,
    readCapability: async () => ({ available: true }),
    preparation: { inspect: async () => ({ eligible: true, permit: growth }), claim: async () => ({ ok: true }) },
    readContext: async () => ({ ...context, stateRevision: 'latest', continuitySupported: true }),
    closer: { close: async (_target, _effect, current) => { assert.equal(await current(), true); return { outcome: 'completed' }; } },
    request: async (_method, payload) => {
      assert.equal(payload.stateRevision, 'latest'); assert.equal(payload.triggerStateRevision, 'state');
      return { ok: true };
    } });
  assert.equal((await growthExecutor.execute(state, target)).outcome, 'completed');
  const blocked = mod.createSharedBrowserExecutor({ enabled: true, effectsEnabled: true,
    preparation: { inspect: async () => { throw Error('permission failure must precede inspect/claim'); } } });
  assert.equal((await blocked.execute(state, target)).errorCode, 'shared_browser_close_permission_unavailable');
  console.log('Shared browser executor: cancellation, explicit timeout policy, stale identity and ACK retry PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
