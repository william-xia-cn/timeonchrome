'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const CONTRACT_SHA = '543d506';
const importSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function run() {
  const validator = await importSource(fs.readFileSync(path.join(root, 'extension/core/shared-browser-activity.js'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'extension/product/shared-browser-activity.js'), 'utf8');
  const { readBrowserRestActivity, createSharedBrowserActivity, createSharedBrowserActivityV2 } = await importSource(
    `import {checkSharedActivityAckV2} from '${pathToFileURL(path.join(root, 'extension/core/shared-forced-use-runtime-v2.js')).href}';\n`
    +
    'const getSession = async () => null; const confirmForegroundPageCheckpoint = async () => ({ok:false});\n'
    + 'const extractDomain = url => new URL(url).hostname;\n'
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
  const initialUrl = tab.url;
  tab.url = 'https://other.test/page'; assert.equal((await sampler()).active, false, 'actual URL must match even when strong evidence omits observedUrl');
  tab.url = initialUrl;
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
  const handoffEvents = [], v2Messages = [];
  let retirementAllowed = true, holdAck = null, pendingEntry = false;
  const activityV2 = createSharedBrowserActivityV2({ enabled: true, uuid: () => 'activity-v2',
    sample: async () => ({ active: true, key: 'fixture-page', quotaBucket: 'composite', presentationEligible: true }),
    readContext: async () => ({ ok: true, policyIdentity: { schemaVersion: 2, revision: 'profile-config:1',
      effectiveAtMs: 0, stage: 'shared', policyHash: 'a'.repeat(64) }, ruleScopeKey: 'b'.repeat(64), reasonCodes: ['timeWindow'],
      pendingEntry, quotaBucket: 'composite', presentationEligible: true }),
    readRound: async () => ({ ok: true, roundId: 'independent-round' }),
    retireRound: async roundId => { handoffEvents.push('retire'); return { ok: retirementAllowed, retiredIndependentRoundId: roundId }; },
    resumeIndependent: async () => handoffEvents.push('resume'),
    onOwnershipChanged: async value => handoffEvents.push(value ? 'owned' : 'released'),
    send: async payload => { handoffEvents.push('send'); v2Messages.push(payload);
      if (holdAck) await new Promise(resolve => { holdAck.resolve = resolve; });
      return { ok: true, receipt: { schemaVersion: 2, leaseId: payload.leaseId, acceptedSequence: payload.sequence,
        duplicate: false, stale: false, ownership: 'accepted', retiredIndependentRoundId: payload.independentRoundId } }; },
  });
  await activityV2.setLease('lease-v2'); handoffEvents.length = 0;
  assert.equal((await activityV2.tick()).ok, true);
  assert.deepEqual(handoffEvents, ['retire', 'send', 'owned']);
  assert.equal(Object.hasOwn(v2Messages[0], 'forcedUsageSeconds'), false, 'sender never supplies a second usage counter');
  pendingEntry = true;
  assert.equal((await activityV2.tick()).ok, true);
  assert.equal(v2Messages.at(-1).status, 'pending-entry', 'unconfirmed access cannot be represented as actual use');
  pendingEntry = false;
  assert.equal((await activityV2.tick()).ok, true);
  assert.equal(v2Messages.at(-1).status, 'active');
  const messagesBeforeFailure = v2Messages.length;
  retirementAllowed = false;
  assert.equal((await activityV2.tick()).ok, false);
  assert.equal(v2Messages.length, messagesBeforeFailure, 'missing local retirement prevents Service handoff');
  assert.equal(activityV2.inspect().owned, false);
  retirementAllowed = true; holdAck = {};
  const lateHandoff = activityV2.tick();
  while (!holdAck.resolve) await new Promise(resolve => setImmediate(resolve));
  await activityV2.setLease(null); holdAck.resolve();
  assert.equal((await lateHandoff).ok, false, 'late ownership ACK after disconnect cannot reacquire control');
  assert.equal(activityV2.inspect().owned, false);
  const coordinatorSource = fs.readFileSync(path.join(root, 'extension/product/shared-forced-use-v2.js'), 'utf8');
  const createCoordinator = new Function('createSharedBrowserActivityV2', 'browserExecutionFence',
    coordinatorSource.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
      + '\nreturn createSharedForcedUseCoordinatorV2;')(createSharedBrowserActivityV2, { invalidate() {} });
  const identity = { schemaVersion: 2, revision: 'profile-config:1', effectiveAtMs: 0,
    stage: 'shared', policyHash: 'a'.repeat(64) };
  const admission = { ok: true, sharedRuntimeV2: true, identityKey: 'fixture-child-device',
    dateKey: '2026-10-16', ruleKey: 'b'.repeat(64), policyIdentity: identity,
    action: 'confirm', reasons: ['timeWindow'], quotaBucket: 'rest' };
  let bridgeOptions;
  const coordinator = createCoordinator({ enabled: true, readLease: () => 'scope-lease',
    request: async () => ({ ok: false }),
    tabs: { query: async () => [{ id: 1, windowId: 2, active: true, url: 'https://example.test/' }] },
    windows: { get: async () => ({ focused: true, state: 'normal' }) },
    sample: async () => ({ active: true, key: 'scope-page', quotaBucket: 'rest' }),
    readDecision: async () => ({ forcedAdmission: admission }),
    readModel: async () => ({ ok: true, policyIdentity: identity }),
    readRound: async () => ({ ok: true, roundId: null }),
    retireRound: async () => ({ ok: true, retiredIndependentRoundId: null }),
    resumeIndependent: async () => {},
    sendActivity: async payload => ({ ok: true, receipt: { schemaVersion: 2, leaseId: payload.leaseId,
      acceptedSequence: payload.sequence, duplicate: false, stale: false, ownership: 'accepted',
      retiredIndependentRoundId: payload.independentRoundId } }),
    createBridge: options => { bridgeOptions = options; return { inspect: () => ({ displayed: false }),
      poll: async () => ({ ok: true }), invalidate: async () => {} }; },
  });
  await coordinator.tick();
  await bridgeOptions.onResolved({ roundId: 'scope-round', deliveryId: 'scope-delivery', resolution: 'continue',
    ruleScopeKey: admission.ruleKey, policyIdentity: identity, reasonCodes: ['timeWindow'] }, { id: 1 });
  assert.equal(coordinator.hasConfirmation({ ...admission, tabId: 9 }), true, 'same rule grant is not tied to the tab');
  assert.equal(coordinator.hasConfirmation({ ...admission, dateKey: '2026-10-17' }), false, 'next day cannot reuse the grant');
  assert.equal(coordinator.hasConfirmation({ ...admission, ruleKey: 'c'.repeat(64) }), false, 'another rule needs confirmation');
  assert.equal(coordinator.hasConfirmation({ ...admission, reasons: ['timeWindow', 'dailyRest'] }), false,
    'new quota reason cannot reuse an earlier time-window-only grant');
  assert(!/closeCurrentSession|updateSession|storage\.(?:local|session)\.set|budgetedLocalSet/.test(source), 'observer cannot mutate accounting');
  console.log(`[Shared Browser Activity] ${vectors.cases.length} contract vectors and sampler/controller checks passed (${CONTRACT_SHA})`);
}
run().catch(error => { console.error(error); process.exit(1); });
