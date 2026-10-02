'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
async function run() {
  let source = fs.readFileSync(path.join(root, 'extension/product/shared-reminder-content-bridge.js'), 'utf8')
    .replace(/import \{ readSharedAccessRuntime \}[^;]+;/, 'const readSharedAccessRuntime=async()=>({ok:true,executionRevision:globalThis.__reminderExecutionRevision||"state-1",policy:{revision:"policy-1"}});')
    .replace(/import \{ createSharedBrowserExecutor \}[^;]+;/, 'const createSharedBrowserExecutor=()=>({execute:async()=>({ok:true,effectsEnabled:false})});')
    .replace(/import \{ requestSharedReminderLifecycle, getSharedBrowserActivityLease, hasSharedReminderContinuityCapability \} from '[^']+';/,
      'const requestSharedReminderLifecycle = () => { throw Error("not configured"); }; const getSharedBrowserActivityLease = () => "lease-1",hasSharedReminderContinuityCapability=()=>false;')
    .replace(/from '\.\.\/infra\/shared-reminder-lifecycle.js'/, `from '${pathToFileURL(path.join(root, 'extension/infra/shared-reminder-lifecycle.js')).href}'`)
    .replace(/from '\.\.\/core\/shared-reminder-lifecycle.js'/, `from '${pathToFileURL(path.join(root, 'extension/core/shared-reminder-lifecycle.js')).href}'`);
  const { createSharedReminderContentBridge, initSharedReminderContentBridge,
    configureSharedReminderContentBridge, pollSharedReminderForTab } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const state = { schemaVersion: 1, roundId: 'round-1', reminderId: 'reminder-1', deliveryId: 'delivery-1',
    policyRevision: 'policy-1', stateRevision: 'state-1', date: '2026-10-02', kinds: ['daily', 'weekly'],
    presenter: 'browser', stage: 'shadow', issuedAtMs: 1000, offerExpiresAtMs: 300000,
    visibleAtMs: null, responseDeadlineSeconds: 60, timeoutAction: 'end', status: 'offered', resolution: null };
  const identityKeys = ['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision'];
  const identity = Object.fromEntries(identityKeys.map(key => [key, state[key]]));
  const tab = { id: 1, windowId: 2, active: true, url: 'https://fixture.test/page' };
  const messages = [];
  const requests = [];
  let visible = true;
  let navigateDuringDisplay = false;
  let backend = { ...state };
  const window = { focused: true, state: 'normal' };
  const options = { enabled: true, runtimeId: 'extension-id', windows: { async get() { return { ...window }; } }, tabs: {
    async get() { return { ...tab }; },
    async sendMessage(id, msg, target) {
      messages.push(msg); assert.equal(id, 1); assert.equal(target.frameId, 0);
      if (navigateDuringDisplay && msg.type === 'SHOW_SHARED_REMINDER') tab.url = 'https://fixture.test/new';
      return { ok: true, visible, identity, presentationId: msg.presentationId };
    } },
    async request(method, payload) {
      requests.push({ method, payload });
      if (method === 'acknowledgeSharedReminderDelivery') backend = { ...backend,
        status: payload.delivery === 'visible' ? 'visible' : 'delivery_failed', visibleAtMs: payload.delivery === 'visible' ? 2500 : null };
      if (method === 'resolveSharedReminder') backend = { ...backend, status: 'resolved', resolution: payload.action };
      return { ok: true, state: backend };
    } };
  const disabled = createSharedReminderContentBridge({ ...options, enabled: false });
  assert.equal((await disabled.poll(1, state.date)).skipped, true);
  assert.equal(messages.length, 0);
  const bridge = createSharedReminderContentBridge(options);
  assert.equal((await bridge.poll(1, state.date)).state.visibleAtMs, 2500);
  assert.deepEqual(messages.map(row => row.type), ['SHOW_SHARED_REMINDER', 'ACTIVATE_SHARED_REMINDER']);
  assert.deepEqual(requests[1].payload, { ...identity, delivery: 'visible' });
  const msg = { type: 'SHARED_REMINDER_ACTION', presentationId: messages[0].presentationId,
    payload: { ...identity, action: 'continue' } };
  const sender = { id: 'extension-id', frameId: 0, tab: { ...tab }, url: tab.url };
  assert.equal((await bridge.handleAction(msg, { ...sender, frameId: 1 })).errorCode, 'shared_reminder_sender_rejected');
  assert.equal((await bridge.handleAction(msg, { ...sender, id: 'other-extension' })).ok, false);
  assert.equal((await bridge.handleAction(msg, { ...sender, tab: { ...sender.tab, windowId: 99 } })).ok, false);
  assert.equal((await bridge.handleAction({ ...msg, presentationId: 'old' }, sender)).ok, false);
  assert.equal((await bridge.handleAction({ ...msg, payload: { ...msg.payload, deliveryId: 'old' } }, sender)).errorCode, 'SHARED_REMINDER_INSTANCE_CHANGED');
  assert.equal((await bridge.handleAction({ ...msg, payload: { ...msg.payload, action: 'timeout_end' } }, sender)).ok, false);
  assert.equal((await bridge.handleAction(msg, sender)).state.resolution, 'continue');
  assert.equal(messages.at(-1).type, 'DISMISS_SHARED_REMINDER');

  backend = { ...state };
  const growing = createSharedReminderContentBridge({ ...options, readContinuity: () => true });
  await growing.poll(1, state.date);
  const displayedAt = growing.inspect().state.visibleAtMs;
  const shows = messages.filter(x => x.type === 'SHOW_SHARED_REMINDER').length;
  globalThis.__reminderExecutionRevision = 'state-2';
  assert.equal((await growing.poll(1, state.date)).ok, true, 'Service keeps trigger identity across negotiated growth');
  assert.equal(growing.inspect().state.stateRevision, 'state-1');
  assert.equal(growing.inspect().state.visibleAtMs, displayedAt);
  assert.equal(messages.filter(x => x.type === 'SHOW_SHARED_REMINDER').length, shows, 'no redisplay/deadline restart');
  backend = { ...backend, stateRevision: 'state-2' };
  assert.equal((await growing.poll(1, state.date)).ok, true);
  assert.notEqual(growing.inspect().state?.stateRevision, 'state-1', 'corrected Service identity cannot keep old prompt');
  await growing.invalidate();
  globalThis.__reminderExecutionRevision = null;

  backend = { ...state }; visible = false;
  const invisible = createSharedReminderContentBridge(options);
  assert.equal((await invisible.poll(1, state.date)).state.status, 'delivery_failed');
  assert.equal(requests.at(-1).payload.delivery, 'failed');
  backend = { ...state }; visible = true; navigateDuringDisplay = true;
  const navigated = createSharedReminderContentBridge(options);
  assert.equal((await navigated.poll(1, state.date)).ok, false);
  assert.equal(navigated.inspect().displayed, false);
  assert.equal((await navigated.handleAction(msg, sender)).ok, false);
  tab.url = sender.url; navigateDuringDisplay = false;
  backend = { ...state, presenter: 'native' };
  const before = messages.length;
  await createSharedReminderContentBridge(options).poll(1, state.date);
  assert.equal(messages.length, before);

  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  function fixture(block = null) {
    const calls = [], sent = [];
    const page = { ...tab }, view = { focused: true, state: 'normal' };
    let live = { ...state }, lease = 'lease-1';
    const entered = deferred(), gate = deferred();
    const bridge = createSharedReminderContentBridge({ enabled: true, runtimeId: 'extension-id',
      deliveryTimeoutMs: block === 'timeout' ? 12 : 3000,
      readLease: () => lease, windows: { async get() { return { ...view }; } },
      tabs: { async get() { return { ...page }; }, async sendMessage(id, message) {
        sent.push(message);
        const reply = { ok: true, visible: true, identity, presentationId: message.presentationId };
        if ((block === 'show' || block === 'timeout') && message.type === 'SHOW_SHARED_REMINDER') {
          entered.resolve(); await gate.promise;
        }
        return reply;
      } },
      async request(method, payload) {
        calls.push({ method, payload });
        if (method === 'acknowledgeSharedReminderDelivery') live = { ...live, status: 'visible', visibleAtMs: 2500 };
        if (method === 'resolveSharedReminder') live = { ...live, status: 'resolved', resolution: payload.action };
        const reply = { ok: true, state: live };
        if ((block === 'read' && method === 'getSharedReminderState')
          || (block === 'ack' && method === 'acknowledgeSharedReminderDelivery')
          || (block === 'choice' && method === 'resolveSharedReminder')) {
          entered.resolve(); await gate.promise;
        }
        return reply;
      } });
    return { bridge, calls, sent, page, view, entered, gate, setLease(value) { lease = value; } };
  }
  for (const phase of ['read', 'show', 'ack']) {
    const f = fixture(phase);
    const pending = f.bridge.poll(1, state.date);
    await f.entered.promise;
    await f.bridge.invalidateTab(1); // Includes same-URL document reload.
    f.gate.resolve();
    assert.equal((await pending).ok, false, `late ${phase} cannot restore UI state`);
    assert.equal(f.bridge.inspect().state, null);
    assert.equal(f.bridge.inspect().displayed, false);
    assert(!f.sent.some(row => row.type === 'ACTIVATE_SHARED_REMINDER'));
    assert(!f.calls.some(row => row.method === 'resolveSharedReminder'));
  }
  const choice = fixture('choice');
  await choice.bridge.poll(1, state.date);
  const action = { ...msg, presentationId: choice.sent[0].presentationId };
  const pendingChoice = choice.bridge.handleAction(action, { ...sender, tab: choice.page, url: choice.page.url });
  await choice.entered.promise;
  await choice.bridge.invalidate();
  choice.gate.resolve();
  assert.equal((await pendingChoice).ok, false);
  assert.equal(choice.bridge.inspect().state, null);
  for (const patch of [{ focused: false }, { state: 'minimized' }]) {
    const f = fixture(); Object.assign(f.view, patch);
    assert.equal((await f.bridge.poll(1, state.date)).ok, false);
    assert.equal(f.calls.length, 0);
    assert.equal(f.sent.length, 0);
  }
  const moved = fixture();
  await moved.bridge.poll(1, state.date);
  const oldPresentation = moved.sent[0].presentationId;
  moved.page.url = 'https://fixture.test/new';
  assert.equal((await moved.bridge.poll(1, state.date)).ok, true, 'new navigation is not permanently wedged');
  assert.notEqual(moved.sent.findLast(row => row.type === 'SHOW_SHARED_REMINDER').presentationId, oldPresentation);
  assert.equal((await moved.bridge.handleAction({ ...msg, presentationId: oldPresentation }, sender)).ok, false);
  const dismissed = fixture();
  await dismissed.bridge.poll(1, state.date);
  assert.equal((await dismissed.bridge.handleAction({ type: 'SHARED_REMINDER_DISMISSED', payload: identity,
    presentationId: dismissed.sent[0].presentationId }, sender)).ok, true);
  assert.equal(dismissed.bridge.inspect().state, null);
  assert(!dismissed.calls.some(row => row.method === 'resolveSharedReminder'), 'Escape/hidden is not a user choice');
  const disconnected = fixture();
  await disconnected.bridge.poll(1, state.date);
  disconnected.setLease(null);
  assert.equal((await disconnected.bridge.handleAction({ ...msg, presentationId: disconnected.sent[0].presentationId }, sender)).ok, false);
  assert.equal(disconnected.bridge.inspect().displayed, false);
  assert.equal(disconnected.calls.filter(row => row.method === 'resolveSharedReminder').length, 0);
  const timed = fixture('timeout');
  const started = Date.now();
  assert.equal((await timed.bridge.poll(1, state.date)).ok, true);
  assert(Date.now() - started < 1000);
  assert.equal(timed.calls.at(-1).payload.delivery, 'failed');
  assert(timed.sent.some(row => row.type === 'DISMISS_SHARED_REMINDER'));
  timed.gate.resolve(); await tick();
  assert.equal(timed.bridge.inspect().displayed, false);
  assert(!timed.sent.some(row => row.type === 'ACTIVATE_SHARED_REMINDER'));
  const oldChrome = global.chrome;
  const events = {};
  const event = name => ({ addListener(listener) { (events[name] ||= []).push(listener); } });
  try {
    global.chrome = { runtime: { onMessage: event('message') },
      tabs: { onUpdated: event('updated'), onRemoved: event('removed'), onReplaced: event('replaced'), onActivated: event('activated') },
      windows: { onFocusChanged: event('focus'), onBoundsChanged: event('bounds') } };
    initSharedReminderContentBridge(); initSharedReminderContentBridge();
    assert(Object.values(events).every(list => list.length === 1), 'listeners register synchronously once');
    assert.equal((await pollSharedReminderForTab(1, state.date)).skipped, true);
    const defaultReply = await new Promise(resolve => events.message[0](msg, sender, resolve));
    assert.equal(defaultReply.errorCode, 'shared_reminder_disabled');
    assert.equal(events.message[0]({ type: 'OTHER' }, sender, () => { throw Error('must not respond'); }), false);
    backend = { ...state }; visible = true;
    assert.equal(configureSharedReminderContentBridge(options).ok, true);
    await pollSharedReminderForTab(1, state.date);
    events.updated[0](1, { status: 'loading' });
    await tick();
    assert.equal(configureSharedReminderContentBridge({ ...options, enabled: false }).ok, true);
    assert.equal((await pollSharedReminderForTab(1, state.date)).skipped, true);
  } finally { global.chrome = oldChrome; }
  const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
  const shared = content.slice(content.indexOf('  function sharedContentIdentity('), content.indexOf('  function bindRestReminderSlider('));
  assert(!/pauseMedia|resumeMedia|exitFullscreen|location\s*=|setInterval|timeout_end/.test(shared));
  assert(shared.includes("response.state?.status !== 'resolved'"));
  const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
  assert(background.includes("|| msg?.type === 'SHARED_REMINDER_DISMISSED') return false;"));
  assert(!background.includes('pollSharedReminderForTab('));
  console.log('[Shared reminder Content bridge] passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
