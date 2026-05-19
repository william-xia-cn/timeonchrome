// Phase 1 test-first: session queue reliability tests (production API based)
// Run with: node tests/unit/session-queue.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor(delayMs = 0) {
    this.data = {};
    this.delayMs = delayMs;
  }
  reset() { this.data = {}; }
  async get(keys) {
    await sleep(this.delayMs);
    const result = {};
    if (Array.isArray(keys)) {
      keys.forEach(k => { result[k] = this.data[k]; });
    } else if (typeof keys === 'string') {
      result[keys] = this.data[keys];
    } else if (typeof keys === 'object') {
      Object.keys(keys).forEach(k => { result[k] = this.data[k] ?? keys[k]; });
    }
    return result;
  }
  async set(obj) {
    await sleep(this.delayMs);
    Object.assign(this.data, obj);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const mockSessionStorage = new MockStorage(2);
const mockLocalStorage = new MockStorage(2);

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
const timeBoundaryApi = loadProdModule('runtime/time-boundary.js', [
  'STALE_GAP_THRESHOLD',
  'clampTime',
  'getReliableCloseTime',
  'getCappedElapsedMs',
  'isFiniteTime',
  'isStaleSession',
]);
const settledInputs = [];
const sessionApi = loadProdModule('runtime/session.js', ['initSession', 'getSession', 'saveSession', 'transitionState', 'heartbeat', 'flushOpenSessionToStats', 'runPeriodicCheckpoint'], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  emitTrace: async () => {}, // no-op for unit tests
  getReliableCloseTime: timeBoundaryApi.getReliableCloseTime,
  isCountedState: (state) => ['ACTIVE', 'BACKGROUND_ACTIVE', 'PIP_ACTIVE'].includes(state),
  settleUsageDuration: async (input) => {
    settledInputs.push(input);
    return 1;
  },
});

function countMaxOpen(events) {
  let open = 0;
  let maxOpen = 0;
  for (const e of events) {
    if (e.type === 'START') open++;
    if (e.type === 'END') open = Math.max(0, open - 1);
    if (open > maxOpen) maxOpen = open;
  }
  return maxOpen;
}

function hasOrphanEnd(events) {
  let open = 0;
  for (const e of events) {
    if (e.type === 'START') open++;
    if (e.type === 'END') {
      if (open === 0) return true;
      open--;
    }
  }
  return false;
}

function section(name) { console.log(`\n[${name}]`); }
let passed = 0, failed = 0;
function check(desc, condition, expectedFail = false) {
  if (condition) {
    passed++;
    return;
  }
  failed++;
  console.error(`  ✗ ${desc}${expectedFail ? ' [EXPECTED_FAIL_BEFORE_PHASE1]' : ''}`);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function runTests() {
  section('SQ-1 concurrent transitionState does not violate sequence invariants');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    await sessionApi.initSession();

    const ops = [];
    for (let i = 0; i < 20; i++) {
      const state = i % 2 === 0 ? 'ACTIVE' : 'PASSIVE';
      const domain = i % 2 === 0 ? 'a.com' : 'b.com';
      ops.push(sessionApi.transitionState(state, domain));
    }
    await Promise.all(ops);

    const events = await eventApi.getEvents();
    check('并发切换后不应出现孤立 END', hasOrphanEnd(events) === false);
    check('并发切换后任意时刻 open event 不超过 1', countMaxOpen(events) <= 1);
  }

  section('SQ-2 transitionState and heartbeat do not cause session rollback');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();

    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'old.com',
      startTime: 1000,
      lastHeartbeat: 1000,
    });

    await Promise.all([
      sessionApi.transitionState('PASSIVE', 'new.com'),
      sessionApi.heartbeat(),
    ]);

    const s = await sessionApi.getSession();
    check('最终 session.state 不应回退为 ACTIVE', s.state === 'PASSIVE');
    check('最终 session.domain 不应回退为 old.com', s.domain === 'new.com');
  }

  section('SQ-3 rapid A→B→A still leaves at most one open event');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    await sessionApi.initSession();

    await sessionApi.transitionState('ACTIVE', 'a.com');
    await Promise.all([
      sessionApi.transitionState('PASSIVE', 'b.com'),
      sessionApi.transitionState('ACTIVE', 'a.com'),
    ]);

    const events = await eventApi.getEvents();
    check('A→B→A 后 open event 峰值 <= 1', countMaxOpen(events) <= 1);
    check('A→B→A 后不应出现孤立 END', hasOrphanEnd(events) === false);
  }

  section('SQ-4 heartbeat is a deprecated no-op for timing state');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    await eventApi.clearEvents();

    const originalNow = Date.now;
    const base = 1777200000000;
    try {
      Date.now = () => base;
      await sessionApi.saveSession({
        state: 'ACTIVE',
        domain: 'stall.test',
        startTime: base,
        lastHeartbeat: base + 30000,
      });
      await eventApi.appendEvent({
        type: eventApi.EVENT_TYPE.START,
        state: 'ACTIVE',
        domain: 'stall.test',
        time: base,
      });

      Date.now = () => base + 130000;
      const heartbeatResult = await sessionApi.heartbeat();

      const events = await eventApi.getEvents();
      const session = await sessionApi.getSession();
      check('heartbeat 返回 deprecated no-op', heartbeatResult?.reason === 'heartbeat_timing_deprecated');
      check('heartbeat 不追加 END 事件', !events.some(e => e.type === eventApi.EVENT_TYPE.END));
      check('heartbeat 不重开 START 事件', !events.some(e =>
        e.type === eventApi.EVENT_TYPE.START &&
        e.state === 'ACTIVE' &&
        e.domain === 'stall.test' &&
        e.time === base + 130000
      ));
      check('heartbeat 不改变 session.startTime', session.startTime === base);
      check('heartbeat 不改变 session state/domain', session.state === 'ACTIVE' && session.domain === 'stall.test');
    } finally {
      Date.now = originalNow;
    }
  }

  section('SQ-5 stale transition closes old segment at last heartbeat and opens new at now');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    await eventApi.clearEvents();

    const originalNow = Date.now;
    const base = 1777201000000;
    try {
      Date.now = () => base;
      await sessionApi.saveSession({
        state: 'ACTIVE',
        domain: 'old.test',
        startTime: base,
        lastHeartbeat: base + 10_000,
      });
      await eventApi.appendEvent({
        type: eventApi.EVENT_TYPE.START,
        state: 'ACTIVE',
        domain: 'old.test',
        time: base,
      });

      Date.now = () => base + 130_000;
      await sessionApi.transitionState('PASSIVE', 'new.test');

      const events = await eventApi.getEvents();
      const session = await sessionApi.getSession();
      check('foreground stale transition END 不得超过一个 checkpoint 窗口', events.some(e =>
        e.type === eventApi.EVENT_TYPE.END &&
        e.state === 'ACTIVE' &&
        e.domain === 'old.test' &&
        e.time <= base + 180_000
      ));
      check('stale transition 新 START 应从 now 开始', events.some(e =>
        e.type === eventApi.EVENT_TYPE.START &&
        e.state === 'PASSIVE' &&
        e.domain === 'new.test' &&
        e.time === base + 130_000
      ));
      check('新 session.startTime 使用 now', session.startTime === base + 130_000);
    } finally {
      Date.now = originalNow;
    }
  }

  section('SQ-6 non-stale transition still closes at now');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    await eventApi.clearEvents();

    const originalNow = Date.now;
    const base = 1777202000000;
    try {
      Date.now = () => base;
      await sessionApi.saveSession({
        state: 'ACTIVE',
        domain: 'fresh.test',
        startTime: base,
        lastHeartbeat: base + 30_000,
      });
      await eventApi.appendEvent({
        type: eventApi.EVENT_TYPE.START,
        state: 'ACTIVE',
        domain: 'fresh.test',
        time: base,
      });

      Date.now = () => base + 60_000;
      await sessionApi.transitionState(null, null);

      const events = await eventApi.getEvents();
      check('non-stale transition END 应使用 now', events.some(e =>
        e.type === eventApi.EVENT_TYPE.END &&
        e.domain === 'fresh.test' &&
        e.time === base + 60_000
      ));
    } finally {
      Date.now = originalNow;
    }
  }

  section('SQ-7 stale boundary applies to background audio and PiP states');
  {
    for (const state of ['BACKGROUND_ACTIVE', 'PIP_ACTIVE']) {
      mockSessionStorage.reset();
      mockLocalStorage.reset();
      await eventApi.clearEvents();

      const originalNow = Date.now;
      const base = 1777203000000;
      try {
        Date.now = () => base;
        await sessionApi.saveSession({
          state,
          domain: `${state.toLowerCase()}.test`,
          startTime: base,
          lastHeartbeat: base + 5_000,
        });
        await eventApi.appendEvent({
          type: eventApi.EVENT_TYPE.START,
          state,
          domain: `${state.toLowerCase()}.test`,
          time: base,
        });

        Date.now = () => base + 130_000;
        await sessionApi.transitionState(null, null);

        const events = await eventApi.getEvents();
        check(`${state} stale END 应截断到 lastHeartbeat`, events.some(e =>
          e.type === eventApi.EVENT_TYPE.END &&
          e.state === state &&
          e.time === base + 5_000
        ));
      } finally {
        Date.now = originalNow;
      }
    }
  }

  section('SQ-8 invalid lastHeartbeat cannot produce backwards END');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    await eventApi.clearEvents();

    const originalNow = Date.now;
    const base = 1777204000000;
    try {
      Date.now = () => base;
      await sessionApi.saveSession({
        state: 'ACTIVE',
        domain: 'invalid-heartbeat.test',
        startTime: base,
        lastHeartbeat: base - 30_000,
      });
      await eventApi.appendEvent({
        type: eventApi.EVENT_TYPE.START,
        state: 'ACTIVE',
        domain: 'invalid-heartbeat.test',
        time: base,
      });

      Date.now = () => base + 130_000;
      await sessionApi.transitionState(null, null);

      const events = await eventApi.getEvents();
      const endEvent = events.find(e => e.type === eventApi.EVENT_TYPE.END && e.domain === 'invalid-heartbeat.test');
      check('lastHeartbeat 早于 startTime 时 END 不早于 startTime', endEvent?.time >= base);
      check('lastHeartbeat 早于 startTime 时 END 不晚于 now', endEvent?.time <= base + 130_000);
    } finally {
      Date.now = originalNow;
    }
  }

  section('SQ-9 periodic checkpoint does not self-deadlock commit queue');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    await eventApi.clearEvents();
    await mockLocalStorage.set({
      cloud_profile_id: 'profile-session-queue',
      cloud_device_id: 'device-session-queue',
      guardian_session: { currentMode: 'study' },
    });

    const originalNow = Date.now;
    const base = 1777205000000;
    try {
      Date.now = () => base;
      await sessionApi.saveSession({
        state: 'ACTIVE',
        domain: 'checkpoint-deadlock.test',
        startTime: base,
        lastHeartbeat: base + 10_000,
      });
      await eventApi.appendEvent({
        type: eventApi.EVENT_TYPE.START,
        state: 'ACTIVE',
        domain: 'checkpoint-deadlock.test',
        time: base,
      });

      Date.now = () => base + 4 * 60_000;
      const checkpoint = await withTimeout(sessionApi.runPeriodicCheckpoint(base + 4 * 60_000), 1000);
      check('periodic checkpoint returns within timeout', checkpoint?.ok === true);

      Date.now = () => base + 4 * 60_000 + 5_000;
      const flush = await withTimeout(sessionApi.flushOpenSessionToStats('ui_flush'), 1000);
      check('subsequent ui_flush returns within timeout', flush?.ok === true);
    } finally {
      Date.now = originalNow;
    }
  }

  section('SQ-10 sub-second foreground transition still settles segment');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    settledInputs.length = 0;
    await eventApi.clearEvents();

    const originalNow = Date.now;
    const base = 1777200000000;
    try {
      Date.now = () => base;
      await sessionApi.initSession();
      await sessionApi.transitionState('ACTIVE', 'short-a.test');

      Date.now = () => base + 500;
      await sessionApi.transitionState('ACTIVE', 'short-b.test');

      const events = await eventApi.getEvents();
      check('sub-second transition appends END', events.some(e =>
        e.type === eventApi.EVENT_TYPE.END &&
        e.domain === 'short-a.test' &&
        e.time === base + 500
      ));
      check('sub-second transition calls settlement', settledInputs.some(s =>
        s.domain === 'short-a.test' &&
        s.startMs === base &&
        s.endMs === base + 500
      ));
    } finally {
      Date.now = originalNow;
    }
  }

  const total = passed + failed;
  console.log(`\n[Session Queue] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
