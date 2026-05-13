// P1-A evidence-based foreground timing tests.
// Run with: node tests/unit/foreground-evidence-p1a.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    const result = {};
    if (Array.isArray(keys)) keys.forEach((key) => { result[key] = this.data[key]; });
    else if (typeof keys === 'string') result[keys] = this.data[keys];
    else if (keys && typeof keys === 'object') Object.keys(keys).forEach((key) => { result[key] = this.data[key] ?? keys[key]; });
    else Object.assign(result, this.data);
    return result;
  }
  async set(values) { Object.assign(this.data, values); }
}

const mockSession = new MockStorage();
const mockLocal = new MockStorage();
global.chrome = { storage: { session: mockSession, local: mockLocal } };

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[\s\S]*?\};?/g, '');
  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const fields = exportNames.map((name) => `${name}: (typeof ${name} !== 'undefined' ? ${name} : undefined)`);
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${fields.join(', ')} };`);
  return factory(injected);
}

const contextApi = loadProdModule('core/context.js', ['buildContext']);
const stateApi = loadProdModule('core/state.js', ['resolveState', 'AttentionState']);
const eventApi = loadProdModule('core/event-log.js', ['appendEvent', 'getEvents', 'clearEvents', 'EVENT_TYPE']);
const timeBoundaryApi = loadProdModule('runtime/time-boundary.js', ['getReliableCloseTime']);
const foregroundApi = loadProdModule('runtime/foreground-evidence.js', [
  'ForegroundConfidence',
  'ACTIVITY_GRACE_MS',
  'PASSIVE_FOREGROUND_GRACE_MS',
  'MAX_UNCHECKPOINTED_MS',
  'CHECKPOINT_INTERVAL_MS',
  'getBoundedForegroundCloseTime',
  'hasCheckpointGap',
  'isForegroundCountable',
  'resolveForegroundConfidence',
]);

let settlementCalls = [];
const sessionApi = loadProdModule('runtime/session.js', [
  'getSession',
  'saveSession',
  'transitionState',
  'heartbeat',
  'closeCurrentSession',
  'flushOpenSessionToStats',
  'runPeriodicCheckpoint',
], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  emitTrace: async () => {},
  getReliableCloseTime: timeBoundaryApi.getReliableCloseTime,
  CHECKPOINT_INTERVAL_MS: foregroundApi.CHECKPOINT_INTERVAL_MS,
  ForegroundConfidence: foregroundApi.ForegroundConfidence,
  getBoundedForegroundCloseTime: foregroundApi.getBoundedForegroundCloseTime,
  hasCheckpointGap: foregroundApi.hasCheckpointGap,
  isForegroundCountable: foregroundApi.isForegroundCountable,
  resolveForegroundConfidence: foregroundApi.resolveForegroundConfidence,
  isCountedState: (state) => ['ACTIVE', 'BACKGROUND_ACTIVE', 'PIP_ACTIVE'].includes(state),
  settleUsageDuration: async (input) => {
    settlementCalls.push(input);
    return 1;
  },
});

let passed = 0;
let failed = 0;

function check(desc, condition, details = '') {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  x ${desc}${details ? `: ${details}` : ''}`);
}

function section(name) {
  console.log(`\n[${name}]`);
}

async function reset() {
  mockSession.reset();
  mockLocal.reset();
  settlementCalls = [];
  await mockLocal.set({
    cloud_profile_id: 'profile-p1a',
    cloud_device_id: 'device-p1a',
    guardian_session: { currentMode: 'composite' },
  });
}

function foregroundEvidence(base, overrides = {}) {
  return {
    domain: 'www.desmos.com',
    tabId: 1,
    isFocused: true,
    isIdle: false,
    pageVisible: true,
    startTime: base,
    lastVisibleAt: base,
    lastPageActivityAt: null,
    lastForegroundEvidenceAt: base,
    lastCheckpointAt: base,
    ...overrides,
  };
}

function maxOpenEvents(events) {
  let open = 0;
  let maxOpen = 0;
  for (const event of events) {
    if (event.type === 'START') open += 1;
    if (event.type === 'END') open = Math.max(0, open - 1);
    maxOpen = Math.max(maxOpen, open);
  }
  return maxOpen;
}

async function runTests() {
  const base = 1777300000000;

  section('P1A-1 confidence states');
  {
    const trusted = foregroundApi.resolveForegroundConfidence(foregroundEvidence(base, { lastPageActivityAt: base + 10_000 }), base + 20_000);
    check('recent activity resolves TRUSTED_ACTIVE', trusted.confidence === foregroundApi.ForegroundConfidence.TRUSTED_ACTIVE);

    const inferred = foregroundApi.resolveForegroundConfidence(foregroundEvidence(base), base + 5 * 60_000);
    check('no activity under 10min resolves INFERRED_FOREGROUND', inferred.confidence === foregroundApi.ForegroundConfidence.INFERRED_FOREGROUND);

    const suspect = foregroundApi.resolveForegroundConfidence(foregroundEvidence(base), base + 11 * 60_000);
    check('no activity over 10min resolves SUSPECT', suspect.confidence === foregroundApi.ForegroundConfidence.SUSPECT);
  }

  section('P1A-2 resolveState foreground guards');
  {
    const trustedCtx = foregroundEvidence(base, { timestamp: base + 20_000, lastPageActivityAt: base + 10_000 });
    check('trusted context maps to ACTIVE', stateApi.resolveState(trustedCtx) === stateApi.AttentionState.ACTIVE);
    const hiddenCtx = foregroundEvidence(base, { pageVisible: false, timestamp: base + 20_000 });
    check('visibility hidden stops ordinary ACTIVE', stateApi.resolveState(hiddenCtx) !== stateApi.AttentionState.ACTIVE);
    const idleCtx = foregroundEvidence(base, { isIdle: true, timestamp: base + 20_000 });
    check('system idle stops ordinary ACTIVE', stateApi.resolveState(idleCtx) === stateApi.AttentionState.IDLE);
  }

  section('P1A-3 context evidence updates');
  {
    let ctx = contextApi.buildContext(null, {
      type: 'PAGE_ACTIVITY',
      category: 'visibility',
      tabId: 7,
      windowId: 70,
      domain: 'www.desmos.com',
      isFocused: true,
      isIdle: false,
      pageVisible: true,
      at: base,
      _reason: 'pageActivity',
    });
    const beforeHeartbeatEvidenceAt = ctx.lastForegroundEvidenceAt;
    ctx = contextApi.buildContext(ctx, { _reason: 'serviceHeartbeat' });
    check('PAGE_ACTIVITY updates lastPageActivityAt', ctx.lastPageActivityAt === base);
    check('visibility visible updates lastVisibleAt', ctx.lastVisibleAt === base);
    check('service heartbeat does not update lastPageActivityAt', ctx.lastPageActivityAt === base);
    check('service heartbeat does not update lastForegroundEvidenceAt', ctx.lastForegroundEvidenceAt === beforeHeartbeatEvidenceAt);
  }

  section('P1A-4 checkpoints bound counted windows');
  {
    await reset();
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'www.desmos.com',
      startTime: base,
      lastHeartbeat: base + 59_000,
      mode: 'composite',
      ...foregroundEvidence(base, { lastPageActivityAt: base, lastCheckpointAt: base }),
    });
    const checkpoint = await sessionApi.runPeriodicCheckpoint(base + 60_000);
    const reopened = await sessionApi.getSession();
    check('60s checkpoint succeeds', checkpoint.checkpointed === true);
    check('checkpoint counted one bounded window', settlementCalls[0]?.endMs - settlementCalls[0]?.startMs === 60_000);
    check('checkpoint reopens at checkpoint time', reopened.startTime === base + 60_000);
  }

  section('P1A-5 missing checkpoint and overnight close do not count active');
  {
    await reset();
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'www.desmos.com',
      startTime: base,
      lastHeartbeat: base + 12 * 60_000,
      mode: 'composite',
      ...foregroundEvidence(base, { lastCheckpointAt: base, lastForegroundEvidenceAt: base + 60_000 }),
    });
    const closed = await sessionApi.closeCurrentSession('tab_close', { now: base + 19.5 * 60 * 60 * 1000 });
    check('overnight tab_close is suspect', closed.suspect === true);
    check('overnight tab_close does not settle active usage', settlementCalls.length === 0);
    const data = await mockLocal.get('foreground_timing_diagnostics_v1');
    check('overnight suspect is diagnostic-recorded', Array.isArray(data.foreground_timing_diagnostics_v1) && data.foreground_timing_diagnostics_v1.length === 1);
  }

  section('P1A-6 recovery/sleep gap does not count large active');
  {
    await reset();
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'sleep.example.com',
      startTime: base,
      lastHeartbeat: base + 60_000,
      mode: 'rest',
      ...foregroundEvidence(base, { domain: 'sleep.example.com', lastCheckpointAt: base }),
    });
    await sessionApi.closeCurrentSession('recovery_gap_close', { now: base + 8 * 60 * 60 * 1000, forceStale: true });
    check('recovery sleep gap does not settle active usage', settlementCalls.length === 0);
  }

  section('P1A-6b stale service heartbeat closes ACTIVE without settlement');
  {
    await reset();
    await eventApi.appendEvent({ type: 'START', state: 'ACTIVE', domain: 'heartbeat.example.com', time: base });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'heartbeat.example.com',
      startTime: base,
      lastHeartbeat: base + 30_000,
      mode: 'rest',
      ...foregroundEvidence(base, { domain: 'heartbeat.example.com', lastPageActivityAt: base, lastCheckpointAt: base }),
    });
    const originalNow = Date.now;
    try {
      Date.now = () => base + 130_000;
      await sessionApi.heartbeat();
    } finally {
      Date.now = originalNow;
    }
    const events = await eventApi.getEvents();
    const session = await sessionApi.getSession();
    check('stale service heartbeat does not call settleUsageDuration for ACTIVE', settlementCalls.length === 0);
    check('stale service heartbeat appends END', events.some((event) => event.type === 'END' && event.domain === 'heartbeat.example.com' && event.time === base + 30_000));
    check('stale service heartbeat clears session', session.state === null && session.domain === null && session.startTime === null);
  }

  section('P1A-6c suspect flush/checkpoint close event log before clearing');
  {
    await reset();
    await eventApi.appendEvent({ type: 'START', state: 'ACTIVE', domain: 'flush-suspect.example.com', time: base });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'flush-suspect.example.com',
      startTime: base,
      lastHeartbeat: base + 700_000,
      mode: 'rest',
      ...foregroundEvidence(base, { domain: 'flush-suspect.example.com', lastCheckpointAt: base }),
    });
    await sessionApi.flushOpenSessionToStats('ui_flush', { now: base + 700_000 });
    let events = await eventApi.getEvents();
    let session = await sessionApi.getSession();
    check('suspect flush appends END before clearing', events.some((event) => event.type === 'END' && event.domain === 'flush-suspect.example.com'));
    check('suspect flush clears session', session.state === null && session.domain === null && session.startTime === null);

    await reset();
    await eventApi.appendEvent({ type: 'START', state: 'ACTIVE', domain: 'checkpoint-stale.example.com', time: base });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'checkpoint-stale.example.com',
      startTime: base,
      lastHeartbeat: base + 10_000,
      mode: 'rest',
      ...foregroundEvidence(base, { domain: 'checkpoint-stale.example.com', lastCheckpointAt: base }),
    });
    await sessionApi.runPeriodicCheckpoint(base + 130_000);
    events = await eventApi.getEvents();
    session = await sessionApi.getSession();
    check('stale ACTIVE checkpoint appends END before clearing', events.some((event) => event.type === 'END' && event.domain === 'checkpoint-stale.example.com'));
    check('stale ACTIVE checkpoint clears session', session.state === null && session.domain === null && session.startTime === null);
  }

  section('P1A-6d periodic checkpoint remains serialized with transitions');
  {
    await reset();
    await eventApi.appendEvent({ type: 'START', state: 'ACTIVE', domain: 'serialized.example.com', time: base });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'serialized.example.com',
      startTime: base,
      lastHeartbeat: base + 59_000,
      mode: 'rest',
      ...foregroundEvidence(base, { domain: 'serialized.example.com', lastPageActivityAt: base, lastCheckpointAt: base }),
    });
    const originalNow = Date.now;
    try {
      Date.now = () => base + 60_000;
      await Promise.all([
        sessionApi.runPeriodicCheckpoint(base + 60_000),
        sessionApi.transitionState('PASSIVE', 'next.example.com'),
      ]);
    } finally {
      Date.now = originalNow;
    }
    const events = await eventApi.getEvents();
    const session = await sessionApi.getSession();
    check('checkpoint/transition serialization keeps max one open event', maxOpenEvents(events) <= 1);
    check('checkpoint/transition serialization leaves valid session', !!session && Number.isFinite(session.lastHeartbeat));
  }

  section('P1A-7 static reading behavior');
  {
    const fiveMin = foregroundApi.resolveForegroundConfidence(foregroundEvidence(base), base + 5 * 60_000);
    const overnight = foregroundApi.resolveForegroundConfidence(foregroundEvidence(base), base + 19.5 * 60 * 60 * 1000);
    check('static reading 5min counts as inferred', fiveMin.confidence === foregroundApi.ForegroundConfidence.INFERRED_FOREGROUND);
    check('static page left overnight is suspect', overnight.confidence === foregroundApi.ForegroundConfidence.SUSPECT);
  }

  section('P1A-8 content pulse privacy and throttle');
  {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'content.js'), 'utf8');
    const pulseBlock = content.slice(content.indexOf('function sendPageActivity'), content.indexOf('function onPageActivity'));
    check('content sends PAGE_ACTIVITY', /type:\s*'PAGE_ACTIVITY'/.test(content));
    check('activity pulse throttle is 15 seconds', /PAGE_ACTIVITY_THROTTLE_MS\s*=\s*15\s*\*\s*1000/.test(content));
    check('payload contains allowed category field', /category,\s*[\r\n\s]*visible:/.test(pulseBlock));
    check('payload does not include key value', !/\bkey(Value|Code|Text)?\b|event\.key|event\.code/.test(pulseBlock));
    check('payload does not include mouse coordinates', !/clientX|clientY|screenX|screenY|pageX|pageY/.test(pulseBlock));
    check('payload does not include DOM/text/input/form/screenshot/path data', !/innerHTML|textContent|value|formData|screenshot|location\.pathname|location\.search/.test(pulseBlock));
  }

  const total = passed + failed;
  console.log(`\n[Foreground Evidence P1-A] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
