'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

async function run() {
  const root = path.resolve(__dirname, '../..');
  const core = await import(pathToFileURL(path.join(root, 'extension/core/shared-reminder-lifecycle.js')));
  const { createSharedReminderLifecycle } = await import(pathToFileURL(path.join(root, 'extension/infra/shared-reminder-lifecycle.js')));
  const offered = { schemaVersion: 1, roundId: 'round-1', reminderId: 'reminder-1', deliveryId: 'delivery-1',
    policyRevision: 'policy-1', stateRevision: 'state-1', date: '2026-10-02', kinds: ['daily', 'weekly'],
    presenter: 'browser', stage: 'shadow', issuedAtMs: 1000, offerExpiresAtMs: 300000,
    visibleAtMs: null, responseDeadlineSeconds: 60, timeoutAction: 'end', status: 'offered', resolution: null };
  const identity = core.sharedReminderIdentity(offered);
  assert.equal(core.validateSharedReminderMessage({ ...identity, action: 'timeout_end' }, 'resolveSharedReminder').ok, false);
  assert.equal(core.validateSharedReminderMessage({ ...identity, delivery: 'visible', visibleAtMs: 2 }, 'acknowledgeSharedReminderDelivery').ok, false);
  assert.equal(core.validateSharedReminderState({ ...offered, childId: 'other' }).ok, false);
  assert.equal(core.validateSharedReminderState({ ...offered, kinds: ['daily', 'daily'] }).ok, false);
  assert.equal(core.validateSharedReminderState(offered, { deliveryId: 'old' }).ok, false);
  const disabled = createSharedReminderLifecycle({ request: () => { throw Error('must not send'); } });
  assert.equal((await disabled.poll(offered.date)).skipped, true);

  let service = { ...offered };
  let failAck = true;
  let failResolve = false;
  let shown = 0;
  let dismissed = 0;
  const messages = [];
  const client = createSharedReminderLifecycle({ enabled: true,
    present: async state => { shown++; assert.deepEqual(state.kinds, ['daily', 'weekly']); return { visible: true }; },
    dismiss: async () => { dismissed++; },
    request: async (method, payload) => {
      messages.push({ method, payload });
      if (method === 'getSharedReminderState') return { ok: true, state: service };
      assert.deepEqual(core.sharedReminderIdentity(payload), identity);
      assert.equal(Object.hasOwn(payload, 'visibleAtMs'), false);
      if (method === 'acknowledgeSharedReminderDelivery') {
        if (failAck) { failAck = false; return { ok: false, errorCode: 'native_response_timeout' }; }
        service = { ...service, status: 'visible', visibleAtMs: 2500 };
      } else if (failResolve) return { ok: false, errorCode: 'SHARED_REMINDER_DEADLINE_ELAPSED' };
      else service = { ...service, status: 'resolved', resolution: payload.action };
      return { ok: true, state: service };
    } });
  assert.equal((await client.poll(offered.date)).errorCode, 'native_response_timeout');
  assert.equal((await client.choose('continue')).errorCode, 'SHARED_REMINDER_NOT_VISIBLE');
  assert.equal((await client.poll(offered.date)).state.visibleAtMs, 2500);
  assert.equal(shown, 1); // Lost ACK retries same delivery, without a second display.
  assert.equal((await client.choose('timeout_end')).ok, false);
  failResolve = true;
  assert.equal((await client.choose('continue')).errorCode, 'SHARED_REMINDER_DEADLINE_ELAPSED');
  assert.equal(dismissed, 0);
  failResolve = false;
  assert.equal((await client.choose('end_rest')).state.resolution, 'end_rest');
  assert.equal(dismissed, 1);
  assert.equal((await client.choose('end_rest')).ok, false);
  assert.equal(messages.some(row => row.payload.action?.startsWith('timeout')), false);

  let failedPayload;
  const invisible = createSharedReminderLifecycle({ enabled: true, present: async () => ({ visible: false }),
    request: async (method, payload) => {
      if (method === 'getSharedReminderState') return { ok: true, state: offered };
      failedPayload = payload;
      return { ok: true, state: { ...offered, status: 'delivery_failed' } };
    } });
  assert.equal((await invisible.poll(offered.date)).state.status, 'delivery_failed');
  assert.equal(failedPayload.delivery, 'failed');
  const native = createSharedReminderLifecycle({ enabled: true,
    present: () => { throw Error('wrong presenter'); }, request: async () => ({ ok: true, state: { ...offered, presenter: 'native' } }) });
  assert.equal((await native.poll(offered.date)).state.presenter, 'native');

  let release;
  const busy = createSharedReminderLifecycle({ enabled: true, request: () => new Promise(resolve => { release = resolve; }) });
  const first = busy.poll(offered.date);
  assert.equal((await busy.poll(offered.date)).errorCode, 'shared_reminder_busy');
  release({ ok: true, state: null });
  await first;

  // Optional fixed-package evidence. Never import another repository's source tree.
  if (process.argv[2]) {
    const pkg = path.resolve(process.argv[2]);
    const module = await import(pathToFileURL(path.join(pkg, 'dist/shared-reminder-lifecycle.js')));
    const vectors = JSON.parse(fs.readFileSync(path.join(pkg, 'shared-reminder-lifecycle.vectors.json'), 'utf8'));
    assert.equal(vectors.cases.length, 28);
    for (const test of vectors.cases) {
      const state = { ...vectors.state, ...test.statePatch };
      assert.equal(core.validateSharedReminderState(state).ok, true, test.name);
      const context = { ...vectors.context, ...test.contextPatch, state };
      const input = { ...core.sharedReminderIdentity(state), ...test.message };
      const invoke = () => test.operation === 'ack' ? module.acknowledgeSharedReminderDelivery(context, input)
        : test.operation === 'resolve' ? module.resolveSharedReminder(context, input) : module.expireSharedReminder(context);
      if (test.operation !== 'timeout') assert.equal(core.validateSharedReminderMessage(input,
        test.operation === 'ack' ? 'acknowledgeSharedReminderDelivery' : 'resolveSharedReminder').ok,
      test.error !== 'INVALID_SHARED_REMINDER_MESSAGE', test.name);
      if (test.error) assert.throws(invoke, error => error.message === test.error, test.name);
      else {
        const result = invoke();
        for (const [key, value] of Object.entries(test.expect)) {
          assert.deepEqual(['status', 'resolution', 'visibleAtMs'].includes(key) ? result.state[key] : result[key], value, test.name);
        }
      }
    }
    console.log('[Fixed contract] 28 lifecycle vectors passed');
  }
  console.log('[Shared reminder lifecycle] passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
