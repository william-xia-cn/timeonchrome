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
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
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

async function seedActiveSession(base, domain = 'p0.example.com', metadata = {}) {
  await sessionApi.saveSession({
    state: 'ACTIVE',
    domain,
    startTime: base,
    lastHeartbeat: base,
    ...metadata,
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
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 60_000, 'tabActivated')
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
    sessionApi.transitionStateAt('ACTIVE', 'next.example.com', base + 45_000, 'tabUpdated')
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

async function testCheckpointRepairsMissingForegroundSessionFromActiveTab() {
  resetAll();
  const now = 1778802500000;
  const result = await withNow(now, () =>
    sessionApi.runPeriodicCheckpoint(now, {
      confirmForegroundPage: async () => ({
        ok: true,
        observedDomain: 'repair.example.com',
        observedUrl: 'https://repair.example.com/course',
        observedState: 'ACTIVE',
        tabId: 70,
        windowId: 7,
        idleState: 'active',
      }),
    })
  );
  const session = await sessionApi.getSession();
  check('missing session repair opens checkpoint session', result.opened === true && result.sessionOpened === true);
  check('missing session repair verifies readback', result.readBackVerified === true);
  check('repair session domain persisted', session.domain === 'repair.example.com');
  check('repair session tab metadata persisted', session.tabId === 70 && session.windowId === 7);
  check('repair session uses estimated open anchor', session.startTime === now - 90_000);
}

async function testCheckpointMissingForegroundSessionReportsExplicitFailure() {
  resetAll();
  const now = 1778802600000;
  const result = await withNow(now, () =>
    sessionApi.runPeriodicCheckpoint(now, {
      confirmForegroundPage: async () => ({
        ok: false,
        reason: 'window_unfocused',
        idleState: 'active',
      }),
    })
  );
  const session = await sessionApi.getSession();
  check('missing session repair returns no_open_session reason', result.reason === 'no_open_session');
  check('missing session repair returns explicit failure reason', result.failureReason === 'window_unfocused');
  check('failed repair does not create session', !session?.state && !session?.startTime);
}

async function testMissedTabCloseDropsUnconfirmedLiveFallback() {
  resetAll();
  const base = 1778803000000;
  await seedActiveSession(base);
  const result = await withNow(base + 10 * 60 * 60_000, () => sessionApi.closeCurrentSession('tab_close', { now: base + 10 * 60 * 60_000 }));
  check('tab close closes session', result.closed === true);
  check('tab close settles only bounded foreground tail', settled.length === 1);
  check('tab close bounded duration is 180s', settled[0].endMs - settled[0].startMs === 180_000);
  check('tab close description end reason', settled[0].description.end.reason === 'tab_close');
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
  check('recovery description end reason', settled[0].description.end.reason === 'recovery_gap_close');
  check('recovery END is bounded', result.closeTime <= base + 180_000);
}

async function testUnknownDomainCountsAsUnknown() {
  resetAll();
  const ctx = contextApi.buildContext(null, { tabId: 7, windowId: 1, url: null, isFocused: true, isIdle: false });
  const state = stateApi.resolveState(ctx);
  check('unknown URL active tab resolves ACTIVE', state === 'ACTIVE');
  check('unknown URL uses safe pseudo domain', ctx.domain === 'unknown-page.chrome-local');
}

async function testDuplicateSameTabSameDomainOpenIsNoop() {
  resetAll();
  const base = 1778800150000;
  await seedActiveSession(base, 'same.example.com', { tabId: 7, windowId: 1 });
  const result = await withNow(base + 1000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'same.example.com', base + 1000, 'tabUpdated', { tabId: 7, windowId: 1 })
  );
  const session = await sessionApi.getSession();
  const events = await eventApi.getEvents();
  check('duplicate same-tab same-domain open is skipped', result?.skipped === true && result.reason === 'duplicate_foreground_open');
  check('duplicate same-tab same-domain writes no segment', settled.length === 0);
  check('duplicate same-tab same-domain writes no transition event', events.filter((event) => event.time > base).length === 0);
  check('duplicate same-tab same-domain keeps original session anchor', session.state === 'ACTIVE' && session.domain === 'same.example.com' && session.startTime === base);
}

async function testSameDomainDifferentTabOpenStillCutsBoundary() {
  resetAll();
  const base = 1778800155000;
  await seedActiveSession(base, 'same.example.com', { tabId: 7, windowId: 1 });
  const result = await withNow(base, () =>
    sessionApi.transitionStateAt('ACTIVE', 'same.example.com', base, 'tabActivated', { tabId: 8, windowId: 1 })
  );
  check('same-domain different-tab open is not skipped', result?.skipped !== true);
  check('same-domain different-tab open writes boundary segment', settled.length === 1);
  check('same-domain different-tab segment is zero ms', settled[0].endMs === settled[0].startMs);
  check('same-domain different-tab keeps transition settlement reason', settled[0].settlementReason === 'transition_complete');
  const session = await sessionApi.getSession();
  check('same-domain different-tab reopens with new tab metadata', session.state === 'ACTIVE' && session.domain === 'same.example.com' && session.tabId === 8);
}

async function testCloseWithoutOpenWritesZeroDiagnosticSegment() {
  resetAll();
  const base = 1778800160000;
  const result = await withNow(base, () =>
    sessionApi.closeCurrentSession('tab_close', { now: base, observedDomain: 'observed-close.example.com' })
  );
  check('close without open returns diagnostic', result.closed === false && result.reason === 'event_close_without_open');
  check('close without open writes one diagnostic segment', settled.length === 1);
  check('close without open diagnostic domain', settled[0].domain === 'observed-close.example.com');
  check('close without open diagnostic reason', settled[0].settlementReason === 'event_close_without_open');
  check('close without open diagnostic is zero ms', settled[0].startMs === base && settled[0].endMs === base);
  check('close without open allows zero duration', settled[0].allowZeroDurationSegment === true);
}

async function testCloseDomainMismatchWritesOldAndObservedSegments() {
  resetAll();
  const base = 1778800170000;
  await seedActiveSession(base, 'old-close.example.com');
  const result = await withNow(base, () =>
    sessionApi.closeCurrentSession('tab_close', { now: base, observedDomain: 'new-close.example.com' })
  );
  check('close mismatch returns mismatch flag', result.closed === true && result.domainMismatch === true);
  check('close mismatch writes old and observed segments', settled.length === 2);
  check('close mismatch old segment domain', settled[0].domain === 'old-close.example.com');
  check('close mismatch old segment reason', settled[0].settlementReason === 'event_close_domain_mismatch_close');
  check('close mismatch old segment zero ms', settled[0].startMs === base && settled[0].endMs === base);
  check('close mismatch observed segment domain', settled[1].domain === 'new-close.example.com');
  check('close mismatch observed segment reason', settled[1].settlementReason === 'event_close_domain_mismatch_observed');
  check('close mismatch observed segment zero ms', settled[1].startMs === base && settled[1].endMs === base);
}

async function testActiveUnknownSettlementCanRecoverSameTabDomain() {
  resetAll();
  const base = 1778804300000;
  await seedActiveSession(base, '__unknown__', { tabId: 7, windowId: 1 });
  await withNow(base + 60_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'next.example.com', base + 60_000, 'tabActivated', {
      resolveUnknownDomainForSettlement: async (session) => {
        check('resolver receives unknown session tabId', session.tabId === 7);
        check('resolver receives unknown session windowId', session.windowId === 1);
        return { ok: true, domain: 'www.baidu.com', reason: 'unknown_recovered_at_settlement:tabs_get' };
      },
      tabId: 8,
      windowId: 1,
      domainResolutionReason: 'known_domain',
    })
  );
  check('unknown settlement is recovered to baidu', settled.length === 1 && settled[0].domain === 'www.baidu.com');
  const session = await sessionApi.getSession();
  check('new session preserves next domain', session.domain === 'next.example.com');
  check('new session stores tab metadata', session.tabId === 8 && session.windowId === 1);
}

async function testActiveUnknownSettlementKeepsUnknownOnMismatch() {
  resetAll();
  const base = 1778804400000;
  await seedActiveSession(base, '__unknown__', { tabId: 7, windowId: 1 });
  await withNow(base + 60_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'next.example.com', base + 60_000, 'tabActivated', {
      resolveUnknownDomainForSettlement: async () => ({ ok: false, reason: 'tab_mismatch' }),
      tabId: 8,
      windowId: 1,
      domainResolutionReason: 'known_domain',
    })
  );
  check('unknown settlement remains visible on mismatch', settled.length === 1 && settled[0].domain === '__unknown__');
}

async function testIdleInactiveCloseSettlesActiveSession() {
  resetAll();
  const base = 1778804500000;
  await seedActiveSession(base, 'www.baidu.com', { tabId: 7, windowId: 1 });
  await withNow(base + 90_000, () =>
    sessionApi.transitionStateAt('IDLE', null, base + 90_000, 'idle_inactive_close', {
      tabId: 7,
      windowId: 1,
    })
  );
  check('idle inactive close settles active segment', settled.length === 1);
  check('idle inactive close uses explicit settlement reason', settled[0]?.settlementReason === 'idle_inactive_close');
  check('idle inactive close description end reason', settled[0]?.description?.end?.reason === 'idle_inactive_close');
  check('idle inactive close preserves active domain', settled[0]?.domain === 'www.baidu.com');
  const session = await sessionApi.getSession();
  check('idle inactive close opens idle session', session.state === 'IDLE' && session.domain === null);
}

async function testIdleActiveReopenStartsNewActiveSession() {
  resetAll();
  const base = 1778804600000;
  await sessionApi.saveSession({
    state: 'IDLE',
    domain: null,
    startTime: base,
    lastHeartbeat: base,
  });
  await withNow(base + 5_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'www.baidu.com', base + 5_000, 'idle_active_reopen', {
      tabId: 7,
      windowId: 1,
      domainResolutionReason: 'idle_active_reopen_lookup',
    })
  );
  check('idle active reopen does not settle idle session', settled.length === 0);
  const session = await sessionApi.getSession();
  check('idle active reopen opens active session', session.state === 'ACTIVE' && session.domain === 'www.baidu.com');
  check('idle active reopen stores attribution context', session.tabId === 7 && session.windowId === 1);
}

async function testSpecialPageCountsAsForeground() {
  resetAll();
  const ctx = contextApi.buildContext(null, { tabId: 8, windowId: 1, url: 'chrome://extensions', isFocused: true, isIdle: false });
  const state = stateApi.resolveState(ctx);
  check('special page resolves ACTIVE', state === 'ACTIVE');
  check('special page maps to safe pseudo domain', ctx.domain === 'chrome-extensions.chrome-local');
}

async function testSpecialPagesCreateContinuousForegroundSegments() {
  resetAll();
  const base = 1778805050000;
  await seedActiveSession(base, 'example.com', {
    startReason: 'tabActivated',
    startOperationSource: 'chrome_event',
    startAtMs: base,
  });
  await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'extension-page.chrome-local', base + 10_000, 'tabUpdated')
  );
  await withNow(base + 25_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'local-file.chrome-local', base + 25_000, 'tabUpdated')
  );
  await withNow(base + 40_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'example.com', base + 40_000, 'tabActivated')
  );
  check('special page transitions create three closed segments', settled.length === 3);
  check('web segment closes at extension open', settled[0].domain === 'example.com' && settled[0].startMs === base && settled[0].endMs === base + 10_000);
  check('extension segment is counted', settled[1].domain === 'extension-page.chrome-local' && settled[1].startMs === base + 10_000 && settled[1].endMs === base + 25_000);
  check('local file segment is counted', settled[2].domain === 'local-file.chrome-local' && settled[2].startMs === base + 25_000 && settled[2].endMs === base + 40_000);
  check('special page transitions have no timeline gap', settled[0].endMs === settled[1].startMs && settled[1].endMs === settled[2].startMs);
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
  check('failed confirmation estimates close', result.repaired === true && result.reason === 'checkpoint_estimated_close');
  check('failed confirmation settles half checkpoint', settled.length === 1 && settled[0].settlementReason === 'checkpoint_estimated_close');
  check('estimated close is capped to half checkpoint', settled[0].endMs - settled[0].startMs === 90_000);
  const session = await sessionApi.getSession();
  check('failed confirmation clears session', session.state === null);
  check('failed checkpoint appears as estimated fallback only', await liveActiveSeconds('p0.example.com', base) === 90);
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

async function testShortFocusBoundarySettlesImmediately() {
  resetAll();
  const base = 1778807000000;
  await seedActiveSession(base, 'a.example.com');
  await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt(null, null, base + 10_000, 'windowFocusLost')
  );
  await withNow(base + 10_500, () =>
    sessionApi.transitionStateAt('ACTIVE', 'a.example.com', base + 10_500, 'windowFocusChanged')
  );
  const session = await sessionApi.getSession();
  const events = await eventApi.getEvents();
  check('short focus boundary reopens at observed time', session.state === 'ACTIVE' && session.startTime === base + 10_500);
  check('short focus boundary writes ACTIVE END', events.some((event) => event.type === 'END' && event.state === 'ACTIVE'));
  check('short focus boundary creates durable segment', settled.length === 1);
  check('short focus segment duration is exact first window', settled[0].endMs - settled[0].startMs === 10_000);
}

async function testRepeatedTransientFocusNoiseCreatesCompleteSegments() {
  resetAll();
  const base = 1778807500000;
  await seedActiveSession(base, 'a.example.com');
  for (let t = 30_000; t <= 180_000; t += 30_000) {
    await withNow(base + t, () =>
      sessionApi.transitionStateAt(null, null, base + t, 'windowFocusLost')
    );
    await withNow(base + t + 500, () =>
      sessionApi.transitionStateAt('ACTIVE', 'a.example.com', base + t + 500, 'windowFocusChanged')
    );
  }
  const session = await sessionApi.getSession();
  check('transient focus noise keeps latest reopen as anchor', session.startTime === base + 180_500);
  check('transient focus noise writes every closed foreground window', settled.length === 6, JSON.stringify(settled));
  check('first transient focus segment is 30s', settled[0].endMs - settled[0].startMs === 30_000);
  check('later transient focus segment keeps exact 500ms gap', settled[1].endMs - settled[1].startMs === 29_500);
}

async function testShortDomainSwitchSettlesImmediately() {
  resetAll();
  const base = 1778807750000;
  await seedActiveSession(base, 'a.example.com');
  await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 10_000, 'tabActivated')
  );
  await withNow(base + 10_500, () =>
    sessionApi.transitionStateAt('ACTIVE', 'a.example.com', base + 10_500, 'tabActivated')
  );
  const session = await sessionApi.getSession();
  const events = await eventApi.getEvents();
  check('short domain switch reopens latest domain immediately', session.domain === 'a.example.com' && session.startTime === base + 10_500);
  check('short domain switch writes ACTIVE END events', events.filter((event) => event.type === 'END' && event.state === 'ACTIVE').length >= 2);
  check('short domain switch creates old and intermediate segments', settled.length === 2);
  check('intermediate short segment preserves exact ms span', settled[1].endMs - settled[1].startMs === 500);
}

async function testUnfocusClosesForegroundImmediately() {
  resetAll();
  const base = 1778808000000;
  await seedActiveSession(base, 'a.example.com');
  await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt(null, null, base + 10_000, 'windowFocusLost')
  );
  const session = await sessionApi.getSession();
  check('unfocus closes foreground session immediately', session.state === null);
  check('unfocus creates durable segment', settled.length === 1);
  check('unfocus durable duration is 10s', settled[0].endMs - settled[0].startMs === 10_000);
  check('unfocus appears in live fallback', await liveActiveSeconds('a.example.com', base) === 10);
}

async function testWindowFocusPolledCannotWriteForegroundLedger() {
  resetAll();
  const base = 1778808250000;
  await seedActiveSession(base, 'a.example.com');
  const closeResult = await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt(null, null, base + 10_000, 'windowFocusPolled')
  );
  const openResult = await withNow(base + 11_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 11_000, 'windowFocusPolled')
  );
  const session = await sessionApi.getSession();
  const events = await eventApi.getEvents();
  check('windowFocusPolled close is skipped', closeResult?.skipped === true && closeResult.reason === 'disabled_timing_reason');
  check('windowFocusPolled open is skipped', openResult?.skipped === true && openResult.reason === 'disabled_timing_reason');
  check('windowFocusPolled does not change open session', session.domain === 'a.example.com' && session.startTime === base);
  check('windowFocusPolled writes no transition events', events.filter((event) => event.time > base).length === 0);
  check('windowFocusPolled writes no segments', settled.length === 0);
}

async function testDomainBoundaryAppliesImmediately() {
  resetAll();
  const base = 1778808500000;
  await seedActiveSession(base, 'a.example.com');
  await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 10_000, 'tabActivated')
  );
  const session = await sessionApi.getSession();
  check('domain boundary session starts at switch timestamp', session.domain === 'b.example.com' && session.startTime === base + 10_000);
  check('domain boundary session records start reason', session.startReason === 'tabActivated');
  check('domain boundary creates durable segment', settled.length === 1);
  check('domain boundary durable duration is 10s', settled[0].endMs - settled[0].startMs === 10_000);
  check('domain boundary description end reason is original source event', settled[0].description.end.reason === 'tabActivated');
  check('domain boundary settlement reason remains transition_complete', settled[0].settlementReason === 'transition_complete');
  check('domain boundary normal boundary appears in live fallback', await liveActiveSeconds('a.example.com', base) === 10);
}

async function testMediaReasonCannotDriveForegroundTransition() {
  resetAll();
  const base = 1778808600000;
  await seedActiveSession(base, 'a.example.com');
  const result = await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 10_000, 'tabAudible')
  );
  const session = await sessionApi.getSession();
  check('tabAudible transition is skipped', result?.skipped === true);
  check('tabAudible does not change foreground session', session.domain === 'a.example.com' && session.startTime === base);
  check('tabAudible does not create usage segment', settled.length === 0);
}

async function testLegacyMediaStartReasonIsSanitizedOnSettlement() {
  resetAll();
  const base = 1778808650000;
  await seedActiveSession(base, 'legacy.example.com', {
    startReason: 'tabAudible',
    startOperationSource: 'chrome_event',
    startAtMs: base,
  });
  await withNow(base + 10_000, () =>
    sessionApi.transitionStateAt('ACTIVE', 'next.example.com', base + 10_000, 'tabActivated')
  );
  check('legacy media-start session still settles', settled.length === 1);
  check('legacy media-start reason is sanitized', settled[0].description.start.reason === 'unknown_start', JSON.stringify(settled[0].description));
  check('legacy media-start does not expose tabAudible', settled[0].description.summary.includes('tabAudible') === false, JSON.stringify(settled[0].description));
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
    sessionApi.transitionStateAt('ACTIVE', 'b.example.com', base + 210_000, 'tabActivated')
  );
  check('checkpoint plus boundary creates two durable segments', settled.length === 2);
  check('first segment is 180s checkpoint', settled[0].endMs - settled[0].startMs === 180_000);
  check('second segment is 30s tail after checkpoint', settled[1].endMs - settled[1].startMs === 30_000);
}

async function testCheckpointReopenPreservesTabMetadata() {
  resetAll();
  const base = 1778808900000;
  await seedActiveSession(base, 'a.example.com', { tabId: 42, windowId: 7 });
  const checkpoint = await withNow(base + 180_000, () =>
    sessionApi.runPeriodicCheckpoint(base + 180_000, {
      confirmForegroundPage: async () => ({ ok: true, observedDomain: 'a.example.com', observedState: 'ACTIVE', tabId: 42, windowId: 7 }),
    })
  );
  const session = await sessionApi.getSession();
  check('checkpoint succeeds', checkpoint.checkpointed === true, JSON.stringify(checkpoint));
  check('checkpoint reopen keeps tabId', session.tabId === 42, JSON.stringify(session));
  check('checkpoint reopen keeps windowId', session.windowId === 7, JSON.stringify(session));
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

async function testForegroundMediaLegacyCompensationIsStillPresent() {
  resetAll();
  const baseContext = contextApi.buildContext(null, {
    tabId: 10,
    windowId: 2,
    url: 'https://media.example.com/watch',
    domain: 'media.example.com',
    isFocused: true,
    idleState: 'active',
    isIdle: false,
  });

  const focusLossWithMedia = {
    ...baseContext,
    isFocused: false,
    foregroundMediaActive: true,
    isAudible: true,
    mediaKind: 'video',
    mediaSourceTabId: 10,
    mediaSourceDomain: 'media.example.com',
    windowState: 'normal',
  };
  check('legacy foreground media keeps unfocused Chrome tab ACTIVE', stateApi.resolveState(focusLossWithMedia) === 'ACTIVE');

  const idleWithMedia = {
    ...focusLossWithMedia,
    idleState: 'idle',
    isIdle: true,
  };
  check('legacy foreground media keeps idle Chrome tab ACTIVE', stateApi.resolveState(idleWithMedia) === 'ACTIVE');

  const lockedWithMedia = {
    ...focusLossWithMedia,
    idleState: 'locked',
    isIdle: true,
  };
  check('locked with media is not ordinary foreground ACTIVE', stateApi.resolveState(lockedWithMedia) !== 'ACTIVE');
}

async function run() {
  const tests = [
    testOrdinaryPageActive180Settles,
    testNormalBoundaryCountsInLiveFallback,
    testDuplicateSameTabSameDomainOpenIsNoop,
    testSameDomainDifferentTabOpenStillCutsBoundary,
    testCloseWithoutOpenWritesZeroDiagnosticSegment,
    testCloseDomainMismatchWritesOldAndObservedSegments,
    testLiveFallbackDoesNotNeedCheckpoint,
    testIdleBeforeCheckpointDropsWindow,
    testMissedIdleEventCountsAtMost180,
    testCheckpointRepairsMissingForegroundSessionFromActiveTab,
    testCheckpointMissingForegroundSessionReportsExplicitFailure,
    testMissedTabCloseDropsUnconfirmedLiveFallback,
    testRecoveryDoesNotBackfillLongGap,
    testUnknownDomainCountsAsUnknown,
    testActiveUnknownSettlementCanRecoverSameTabDomain,
    testActiveUnknownSettlementKeepsUnknownOnMismatch,
    testIdleInactiveCloseSettlesActiveSession,
    testIdleActiveReopenStartsNewActiveSession,
    testSpecialPageCountsAsForeground,
    testSpecialPagesCreateContinuousForegroundSegments,
    testUiFlushDoesNotSettleForeground,
    testRepeatedUiReadsDoNotCreateDurableSegments,
    testCheckpointConfirmationFailureDropsWindow,
    testShortBoundaryDropDoesNotAppearInLiveFallback,
    testShortFocusBoundarySettlesImmediately,
    testRepeatedTransientFocusNoiseCreatesCompleteSegments,
    testShortDomainSwitchSettlesImmediately,
    testUnfocusClosesForegroundImmediately,
    testWindowFocusPolledCannotWriteForegroundLedger,
    testDomainBoundaryAppliesImmediately,
    testMediaReasonCannotDriveForegroundTransition,
    testLegacyMediaStartReasonIsSanitizedOnSettlement,
    testCheckpointThenBoundaryDoesNotDoubleCountCheckpointWindow,
    testCheckpointReopenPreservesTabMetadata,
    testIdleAndLockedBlockForegroundActive,
    testForegroundMediaLegacyCompensationIsStillPresent,
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
