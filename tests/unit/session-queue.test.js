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
const sessionApi = loadProdModule('runtime/session.js', ['initSession', 'getSession', 'saveSession', 'transitionState', 'heartbeat'], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
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

  const total = passed + failed;
  console.log(`\n[Session Queue] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
