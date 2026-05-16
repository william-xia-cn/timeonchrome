// P0 foreground_page reliability tests
// Run with: node tests/unit/foreground-page-reliability-p0.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys == null) return { ...this.data };
    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach((key) => { out[key] = this.data[key]; });
      return out;
    }
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    const out = {};
    Object.keys(keys || {}).forEach((key) => { out[key] = this.data[key] ?? keys[key]; });
    return out;
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
  }
}

const mockSessionStorage = new MockStorage();
const mockLocalStorage = new MockStorage();

global.chrome = {
  storage: {
    session: mockSessionStorage,
    local: mockLocalStorage,
  },
};

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const eventApi = loadProdModule('core/event-log.js', ['appendEvent', 'getEvents', 'clearEvents', 'EVENT_TYPE']);
const aggregateApi = loadProdModule('core/aggregate.js', ['computeAllDomains', 'computeAllDomainsWithAudio']);
const timeBoundaryApi = loadProdModule('runtime/time-boundary.js', [
  'getReliableCloseTime',
]);
const contextApi = loadProdModule('core/context.js', ['buildContext']);
const stateApi = loadProdModule('core/state.js', ['resolveState', 'AttentionState']);

const settled = [];
const sessionApi = loadProdModule('runtime/session.js', [
  'closeCurrentSession',
  'flushOpenSessionToStats',
  'getSession',
  'heartbeat',
  'runPeriodicCheckpoint',
  'saveSession',
  'settleCurrentSessionSegment',
  'transitionStateAt',
], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  emitTrace: async () => {},
  getReliableCloseTime: timeBoundaryApi.getReliableCloseTime,
  isCountedState: (state) => ['ACTIVE', 'BACKGROUND_ACTIVE', 'PIP_ACTIVE'].includes(state),
  settleUsageDuration: async (input) => {
    settled.push(input);
    return 1;
  },
});

function resetAll() {
  settled.length = 0;
  mockSessionStorage.reset();
  mockLocalStorage.reset();
}

function check(name, condition, details = '') {
  if (!condition) {
    throw new Error(`${name}${details ? `: ${details}` : ''}`);
  }
}

async function withNow(now, fn) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await fn();
  } finally {
    Date.now = originalNow;
  }
}

async function seedActiveSession(base, domain = 'p0.example.com') {
  await sessionApi.saveSession({
    state: 'ACTIVE',
    domain,
    startTime: base,
    lastHeartbeat: base,
  });
  await withNow(base, () => eventApi.appendEvent({
    type: eventApi.EVENT_TYPE.START,
    state: 'ACTIVE',
    domain,
    time: base,
  }));
}

function localDateFromMs(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function liveActiveSeconds(domain, dateMs) {
  const events = await eventApi.getEvents();
  const domains = aggregateApi.computeAllDomains(events, localDateFromMs(dateMs));
  return domains[domain] || 0;
}

async function testOrdinaryPageActive180Settles() {
  resetAll();
  const base = 1778800000000;
  await seedActiveSession(base);
  const result = await withNow(base + 180_000, () =>
    sessionApi.runPeriodicCheckpoint(base + 180_000, { confirmForegroundPage: async () => ({ ok: true }) })
  );
  check('checkpoint should settle', result.checkpointed === true);
  check('one segment settled', settled.length === 1);
  check('settled duration is 180s', settled[0].endMs - settled[0].startMs === 180_000);
  const session = await sessionApi.getSession();
  check('session reopens at checkpoint boundary', session.startTime === base + 180_000);
}

async function testNormalBoundaryCountsInLiveFallback() {
  resetAll();
  const base = 1778800100000;
  await seedActiveSession(base, 'a.example.com');
  await withNow(base + 60_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 60_000, 'stable_tabActivated')
  );
  check('normal boundary creates durable segment', settled.length === 1);
  check('normal boundary duration is 60s', settled[0].endMs - settled[0].startMs === 60_000);
  check('normal boundary appears in live fallback', await liveActiveSeconds('a.example.com', base) === 60);
}

async function testLiveFallbackDoesNotNeedCheckpoint() {
  resetAll();
  const base = 1778800200000;
  await seedActiveSession(base, 'fast.example.com');
  await withNow(base + 45_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'next.example.com', base + 45_000, 'stable_tabUpdated')
  );
  check('live fallback counts boundary under checkpoint window', await liveActiveSeconds('fast.example.com', base) === 45);
  check('stable boundary under checkpoint window creates durable segment', settled.length === 1);
  check('stable boundary durable duration is 45s', settled[0].endMs - settled[0].startMs === 45_000);
}

async function testIdleBeforeCheckpointDropsWindow() {
  resetAll();
  const base = 1778801000000;
  await seedActiveSession(base);
  await withNow(base + 60_000, () => sessionApi.transitionStateAt('IDLE', null, base + 60_000, 'idle_before_checkpoint'));
  check('idle transition settles active foreground at observed boundary', settled.length === 1);
  check('idle transition duration is 60s', settled[0].endMs - settled[0].startMs === 60_000);
  const events = await eventApi.getEvents();
  check('active END is bounded to idle boundary', events.some((event) => event.type === 'END' && event.time === base + 60_000));
  check('idle-before-checkpoint END remains live countable', events.some((event) => event.type === 'END' && event.countable !== false));
  check('idle-before-checkpoint appears in live fallback', await liveActiveSeconds('p0.example.com', base) === 60);
}

async function testMissedIdleEventCountsAtMost180() {
  resetAll();
  const base = 1778802000000;
  await seedActiveSession(base);
  await withNow(base + 12 * 60 * 60_000, () =>
    sessionApi.runPeriodicCheckpoint(base + 12 * 60 * 60_000, { confirmForegroundPage: async () => ({ ok: true }) })
  );
  check('missed idle only settles one checkpoint window', settled.length === 1 && settled[0].endMs - settled[0].startMs === 180_000);
}

async function testMissedTabCloseDropsUnconfirmedLiveFallback() {
  resetAll();
  const base = 1778803000000;
  await seedActiveSession(base);
  const result = await withNow(base + 10 * 60 * 60_000, () => sessionApi.closeCurrentSession('tab_close', { now: base + 10 * 60 * 60_000 }));
  check('tab close closes session', result.closed === true);
  check('tab close settles only bounded foreground tail', settled.length === 1);
  check('tab close bounded duration is 180s', settled[0].endMs - settled[0].startMs === 180_000);
  check('tab close END is bounded to one window', result.closeTime <= base + 180_000);
  check('tab close bounded tail appears in live fallback', await liveActiveSeconds('p0.example.com', base) === 180);
}

async function testRecoveryDoesNotBackfillLongGap() {
  resetAll();
  const base = 1778804000000;
  await seedActiveSession(base);
  const result = await withNow(base + 24 * 60 * 60_000, () => sessionApi.closeCurrentSession('recovery_gap_close', { now: base + 24 * 60 * 60_000 }));
  check('recovery closes session', result.closed === true);
  check('recovery settles only bounded foreground tail', settled.length === 1);
  check('recovery bounded duration is 180s', settled[0].endMs - settled[0].startMs === 180_000);
  check('recovery END is bounded', result.closeTime <= base + 180_000);
}

async function testUnknownDomainCountsAsUnknown() {
  resetAll();
  const ctx = contextApi.buildContext(null, { tabId: 7, windowId: 1, url: null, isFocused: true, isIdle: false });
  const state = stateApi.resolveState(ctx);
  check('unknown URL active tab resolves ACTIVE', state === 'ACTIVE');
  check('unknown URL uses __unknown__ candidate', ctx.candidateDomain === '__unknown__');
}

async function testSpecialPageDoesNotCount() {
  resetAll();
  const ctx = contextApi.buildContext(null, { tabId: 8, windowId: 1, url: 'chrome://extensions', isFocused: true, isIdle: false });
  const state = stateApi.resolveState(ctx);
  check('special page is not ACTIVE', state !== 'ACTIVE');
  check('special page candidate none', ctx.candidateKind === 'none');
}

async function testUiFlushDoesNotSettleForeground() {
  resetAll();
  const base = 1778805000000;
  await seedActiveSession(base);
  const result = await withNow(base + 120_000, () => sessionApi.flushOpenSessionToStats('ui_flush'));
  check('ui flush returns ok', result.ok === true);
  check('ui flush does not settle active foreground', settled.length === 0);
  check('ui flush reports checkpoint required', result.reason === 'foreground_checkpoint_required');
}

async function testRepeatedUiReadsDoNotCreateDurableSegments() {
  resetAll();
  const base = 1778805500000;
  await seedActiveSession(base);
  const first = await withNow(base + 60_000, () => sessionApi.flushOpenSessionToStats('ui_flush'));
  const second = await withNow(base + 90_000, () => sessionApi.flushOpenSessionToStats('ui_flush'));
  check('first ui read returns without foreground settlement', first.reason === 'foreground_checkpoint_required');
  check('second ui read returns without foreground settlement', second.reason === 'foreground_checkpoint_required');
  check('repeated ui reads do not create durable foreground segments', settled.length === 0);
}

async function testCheckpointConfirmationFailureDropsWindow() {
  resetAll();
  const base = 1778806000000;
  await seedActiveSession(base);
  const result = await withNow(base + 180_000, () =>
    sessionApi.runPeriodicCheckpoint(base + 180_000, { confirmForegroundPage: async () => ({ ok: false, reason: 'idle_not_active' }) })
  );
  check('failed confirmation drops checkpoint', result.dropped === true);
  check('failed confirmation does not settle', settled.length === 0);
  const session = await sessionApi.getSession();
  check('failed confirmation clears session', session.state === null);
  check('failed checkpoint does not appear in live fallback', await liveActiveSeconds('p0.example.com', base) === 0);
}

async function testShortBoundaryDropDoesNotAppearInLiveFallback() {
  resetAll();
  const base = 1778806500000;
  await seedActiveSession(base, 'a.example.com');
  await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt(null, null, base + 10_000, 'short_boundary_drop_close')
  );
  await withNow(base + 12_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'a.example.com', base + 12_000, 'short_boundary_drop_reopen')
  );
  check('short boundary drop does not settle durable segment', settled.length === 0);
  check('short boundary drop does not appear in live fallback', await liveActiveSeconds('a.example.com', base) === 0);
}

async function applySimulatedActions(actions) {
  for (const action of actions) {
    await withNow(action.at, () =>
      sessionApi.transitionStateAt(action.state, action.domain, action.at, action.reason || 'stable_test_boundary')
    );
  }
}

function simulateBoundaries(steps, initialApplied = { state: null, domain: null }) {
  const stabilizationMs = 1000;
  let applied = { ...initialApplied };
  let pending = null;
  const actions = [];
  const same = (a, b) => (a?.state ?? null) === (b?.state ?? null) && (a?.domain ?? null) === (b?.domain ?? null);
  const apply = (target, at, reason = 'stable_test_boundary') => {
    actions.push({ state: target.state, domain: target.domain, at, reason });
    applied = { ...target };
    pending = null;
  };
  for (const step of steps) {
    const target = { state: step.state, domain: step.domain || null };
    if (pending && step.at - pending.at >= stabilizationMs) {
      apply(pending.target, pending.at, `stable_${pending.reason || 'test_boundary'}`);
    }
    if (same(target, applied)) {
      if (pending && !same(pending.target, target)) {
        pending = null;
      }
      continue;
    }
    if (pending && same(pending.target, target)) continue;
    pending = { target, at: step.at, reason: step.reason };
  }
  return actions;
}

async function testShortBoundaryJitterDoesNotCloseOrReopen() {
  resetAll();
  const base = 1778807000000;
  await seedActiveSession(base, 'a.example.com');
  const actions = simulateBoundaries([
    { state: null, domain: null, at: base + 10_000, reason: 'windowFocusPolled' },
    { state: 'ACTIVE', domain: 'a.example.com', at: base + 10_500, reason: 'windowFocusPolled' },
  ], { state: 'ACTIVE', domain: 'a.example.com' });
  check('short A->none->A jitter produces no applied boundary', actions.length === 0, JSON.stringify(actions));
  await applySimulatedActions(actions);
  const session = await sessionApi.getSession();
  const events = await eventApi.getEvents();
  check('short jitter keeps session startTime unchanged', session.startTime === base);
  check('short jitter writes no ACTIVE END', !events.some((event) => event.type === 'END' && event.state === 'ACTIVE'));
}

async function testRepeatedTransientFocusNoiseDoesNotBlockCheckpoint() {
  resetAll();
  const base = 1778807500000;
  await seedActiveSession(base, 'a.example.com');
  const steps = [];
  for (let t = 30_000; t <= 180_000; t += 30_000) {
    steps.push({ state: null, domain: null, at: base + t, reason: 'windowFocusPolled' });
    steps.push({ state: 'ACTIVE', domain: 'a.example.com', at: base + t + 500, reason: 'windowFocusPolled' });
  }
  const actions = simulateBoundaries(steps, { state: 'ACTIVE', domain: 'a.example.com' });
  check('repeated transient focus noise produces no applied boundary', actions.length === 0, JSON.stringify(actions));
  await applySimulatedActions(actions);
  const beforeCheckpoint = await sessionApi.getSession();
  check('transient noise keeps original checkpoint anchor', beforeCheckpoint.startTime === base);
  const checkpoint = await withNow(base + 190_000, () =>
    sessionApi.runPeriodicCheckpoint(base + 190_000, { confirmForegroundPage: async () => ({ ok: true }) })
  );
  check('checkpoint still succeeds after repeated transient noise', checkpoint.checkpointed === true, JSON.stringify(checkpoint));
  check('checkpoint writes one durable segment', settled.length === 1);
}

async function testShortDomainSwitchJitterDoesNotCloseOrReopen() {
  resetAll();
  const base = 1778807750000;
  await seedActiveSession(base, 'a.example.com');
  const actions = simulateBoundaries([
    { state: 'ACTIVE', domain: 'b.example.com', at: base + 10_000, reason: 'tabActivated' },
    { state: 'ACTIVE', domain: 'a.example.com', at: base + 10_500, reason: 'tabActivated' },
  ], { state: 'ACTIVE', domain: 'a.example.com' });
  check('short A->B->A jitter produces no applied boundary', actions.length === 0, JSON.stringify(actions));
  await applySimulatedActions(actions);
  const session = await sessionApi.getSession();
  const events = await eventApi.getEvents();
  check('short domain jitter keeps session startTime unchanged', session.domain === 'a.example.com' && session.startTime === base);
  check('short domain jitter writes no ACTIVE END', !events.some((event) => event.type === 'END' && event.state === 'ACTIVE'));
}

async function testStableUnfocusClosesUnconfirmedForeground() {
  resetAll();
  const base = 1778808000000;
  await seedActiveSession(base, 'a.example.com');
  const actions = simulateBoundaries([
    { state: null, domain: null, at: base + 10_000, reason: 'windowFocusPolled' },
    { state: null, domain: null, at: base + 16_000, reason: 'windowFocusPolled' },
  ], { state: 'ACTIVE', domain: 'a.example.com' });
  check('stable unfocus applies null boundary at original timestamp', actions.some((a) => a.state === null && a.at === base + 10_000));
  await applySimulatedActions(actions);
  const session = await sessionApi.getSession();
  check('stable unfocus closes foreground session', session.state === null);
  check('stable unfocus creates durable segment', settled.length === 1);
  check('stable unfocus durable duration is 10s', settled[0].endMs - settled[0].startMs === 10_000);
  check('stable unfocus appears in live fallback', await liveActiveSeconds('a.example.com', base) === 10);
}

async function testStableBoundaryAppliesAtOriginalSwitchTime() {
  resetAll();
  const base = 1778808500000;
  await seedActiveSession(base, 'a.example.com');
  const actions = simulateBoundaries([
    { state: 'ACTIVE', domain: 'b.example.com', at: base + 10_000, reason: 'tabActivated' },
    { state: 'ACTIVE', domain: 'b.example.com', at: base + 11_000, reason: 'tabActivated' },
  ], { state: 'ACTIVE', domain: 'a.example.com' });
  check('stable B applies at switch timestamp', actions.some((a) => a.state === 'ACTIVE' && a.domain === 'b.example.com' && a.at === base + 10_000));
  await applySimulatedActions(actions);
  const session = await sessionApi.getSession();
  check('stable B session starts at original switch timestamp', session.domain === 'b.example.com' && session.startTime === base + 10_000);
  check('stable A->B creates durable segment', settled.length === 1);
  check('stable A->B durable duration is 10s', settled[0].endMs - settled[0].startMs === 10_000);
  check('stable A->B normal boundary appears in live fallback', await liveActiveSeconds('a.example.com', base) === 10);
}

async function testCheckpointThenBoundaryDoesNotDoubleCountCheckpointWindow() {
  resetAll();
  const base = 1778808750000;
  await seedActiveSession(base, 'a.example.com');
  const checkpoint = await withNow(base + 180_000, () =>
    sessionApi.runPeriodicCheckpoint(base + 180_000, { confirmForegroundPage: async () => ({ ok: true }) })
  );
  check('checkpoint succeeds before boundary', checkpoint.checkpointed === true);
  await withNow(base + 210_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 210_000, 'stable_tabActivated')
  );
  check('checkpoint plus boundary creates two durable segments', settled.length === 2);
  check('first segment is 180s checkpoint', settled[0].endMs - settled[0].startMs === 180_000);
  check('second segment is 30s tail after checkpoint', settled[1].endMs - settled[1].startMs === 30_000);
}

async function testIdleAndLockedBlockForegroundActive() {
  resetAll();
  const activeContext = contextApi.buildContext(null, {
    tabId: 9,
    windowId: 1,
    url: 'https://idle.example.com/',
    domain: 'idle.example.com',
    isFocused: true,
    idleState: 'active',
    isIdle: false,
  });
  check('idleState active allows foreground ACTIVE', stateApi.resolveState(activeContext) === 'ACTIVE');

  const idleContext = contextApi.buildContext(activeContext, { idleState: 'idle', isIdle: true });
  check('idle blocks foreground ACTIVE', stateApi.resolveState(idleContext) === 'IDLE');

  const lockedContext = contextApi.buildContext(activeContext, { idleState: 'locked', isIdle: true });
  check('locked blocks foreground ACTIVE', stateApi.resolveState(lockedContext) === 'IDLE');
}

async function run() {
  const tests = [
    testOrdinaryPageActive180Settles,
    testNormalBoundaryCountsInLiveFallback,
    testLiveFallbackDoesNotNeedCheckpoint,
    testIdleBeforeCheckpointDropsWindow,
    testMissedIdleEventCountsAtMost180,
    testMissedTabCloseDropsUnconfirmedLiveFallback,
    testRecoveryDoesNotBackfillLongGap,
    testUnknownDomainCountsAsUnknown,
    testSpecialPageDoesNotCount,
    testUiFlushDoesNotSettleForeground,
    testRepeatedUiReadsDoNotCreateDurableSegments,
    testCheckpointConfirmationFailureDropsWindow,
    testShortBoundaryDropDoesNotAppearInLiveFallback,
    testShortBoundaryJitterDoesNotCloseOrReopen,
    testRepeatedTransientFocusNoiseDoesNotBlockCheckpoint,
    testShortDomainSwitchJitterDoesNotCloseOrReopen,
    testStableUnfocusClosesUnconfirmedForeground,
    testStableBoundaryAppliesAtOriginalSwitchTime,
    testCheckpointThenBoundaryDoesNotDoubleCountCheckpointWindow,
    testIdleAndLockedBlockForegroundActive,
  ];
  let passed = 0;
  for (const test of tests) {
    await test();
    passed++;
  }
  console.log(`[Foreground Page P0] ${passed}/${tests.length} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
