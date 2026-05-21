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

function loadEffects(stubs = {}) {
  const interceptorAbs = path.join(__dirname, '..', '..', 'extension', 'product', 'interceptor.js');
  const effectsAbs = path.join(__dirname, '..', '..', 'extension', 'product', 'mode-effects.js');
  let interceptorCode = fs.readFileSync(interceptorAbs, 'utf8');
  let effectsCode = fs.readFileSync(effectsAbs, 'utf8');
  for (const transform of [
    (code) => code.replace(/^\s*import[\s\S]*?;\s*$/gm, ''),
    (code) => code.replace(/export\s+async\s+function\s+/g, 'async function '),
    (code) => code.replace(/export\s+function\s+/g, 'function '),
    (code) => code.replace(/export\s+const\s+/g, 'const '),
    (code) => code.replace(/export\s*\{[^}]*\};?\s*$/gm, ''),
  ]) {
    interceptorCode = transform(interceptorCode);
    effectsCode = transform(effectsCode);
  }

  const sentMessages = [];
  const tabUpdates = [];
  const storageState = {};
  const context = {
    URL,
    console,
    setTimeout,
    chrome: {
      runtime: { getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}` },
      scripting: { executeScript: async () => [] },
      tabs: {
        get: async (tabId) => ({ id: tabId, url: 'https://example.com' }),
        sendMessage: async (tabId, payload) => { sentMessages.push({ tabId, payload }); return true; },
        update: async (tabId, payload) => { tabUpdates.push({ tabId, payload }); },
      },
      notifications: { create: () => {} },
      declarativeNetRequest: {
        getDynamicRules: async () => [],
        updateDynamicRules: async () => {},
      },
      storage: {
        local: {
          get: async (key) => {
            if (typeof key === 'string') return { [key]: storageState[key] };
            if (Array.isArray(key)) return Object.fromEntries(key.map((k) => [k, storageState[k]]));
            return { cloud_monitoring_enabled: 1, ...storageState };
          },
          set: async (patch) => { Object.assign(storageState, patch || {}); },
        },
      },
    },
    getConfig: async () => ({ mode: 'study', quotaState: {}, blockMessage: '' }),
    getSession: async () => ({ currentMode: 'study', currentModeStartedAtMs: 1000 }),
    clearTemporaryCompositeDomains: async () => {},
    getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 0, restSeconds: 0 }),
    getTodayEffectiveRestLimit: () => 120,
    shouldEnforcePictureInPicturePolicy: () => true,
    closeForbiddenPictureInPicture: async () => ({ ok: true, handled: true }),
    logClientEventBestEffort: () => {},
    normalizeMode: (mode) => ['study', 'composite', 'rest', 'locked', 'paused'].includes(mode) ? mode : 'study',
    commitModeChange: async ({ toMode, reason, source, effectiveAtMs }) => ({
      ok: true,
      changed: true,
      fromMode: 'study',
      toMode,
      reason,
      source,
      currentMode: toMode,
      currentModeStartedAtMs: effectiveAtMs,
      session: { currentMode: toMode, currentModeStartedAtMs: effectiveAtMs },
    }),
    saveConfig: async () => {},
    ...stubs,
    __sentMessages: sentMessages,
    __tabUpdates: tabUpdates,
    __storageState: storageState,
  };

  vm.createContext(context);
  vm.runInContext(interceptorCode, context, { filename: 'interceptor.js' });
  vm.runInContext(`${effectsCode}
this.__exports = {
  executeModeDecision,
  sendModeSwitchSuccessNotice,
  reSendPendingNotice,
  redirectToReminder,
};`, context, { filename: 'mode-effects.js' });
  return {
    ...context.__exports,
    sentMessages,
    tabUpdates,
    storageState,
  };
}

(async function run() {
  section('IMT-1 executeModeDecision commits mode change and sends decision notice');
  {
    const commits = [];
    const effects = loadEffects({
      commitModeChange: async (payload) => {
        commits.push(payload);
        return {
          ok: true,
          changed: true,
          fromMode: 'study',
          toMode: payload.toMode,
          currentMode: payload.toMode,
          session: { currentMode: payload.toMode },
        };
      },
    });
    const result = await effects.executeModeDecision({
      ok: true,
      access: 'allow',
      modeChange: {
        toMode: 'composite',
        reason: 'study_to_composite',
        source: 'auto_mode_route',
        effectiveAtMs: 1234,
        persistConfigMode: false,
      },
      notice: {
        kind: 'study_to_composite',
        targetMode: 'composite',
        text: '你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 1小时',
      },
    }, { tabId: 7, domain: 'youtube.com' });
    expect('commit payload', commits[0], {
      toMode: 'composite',
      reason: 'study_to_composite',
      source: 'auto_mode_route',
      effectiveAtMs: 1234,
      persistConfigMode: false,
      config: { mode: 'study', quotaState: {}, blockMessage: '' },
      session: { currentMode: 'study', currentModeStartedAtMs: 1000 },
      drainModeBoundary: commits[0].drainModeBoundary,
    });
    expectTrue('mode change returned', result.modeChange?.toMode === 'composite');
    expect('notice ACK result', {
      noticeAttempted: result.noticeAttempted,
      noticeSent: result.noticeSent,
      noticeRendered: result.noticeRendered,
      noticeAck: result.noticeAck,
      noticeError: result.noticeError,
    }, {
      noticeAttempted: true,
      noticeSent: true,
      noticeRendered: true,
      noticeAck: true,
      noticeError: null,
    });
    expect('notice sent to tab', effects.sentMessages.map((m) => ({ tabId: m.tabId, type: m.payload.type, text: m.payload.noticeText })), [
      { tabId: 7, type: 'AUTO_MODE_PENDING_CANCEL', text: undefined },
      { tabId: 7, type: 'AUTO_MODE_PENDING_SUCCESS', text: '你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 1小时' },
    ]);
    expectTrue('mode effect trace stores rendered notice', effects.storageState.mode_effect_trace_v1?.[0]?.result?.noticeRendered === true);
  }

  section('IMT-1b executeModeDecision reports missing notice target');
  {
    const effects = loadEffects();
    const result = await effects.executeModeDecision({
      ok: true,
      access: 'allow',
      notice: {
        kind: 'manual_mode_change',
        targetMode: 'study',
        text: '已回到学习模式',
      },
    }, {});
    expectTrue('notice was attempted', result.noticeAttempted === true);
    expect('missing target reported', {
      noticeTargetTabId: result.noticeTargetTabId,
      noticeSent: result.noticeSent,
      noticeError: result.noticeError,
    }, {
      noticeTargetTabId: null,
      noticeSent: false,
      noticeError: 'notice_target_missing',
    });
  }

  section('IMT-2 reminder decision redirects without committing mode');
  {
    let committed = false;
    const effects = loadEffects({
      commitModeChange: async () => { committed = true; },
    });
    const result = await effects.executeModeDecision({
      ok: true,
      access: 'reminder',
      reminder: { reason: 'study_mode', params: { originMode: 'study' } },
    }, { tabId: 9, domain: 'example.com' });
    expectTrue('blocked result', result.blocked === true && result.reminderSent === true);
    expectTrue('no mode commit', committed === false);
    expectTrue('reminder URL used', effects.tabUpdates[0]?.payload?.url?.includes('reason=study_mode'));
  }

  section('IMT-3 pending success notice can be resent after content script ready');
  {
    const effects = loadEffects();
    await effects.sendModeSwitchSuccessNotice(11, 'study', 'composite', {
      domain: 'example.com',
      noticeText: '你正在打开学习网站 · 即将进入学习模式 · 今日剩余 不限',
      displayDuration: 4000,
    });
    const resent = await effects.reSendPendingNotice(11, 'example.com');
    expectTrue('resent notice', resent === true);
    expect('two success sends', effects.sentMessages.filter((m) => m.payload.type === 'AUTO_MODE_PENDING_SUCCESS').length, 2);
  }

  section('IMT-4 missing content listener triggers programmatic content injection');
  {
    const sent = [];
    const injections = [];
    const effects = loadEffects({
      chrome: {
        runtime: { getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}` },
        tabs: {
          get: async (tabId) => ({ id: tabId, url: 'https://example.com' }),
          sendMessage: async (tabId, payload) => {
            sent.push({ tabId, payload });
            if (sent.length === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
            return { ok: true, handled: true, rendered: true };
          },
          update: async () => {},
        },
        scripting: {
          executeScript: async (payload) => { injections.push(payload); return []; },
        },
        notifications: { create: () => {} },
        declarativeNetRequest: {
          getDynamicRules: async () => [],
          updateDynamicRules: async () => {},
        },
        storage: {
          local: {
            get: async () => ({}),
            set: async () => {},
          },
        },
      },
    });
    const result = await effects.sendModeSwitchSuccessNotice(31, 'study', 'rest', {
      domain: 'example.com',
      noticeText: '你正在打开学习网站 · 即将进入学习模式 · 今日剩余 不限',
    });
    expectTrue('notice succeeds after injection retry', result === true);
    expectTrue('content script injected once', injections.length === 1);
    expect('injection target', injections[0]?.target, { tabId: 31, allFrames: true });
  }

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} interceptor/mode effects tests passed`);
})();
