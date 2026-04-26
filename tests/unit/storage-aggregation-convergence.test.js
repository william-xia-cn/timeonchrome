// Phase 2A.2: storage aggregation convergence tests
// Run with: node tests/unit/storage-aggregation-convergence.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    const result = {};
    if (keys === null) return { ...this.data };
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
    Object.assign(this.data, obj);
  }
  async remove(keys) {
    const arr = Array.isArray(keys) ? keys : [keys];
    arr.forEach(k => delete this.data[k]);
  }
}

const mockLocalStorage = new MockStorage();

global.chrome = {
  storage: {
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
const storageApi = loadProdModule('infra/storage.js', ['getTodayStats', 'getStatsRange', 'getDateKey'], {
  computeAllDomains: aggregateApi.computeAllDomains,
  computeAllDomainsWithAudio: aggregateApi.computeAllDomainsWithAudio,
  emitTrace: async () => {}, // no-op for unit tests
});

const EVENT_LOG_KEY = 'event_log_v1';

function tsForDate(dateStr, h, m, s = 0) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, s).getTime();
}

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

async function runTests() {
  const today = storageApi.getDateKey();

  section('S1: getTodayStats should use hardened same-domain legal pairing');
  {
    mockLocalStorage.reset();
    await mockLocalStorage.set({
      [EVENT_LOG_KEY]: [
        { type: 'START', state: 'ACTIVE', domain: 'a.com', time: tsForDate(today, 10, 0, 0) },
        { type: 'END', state: 'ACTIVE', domain: 'b.com', time: tsForDate(today, 10, 0, 1) }, // orphan for b.com
        { type: 'END', state: 'ACTIVE', domain: 'a.com', time: tsForDate(today, 10, 0, 2) },
      ]
    });

    const stats = await storageApi.getTodayStats();
    expect('a.com should be 2 seconds', stats['a.com'], 2);
    expectTrue('b.com should be absent', !('b.com' in stats));
  }

  section('S2: getStatsRange should preserve return shape and hardened zero handling');
  {
    mockLocalStorage.reset();
    await mockLocalStorage.set({
      [EVENT_LOG_KEY]: [
        { type: 'START', state: 'ACTIVE', domain: 'x.com', time: tsForDate(today, 11, 0, 0) },
        { type: 'START', state: 'ACTIVE', domain: 'x.com', time: tsForDate(today, 11, 0, 5) },
      ]
    });

    const range = await storageApi.getStatsRange(1);
    expectTrue('range should contain today key', typeof range[today] === 'object');
    expectTrue('x.com should be absent (unclosed START ignored)', !('x.com' in range[today]));
    expect('audioSeconds should always exist with zero default', range[today].audioSeconds, 0);
    expect('backgroundMediaByDomain should always exist with empty default', range[today].backgroundMediaByDomain, {});
  }



  section('S3: getStatsRange should split BACKGROUND_ACTIVE into audioSeconds');
  {
    mockLocalStorage.reset();
    await mockLocalStorage.set({
      [EVENT_LOG_KEY]: [
        { type: 'START', state: 'BACKGROUND_ACTIVE', domain: 'music.com', time: tsForDate(today, 12, 0, 0) },
        { type: 'END', state: 'BACKGROUND_ACTIVE', domain: 'music.com', time: tsForDate(today, 12, 0, 6) },
        { type: 'START', state: 'ACTIVE', domain: 'study.com', time: tsForDate(today, 12, 1, 0) },
        { type: 'END', state: 'ACTIVE', domain: 'study.com', time: tsForDate(today, 12, 1, 5) },
      ]
    });

    const range = await storageApi.getStatsRange(1);
    expect('audioSeconds should be 6', range[today].audioSeconds, 6);
    expect('backgroundMediaByDomain.music.com should be 6', range[today].backgroundMediaByDomain['music.com'], 6);
    expect('study.com should be 5 seconds', range[today]['study.com'], 5);
    expectTrue('music.com should be absent from domain totals', !('music.com' in range[today]));
  }

  section('S4: getTodayStats should expose BACKGROUND_ACTIVE as audioSeconds');
  {
    mockLocalStorage.reset();
    await mockLocalStorage.set({
      [EVENT_LOG_KEY]: [
        { type: 'START', state: 'BACKGROUND_ACTIVE', domain: 'video.com', time: tsForDate(today, 13, 0, 0) },
        { type: 'END', state: 'BACKGROUND_ACTIVE', domain: 'video.com', time: tsForDate(today, 13, 0, 8) },
        { type: 'START', state: 'ACTIVE', domain: 'read.com', time: tsForDate(today, 13, 1, 0) },
        { type: 'END', state: 'ACTIVE', domain: 'read.com', time: tsForDate(today, 13, 1, 4) },
      ]
    });

    const stats = await storageApi.getTodayStats();
    expect('audioSeconds should be 8', stats.audioSeconds, 8);
    expect('backgroundMediaByDomain.video.com should be 8', stats.backgroundMediaByDomain['video.com'], 8);
    expect('read.com should be 4 seconds', stats['read.com'], 4);
    expectTrue('video.com should be absent from domain totals', !('video.com' in stats));
  }

  const total = passed + failed;
  console.log(`\n[Storage Aggregation Convergence] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
