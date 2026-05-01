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

  section('IMT-2 Rest + composite => not immediate, then switch after 60s foreground dwell');
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
    const blocked1 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 0, foreground: true });
    const blocked2 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 59_000, foreground: true });
    const blocked3 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 60_000, foreground: true });
    expect('first call should not block', blocked1, false);
    expect('within gate should not block', blocked2, false);
    expect('after gate should not block', blocked3, false);
    expect('runtime mode switched to composite only once after gate', saves, ['composite']);
    expectTrue('pending START sent', sent.some((m) => m.type === 'AUTO_MODE_PENDING_START' && m.targetMode === 'composite' && typeof m.deadlineAt === 'number'));
    expectTrue('pending SUCCESS sent', sent.some((m) => m.type === 'AUTO_MODE_PENDING_SUCCESS' && m.targetMode === 'composite'));
    expectTrue('pending CANCEL sent at completion', sent.some((m) => m.type === 'AUTO_MODE_PENDING_CANCEL' && m.reason === 'completed'));
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
    await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 0, foreground: true });
    await checkAndRemind(1, 'https://news.example.com', 1, { nowMs: 30_000, foreground: true });
    await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 61_000, foreground: true });
    expect('interrupt should cancel old candidate', saves.length, 0);
    expectTrue('pending CANCEL on interrupt', sent.some((m) => m.type === 'AUTO_MODE_PENDING_CANCEL' && m.reason === 'candidate_changed'));
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
    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 0, userActive: true, foreground: true });
    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 89_000, userActive: true, foreground: true });
    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 90_000, userActive: true, foreground: true });
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
    await checkAndRemind(2, 'https://khanacademy.org', 1, { nowMs: 0, userActive: true, foreground: true });
    await checkAndRemind(2, 'https://khanacademy.org', 1, { nowMs: 90_000, userActive: true, foreground: true });
    expect('composite->study switches after 90s gate', saves, ['study']);
  }

  section('IMT-9 Rest + composite does not require keyboard/mouse activity');
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
    await checkAndRemind(3, 'https://youtube.com', 1, { nowMs: 0, foreground: true, userActive: false });
    await checkAndRemind(3, 'https://youtube.com', 1, { nowMs: 60_000, foreground: true, userActive: false });
    expect('switches to composite even without input activity', saves, ['composite']);
    expectTrue('pending success emitted without input activity', sent.some((m) => m.type === 'AUTO_MODE_PENDING_SUCCESS' && m.targetMode === 'composite'));
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
    await checkAndRemind(4, 'https://youtube.com', 1, { nowMs: 0, foreground: true, userActive: true });
    await checkAndRemind(4, 'https://youtube.com', 0, { nowMs: 61_000, foreground: true, userActive: true });
    await checkAndRemind(4, 'https://youtube.com', 1, { nowMs: 62_000, foreground: true, userActive: true });
    expect('monitoring off cancels candidate, no auto switch', saves.length, 0);
    expectTrue('pending cancel reason monitoring_off', sent.some((m) => m.type === 'AUTO_MODE_PENDING_CANCEL' && m.reason === 'monitoring_off'));
  }

  section('IMT-10b Rest + composite pending requires foreground dwell');
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
    await checkAndRemind(5, 'https://youtube.com', 1, { nowMs: 0, foreground: false });
    await checkAndRemind(5, 'https://youtube.com', 1, { nowMs: 60_000, foreground: false });
    expect('no foreground should not start composite candidate', saves.length, 0);
    expectTrue('no pending START when not foreground', !sent.some((m) => m.type === 'AUTO_MODE_PENDING_START'));
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
    const blocked = await checkAndRemind(9, 'https://youtube.com', 1, { nowMs: 0, foreground: true, userActive: true });
    expect('sendMessage failure should not block navigation', blocked, false);
    expectTrue('fallback notification emitted', notifications.length > 0);
  }

  section('IMT-12 Rest -> Study uses study copy payload without remainingCompositeTime');
  {
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async () => {},
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: () => 'khanacademy.org',
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async () => {}, sendMessage: async (_id, msg) => { sent.push(msg); } },
    });
    await checkAndRemind(10, 'https://khanacademy.org', 1, { nowMs: 0, userActive: true, foreground: true });
    await checkAndRemind(10, 'https://khanacademy.org', 1, { nowMs: 90_000, userActive: true, foreground: true });
    const start = sent.find((m) => m.type === 'AUTO_MODE_PENDING_START' && m.targetMode === 'study');
    const success = sent.find((m) => m.type === 'AUTO_MODE_PENDING_SUCCESS' && m.targetMode === 'study');
    expectTrue('study START exists', !!start);
    expectTrue('study SUCCESS exists', !!success);
    expect('study START remainingCompositeTime empty', start?.remainingCompositeTime || '', '');
    expect('study SUCCESS has no remainingCompositeTime', Object.prototype.hasOwnProperty.call(success || {}, 'remainingCompositeTime'), false);
  }

  section('IMT-13 Rest -> Study cancels on leave and re-entry restarts fresh 90s');
  {
    const saves = [];
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => saves.push(s.currentMode),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: (u) => new URL(u).hostname,
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async () => {}, sendMessage: async (_id, msg) => { sent.push(msg); } },
    });
    await checkAndRemind(11, 'https://khanacademy.org', 1, { nowMs: 0, userActive: true, foreground: true });
    await checkAndRemind(11, 'https://news.example.com', 1, { nowMs: 30_000, userActive: true, foreground: true });
    await checkAndRemind(11, 'https://khanacademy.org', 1, { nowMs: 31_000, userActive: true, foreground: true });
    await checkAndRemind(11, 'https://khanacademy.org', 1, { nowMs: 90_000, userActive: true, foreground: true });
    expect('should not switch from accumulated partial visits', saves.length, 0);
    await checkAndRemind(11, 'https://khanacademy.org', 1, { nowMs: 121_000, userActive: true, foreground: true });
    expect('should switch only after fresh continuous 90s', saves, ['study']);

    const studyStarts = sent.filter((m) => m.type === 'AUTO_MODE_PENDING_START' && m.targetMode === 'study');
    expectTrue('at least two study START messages', studyStarts.length >= 2);
    expect('first study deadlineAt', studyStarts[0]?.deadlineAt, 90_000);
    expect('re-entry study deadlineAt resets from re-entry timestamp', studyStarts[studyStarts.length - 1]?.deadlineAt, 121_000);
    expectTrue('leave triggers pending cancel', sent.some((m) => m.type === 'AUTO_MODE_PENDING_CANCEL' && m.reason === 'candidate_changed'));
  }

  section('IMT-14 Composite -> Study domain switch resets countdown');
  {
    const saves = [];
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'composite', studyList: ['khanacademy.org', 'coursera.org'] }),
      getSession: async () => ({ currentMode: 'composite' }),
      saveSession: async (s) => saves.push(s.currentMode),
      hasTemporaryCompositePermission: async () => false,
      matchDomain: (d, p) => d === p,
      extractDomain: (u) => new URL(u).hostname,
      isSpecialUrl: () => false,
    }, {
      tabs: { update: async () => {}, sendMessage: async (_id, msg) => { sent.push(msg); } },
    });
    await checkAndRemind(12, 'https://khanacademy.org', 1, { nowMs: 0, userActive: true, foreground: true });
    await checkAndRemind(12, 'https://coursera.org', 1, { nowMs: 40_000, userActive: true, foreground: true });
    await checkAndRemind(12, 'https://coursera.org', 1, { nowMs: 100_000, userActive: true, foreground: true });
    expect('no switch before fresh 90s on new study domain', saves.length, 0);
    await checkAndRemind(12, 'https://coursera.org', 1, { nowMs: 130_000, userActive: true, foreground: true });
    expect('switch after fresh 90s on new study domain', saves, ['study']);
    const studyStarts = sent.filter((m) => m.type === 'AUTO_MODE_PENDING_START' && m.targetMode === 'study');
    expectTrue('domain switch created a new study START', studyStarts.length >= 2);
    expect('first domain deadlineAt', studyStarts[0]?.deadlineAt, 90_000);
    expect('new domain deadlineAt reset', studyStarts[studyStarts.length - 1]?.deadlineAt, 130_000);
  }

  const total = passed + failed;
  console.log(`\n[Interceptor Mode Transition V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
