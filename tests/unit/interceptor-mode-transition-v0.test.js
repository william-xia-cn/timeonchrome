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
    clearTimeout,
    chrome: {
      runtime: { getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}` },
      tabs: {
        get: async (tabId) => ({ id: tabId, url: 'https://example.com' }),
        sendMessage: async (tabId, payload) => {
          sentMessages.push({ tabId, payload });
          return { ok: true, handled: true, rendered: true, visible: true };
        },
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
    getEffectiveQuotaForDate: (cfg = {}) => ({
      todayEffectiveQuota: {
        studyMinutes: cfg.dailyStudyQuota === 0 ? null : (cfg.dailyStudyQuota ?? null),
        restMinutes: cfg.dailyRestQuota === 0 ? null : (cfg.dailyRestQuota ?? 120),
        compositeMinutes: cfg.dailyUndeterminedQuota === 0 ? null : (cfg.dailyUndeterminedQuota ?? 60),
        onlineMinutes: cfg.dailyOnlineQuota === 0 ? null : (cfg.dailyOnlineQuota ?? null),
        weeklyRestMinutes: cfg.weeklyRestQuota === 0 ? null : (cfg.weeklyRestQuota ?? ((cfg.dailyRestQuota ?? 120) * 7)),
      },
    }),
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
  deliverPendingNoticeForFocusedTab,
  markContentScriptReady,
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
  section('IMT-0 mode effects do not own PiP cleanup');
  {
    const interceptorAbs = path.join(__dirname, '..', '..', 'extension', 'product', 'interceptor.js');
    const source = fs.readFileSync(interceptorAbs, 'utf8');
    expectTrue('product interceptor does not import pip-policy', !source.includes('../core/pip-policy.js'));
    expectTrue('product interceptor does not call PiP cleanup helper', !source.includes('closeForbidden' + 'PictureInPicture'));
    expectTrue(
      'product interceptor does not expose PiP cleanup result fields',
      !source.includes('pipClose' + 'Attempted') && !source.includes('pipClose' + 'Sent')
    );
  }

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
    effects.markContentScriptReady(7, 'youtube.com');
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
        text: '你正在打开复合网站/待归类对象 · 即将进入复合模式 · 今日待归类剩余 1小时',
      },
    }, { tabId: 7, domain: 'youtube.com' });
    expect('commit payload', commits[0], {
      toMode: 'composite',
      reason: 'study_to_composite',
      source: 'auto_mode_route',
      effectiveAtMs: 1234,
      persistConfigMode: false,
      setRestExitGrace: false,
      clearRestExitGrace: false,
      auditId: null,
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
      noticeAck: { ok: true, handled: true, rendered: true, visible: true },
      noticeError: null,
    });
    expect('notice sent to tab', effects.sentMessages.map((m) => ({ tabId: m.tabId, type: m.payload.type, text: m.payload.noticeText })), [
      { tabId: 7, type: 'AUTO_MODE_PENDING_CANCEL', text: undefined },
      { tabId: 7, type: 'AUTO_MODE_PENDING_SUCCESS', text: '你正在打开复合网站/待归类对象 · 即将进入复合模式 · 今日待归类剩余 1小时' },
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
    }, { tabId: 9, domain: 'example.com', event: { url: 'https://example.com/path?a=1#private' } });
    expectTrue('blocked result', result.blocked === true && result.reminderSent === true);
    expectTrue('no mode commit', committed === false);
    expectTrue('reminder URL used', effects.tabUpdates[0]?.payload?.url?.includes('reason=study_mode'));
    expectTrue('reminder URL carries sanitized original targetUrl', effects.tabUpdates[0]?.payload?.url?.includes('targetUrl=https%3A%2F%2Fexample.com%2Fpath%3Fa%3D1'));
    expectTrue('reminder URL does not carry hash fragment', !effects.tabUpdates[0]?.payload?.url?.includes('private'));
  }

  section('IMT-2b reminder targetUrl only allows http/https');
  {
    const effects = loadEffects();
    await effects.executeModeDecision({
      ok: true,
      access: 'reminder',
      reminder: { reason: 'study_mode', params: {} },
    }, { tabId: 10, domain: 'extension-page.chrome-local', event: { url: 'chrome-extension://ext-id/admin/admin.html' } });
    expectTrue('special URL is not forwarded as targetUrl', !effects.tabUpdates[0]?.payload?.url?.includes('targetUrl='));
  }

  section('IMT-3 rendered success notice is one-shot and not replayed after ready');
  {
    let listenerReady = false;
    const sent = [];
    const effects = loadEffects({
      chrome: {
        runtime: { getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}` },
        tabs: {
          get: async (tabId) => ({ id: tabId, url: 'https://example.com' }),
          sendMessage: async (tabId, payload) => {
            if (!listenerReady) throw new Error('Could not establish connection. Receiving end does not exist.');
            sent.push({ tabId, payload });
            return { ok: true, handled: true, rendered: true, visible: true };
          },
          update: async () => {},
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
    const queued = await effects.sendModeSwitchSuccessNotice(11, 'study', 'composite', {
      domain: 'example.com',
      noticeText: '你正在打开学习网站 · 即将进入学习模式 · 今日剩余 不限',
      displayDuration: 4000,
    });
    expectTrue('notice queued before content ready', queued === false);
    listenerReady = true;
    effects.markContentScriptReady(11, 'example.com');
    const resent = await effects.reSendPendingNotice(11, 'example.com');
    expectTrue('resent notice', resent === true);
    expect('one success send after ready', sent.filter((m) => m.payload.type === 'AUTO_MODE_PENDING_SUCCESS').length, 1);
    const replayed = await effects.reSendPendingNotice(11, 'example.com');
    expectTrue('rendered notice is cleared and cannot replay', replayed === false);
    expect('still only one success send', sent.filter((m) => m.payload.type === 'AUTO_MODE_PENDING_SUCCESS').length, 1);
  }

  section('IMT-4 missing content listener queues pending notice until foreground recovery');
  {
    let listenerReady = false;
    const sent = [];
    const effects = loadEffects({
      chrome: {
        runtime: { getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}` },
        tabs: {
          get: async (tabId) => ({ id: tabId, url: 'https://example.com' }),
          sendMessage: async (tabId, payload) => {
            if (!listenerReady) throw new Error('Could not establish connection. Receiving end does not exist.');
            sent.push({ tabId, payload });
            return { ok: true, handled: true, rendered: true, visible: true };
          },
          update: async () => {},
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
    expectTrue('notice deferred before content ready', result === false);
    expectTrue('no send before content ready', sent.length === 0);
    listenerReady = true;
    const delivery = await effects.deliverPendingNoticeForFocusedTab(31, 'tabActivated');
    expectTrue('notice succeeds on foreground recovery', delivery.ok === true && delivery.source === 'tabActivated');
    expectTrue('sent once after foreground recovery', sent.length === 1);
    const replayed = await effects.deliverPendingNoticeForFocusedTab(31, 'tabActivated');
    expectTrue('foreground recovery does not replay rendered notice', replayed.ok === false);
    expectTrue('still sent once after foreground recovery', sent.length === 1);
  }

  section('IMT-5 invisible success ack keeps pending until visible retry');
  {
    const sent = [];
    let visible = false;
    const effects = loadEffects({
      chrome: {
        runtime: { getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}` },
        tabs: {
          get: async (tabId) => ({ id: tabId, url: 'https://example.com' }),
          sendMessage: async (tabId, payload) => {
            sent.push({ tabId, payload, visible });
            return visible
              ? { ok: true, handled: true, rendered: true, visible: true }
              : { ok: false, handled: true, rendered: false, visible: false, reason: 'document_not_visible' };
          },
          update: async () => {},
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
    effects.markContentScriptReady(41, 'example.com');
    const first = await effects.sendModeSwitchSuccessNotice(41, 'study', 'rest', {
      domain: 'example.com',
      noticeText: '你正在打开学习网站 · 即将进入学习模式 · 今日剩余 不限',
    });
    expectTrue('invisible ack does not complete delivery', first === false);
    expectTrue('first invisible send attempted', sent.length === 1);
    visible = true;
    const recovered = await effects.deliverPendingNoticeForFocusedTab(41, 'tabActivated_delayed');
    expectTrue('visible retry succeeds', recovered.ok === true && recovered.visible === true);
    expectTrue('second send recovers pending notice', sent.length === 2);
    const replayed = await effects.deliverPendingNoticeForFocusedTab(41, 'tabActivated_delayed');
    expectTrue('visible success clears pending', replayed.ok === false);
    expectTrue('no third send after visible success', sent.length === 2);
  }

  section('IMT-6 content ready is top-frame only');
  {
    const contentAbs = path.join(__dirname, '..', '..', 'extension', 'content.js');
    const backgroundAbs = path.join(__dirname, '..', '..', 'extension', 'background.js');
    const contentSource = fs.readFileSync(contentAbs, 'utf8');
    const backgroundSource = fs.readFileSync(backgroundAbs, 'utf8');
    expectTrue('content ready send is guarded by top-frame UI capability', contentSource.includes('if (!canRenderTopFrameUi) return;') && contentSource.includes("type: 'CONTENT_SCRIPT_READY'"));
    expectTrue('content ready sends visible lifecycle reasons', contentSource.includes("notifyContentScriptReady('visibilitychange')") && contentSource.includes("notifyContentScriptReady('pageshow')") && contentSource.includes("notifyContentScriptReady('window_focus')"));
    expectTrue('background ignores non-top-frame content ready', backgroundSource.includes("reason: 'non_top_frame'") && backgroundSource.includes('frameId !== 0'));
    expectTrue('background schedules delayed pending retry', backgroundSource.includes('deliverPendingModeNoticeForTabWithDelayedRetry') && backgroundSource.includes('250'));
  }

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} interceptor/mode effects tests passed`);
})();
