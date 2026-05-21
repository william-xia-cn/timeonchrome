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
  const abs = path.join(__dirname, '..', '..', 'extension', 'message-router.js');
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

  const normalizeMode = (mode) => {
    if (mode === 'whitelist') return 'study';
    if (mode === 'blacklist') return 'rest';
    return ['study', 'rest', 'composite', 'locked', 'paused'].includes(mode) ? mode : 'study';
  };
  const statsMetaKeys = new Set(['audioSeconds', 'backgroundMediaByDomain', 'pipSeconds', 'pipByDomain', 'onlineSeconds', 'compositeSeconds', 'undeterminedSeconds']);
  const summarizeStats = (stats = {}, cfg = {}) => {
    let onlineSeconds = 0;
    for (const [key, value] of Object.entries(stats || {})) {
      if (statsMetaKeys.has(key)) continue;
      if (typeof value === 'number' && Number.isFinite(value)) onlineSeconds += value;
    }
    let compositeSeconds = Number(stats?.compositeSeconds);
    if (!Number.isFinite(compositeSeconds)) {
      const legacy = Number(stats?.undeterminedSeconds);
      compositeSeconds = Number.isFinite(legacy) ? legacy : 0;
    }
    if (!compositeSeconds) {
      for (const [domain, value] of Object.entries(stats || {})) {
        if (statsMetaKeys.has(domain)) continue;
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        if ((cfg.compositeList || []).some((pattern) => domain === pattern || domain.endsWith(`.${pattern}`))) {
          compositeSeconds += seconds;
        }
      }
    }
    return { ...stats, onlineSeconds, compositeSeconds, undeterminedSeconds: compositeSeconds };
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
    getTodayUsageView: async (options = {}) => {
      const cfg = options.config || (stubs.getConfig ? await stubs.getConfig() : {});
      const stats = stubs.getTodayStats ? await stubs.getTodayStats() : {};
      return { stats, statsWithSummary: summarizeStats(stats, cfg) };
    },
    getUsageRangeView: async (days = 7, options = {}) => {
      const cfg = options.config || (stubs.getConfig ? await stubs.getConfig() : {});
      const range = stubs.getStatsRange ? await stubs.getStatsRange(days) : {};
      const statsWithSummaryByDate = {};
      for (const [date, stats] of Object.entries(range || {})) {
        statsWithSummaryByDate[date] = summarizeStats(stats, cfg);
      }
      return { statsByDate: range, statsWithSummaryByDate };
    },
    getPopupModeStatsView: async () => ({
      summary: stubs.getPopupSettledModeStats
        ? await stubs.getPopupSettledModeStats()
        : { studySeconds: 0, restSeconds: 0, compositeSeconds: 0, onlineSeconds: 0, backgroundMediaSeconds: 0, pipSeconds: 0 },
    }),
    getSettlementAnalysisView: async () => ({ ok: true, segments: [], reconciliation: { rows: [], summary: {} } }),
    getMediaSettlementAnalysisView: async () => ({ ok: true, rows: [], summary: {} }),
    getModeEffectTrace: async (limit = 50) => [{ atMs: 123, result: { noticeRendered: true }, limit }],
    flushOpenSessionToStats: async () => ({ ok: true }),
    getTimingSession: async () => null,
    getCappedElapsedMs: () => 0,
    clearTabModeNotice: async () => false,
    sendModeSwitchSuccessNotice: async () => false,
    applyModeTransitionSideEffects: async () => ({ pipCloseAttempted: false, pipCloseSent: false, studyNoticeSent: false }),
    updateDeclarativeRules: async () => {},
    normalizeMode,
    commitModeChangeStub: async ({ toMode, effectiveAtMs = Date.now() } = {}) => {
      const session = stubs.getSession ? await stubs.getSession() : {};
      const config = stubs.getConfig ? await stubs.getConfig() : {};
      const fromMode = normalizeMode(session?.currentMode || config?.mode);
      const mode = normalizeMode(toMode);
      const changed = fromMode !== mode;
      return {
        ok: true,
        changed,
        fromMode,
        toMode: mode,
        mode,
        currentMode: mode,
        currentModeStartedAtMs: changed
          ? Number(effectiveAtMs)
          : (Number.isFinite(Number(session?.currentModeStartedAtMs)) ? Number(session.currentModeStartedAtMs) : null),
        session: {
          ...(session || {}),
          currentMode: mode,
          currentModeStartedAtMs: changed
            ? Number(effectiveAtMs)
            : session?.currentModeStartedAtMs,
        },
      };
    },
    handleModeEvent: async (event = {}) => {
      if (event.type === 'ACCESS_OBSERVED') {
        const blocked = typeof stubs.accessObserved === 'function'
          ? await stubs.accessObserved(event.tabId, event.url, 1, {
            foreground: event.foreground,
            source: event.source,
          })
          : false;
        return blocked
          ? { ok: true, access: 'reminder', reminder: { reason: 'test', params: {} } }
          : { ok: true, access: 'allow' };
      }
      if (event.type === 'EVALUATE_QUOTA_STATE') {
        const quota = typeof stubs.evaluateQuotaState === 'function'
          ? await stubs.evaluateQuotaState()
          : { ok: true, config: {}, newState: {} };
        const route = typeof stubs.evaluateQuotaModeTransition === 'function'
          ? stubs.evaluateQuotaModeTransition()
          : { kind: 'none', reason: 'quota_allows_current_mode' };
        return {
          ok: true,
          access: 'allow',
          quota,
          modeChange: route.kind === 'mode_change' ? {
            toMode: route.toMode,
            reason: route.reason,
            source: route.source || event.source || 'quota_alarm',
            effectiveAtMs: Date.now(),
            persistConfigMode: false,
          } : null,
          recheckActiveTab: true,
        };
      }
      const toMode = normalizeMode(event.requestedMode || event.toMode || event.mode);
      return {
        ok: true,
        access: 'allow',
        modeChange: {
          toMode,
          reason: event.reason || 'manual_mode_switch',
          source: event.source || 'runtime_message',
          effectiveAtMs: Number(event.nowMs) || Date.now(),
          persistConfigMode: true,
        },
        notice: { kind: 'manual_mode_change', targetMode: toMode, text: `已切换到${toMode}` },
        recheckActiveTab: true,
      };
    },
    executeModeDecision: async (decision = {}, execContext = {}) => {
      const modeChange = decision.modeChange
        ? await (stubs.commitModeChangeStub || (async ({ toMode, effectiveAtMs = Date.now() } = {}) => {
          const session = stubs.getSession ? await stubs.getSession() : {};
          const config = stubs.getConfig ? await stubs.getConfig() : {};
          const fromMode = normalizeMode(session?.currentMode || config?.mode);
          const mode = normalizeMode(toMode);
          return {
            ok: true,
            changed: fromMode !== mode,
            fromMode,
            toMode: mode,
            mode,
            currentMode: mode,
            currentModeStartedAtMs: Number(effectiveAtMs),
            session: { ...(session || {}), currentMode: mode, currentModeStartedAtMs: Number(effectiveAtMs) },
          };
        }))(decision.modeChange)
        : null;
      if (modeChange?.changed && typeof stubs.applyModeTransitionSideEffects === 'function') {
        await stubs.applyModeTransitionSideEffects({
          fromMode: modeChange.fromMode,
          toMode: modeChange.toMode,
          tabId: execContext.tabId ?? null,
          sendStudyNotice: false,
        });
      }
      if (decision.notice && Number.isInteger(execContext.tabId)) {
        if (typeof stubs.clearTabModeNotice === 'function') {
          await stubs.clearTabModeNotice(execContext.tabId, 'mode_changed');
        }
        if (typeof stubs.sendModeSwitchSuccessNotice === 'function') {
          await stubs.sendModeSwitchSuccessNotice(
            execContext.tabId,
            decision.notice.targetMode || modeChange?.toMode,
            modeChange?.fromMode || null,
            { noticeText: decision.notice.text, displayDuration: 4000 }
          );
        }
      }
      return {
        ok: decision.ok !== false,
        blocked: decision.access === 'reminder',
        decision,
        modeChange,
        noticeAttempted: Boolean(decision.notice),
        noticeTargetTabId: Number.isInteger(execContext.tabId) ? execContext.tabId : null,
        noticeSent: Boolean(decision.notice),
        noticeAck: decision.notice ? { ok: true, handled: true, rendered: true } : null,
        noticeRendered: Boolean(decision.notice),
        noticeError: null,
      };
    },
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
        accessObserved: async (tabId, url, monitoringEnabled) => {
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

  section('MSR-1b EVALUATE_QUOTA_STATE uses Mode Service and rechecks current tab');
  {
    const checkCalls = [];
    const modeRequests = [];
    const sideEffects = [];
    const cfg = { mode: 'rest', quotaState: { restLocked: true, studyLocked: false } };
    const session = { currentMode: 'rest', currentModeStartedAtMs: 100 };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        getSession: async () => session,
        getSyncState: () => ({ monitoringEnabled: 1 }),
        evaluateQuotaState: async () => ({
          ok: true,
          usage: {},
          oldState: {},
          newState: cfg.quotaState,
          stateChanged: true,
          newlyLockedDomains: [],
          config: cfg,
        }),
        evaluateQuotaModeTransition: () => ({
          kind: 'mode_change',
          toMode: 'study',
          reason: 'quota_rest_exhausted',
          source: 'quota_alarm',
        }),
        commitModeChangeStub: async (input) => {
          modeRequests.push(input);
          return {
            ok: true,
            changed: true,
            fromMode: 'rest',
            toMode: 'study',
            mode: 'study',
            currentMode: 'study',
            session: { currentMode: 'study' },
          };
        },
        applyModeTransitionSideEffects: async (input) => {
          sideEffects.push(input);
          return {};
        },
        accessObserved: async (tabId, url, monitoringEnabled, options) => {
          checkCalls.push({ tabId, url, monitoringEnabled, options });
          return false;
        },
      },
      {
        tabs: {
          query: async () => [{ id: 17, url: 'https://study.example' }],
          update: async () => {},
        },
      }
    );

    const res = await handleMessage({ type: 'EVALUATE_QUOTA_STATE', source: 'quota_alarm' }, {});
    expect('quota mode request target', modeRequests[0]?.toMode, 'study');
    expect('quota mode request reason', modeRequests[0]?.reason, 'quota_rest_exhausted');
    expect('quota side effects old/new', sideEffects.map((item) => ({ fromMode: item.fromMode, toMode: item.toMode })), [{ fromMode: 'rest', toMode: 'study' }]);
    expect('quota current tab recheck', checkCalls, [{
      tabId: 17,
      url: 'https://study.example',
      monitoringEnabled: 1,
      options: { foreground: true, source: 'quota_state_change' },
    }]);
    expectTrue('quota response reports mode change', res.modeChange?.changed === true);
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
        accessObserved: async () => false,
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
        accessObserved: async () => true,
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
        accessObserved: async () => false,
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
        accessObserved: async () => false,
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
    expect('notice diagnostics returned', {
      noticeAttempted: res.noticeAttempted,
      noticeTargetTabId: res.noticeTargetTabId,
      noticeSent: res.noticeSent,
      noticeRendered: res.noticeRendered,
      noticeError: res.noticeError,
    }, {
      noticeAttempted: true,
      noticeTargetTabId: 21,
      noticeSent: true,
      noticeRendered: true,
      noticeError: null,
    });
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
        accessObserved: async () => false,
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
    expect('study -> composite side effects called', sideEffects[0], { fromMode: 'study', toMode: 'composite', tabId: 22, sendStudyNotice: false });
  }

  section('MSR-6d GET_MODE_EFFECT_TRACE exposes recent notice diagnostics');
  {
    const { handleMessage } = loadHandleMessage({}, {
      tabs: { query: async () => [], update: async () => {} },
    });
    const res = await handleMessage({ type: 'GET_MODE_EFFECT_TRACE', limit: 5 }, {});
    expect('trace rows returned', { ok: res.ok, rendered: res.rows[0]?.result?.noticeRendered }, {
      ok: true,
      rendered: true,
    });
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
        accessObserved: async () => false,
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
    expect('rest -> composite side effect payload', sideEffects[0], { fromMode: 'rest', toMode: 'composite', tabId: 26, sendStudyNotice: false });
  }

  section('MSR-6c 手动 mode switch 通过 Mode Service 请求提交');
  {
    const modeRequests = [];
    const cfg = { mode: 'rest', compositeList: ['youtube.com'] };
    const session = { currentMode: 'rest' };

    const { handleMessage } = loadHandleMessage(
      {
        getConfig: async () => cfg,
        saveConfig: async () => {},
        updateDeclarativeRules: async () => {},
        getSession: async () => session,
        accessObserved: async () => false,
        getSyncState: () => ({ monitoringEnabled: 1 }),
        clearTabModeNotice: async () => true,
        sendModeSwitchSuccessNotice: async () => true,
        applyModeTransitionSideEffects: async () => ({ pipCloseAttempted: true, pipCloseSent: true, studyNoticeSent: false }),
        commitModeChangeStub: async (request) => {
          modeRequests.push(request);
          return {
            ok: true,
            changed: true,
            fromMode: 'rest',
            toMode: request.toMode,
            mode: request.toMode,
            currentMode: request.toMode,
            currentModeStartedAtMs: request.effectiveAtMs,
            session: {
              currentMode: request.toMode,
              currentModeStartedAtMs: request.effectiveAtMs,
            },
          };
        },
      },
      {
        tabs: {
          query: async () => [{ id: 27, url: 'https://youtube.com/watch' }],
          update: async () => {},
        },
      }
    );

    await handleMessage({ type: 'SWITCH_TO_COMPOSITE' }, {});
    expect('manual switch sends one mode service request', modeRequests.length, 1);
    expect('manual switch request shape', {
      toMode: modeRequests[0].toMode,
      reason: modeRequests[0].reason,
      source: modeRequests[0].source,
      persistConfigMode: modeRequests[0].persistConfigMode,
      hasBoundary: Number.isFinite(modeRequests[0].effectiveAtMs),
    }, {
      toMode: 'composite',
      reason: 'manual_mode_switch',
      source: 'runtime_message',
      persistConfigMode: true,
      hasBoundary: true,
    });
  }

  section('MSR-7 GET_SETTLED_TODAY_STATS is read-only and does not flush');
  {
    const flushCalls = [];
    const { handleMessage } = loadHandleMessage({
      getConfig: async () => ({ compositeList: ['video.example'] }),
      getTodayStats: async () => ({ 'video.example': 120 }),
      flushOpenSessionToStats: async (reason, options) => {
        flushCalls.push({ reason, options });
        return { ok: true };
      },
    });

    const res = await handleMessage({ type: 'GET_SETTLED_TODAY_STATS' }, {});
    expect('settled stats does not flush', flushCalls.length, 0);
    expect('settled stats keeps usage summary', res.compositeSeconds, 120);
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

  section('MSR-9 GET_POPUP_SETTLED_MODE_STATS is read-only and mode authoritative');
  {
    const flushCalls = [];
    const { handleMessage } = loadHandleMessage({
      getPopupSettledModeStats: async () => ({
        studySeconds: 120,
        restSeconds: 30,
        compositeSeconds: 60,
        onlineSeconds: 240,
        backgroundMediaSeconds: 10,
        pipSeconds: 30,
      }),
      flushOpenSessionToStats: async (reason, options) => {
        flushCalls.push({ reason, options });
        return { ok: true };
      },
    });

    const res = await handleMessage({ type: 'GET_POPUP_SETTLED_MODE_STATS' }, {});
    expect('popup mode stats does not flush', flushCalls.length, 0);
    expect('popup mode stats returns mode aggregate', res, {
      studySeconds: 120,
      restSeconds: 30,
      compositeSeconds: 60,
      onlineSeconds: 240,
      backgroundMediaSeconds: 10,
      pipSeconds: 30,
    });
  }

  section('MSR-9b cloud sync status includes media pending fields');
  {
    const cloudSyncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
    expectTrue('cloud sync imports media pending builders', cloudSyncSource.includes('getPendingMediaSegments') && cloudSyncSource.includes('buildMediaSegmentsUploadPayload'));
    expectTrue('cloud sync uploads media segments and media stats', cloudSyncSource.includes("'/device/media-segments/v1'") && cloudSyncSource.includes("'/device/media-stats/v1'"));
    expectTrue('cloud sync status exposes media pending counts', cloudSyncSource.includes('pendingMediaSegments') && cloudSyncSource.includes('pendingMediaStatsDates'));
    expectTrue('cloud sync records media upload timestamps', cloudSyncSource.includes('lastMediaSegmentUploadAt') && cloudSyncSource.includes('lastMediaStatsUploadAt'));
  }

  section('MSR-10 GET_STATS 返回 compositeSeconds 并兼容 legacy undeterminedSeconds');
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

  section('MSR-11 GET_STATS 优先使用 explicit compositeSeconds');
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

  section('MSR-12 popup lightweight runtime status skips usage summary');
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
