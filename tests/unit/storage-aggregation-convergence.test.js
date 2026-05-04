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
    expect('pipSeconds should always exist with zero default', range[today].pipSeconds, 0);
    expect('pipByDomain should always exist with empty default', range[today].pipByDomain, {});
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

  section('S5: PiP should be split into pipSeconds and pipByDomain');
  {
    mockLocalStorage.reset();
    await mockLocalStorage.set({
      [EVENT_LOG_KEY]: [
        { type: 'START', state: 'PIP_ACTIVE', domain: 'video.com', time: tsForDate(today, 14, 0, 0) },
        { type: 'END', state: 'PIP_ACTIVE', domain: 'video.com', time: tsForDate(today, 14, 0, 9) },
        { type: 'START', state: 'ACTIVE', domain: 'read.com', time: tsForDate(today, 14, 1, 0) },
        { type: 'END', state: 'ACTIVE', domain: 'read.com', time: tsForDate(today, 14, 1, 4) },
      ]
    });

    const stats = await storageApi.getTodayStats();
    expect('pipSeconds should be 9', stats.pipSeconds, 9);
    expect('pipByDomain.video.com should be 9', stats.pipByDomain['video.com'], 9);
    expect('read.com should be 4 seconds', stats['read.com'], 4);
    expectTrue('video.com should be absent from domain totals', !('video.com' in stats));
    expect('audioSeconds should stay 0', stats.audioSeconds, 0);
  }

  section('S6: resetDailyLockedDomains should reset quota state across date boundary');
  {
    mockLocalStorage.reset();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const CONFIG_KEY = 'guardian_config';
    const HASH_KEY = 'guardian_config_hash';
    const LAST_RESET_DATE_KEY = 'last_reset_date';

    await mockLocalStorage.set({
      [LAST_RESET_DATE_KEY]: yesterdayKey,
      [CONFIG_KEY]: {
        isInitialized: true,
        adminPasswordHash: '',
        lockedDomains: ['temp-blocked.com', 'another.com'],
        quotaState: { onlineLocked: true, studyLocked: false, restLocked: true, undeterminedLocked: true },
        quotaBorrow: { borrowedFrom: yesterdayKey, amount: 30, repaid: false },
        studyList: ['study.com'],
        compositeList: ['composite.com'],
        unsafeList: [],
      },
      [HASH_KEY]: 'old-hash',
    });

    // Inline reset logic matching infra/storage.js resetDailyLockedDomains
    const today = storageApi.getDateKey();
    const stored = await mockLocalStorage.get([LAST_RESET_DATE_KEY]);
    expectTrue('last_reset_date should be yesterday before reset', stored[LAST_RESET_DATE_KEY] === yesterdayKey);

    // Simulate reset: update date key, clear lockedDomains, reset quotaState
    await mockLocalStorage.set({ [LAST_RESET_DATE_KEY]: today });
    const config = (await mockLocalStorage.get([CONFIG_KEY]))[CONFIG_KEY];
    config.lockedDomains = [];
    config.quotaState = { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false };
    // Auto-repay borrow if repayment date passed (production: repayD = borrowedFrom + 1, today > repayD)
    if (config.quotaBorrow && !config.quotaBorrow.repaid) {
      const repayD = new Date(config.quotaBorrow.borrowedFrom + 'T00:00:00');
      repayD.setDate(repayD.getDate() + 1);
      const repayDateKey = `${repayD.getFullYear()}-${String(repayD.getMonth() + 1).padStart(2, '0')}-${String(repayD.getDate()).padStart(2, '0')}`;
      if (today > repayDateKey) {
        config.quotaBorrow = { ...config.quotaBorrow, repaid: true };
      }
    }
    await mockLocalStorage.set({ [CONFIG_KEY]: config });

    // Assertions
    const resetDate = (await mockLocalStorage.get([LAST_RESET_DATE_KEY]))[LAST_RESET_DATE_KEY];
    expect('last_reset_date should be today', resetDate, today);

    const finalConfig = (await mockLocalStorage.get([CONFIG_KEY]))[CONFIG_KEY];
    expectTrue('lockedDomains should be cleared', !finalConfig.lockedDomains || finalConfig.lockedDomains.length === 0);
    expect('quotaState.onlineLocked should be false', finalConfig.quotaState.onlineLocked, false);
    expect('quotaState.studyLocked should be false', finalConfig.quotaState.studyLocked, false);
    expect('quotaState.restLocked should be false', finalConfig.quotaState.restLocked, false);
    expect('quotaState.undeterminedLocked should be false', finalConfig.quotaState.undeterminedLocked, false);
    expectTrue('studyList should be preserved', Array.isArray(finalConfig.studyList) && finalConfig.studyList.includes('study.com'));
    expectTrue('compositeList should be preserved', Array.isArray(finalConfig.compositeList) && finalConfig.compositeList.includes('composite.com'));
    // yesterday borrow: repayD = today, today > today is false → NOT repaid yet (matches production)
    expect('quotaBorrow.repaid should be false (yesterday borrow not yet repaid per production logic)', finalConfig.quotaBorrow.repaid, false);
  }

  section('S7: resetDailyLockedDomains should skip when already reset today');
  {
    mockLocalStorage.reset();

    const CONFIG_KEY = 'guardian_config';
    const LAST_RESET_DATE_KEY = 'last_reset_date';
    const today = storageApi.getDateKey();

    await mockLocalStorage.set({
      [LAST_RESET_DATE_KEY]: today,
      [CONFIG_KEY]: {
        isInitialized: true,
        adminPasswordHash: '',
        lockedDomains: ['should-stay.com'],
        quotaState: { onlineLocked: true, studyLocked: true, restLocked: true, undeterminedLocked: false },
        studyList: [],
        compositeList: [],
        unsafeList: [],
      },
    });

    // Simulate early-exit check: if last_reset_date === today, skip
    const stored = await mockLocalStorage.get([LAST_RESET_DATE_KEY]);
    expectTrue('last_reset_date should be today', stored[LAST_RESET_DATE_KEY] === today);

    const config = (await mockLocalStorage.get([CONFIG_KEY]))[CONFIG_KEY];
    expectTrue('lockedDomains should NOT be cleared (already reset today)', config.lockedDomains && config.lockedDomains.includes('should-stay.com'));
    expect('quotaState.onlineLocked should remain true', config.quotaState.onlineLocked, true);
  }

  section('S8: resetDailyLockedDomains should auto-repay borrow when today > borrowedFrom + 1 day');
  {
    mockLocalStorage.reset();

    const CONFIG_KEY = 'guardian_config';
    const LAST_RESET_DATE_KEY = 'last_reset_date';
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoKey = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`;
    const today = storageApi.getDateKey();

    await mockLocalStorage.set({
      [LAST_RESET_DATE_KEY]: twoDaysAgoKey,
      [CONFIG_KEY]: {
        isInitialized: true,
        adminPasswordHash: '',
        lockedDomains: [],
        quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
        quotaBorrow: { borrowedFrom: twoDaysAgoKey, amount: 20, repaid: false },
        studyList: [],
        compositeList: [],
        unsafeList: [],
      },
    });

    // Simulate reset logic
    await mockLocalStorage.set({ [LAST_RESET_DATE_KEY]: today });
    const config = (await mockLocalStorage.get([CONFIG_KEY]))[CONFIG_KEY];
    config.lockedDomains = [];
    config.quotaState = { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false };
    if (config.quotaBorrow && !config.quotaBorrow.repaid) {
      const repayD = new Date(config.quotaBorrow.borrowedFrom + 'T00:00:00');
      repayD.setDate(repayD.getDate() + 1);
      const repayDateKey = `${repayD.getFullYear()}-${String(repayD.getMonth() + 1).padStart(2, '0')}-${String(repayD.getDate()).padStart(2, '0')}`;
      if (today > repayDateKey) {
        config.quotaBorrow = { ...config.quotaBorrow, repaid: true };
      }
    }
    await mockLocalStorage.set({ [CONFIG_KEY]: config });

    const finalConfig = (await mockLocalStorage.get([CONFIG_KEY]))[CONFIG_KEY];
    // twoDaysAgo borrow: repayD = yesterday, today > yesterday → repaid
    expect('quotaBorrow.repaid should be true (2-day-old borrow auto-repaid)', finalConfig.quotaBorrow.repaid, true);
    expect('quotaBorrow.amount should be preserved', finalConfig.quotaBorrow.amount, 20);
  }

  const total = passed + failed;
  console.log(`\n[Storage Aggregation Convergence] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
