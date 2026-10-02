'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const CONTRACT_SHA = '543d506';
const importSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function run() {
  const validator = await importSource(fs.readFileSync(path.join(root, 'extension/core/shared-browser-activity.js'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'extension/product/shared-browser-activity.js'), 'utf8');
  const { readBrowserRestActivity, createSharedBrowserActivity } = await importSource(
    'const getSession = async () => null; const confirmForegroundPageCheckpoint = async () => ({ok:false});\n'
    + 'const chrome = {tabs:{},windows:{}}; const reportSharedBrowserActivity = async () => ({ok:false});\n'
    + source.replace(/^import .*;\r?\n/gm, ''));
  const readContract = file => execFileSync('git', ['show', `${CONTRACT_SHA}:app-runtime-management/contracts/${file}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const service = await importSource(ts.transpileModule(readContract('shared-reminder-lifecycle.ts'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const vectors = JSON.parse(readContract('shared-reminder-lifecycle.vectors.json')).browserActivity;
  for (const vector of vectors.cases) {
    const initial = { ...vectors.message, ...vector.messagePatch };
    const first = service.receiveSharedBrowserActivity(vectors.context, initial);
    const context = { ...vectors.context, current: first.receipt, ...vector.contextPatch };
    const next = { ...initial, ...vector.nextPatch };
    const execute = () => vector.operation === 'validate' ? service.validateSharedBrowserActivity(next)
      : vector.operation === 'receive' ? service.receiveSharedBrowserActivity(context, next)
        : service.sharedBrowserReminderEligibility(context, vector.expectedActivityId);
    if (vector.error) {
      assert.throws(execute, error => error.message === vector.error, vector.name);
      if (vector.operation === 'validate') assert.equal(validator.validateSharedBrowserActivity(next).ok, false, vector.name);
    } else {
      const result = execute();
      for (const [field, value] of Object.entries(vector.expect)) {
        const actual = field === 'receivedMonotonicMs' ? result.receipt.receivedMonotonicMs
          : field === 'eligible' && result.receipt ? service.sharedBrowserReminderEligibility({ ...context, current: result.receipt }).eligible
            : result[field];
        assert.equal(actual, value, `${vector.name}: ${field}`);
      }
      assert.equal(validator.validateSharedBrowserActivity(next).ok, true);
    }
  }
  const session = { state: 'ACTIVE', tabId: 7, windowId: 8, domain: 'fixture.test',
    quotaBucketAtTime: 'rest', targetClassificationAtTime: 'pending_composite' };
  let current = { ...session };
  let tab = { id: 7, windowId: 8, active: true, url: 'https://fixture.test/page' };
  let win = { id: 8, state: 'normal', focused: true };
  let evidence = { ok: true, observedState: 'ACTIVE', observedDomain: session.domain,
    tabId: 7, windowId: 8, idleState: 'active', observedUrl: tab.url };
  let visible = true;
  const sampler = () => readBrowserRestActivity({ readSession: async () => current,
    confirm: async () => evidence, tabs: { get: async () => tab,
      sendMessage: async () => ({ documentVisible: visible }) }, windows: { get: async () => win } });
  assert.equal((await sampler()).active, true, 'borrowed Rest is eligible regardless of classification');
  assert.equal((await sampler()).presentationEligible, true);
  win.focused = false;
  evidence = { ...evidence, foregroundMediaActive: true, observedUrl: undefined };
  assert.equal((await sampler()).active, true, 'fresh strong-media verification keeps existing activity');
  assert.equal((await sampler()).presentationEligible, false);
  win.state = 'minimized'; assert.equal((await sampler()).active, false);
  win.state = 'normal'; tab.active = false; assert.equal((await sampler()).active, false);
  tab.active = true; evidence.ok = false; assert.equal((await sampler()).active, false, 'failed-close residual ACTIVE is not proof');
  evidence.ok = true; evidence.idleState = 'locked'; assert.equal((await sampler()).active, false);
  evidence.idleState = 'active'; evidence.observedDomain = 'other.test'; assert.equal((await sampler()).active, false);
  evidence.observedDomain = session.domain; current.quotaBucketAtTime = 'study'; assert.equal((await sampler()).active, false);
  current = { ...session }; visible = false; assert.equal((await sampler()).presentationEligible, false);
  assert.equal((await readBrowserRestActivity({ readSession: async () => { throw Error('storage'); } })).active, false);
  let reads = 0;
  assert.equal((await readBrowserRestActivity({ readSession: async () => ++reads === 1 ? session : null,
    confirm: async () => evidence, tabs: { get: async () => tab, sendMessage: async () => ({ documentVisible: true }) },
    windows: { get: async () => win } })).active, false, 'session stop during read cannot renew');

  const messages = [];
  let scheduled = null;
  let fact = { active: true, key: 'local-page-1', presentationEligible: true };
  let uuid = 0;
  let holdSample = null;
  const controller = createSharedBrowserActivity({ sample: () => holdSample || Promise.resolve(fact),
    uuid: () => `activity-${++uuid}`, send: payload => { messages.push(payload); return Promise.resolve({ ok: true }); },
    schedule: (fn, ms) => { assert.equal(ms, 5000); scheduled = fn; return 1; }, cancel: () => { scheduled = null; } });
  controller.setLease('lease-1'); await controller.tick(); assert.equal(messages.length, 0);
  controller.configure(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).status, 'active');
  const firstId = messages.at(-1).activityId;
  scheduled(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).activityId, firstId); assert.equal(messages.at(-1).sequence, 2);
  fact = { ...fact, key: 'local-page-2' }; await controller.tick();
  assert.equal(messages.at(-2).status, 'inactive'); assert.notEqual(messages.at(-1).activityId, firstId);
  let release;
  holdSample = new Promise(resolve => { release = resolve; });
  const reading = controller.tick(); controller.invalidate();
  assert.equal(messages.at(-1).status, 'inactive');
  release(fact); await reading; assert.equal(messages.at(-1).status, 'inactive', 'stale sampled evidence cannot revive');
  holdSample = null; await controller.tick();
  const oldSequence = messages.at(-1).sequence;
  controller.setLease(null); assert.equal(scheduled, null);
  controller.setLease('lease-1'); await new Promise(resolve => setImmediate(resolve));
  assert(messages.at(-1).sequence > oldSequence, 'same lease cannot reset sequence');
  controller.setLease('lease-2'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).sequence, 1);
  controller.configure(false); assert.equal(messages.at(-1).status, 'inactive'); assert.equal(scheduled, null);
  let expireRead;
  let resolveRead;
  const hungMessages = [];
  const hung = createSharedBrowserActivity({ enabled: true,
    sample: () => new Promise(resolve => { resolveRead = resolve; }), uuid: () => 'hung-activity',
    send: payload => hungMessages.push(payload), schedule: () => 1, cancel: () => {},
    deadline: (callback, ms) => { assert.equal(ms, 3000); expireRead = callback; return 2; }, clearDeadline: () => {} });
  hung.setLease('hung-lease'); await new Promise(resolve => setImmediate(resolve));
  expireRead(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(hungMessages.at(-1).status, 'inactive', 'unresponsive page query cannot block subsequent renewals');
  resolveRead(fact); await new Promise(resolve => setImmediate(resolve));
  assert.equal(hungMessages.length, 1, 'late read after deadline cannot restore activity');
  hung.configure(false);
  for (const message of messages) {
    assert.equal(validator.validateSharedBrowserActivity(message).ok, true);
    assert.deepEqual(Object.keys(message).sort(), ['schemaVersion', 'leaseId', 'activityId', 'sequence', 'status', 'quotaBucket', 'presentationEligible'].sort());
    assert(!JSON.stringify(message).includes('local-page'));
  }
  assert(!/closeCurrentSession|updateSession|storage\.(?:local|session)\.set|budgetedLocalSet/.test(source), 'observer cannot mutate accounting');
  console.log(`[Shared Browser Activity] ${vectors.cases.length} contract vectors and sampler/controller checks passed (${CONTRACT_SHA})`);
}
run().catch(error => { console.error(error); process.exit(1); });
