// Phase 1 test-first: recovery idempotency & race tests (production API based)
// Run with: node tests/unit/recovery-idempotent.test.js

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

const eventApi = loadProdModule('core/event-log.js', ['appendEvent', 'getEvents', 'getLastEvent', 'EVENT_TYPE']);
const sessionApi = loadProdModule('runtime/session.js', ['initSession', 'getSession', 'saveSession', 'transitionState', 'runSessionCommit'], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
});
const recoveryApi = loadProdModule('runtime/recovery.js', ['recover'], {
  getSession: sessionApi.getSession,
  saveSession: sessionApi.saveSession,
  runSessionCommit: sessionApi.runSessionCommit,
  appendEvent: eventApi.appendEvent,
  getLastEvent: eventApi.getLastEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
});

function isLegalSequence(events, initialOpen = 0) {
  let open = initialOpen;
  for (const e of events) {
    if (e.type === 'START') {
      open++;
      if (open > 1) return false;
    }
    if (e.type === 'END') {
      if (open === 0) return false;
      open--;
    }
  }
  return true;
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
  section('RI-1 repeated recover only appends one END');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();

    const base = Date.now();
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'x.com',
      startTime: base - 30_000,
      lastHeartbeat: base - 5_000,
    });

    await recoveryApi.recover();
    await recoveryApi.recover();

    const events = await eventApi.getEvents();
    const endEvents = events.filter(e => e.type === 'END' && e.domain === 'x.com');
    check('重复 recover 后只应有 1 个补写 END', endEvents.length === 1);
  }

  section('RI-2 recover racing with transitionState yields legal sequence');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();

    const base = Date.now();
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'a.com',
      startTime: base - 50_000,
      lastHeartbeat: base - 1_000,
    });

    await Promise.all([
      recoveryApi.recover(),
      sessionApi.transitionState('PASSIVE', 'b.com'),
    ]);

    const events = await eventApi.getEvents();
    // 初始 session 已有一个未闭合段（open=1），允许首条是用于闭合它的 END
    check('竞争场景下事件序列仍合法（无孤立 END / 无双 open）', isLegalSequence(events, 1));
  }

  const total = passed + failed;
  console.log(`\n[Recovery Idempotent] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
