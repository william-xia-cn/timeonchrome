// interceptor-mode-transition-v0.test.js
// Run with: node tests/unit/interceptor-mode-transition-v0.test.js

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

function loadCheckAndRemind(stubs, chromeOverride = {}) {
  const abs = path.join(__dirname, '..', '..', 'product', 'interceptor.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const chrome = {
    runtime: {
      getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}`,
    },
    tabs: { update: async () => {} },
    notifications: { create: () => {} },
    declarativeNetRequest: {
      getDynamicRules: async () => [],
      updateDynamicRules: async () => {},
    },
    storage: { local: { get: async () => ({ cloud_monitoring_enabled: 1 }) } },
    ...chromeOverride,
  };

  const context = {
    URL,
    console,
    chrome,
    ...stubs,
  };

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__checkAndRemind = checkAndRemind;`, context, { filename: 'interceptor.js' });
  return { checkAndRemind: context.__checkAndRemind };
}

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    mode: 'study',
    studyList: ['khanacademy.org'],
    compositeList: ['youtube.com'],
    restrictedEntertainmentList: ['bilibili.com'],
    unsafeList: ['tiktok.com'],
    blacklist: [],
    schedule: { enabled: false, days: {} },
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    blockMessage: '',
    ...overrides,
  };
}

async function run() {
  section('IMT-1 Study + composite => to_composite_confirm');
  {
    const redirectedUrls = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'study' }),
      getSession: async () => ({ currentMode: 'study' }),
      saveSession: async () => {},
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async (_id, payload) => redirectedUrls.push(payload.url) },
    });
    const blocked = await checkAndRemind(1, 'https://youtube.com', 1);
    expect('should block', blocked, true);
    expectTrue('reason', redirectedUrls[0].includes('reason=to_composite_confirm'));
  }

  section('IMT-2 Rest + composite => auto composite, no block');
  {
    const saves = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => saves.push(s.currentMode),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
      redirectToReminder: async () => { throw new Error('should not redirect'); },
    });
    const blocked = await checkAndRemind(1, 'https://youtube.com', 1);
    expect('should not block', blocked, false);
    expect('runtime mode switched to composite', saves[0], 'composite');
  }

  section('IMT-3 Study + rest/unclassified => to_rest_slide_confirm');
  {
    const redirectedUrls = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'study' }),
      getSession: async () => ({ currentMode: 'study' }),
      saveSession: async () => {},
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'news.example.com',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async (_id, payload) => redirectedUrls.push(payload.url) },
    });
    const blocked = await checkAndRemind(1, 'https://news.example.com', 1);
    expect('should block', blocked, true);
    expectTrue('reason', redirectedUrls[0].includes('reason=to_rest_slide_confirm'));
  }

  section('IMT-4 Composite + rest/unclassified => to_rest_confirm');
  {
    const redirectedUrls = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'composite' }),
      getSession: async () => ({ currentMode: 'composite' }),
      saveSession: async () => {},
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'news.example.com',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async (_id, payload) => redirectedUrls.push(payload.url) },
    });
    const blocked = await checkAndRemind(1, 'https://news.example.com', 1);
    expect('should block', blocked, true);
    expectTrue('reason', redirectedUrls[0].includes('reason=to_rest_confirm'));
  }

  section('IMT-5 hardBlocked/unsafe priority');
  {
    const redirectedUrls = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'study', unsafeList: ['youtube.com'] }),
      getSession: async () => ({ currentMode: 'study' }),
      saveSession: async () => {},
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async (_id, payload) => redirectedUrls.push(payload.url) },
    });
    const blocked = await checkAndRemind(1, 'https://youtube.com', 1);
    expect('should block', blocked, true);
    expectTrue('reason', redirectedUrls[0].includes('reason=unsafe'));
  }

  section('IMT-6 paused priority when monitoring off');
  {
    let called = false;
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'study' }),
      getSession: async () => ({ currentMode: 'study' }),
      saveSession: async () => {},
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
      redirectToReminder: async () => { called = true; },
    });
    const blocked = await checkAndRemind(1, 'https://youtube.com', 0);
    expect('should not block', blocked, false);
    expectTrue('no redirect', !called);
  }

  const total = passed + failed;
  console.log(`\n[Interceptor Mode Transition V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
