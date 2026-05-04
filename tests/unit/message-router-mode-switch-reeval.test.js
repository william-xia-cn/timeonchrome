// message-router-mode-switch-reeval.test.js
// Run with: node tests/unit/message-router-mode-switch-reeval.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
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

function loadHandleMessage(stubs, chromeOverride = {}) {
  const abs = path.join(__dirname, '..', '..', 'message-router.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const chrome = {
    runtime: {
      id: 'ext-id',
      getURL: (p = '/') => `chrome-extension://ext-id${p}`,
    },
    storage: { local: { set: async () => {} } },
    tabs: {
      query: async () => [],
      update: async () => {},
    },
    ...chromeOverride,
  };

  const context = {
    extractDomain: (url) => {
      try { return new URL(url).hostname; } catch { return null; }
    },
    matchDomain: (domain, pattern) => domain === pattern || domain.endsWith(`.${pattern}`),
    clearTemporaryCompositeDomains: async () => {},
    getTodayStatsWithCategories: async () => ({ studySeconds: 0, restSeconds: 0, undeterminedSeconds: 0 }),
    getTimingSession: async () => null,
    getCappedElapsedMs: () => 0,
    ...stubs,
    URL,
    chrome,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    console,
  };

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__handleMessage = handleMessage;`, context, { filename: 'message-router.js' });
  return { handleMessage: context.__handleMessage };
}

async function run() {
  section('MSR-1 SWITCH_TO_STUDY 后应重评估当前活动 tab');
  {
    const checkCalls = [];
    const cfg = { mode: 'rest' };
    const session = { currentMode: 'rest' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        checkAndRemind: async (tabId, url, monitoringEnabled) => {
          checkCalls.push({ tabId, url, monitoringEnabled });
          return false;
        },
        getSyncState: () => ({ monitoringEnabled: 1 }),
      },
      {
        tabs: {
          query: async () => [{ id: 11, url: 'https://reddit.com' }],
          update: async () => {},
        },
      }
    );

    const res = await handleMessage({ type: 'SWITCH_TO_STUDY' }, {});
    expect('session currentMode updated', res.currentMode, 'study');
    expect('重评估 tabId', checkCalls[0]?.tabId, 11);
    expect('重评估 url', checkCalls[0]?.url, 'https://reddit.com');
  }

  section('MSR-2 reminder 活动页在允许时应立即 unblocked 到域名页');
  {
    let updated = null;
    const cfg = { mode: 'study' };
    const session = { currentMode: 'study' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        checkAndRemind: async () => false,
        getSyncState: () => ({ monitoringEnabled: 1 }),
      },
      {
        tabs: {
          query: async () => [{ id: 12, url: 'chrome-extension://ext-id/reminder.html?reason=study_mode&domain=example.com' }],
          update: async (id, payload) => { updated = { id, payload }; },
        },
      }
    );

    await handleMessage({ type: 'SWITCH_TO_REST' }, {});
    expect('应导航回原域名', updated, { id: 12, payload: { url: 'https://example.com' } });
  }

  section('MSR-3 reminder 活动页若仍应 blocked 不应执行 unblocked 跳转');
  {
    let updateCount = 0;
    const cfg = { mode: 'rest' };
    const session = { currentMode: 'rest' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        checkAndRemind: async () => true,
        getSyncState: () => ({ monitoringEnabled: 1 }),
      },
      {
        tabs: {
          query: async () => [{ id: 13, url: 'chrome-extension://ext-id/reminder.html?reason=study_mode&domain=bad.com' }],
          update: async () => { updateCount++; },
        },
      }
    );

    await handleMessage({ type: 'SWITCH_TO_STUDY' }, {});
    expectTrue('blocked 时不应做额外 update', updateCount === 0);
  }

  section('MSR-4 SWITCH_TO_STUDY closes PiP on non-study domains only');
  {
    const executed = [];
    const cfg = { mode: 'rest', studyList: ['study.example'] };
    const session = { currentMode: 'rest' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        checkAndRemind: async () => false,
        getSyncState: () => ({ monitoringEnabled: 1 }),
        extractDomain: (url) => new URL(url).hostname,
        matchDomain: (domain, pattern) => domain === pattern || domain.endsWith(`.${pattern}`),
      },
      {
        tabs: {
          query: async (query = {}) => query.active
            ? [{ id: 1, url: 'https://study.example/lesson' }]
            : [
                { id: 1, url: 'https://study.example/lesson' },
                { id: 2, url: 'https://video.example/watch' },
              ],
          update: async () => {},
        },
        scripting: {
          executeScript: async ({ target }) => {
            executed.push(target.tabId);
            return [{ result: true }];
          },
        },
      }
    );

    await handleMessage({ type: 'SWITCH_TO_STUDY' }, {});
    expect('只关闭非学习域名 PiP', executed, [2]);
  }

  const total = passed + failed;
  console.log(`\n[Message Router Mode Switch Re-eval] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
