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
    tabs: { update: async () => {}, sendMessage: async () => {} },
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
    getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 0 }),
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

  section('IMT-2 Rest + composite => not immediate, then switch after 60s');
  {
    const saves = [];
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => saves.push(s.currentMode),
      getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 120 }),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
      redirectToReminder: async () => { throw new Error('should not redirect'); },
    }, {
      tabs: { update: async () => {}, sendMessage: async (_id, msg) => { sent.push(msg); } },
    });
    const blocked1 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 0, userActive: true });
    const blocked2 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 59_000, userActive: true });
    const blocked3 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 60_000, userActive: true });
    expect('first call should not block', blocked1, false);
    expect('within gate should not block', blocked2, false);
    expect('after gate should not block', blocked3, false);
    expect('runtime mode switched to composite only once after gate', saves, ['composite']);
    expectTrue('pending START sent', sent.some((m) => m.type === 'REST_COMPOSITE_PENDING_START' && typeof m.deadlineAt === 'number'));
    expectTrue('pending SUCCESS sent', sent.some((m) => m.type === 'REST_COMPOSITE_PENDING_SUCCESS'));
    expectTrue('pending CANCEL sent at completion', sent.some((m) => m.type === 'REST_COMPOSITE_PENDING_CANCEL' && m.reason === 'completed'));
  }

  section('IMT-2b Rest + composite gate cancels on interrupting domain switch');
  {
    const saves = [];
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => saves.push(s.currentMode),
      getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 0 }),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: (u) => new URL(u).hostname,
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async () => {}, sendMessage: async (_id, msg) => { sent.push(msg); } },
    });
    await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 0, userActive: true });
    await checkAndRemind(1, 'https://news.example.com', 1, { nowMs: 30_000, userActive: true });
    await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 61_000, userActive: true });
    expect('interrupt should cancel old candidate', saves.length, 0);
    expectTrue('pending CANCEL on interrupt', sent.some((m) => m.type === 'REST_COMPOSITE_PENDING_CANCEL' && m.reason === 'candidate_changed'));
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

  section('IMT-7 Rest + study => not immediate, then switch after 90s');
  {
    const saves = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => saves.push(s.currentMode),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'khanacademy.org',
      isSpecialUrl: () => false,
    });
    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 0, userActive: true });
    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 89_000, userActive: true });
    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 90_000, userActive: true });
    expect('rest->study switches only after 90s gate', saves, ['study']);
  }

  section('IMT-8 Composite + study => not immediate, then switch after 90s');
  {
    const saves = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'composite' }),
      getSession: async () => ({ currentMode: 'composite' }),
      saveSession: async (s) => saves.push(s.currentMode),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'khanacademy.org',
      isSpecialUrl: () => false,
    });
    await checkAndRemind(2, 'https://khanacademy.org', 1, { nowMs: 0, userActive: true });
    await checkAndRemind(2, 'https://khanacademy.org', 1, { nowMs: 90_000, userActive: true });
    expect('composite->study switches after 90s gate', saves, ['study']);
  }

  section('IMT-9 idle/no-activity prevents auto switch');
  {
    const saves = [];
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => saves.push(s.currentMode),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async () => {}, sendMessage: async (_id, msg) => { sent.push(msg); } },
    });
    await checkAndRemind(3, 'https://youtube.com', 1, { nowMs: 0, userActive: true });
    await checkAndRemind(3, 'https://youtube.com', 1, { nowMs: 60_000, userActive: false });
    await checkAndRemind(3, 'https://youtube.com', 1, { nowMs: 120_000, userActive: true });
    expect('idle call should clear candidate and avoid switch', saves.length, 0);
    expectTrue('pending cancel reason inactive', sent.some((m) => m.type === 'REST_COMPOSITE_PENDING_CANCEL' && m.reason === 'inactive'));
  }

  section('IMT-10 monitoring off prevents auto switch');
  {
    const saves = [];
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => saves.push(s.currentMode),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async () => {}, sendMessage: async (_id, msg) => { sent.push(msg); } },
    });
    await checkAndRemind(4, 'https://youtube.com', 1, { nowMs: 0, userActive: true });
    await checkAndRemind(4, 'https://youtube.com', 0, { nowMs: 61_000, userActive: true });
    await checkAndRemind(4, 'https://youtube.com', 1, { nowMs: 62_000, userActive: true });
    expect('monitoring off cancels candidate, no auto switch', saves.length, 0);
    expectTrue('pending cancel reason monitoring_off', sent.some((m) => m.type === 'REST_COMPOSITE_PENDING_CANCEL' && m.reason === 'monitoring_off'));
  }

  section('IMT-11 sendMessage failure should fallback without throw');
  {
    const notifications = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async () => {},
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'youtube.com',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async () => {}, sendMessage: async () => { throw new Error('blocked'); } },
      notifications: { create: (payload) => notifications.push(payload) },
    });
    const blocked = await checkAndRemind(9, 'https://youtube.com', 1, { nowMs: 0, userActive: true });
    expect('sendMessage failure should not block navigation', blocked, false);
    expectTrue('fallback notification emitted', notifications.length > 0);
  }

  const total = passed + failed;
  console.log(`\n[Interceptor Mode Transition V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
