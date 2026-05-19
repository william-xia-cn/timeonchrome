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
    getTodayStats: async () => ({}),
    getStatsRange: async () => ({}),
    flushOpenSessionToStats: async () => ({ ok: true }),
    getTimingSession: async () => null,
    getCappedElapsedMs: () => 0,
    clearTabModeNotice: async () => false,
    sendModeSwitchSuccessNotice: async () => false,
    applyModeTransitionSideEffects: async () => ({ pipCloseAttempted: false, pipCloseSent: false, studyNoticeSent: false }),
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

  section('MSR-4 SWITCH_TO_STUDY triggers unified side effects on active tab');
  {
    const sideEffects = [];
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
        applyModeTransitionSideEffects: async (payload) => {
          sideEffects.push(payload);
          return { pipCloseAttempted: true, pipCloseSent: true, studyNoticeSent: false };
        },
      },
      {
        tabs: {
          query: async () => [{ id: 1, url: 'https://study.example/lesson' }],
          update: async () => {},
        },
      }
    );

    await handleMessage({ type: 'SWITCH_TO_STUDY' }, {});
    expect('side effects called once', sideEffects.length, 1);
    expect('study side effect target', sideEffects[0], {
      fromMode: 'rest',
      toMode: 'study',
      tabId: 1,
      sendStudyNotice: false,
    });
  }

  section('MSR-5 手动 SWITCH_TO_STUDY 清旧提示并发送短暂成功提示');
  {
    const notices = [];
    const cfg = { mode: 'composite', studyList: ['study.example'] };
    const session = { currentMode: 'composite' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        checkAndRemind: async () => false,
        getSyncState: () => ({ monitoringEnabled: 1 }),
        clearTabModeNotice: async (tabId, reason) => { notices.push({ type: 'clear', tabId, reason }); return true; },
        sendModeSwitchSuccessNotice: async (tabId, targetMode, fromMode, options) => {
          notices.push({ type: 'success', tabId, targetMode, fromMode, options });
          return true;
        },
      },
      {
        tabs: {
          query: async (query = {}) => query.active
            ? [{ id: 21, url: 'https://study.example/lesson' }]
            : [{ id: 21, url: 'https://study.example/lesson' }],
          update: async () => {},
        },
      }
    );

    const res = await handleMessage({ type: 'SWITCH_TO_STUDY' }, {});
    expect('session currentMode study', res.currentMode, 'study');
    expect('先清理旧提示', notices[0], { type: 'clear', tabId: 21, reason: 'mode_changed' });
    expect('再发送 study success notice', notices[1]?.targetMode, 'study');
    expect('success notice from composite', notices[1]?.fromMode, 'composite');
    expect('success notice TTL 4s', notices[1]?.options?.displayDuration, 4000);
  }

  section('MSR-6 手动 SWITCH_TO_COMPOSITE 清旧提示并发送短暂成功提示');
  {
    const notices = [];
    const sideEffects = [];
    const cfg = { mode: 'study', compositeList: ['youtube.com'] };
    const session = { currentMode: 'study' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        checkAndRemind: async () => false,
        getSyncState: () => ({ monitoringEnabled: 1 }),
        clearTabModeNotice: async (tabId, reason) => { notices.push({ type: 'clear', tabId, reason }); return true; },
        applyModeTransitionSideEffects: async (payload) => { sideEffects.push(payload); return { pipCloseAttempted: false, pipCloseSent: false, studyNoticeSent: false }; },
        sendModeSwitchSuccessNotice: async (tabId, targetMode, fromMode, options) => {
          notices.push({ type: 'success', tabId, targetMode, fromMode, options });
          return true;
        },
      },
      {
        tabs: {
          query: async (query = {}) => query.active
            ? [{ id: 22, url: 'https://youtube.com/watch' }]
            : [{ id: 22, url: 'https://youtube.com/watch' }],
          update: async () => {},
        },
      }
    );

    const res = await handleMessage({ type: 'SWITCH_TO_COMPOSITE' }, {});
    expect('session currentMode composite', res.currentMode, 'composite');
    expect('先清理旧提示', notices[0], { type: 'clear', tabId: 22, reason: 'mode_changed' });
    expect('再发送 composite success notice', notices[1]?.targetMode, 'composite');
    expect('success notice from study', notices[1]?.fromMode, 'study');
    expect('success notice TTL 4s', notices[1]?.options?.displayDuration, 4000);
    expect('study -> composite side effects called', sideEffects[0], { fromMode: 'study', toMode: 'composite', tabId: 22 });
  }

  section('MSR-6b 手动 Rest -> Composite 必须触发 PiP cleanup side effect');
  {
    const sideEffects = [];
    const cfg = { mode: 'rest', compositeList: ['youtube.com'] };
    const session = { currentMode: 'rest' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        checkAndRemind: async () => false,
        getSyncState: () => ({ monitoringEnabled: 1 }),
        clearTabModeNotice: async () => true,
        sendModeSwitchSuccessNotice: async () => true,
        applyModeTransitionSideEffects: async (payload) => { sideEffects.push(payload); return { pipCloseAttempted: true, pipCloseSent: true, studyNoticeSent: false }; },
      },
      {
        tabs: {
          query: async () => [{ id: 26, url: 'https://youtube.com/watch' }],
          update: async () => {},
        },
      }
    );

    const res = await handleMessage({ type: 'SWITCH_TO_COMPOSITE' }, {});
    expect('session currentMode composite', res.currentMode, 'composite');
    expect('rest -> composite side effect payload', sideEffects[0], { fromMode: 'rest', toMode: 'composite', tabId: 26 });
  }

  section('MSR-7 GET_STATS from popup uses popup_open foreground settlement');
  {
    const flushCalls = [];
    const { handleMessage } = loadHandleMessage({
      getConfig: async () => ({}),
      getTodayStats: async () => ({}),
      flushOpenSessionToStats: async (reason, options) => {
        flushCalls.push({ reason, options });
        return { ok: true };
      },
    });

    await handleMessage({ type: 'GET_STATS', source: 'popup' }, {});
    expect('popup GET_STATS flush reason', flushCalls[0]?.reason, 'popup_open');
    expect('popup GET_STATS allows foreground', flushCalls[0]?.options?.allowForeground, true);
  }

  section('MSR-8 regular GET_STATS keeps ui_flush behavior');
  {
    const flushCalls = [];
    const { handleMessage } = loadHandleMessage({
      getConfig: async () => ({}),
      getTodayStats: async () => ({}),
      flushOpenSessionToStats: async (reason, options) => {
        flushCalls.push({ reason, options });
        return { ok: true };
      },
    });

    await handleMessage({ type: 'GET_STATS' }, {});
    expect('regular GET_STATS flush reason', flushCalls[0]?.reason, 'ui_flush');
    expect('regular GET_STATS has no foreground override', flushCalls[0]?.options, undefined);
  }

  section('MSR-9 GET_STATS 返回 compositeSeconds 并兼容 legacy undeterminedSeconds');
  {
    const { handleMessage } = loadHandleMessage({
      getConfig: async () => ({ compositeList: ['video.example'] }),
      getTodayStats: async () => ({
        'video.example': 120,
        'other.example': 60,
        audioSeconds: 0,
        backgroundMediaByDomain: {},
        pipSeconds: 0,
        pipByDomain: {},
      }),
    });

    const res = await handleMessage({ type: 'GET_STATS' }, {});
    expect('compositeSeconds from compositeList', res.compositeSeconds, 120);
    expect('legacy undeterminedSeconds alias mirrors composite', res.undeterminedSeconds, 120);
    expect('onlineSeconds excludes summary aliases', res.onlineSeconds, 180);
  }

  section('MSR-10 GET_STATS 优先使用 explicit compositeSeconds');
  {
    const { handleMessage } = loadHandleMessage({
      getConfig: async () => ({ compositeList: ['video.example'] }),
      getTodayStats: async () => ({
        'video.example': 120,
        compositeSeconds: 90,
        undeterminedSeconds: 30,
      }),
    });

    const res = await handleMessage({ type: 'GET_STATS' }, {});
    expect('explicit compositeSeconds wins', res.compositeSeconds, 90);
    expect('legacy alias follows explicit composite', res.undeterminedSeconds, 90);
    expect('onlineSeconds excludes explicit composite alias', res.onlineSeconds, 120);
  }

  section('MSR-11 popup lightweight runtime status skips usage summary');
  {
    let analyticsCalls = 0;
    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => ({ mode: 'composite', dailyRestQuota: 120, dailyUndeterminedQuota: 60 }),
        getSession: async () => ({ currentMode: 'composite' }),
        getTodayStatsWithCategories: async () => {
          analyticsCalls += 1;
          return { restSeconds: 10, compositeSeconds: 20 };
        },
        getTimingSession: async () => ({ state: 'ACTIVE', domain: 'active.example', startTime: 1000 }),
        getCappedElapsedMs: () => 5000,
        getSyncState: () => ({ monitoringEnabled: 1 }),
      },
      {
        tabs: {
          query: async () => [{ id: 3, url: 'https://active.example/path' }],
          update: async () => {},
        },
      }
    );

    const res = await handleMessage({ type: 'GET_RUNTIME_MODE_STATUS', includeUsageSummary: false }, {});
    expect('lightweight mode', res.mode, 'composite');
    expect('lightweight domain', res.currentDomain, 'active.example');
    expect('lightweight duration', res.currentSessionDurationSeconds, 5);
    expect('lightweight composite remaining omitted', res.compositeRemainingSeconds, null);
    expect('lightweight rest remaining omitted', res.restRemainingSeconds, null);
    expect('usage summary skipped', analyticsCalls, 0);
  }

  const total = passed + failed;
  console.log(`\n[Message Router Mode Switch Re-eval] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
