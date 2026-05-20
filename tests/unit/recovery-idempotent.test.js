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
const timeBoundaryApi = loadProdModule('runtime/time-boundary.js', [
  'STALE_GAP_THRESHOLD',
  'clampTime',
  'getReliableCloseTime',
  'getCappedElapsedMs',
  'isFiniteTime',
  'isStaleSession',
]);
const sessionApi = loadProdModule('runtime/session.js', ['initSession', 'getSession', 'getSessionWithPersistenceSource', 'saveSession', 'transitionState', 'runSessionCommit'], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  emitTrace: async () => {}, // no-op for unit tests
  getReliableCloseTime: timeBoundaryApi.getReliableCloseTime,
});
const recoverySettlements = [];
const recoveryApi = loadProdModule('runtime/recovery.js', ['recover'], {
  getSession: sessionApi.getSession,
  getSessionWithPersistenceSource: sessionApi.getSessionWithPersistenceSource,
  saveSession: sessionApi.saveSession,
  runSessionCommit: sessionApi.runSessionCommit,
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  isCountedState: (state) => ['ACTIVE', 'BACKGROUND_ACTIVE', 'PIP_ACTIVE'].includes(state),
  settleCurrentSessionSegment: async (session, closeAt, reason, options = {}) => {
    recoverySettlements.push({ session, closeAt, reason, options });
    return {
      appended: 1,
      durationSeconds: Math.floor(Math.max(0, closeAt - session.startTime) / 1000),
    };
  },
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
    recoverySettlements.length = 0;

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
    check('recover 使用 recovery_estimated_close 结算原因', recoverySettlements[0]?.reason === 'recovery_estimated_close');
    check('recover description end reason 使用半 checkpoint 估算', recoverySettlements[0]?.options?.endReason === 'recovery_estimated_half_checkpoint');
    check('recover description end source 是 recovery', recoverySettlements[0]?.options?.endOperationSource === 'recovery');
    check('recover closeAt 不晚于 start+90s', recoverySettlements[0]?.closeAt <= base - 30_000 + 90_000);
  }

  section('RI-1b recover preserves current mode for recovery segment');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    recoverySettlements.length = 0;

    const base = Date.now();
    await mockLocalStorage.set({
      guardian_session: { currentMode: 'composite' },
      guardian_config: { mode: 'rest' },
    });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'mode-recovery.example.com',
      startTime: base - 30_000,
      lastHeartbeat: base - 5_000,
    });

    await recoveryApi.recover();

    check('recover 使用 guardian_session.currentMode 作为 modeOverride', recoverySettlements[0]?.options?.modeOverride === 'composite');
  }

  section('RI-2 recover racing with transitionState yields legal sequence');
  {
    mockSessionStorage.reset();
    mockLocalStorage.reset();
    recoverySettlements.length = 0;

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
