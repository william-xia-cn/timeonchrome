// Foreground timing reliability P0 regression coverage.
// Run with: node tests/unit/foreground-timing-reliability.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() {
    this.data = {};
  }
  reset() {
    this.data = {};
  }
  async get(keys) {
    const result = {};
    if (Array.isArray(keys)) {
      keys.forEach((key) => { result[key] = this.data[key]; });
    } else if (typeof keys === 'string') {
      result[keys] = this.data[keys];
    } else if (keys && typeof keys === 'object') {
      Object.keys(keys).forEach((key) => { result[key] = this.data[key] ?? keys[key]; });
    } else {
      Object.assign(result, this.data);
    }
    return result;
  }
  async set(values) {
    Object.assign(this.data, values);
  }
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.data[key];
    }
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

  code = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[\s\S]*?\};?/g, '');

  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const eventApi = loadProdModule('core/event-log.js', ['appendEvent', 'getEvents', 'clearEvents', 'EVENT_TYPE']);
const timeBoundaryApi = loadProdModule('runtime/time-boundary.js', ['getReliableCloseTime']);
const foregroundEvidenceApi = loadProdModule('runtime/foreground-evidence.js', [
  'CHECKPOINT_INTERVAL_MS',
  'ForegroundConfidence',
  'getBoundedForegroundCloseTime',
  'hasCheckpointGap',
  'isForegroundCountable',
  'resolveForegroundConfidence',
]);

let settlementCalls = [];
const sessionApi = loadProdModule('runtime/session.js', [
  'closeCurrentSession',
  'getSession',
  'saveSession',
  'settleCurrentSessionSegment',
], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  emitTrace: async () => {},
  getReliableCloseTime: timeBoundaryApi.getReliableCloseTime,
  CHECKPOINT_INTERVAL_MS: foregroundEvidenceApi.CHECKPOINT_INTERVAL_MS,
  ForegroundConfidence: foregroundEvidenceApi.ForegroundConfidence,
  getBoundedForegroundCloseTime: foregroundEvidenceApi.getBoundedForegroundCloseTime,
  hasCheckpointGap: foregroundEvidenceApi.hasCheckpointGap,
  isForegroundCountable: foregroundEvidenceApi.isForegroundCountable,
  resolveForegroundConfidence: foregroundEvidenceApi.resolveForegroundConfidence,
  isCountedState: (state) => ['ACTIVE', 'BACKGROUND_ACTIVE', 'PIP_ACTIVE'].includes(state),
  settleUsageDuration: async (input) => {
    settlementCalls.push(input);
    return 1;
  },
});

const recoveryApi = loadProdModule('runtime/recovery.js', ['recover'], {
  getSession: sessionApi.getSession,
  getSessionWithPersistenceSource: async () => {
    const sessionData = await mockSessionStorage.get('session_v1');
    if (sessionData.session_v1) return { session: sessionData.session_v1, source: 'session' };
    const localData = await mockLocalStorage.get('session_v1_persistent');
    return {
      session: localData.session_v1_persistent || null,
      source: localData.session_v1_persistent ? 'persistent' : 'none',
    };
  },
  saveSession: sessionApi.saveSession,
  runSessionCommit: async (task) => task(),
  settleCurrentSessionSegment: sessionApi.settleCurrentSessionSegment,
  closeCurrentSession: sessionApi.closeCurrentSession,
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  getLastEvent: async () => {
    const events = await eventApi.getEvents();
    return events.length ? events[events.length - 1] : null;
  },
  getReliableCloseTime: timeBoundaryApi.getReliableCloseTime,
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
  mockSessionStorage.reset();
  mockLocalStorage.reset();
  await mockLocalStorage.set({
    event_log_last_compact: Date.now(),
    cloud_profile_id: 'profile-test',
    cloud_device_id: 'device-test',
  });
  settlementCalls = [];
}

async function runTests() {
  section('FT-1 tab_close uses bounded reliable close time');
  {
    await reset();
    const base = 1777209000000;
    await eventApi.appendEvent({ type: 'START', state: 'ACTIVE', domain: 'close.test', time: base });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'close.test',
      startTime: base,
      lastHeartbeat: base + 10_000,
      mode: 'rest',
      tabId: 1,
      pageVisible: true,
      lastPageActivityAt: base,
      lastVisibleAt: base,
      lastForegroundEvidenceAt: base + 10_000,
      lastCheckpointAt: base,
    });

    const result = await sessionApi.closeCurrentSession('tab_close', { now: base + 130_000 });
    const events = await eventApi.getEvents();
    const end = events.find((event) => event.type === 'END' && event.domain === 'close.test');

    check('tab_close should report stale close', result.stale === true);
    check('tab_close should return stale-aware settlement reason', result.settlementReason === 'tab_close_stale_close');
    check('tab_close END should be capped at lastHeartbeat', end?.time === base + 10_000);
    check('settlement endMs should be capped at lastHeartbeat', settlementCalls[0]?.endMs === base + 10_000, JSON.stringify({ result, settlement: settlementCalls[0] }));
    check('settlement reason should be tab_close_stale_close', settlementCalls[0]?.settlementReason === 'tab_close_stale_close', JSON.stringify({ result, settlement: settlementCalls[0] }));
  }

  section('FT-2 tab_close appends END and clears session');
  {
    await reset();
    const base = 1777210000000;
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'tab-close.test',
      startTime: base,
      lastHeartbeat: base + 20_000,
      mode: 'study',
      tabId: 1,
      pageVisible: true,
      lastPageActivityAt: base,
      lastVisibleAt: base,
      lastForegroundEvidenceAt: base + 20_000,
      lastCheckpointAt: base,
    });

    await sessionApi.closeCurrentSession('tab_close', { now: base + 30_000 });
    const events = await eventApi.getEvents();
    const session = await sessionApi.getSession();

    check('tab_close should append exactly one END', events.filter((event) => event.type === 'END').length === 1);
    check('tab_close should clear session state', session.state === null);
    check('tab_close should clear session domain', session.domain === null);
    check('tab_close should clear mode-at-open', session.mode === null);
  }

  section('FT-3 runtime close API can reopen a new session explicitly');
  {
    await reset();
    const base = 1777211000000;
    await mockLocalStorage.set({ guardian_session: { currentMode: 'composite' } });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'old.test',
      startTime: base,
      lastHeartbeat: base + 10_000,
      mode: 'rest',
      tabId: 1,
      pageVisible: true,
      lastPageActivityAt: base,
      lastVisibleAt: base,
      lastForegroundEvidenceAt: base + 10_000,
      lastCheckpointAt: base,
    });

    await sessionApi.closeCurrentSession('tab_close', {
      now: base + 20_000,
      reopenState: 'ACTIVE',
      reopenDomain: 'new.test',
    });
    const events = await eventApi.getEvents();
    const session = await sessionApi.getSession();

    check('reopen should append END + START', events.length === 2 && events[0].type === 'END' && events[1].type === 'START');
    check('reopened session should use new domain', session.domain === 'new.test');
    check('reopened session should persist mode-at-open', session.mode === 'composite');
  }

  section('FT-4 monitoring_off closes once and prevents recovery duplicate');
  {
    await reset();
    const base = 1777212000000;
    await eventApi.appendEvent({ type: 'START', state: 'ACTIVE', domain: 'monitor.test', time: base });
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'monitor.test',
      startTime: base,
      lastHeartbeat: base + 20_000,
      mode: 'study',
      tabId: 1,
      pageVisible: true,
      lastPageActivityAt: base,
      lastVisibleAt: base,
      lastForegroundEvidenceAt: base + 20_000,
      lastCheckpointAt: base,
    });

    await sessionApi.closeCurrentSession('monitoring_off', { now: base + 30_000 });
    await recoveryApi.recover();
    const events = await eventApi.getEvents();

    check('monitoring_off should leave only one END after recovery', events.filter((event) => event.type === 'END').length === 1);
  }

  section('FT-4b stale monitoring_off uses stale-aware settlement reason');
  {
    await reset();
    const base = 1777212500000;
    await sessionApi.saveSession({
      state: 'ACTIVE',
      domain: 'monitor-stale.test',
      startTime: base,
      lastHeartbeat: base + 5_000,
      mode: 'study',
      tabId: 1,
      pageVisible: true,
      lastPageActivityAt: base,
      lastVisibleAt: base,
      lastForegroundEvidenceAt: base + 5_000,
      lastCheckpointAt: base,
    });

    const result = await sessionApi.closeCurrentSession('monitoring_off', { now: base + 130_000 });

    check('monitoring_off should report stale close', result.stale === true);
    check('monitoring_off should return stale-aware settlement reason', result.settlementReason === 'monitoring_off_stale_close');
    check('settlement reason should be monitoring_off_stale_close', settlementCalls[0]?.settlementReason === 'monitoring_off_stale_close', JSON.stringify({ result, settlement: settlementCalls[0] }));
  }

  section('FT-5 mode attribution survives persisted session recovery');
  {
    await reset();
    const base = 1777213000000;
    await mockLocalStorage.set({
      session_v1_persistent: {
        state: 'ACTIVE',
        domain: 'persisted.test',
        startTime: base,
        lastHeartbeat: base + 10_000,
        mode: 'rest',
        tabId: 1,
        pageVisible: true,
        lastPageActivityAt: base,
        lastVisibleAt: base,
        lastForegroundEvidenceAt: base + 10_000,
        lastCheckpointAt: base,
      },
    });

    const originalNow = Date.now;
    try {
      Date.now = () => base + 130_000;
      await recoveryApi.recover();
    } finally {
      Date.now = originalNow;
    }

    check('recovery settlement should preserve persisted mode-at-open', settlementCalls[0]?.mode === 'rest', JSON.stringify({ settlement: settlementCalls[0] }));
  }

  const total = passed + failed;
  console.log(`\n[Foreground Timing Reliability] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
