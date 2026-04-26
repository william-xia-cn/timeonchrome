// Recovery accuracy tests for production recovery/session/event-log/stats modules.
// Run with: node tests/unit/recovery-accuracy.test.js

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
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) {
      keys.forEach(k => { result[k] = this.data[k]; });
      return result;
    }
    if (typeof keys === 'string') {
      result[keys] = this.data[keys];
      return result;
    }
    if (typeof keys === 'object') {
      Object.keys(keys).forEach(k => { result[k] = this.data[k] ?? keys[k]; });
      return result;
    }
    return result;
  }

  async set(obj) {
    Object.assign(this.data, obj);
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

const aggregateApi = loadProdModule('core/aggregate.js', ['computeAllDomains', 'computeAllDomainsWithAudio']);
const eventApi = loadProdModule('core/event-log.js', ['appendEvent', 'getEvents', 'getLastEvent', 'EVENT_TYPE']);
const sessionApi = loadProdModule('runtime/session.js', ['getSession', 'saveSession', 'runSessionCommit'], {
  appendEvent: eventApi.appendEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
  emitTrace: async () => {},
});
const recoveryApi = loadProdModule('runtime/recovery.js', ['recover'], {
  getSession: sessionApi.getSession,
  saveSession: sessionApi.saveSession,
  runSessionCommit: sessionApi.runSessionCommit,
  appendEvent: eventApi.appendEvent,
  getLastEvent: eventApi.getLastEvent,
  EVENT_TYPE: eventApi.EVENT_TYPE,
});
const storageApi = loadProdModule('infra/storage.js', ['getTodayStats', 'getDateKey'], {
  computeAllDomains: aggregateApi.computeAllDomains,
  computeAllDomainsWithAudio: aggregateApi.computeAllDomainsWithAudio,
  emitTrace: async () => {},
});

const SESSION_KEY = 'session_v1';
const EVENT_LOG_KEY = 'event_log_v1';
const REAL_DATE_NOW = Date.now;
const BASE_TIME = Date.parse('2026-04-26T12:00:00Z');

let passed = 0;
let failed = 0;

async function withNow(now, task) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await task();
  } finally {
    Date.now = originalNow;
  }
}

function resetStorage() {
  mockSessionStorage.reset();
  mockLocalStorage.reset();
}

async function seedOpenActiveSession({ domain, startTime, lastHeartbeat }) {
  await withNow(startTime, async () => {
    await eventApi.appendEvent({
      type: eventApi.EVENT_TYPE.START,
      state: 'ACTIVE',
      domain,
      time: startTime,
    });
  });
  await sessionApi.saveSession({
    state: 'ACTIVE',
    domain,
    startTime,
    lastHeartbeat,
  });
}

async function recoverAt(now) {
  return withNow(now, async () => recoveryApi.recover());
}

async function readStatsAt(now) {
  return withNow(now, async () => {
    const date = storageApi.getDateKey();
    const stats = await storageApi.getTodayStats();
    return { date, stats };
  });
}

function deriveStats(events, date) {
  return aggregateApi.computeAllDomains(events, date);
}

function durationFor(stats, domain) {
  return stats?.[domain] || 0;
}

function firstBrokenLayer({ sessionBefore, sessionAfter, events, derivedStats, stats, expectedStats, expectedEventCount }) {
  if (!sessionBefore && expectedEventCount > 0) return 'test-setup';
  if (sessionAfter?.state || sessionAfter?.domain || sessionAfter?.startTime) return 'session';
  if (events.length !== expectedEventCount) return 'event-log';
  if (JSON.stringify(derivedStats) !== JSON.stringify(expectedStats)) return 'recovery';
  if (JSON.stringify(stats) !== JSON.stringify(derivedStats)) return 'stats';
  return null;
}

function printReport(name, report) {
  console.log(`\n[${name}]`);
  console.log(`  recovery before session: ${JSON.stringify(report.sessionBefore)}`);
  console.log(`  recovery after session:  ${JSON.stringify(report.sessionAfter)}`);
  console.log(`  event-log:               ${JSON.stringify(report.events)}`);
  console.log(`  event-log-derived stats: ${JSON.stringify(report.derivedStats)}`);
  console.log(`  GET_STATS stats:         ${JSON.stringify(report.stats)}`);
  console.log(`  duration comparison:     ${JSON.stringify(report.durationComparison)}`);
  console.log(`  first broken layer:      ${report.brokenLayer || 'none'}`);
}

function check(desc, condition) {
  if (condition) {
    passed++;
    return;
  }
  failed++;
  console.error(`  x ${desc}`);
}

function expectEqual(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(`${desc} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`, ok);
}

async function runScenario({ name, setup, recoverTimes, statsAt, expectedStats, expectedEventCount, domain }) {
  resetStorage();
  await setup();

  const sessionBefore = await sessionApi.getSession();
  for (const time of recoverTimes) {
    await recoverAt(time);
  }

  const sessionAfter = await sessionApi.getSession();
  const events = await eventApi.getEvents();
  const { date, stats } = await readStatsAt(statsAt);
  const derivedStats = deriveStats(events, date);
  const durationComparison = {
    eventLogDerived: durationFor(derivedStats, domain),
    stats: durationFor(stats, domain),
  };
  const brokenLayer = firstBrokenLayer({
    sessionBefore,
    sessionAfter,
    events,
    derivedStats,
    stats,
    expectedStats,
    expectedEventCount,
  });

  const report = { sessionBefore, sessionAfter, events, derivedStats, stats, durationComparison, brokenLayer };
  printReport(name, report);

  return report;
}

async function runTests() {
  const domain = 'recovery.test';
  const t0 = BASE_TIME;

  const scenarioA = await runScenario({
    name: 'A short interruption uses now as END time',
    domain,
    setup: () => seedOpenActiveSession({
      domain,
      startTime: t0,
      lastHeartbeat: t0 + 5_000,
    }),
    recoverTimes: [t0 + 10_000],
    statsAt: t0 + 10_000,
    expectedStats: { [domain]: 10 },
    expectedEventCount: 2,
  });
  expectEqual('A first broken layer', scenarioA.brokenLayer, null);
  expectEqual('A event-log-derived duration', scenarioA.durationComparison.eventLogDerived, 10);
  expectEqual('A stats duration', scenarioA.durationComparison.stats, 10);
  expectEqual('A END time uses now', scenarioA.events.at(-1).time, t0 + 10_000);

  const scenarioB = await runScenario({
    name: 'B long interruption truncates END time to lastHeartbeat',
    domain,
    setup: () => seedOpenActiveSession({
      domain,
      startTime: t0,
      lastHeartbeat: t0 + 5_000,
    }),
    recoverTimes: [t0 + 120_000],
    statsAt: t0 + 120_000,
    expectedStats: { [domain]: 5 },
    expectedEventCount: 2,
  });
  expectEqual('B first broken layer', scenarioB.brokenLayer, null);
  expectEqual('B event-log-derived duration', scenarioB.durationComparison.eventLogDerived, 5);
  expectEqual('B stats duration', scenarioB.durationComparison.stats, 5);
  expectEqual('B END time uses lastHeartbeat', scenarioB.events.at(-1).time, t0 + 5_000);

  const scenarioC = await runScenario({
    name: 'C repeated recovery does not append duplicate END',
    domain,
    setup: () => seedOpenActiveSession({
      domain,
      startTime: t0,
      lastHeartbeat: t0 + 5_000,
    }),
    recoverTimes: [t0 + 120_000, t0 + 121_000],
    statsAt: t0 + 121_000,
    expectedStats: { [domain]: 5 },
    expectedEventCount: 2,
  });
  expectEqual('C first broken layer', scenarioC.brokenLayer, null);
  expectEqual('C event count remains START+END', scenarioC.events.length, 2);
  expectEqual('C stats duration does not double', scenarioC.durationComparison.stats, 5);

  const scenarioD = await runScenario({
    name: 'D empty session writes no event-log entries',
    domain,
    setup: async () => {
      await sessionApi.saveSession({
        state: null,
        domain: null,
        startTime: null,
        lastHeartbeat: t0,
      });
    },
    recoverTimes: [t0 + 120_000],
    statsAt: t0 + 120_000,
    expectedStats: {},
    expectedEventCount: 0,
  });
  expectEqual('D first broken layer', scenarioD.brokenLayer, null);
  expectEqual('D event-log stays empty', scenarioD.events.length, 0);
  expectEqual('D stats stay empty', scenarioD.stats, {});

  Date.now = REAL_DATE_NOW;
  const total = passed + failed;
  console.log(`\n[Recovery Accuracy] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  Date.now = REAL_DATE_NOW;
  console.error(err);
  process.exit(1);
});
