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
  await eventApi.appendEvent({
    type: eventApi.EVENT_TYPE.START,
    state: 'ACTIVE',
    domain,
    time: base,
  });
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
  check('normal boundary does not create durable segment', settled.length === 0);
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
  check('durable segments remain checkpoint-only', settled.length === 0);
}

async function testIdleBeforeCheckpointDropsWindow() {
  resetAll();
  const base = 1778801000000;
  await seedActiveSession(base);
  await withNow(base + 60_000, () => sessionApi.transitionStateAt('IDLE', null, base + 60_000, 'idle_before_checkpoint'));
  check('idle transition does not settle active foreground', settled.length === 0);
  const events = await eventApi.getEvents();
  check('active END is bounded to idle boundary', events.some((event) => event.type === 'END' && event.time === base + 60_000));
  check('idle-before-checkpoint END is not live countable', events.some((event) => event.type === 'END' && event.countable === false));
  check('idle-before-checkpoint does not appear in live fallback', await liveActiveSeconds('p0.example.com', base) === 0);
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
  check('tab close does not settle active foreground', settled.length === 0);
  check('tab close END is bounded to one window', result.closeTime <= base + 180_000);
  check('tab close stale drop does not appear in live fallback', await liveActiveSeconds('p0.example.com', base) === 0);
}

async function testRecoveryDoesNotBackfillLongGap() {
  resetAll();
  const base = 1778804000000;
  await seedActiveSession(base);
  const result = await withNow(base + 24 * 60 * 60_000, () => sessionApi.closeCurrentSession('recovery_gap_close', { now: base + 24 * 60 * 60_000 }));
  check('recovery closes session', result.closed === true);
  check('recovery does not settle active foreground', settled.length === 0);
  check('recovery END is bounded', result.closeTime <= base + 180_000);
  check('recovery stale drop does not appear in live fallback', await liveActiveSeconds('p0.example.com', base) === 0);
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

function simulateBoundaries(steps) {
  const stabilizationMs = 5000;
  let applied = { state: null, domain: null };
  let pending = null;
  const actions = [];
  const same = (a, b) => (a?.state ?? null) === (b?.state ?? null) && (a?.domain ?? null) === (b?.domain ?? null);
  const apply = (target, at) => {
    actions.push({ state: target.state, domain: target.domain, at });
    applied = { ...target };
    pending = null;
  };
  for (const step of steps) {
    const target = { state: step.state, domain: step.domain || null };
    if (pending && step.at - pending.at >= stabilizationMs) {
      apply(pending.target, pending.at);
    }
    if (same(target, applied)) {
      if (pending && !same(pending.target, target)) {
        const previous = { ...applied };
        actions.push({ state: null, domain: null, at: pending.at });
        actions.push({ state: previous.state, domain: previous.domain, at: step.at });
        pending = null;
      }
      continue;
    }
    if (pending && same(pending.target, target)) continue;
    pending = { target, at: step.at };
  }
  return actions;
}

async function testShortBoundaryDrop() {
  const actions = simulateBoundaries([
    { state: 'ACTIVE', domain: 'a.example.com', at: 0 },
    { state: 'ACTIVE', domain: 'b.example.com', at: 10_000 },
    { state: 'ACTIVE', domain: 'a.example.com', at: 12_000 },
  ]);
  check('A applies at original timestamp', actions.some((a) => a.state === 'ACTIVE' && a.domain === 'a.example.com' && a.at === 0));
  check('B under 5s does not apply', !actions.some((a) => a.state === 'ACTIVE' && a.domain === 'b.example.com'));
  check('A closes at switch-out timestamp', actions.some((a) => a.state === null && a.at === 10_000));
  check('A reopens at switch-back timestamp', actions.some((a) => a.state === 'ACTIVE' && a.domain === 'a.example.com' && a.at === 12_000));
}

async function testStableBoundaryAppliesAtOriginalSwitchTime() {
  const actions = simulateBoundaries([
    { state: 'ACTIVE', domain: 'a.example.com', at: 0 },
    { state: 'ACTIVE', domain: 'b.example.com', at: 10_000 },
    { state: 'ACTIVE', domain: 'b.example.com', at: 16_000 },
  ]);
  check('stable B applies at switch timestamp', actions.some((a) => a.state === 'ACTIVE' && a.domain === 'b.example.com' && a.at === 10_000));
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
    testShortBoundaryDrop,
    testStableBoundaryAppliesAtOriginalSwitchTime,
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
