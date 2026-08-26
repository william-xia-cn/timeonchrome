// mode-routing-matrix-v0.test.js
// Run with: node tests/unit/mode-routing-matrix-v0.test.js

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

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    mode: 'study',
    studyList: ['khanacademy.org'],
    compositeList: ['youtube.com'],
    restrictedEntertainmentList: ['bilibili.com'],
    unsafeList: ['tiktok.com'],
    blacklist: [],
    dailyUndeterminedQuota: 60,
    dailyRestQuota: 120,
    schedule: { enabled: false, days: {} },
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    blockMessage: '',
    ...overrides,
  };
}

function loadModeService(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'product', 'mode-service.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const context = {
    URL,
    console,
    Date,
    getConfig: async () => makeConfig(),
    getSession: async () => ({}),
    saveConfig: async () => {},
    saveSession: async () => {},
    extractDomain: (url) => {
      try { return new URL(url).hostname; } catch { return null; }
    },
    isSpecialUrl: (url) => /^(chrome|about|file|data|blob):/.test(String(url || '')),
    hasTemporaryCompositePermission: async () => false,
    getSiteClassificationRequestRecords: async () => [],
    recordUnclassifiedSiteAccess: async (input, context = {}) => ({
      ok: true,
      added: true,
      request: {
        id: 'auto-request',
        status: 'pending',
        requestedTargetType: 'host',
        requestedNormalizedValue: input,
        sourceTabId: context.sourceTabId ?? null,
        sourceUrl: context.url || null,
        sourceDomain: context.domain || null,
      },
    }),
    resolveSiteAccessClassification: (cfg, _records, input) => {
      const rawUrl = typeof input === 'string' ? input : input?.url;
      const host = (() => { try { return new URL(rawUrl).hostname; } catch { return ''; } })();
      const match = (patterns = []) => patterns.some((p) => host === p || host.endsWith(`.${p}`));
      if (match(cfg.unsafeList || cfg.blacklist || [])) return { classification: 'blocked' };
      if (match(cfg.restrictedEntertainmentList || [])) return { classification: 'restricted' };
      if (match(cfg.studyList || [])) return { classification: 'study' };
      if (match(cfg.compositeList || [])) return { classification: 'composite' };
      return { classification: 'unclassified' };
    },
    getTodayStatsWithCategories: async () => ({ restSeconds: 0, undeterminedSeconds: 0 }),
    getTodayEffectiveRestLimit: (cfg) => cfg.dailyRestQuota ?? 120,
    getEffectiveQuotaForDate: (cfg = {}) => ({
      todayEffectiveQuota: {
        studyMinutes: cfg.dailyStudyQuota === 0 ? null : (cfg.dailyStudyQuota ?? null),
        restMinutes: cfg.dailyRestQuota === 0 ? null : (cfg.dailyRestQuota ?? 120),
        compositeMinutes: cfg.dailyUndeterminedQuota === 0 ? null : (cfg.dailyUndeterminedQuota ?? 60),
        onlineMinutes: cfg.dailyOnlineQuota === 0 ? null : (cfg.dailyOnlineQuota ?? null),
        weeklyRestMinutes: cfg.timeQuota?.weekly && Object.prototype.hasOwnProperty.call(cfg.timeQuota.weekly, 'restMinutes')
          ? cfg.timeQuota.weekly.restMinutes
          : (Number(cfg.weeklyRestQuota) > 0 ? Number(cfg.weeklyRestQuota) : null),
      },
    }),
    hasTimeWindowsDaily: (cfg = {}) => !!cfg?.timeWindows?.daily,
    getModeWindowStatus: () => ({ configured: false, allowed: true }),
    reminderReasonForModeWindow: (mode) => `${mode}_schedule_locked`,
    evaluateQuotaState: async () => ({ ok: true, config: makeConfig(), newState: {} }),
    enqueueModeBoundaryIntent: async () => ({ ok: true }),
    setCachedEffectiveMode: () => {},
    ...stubs,
  };

  vm.createContext(context);
  vm.runInContext(`${code}
this.__modeService = { handleModeEvent, evaluateModeRoute, evaluateQuotaModeTransition };`, context, { filename: 'mode-service.js' });
  return context.__modeService;
}

async function accessCase(name, {
  mode,
  startedAt = null,
  restExitGraceUntilMs = null,
  url,
  nowMs = 31_000,
  quotaState = {},
  stats = {},
  configOverrides = {},
  foreground = true,
  source = 'unit',
  stubs = {},
}) {
  section(name);
  const cfg = makeConfig({
    ...configOverrides,
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false, ...quotaState },
  });
  const svc = loadModeService({
    getConfig: async () => cfg,
    getSession: async () => ({ currentMode: mode, currentModeStartedAtMs: startedAt, restExitGraceUntilMs }),
    getTodayStatsWithCategories: async () => ({ restSeconds: 0, undeterminedSeconds: 0, ...stats }),
    ...stubs,
  });
  return await svc.handleModeEvent({
    type: 'ACCESS_OBSERVED',
    source,
    tabId: 1,
    url,
    foreground,
    nowMs,
  });
}

(async function run() {
  {
    const res = await accessCase('Study -> Study: allow', {
      mode: 'study',
      url: 'https://khanacademy.org/math',
    });
    expect('study site allowed', { access: res.access, modeChange: res.modeChange, reminder: res.reminder }, {
      access: 'allow',
      modeChange: null,
      reminder: null,
    });
  }

  {
    const res = await accessCase('Rest -> Study: immediate mode change', {
      mode: 'rest',
      url: 'https://khanacademy.org/math',
      nowMs: 1000,
    });
    expect('rest study route', {
      access: res.access,
      toMode: res.modeChange?.toMode,
      reason: res.modeChange?.reason,
      setRestExitGrace: res.modeChange?.setRestExitGrace,
      notice: res.notice?.kind,
      noticeText: res.notice?.text,
    }, {
      access: 'allow',
      toMode: 'study',
      reason: 'rest_to_study',
      setRestExitGrace: true,
      notice: 'rest_to_study_success',
      noticeText: '你正在打开学习网站 · 即将进入学习模式 · 今日剩余 不限',
    });
  }

  {
    const res = await accessCase('Rest -> Composite: immediate mode change', {
      mode: 'rest',
      url: 'https://youtube.com/watch',
      nowMs: 1000,
      stats: { undeterminedSeconds: 0 },
    });
    expect('rest composite route', {
      toMode: res.modeChange?.toMode,
      reason: res.modeChange?.reason,
      setRestExitGrace: res.modeChange?.setRestExitGrace,
      noticeText: res.notice?.text,
    }, {
      toMode: 'composite',
      reason: 'rest_to_composite',
      setRestExitGrace: true,
      noticeText: '你正在打开复合网站 · 即将进入复合模式 · 今日待归类剩余 1小时',
    });
  }

  {
    const res = await accessCase('Rest -> Study: finite study quota shows remaining study time', {
      mode: 'rest',
      url: 'https://khanacademy.org/math',
      nowMs: 1000,
      configOverrides: { dailyStudyQuota: 1 },
      stats: { studySeconds: 30 },
    });
    expect('finite study remaining text', res.notice?.text, '你正在打开学习网站 · 即将进入学习模式 · 今日剩余 30秒');
  }

  {
    const res = await accessCase('Study -> Restricted target inside Rest Exit Grace: no Reminder', {
      mode: 'study',
      startedAt: 1000,
      restExitGraceUntilMs: 31_000,
      nowMs: 30_000,
      url: 'https://bilibili.com/video'
    });
    expect('grace returns rest', {
      access: res.access,
      toMode: res.modeChange?.toMode,
      reminder: res.reminder,
      notice: res.notice?.kind,
    }, {
      access: 'allow',
      toMode: 'rest',
      reminder: null,
      notice: 'mode_grace_to_rest',
    });
  }

  {
    const res = await accessCase('Study -> Restricted target after Rest Exit Grace: Reminder', {
      mode: 'study',
      startedAt: 31_500,
      restExitGraceUntilMs: 31_000,
      nowMs: 32_000,
      url: 'https://bilibili.com/video'
    });
    expect('stable study needs reminder', {
      access: res.access,
      modeChange: res.modeChange,
      reminder: res.reminder,
    }, {
      access: 'reminder',
      modeChange: null,
      reminder: { reason: 'to_rest_slide_confirm', params: { originMode: 'study' } },
    });
  }

  {
    const res = await accessCase('Fresh current mode start does not extend expired Rest Exit Grace', {
      mode: 'composite',
      startedAt: 31_500,
      restExitGraceUntilMs: 31_000,
      nowMs: 32_000,
      url: 'https://bilibili.com/video'
    });
    expect('expired rest exit grace still needs reminder', {
      access: res.access,
      modeChange: res.modeChange,
      reminder: res.reminder,
    }, {
      access: 'reminder',
      modeChange: null,
      reminder: { reason: 'to_rest_confirm', params: { siteType: 'restricted' } },
    });
  }

  {
    const autoRequests = [];
    const res = await accessCase('Study -> Unclassified: auto pending to composite', {
      mode: 'study',
      url: 'https://example.com/article',
      stats: { undeterminedSeconds: 0 },
      stubs: {
        recordUnclassifiedSiteAccess: async (input, context = {}) => {
          autoRequests.push({ input, context });
          return {
            ok: true,
            added: true,
            request: {
              id: 'auto-example',
              status: 'pending',
              requestedTargetType: 'host',
              requestedNormalizedValue: input,
              sourceTabId: context.sourceTabId,
              sourceUrl: context.url,
              sourceDomain: context.domain,
            },
          };
        },
      },
    });
    expect('unclassified creates pending request and enters composite', {
      access: res.access,
      toMode: res.modeChange?.toMode,
      reason: res.modeChange?.reason,
      requestInput: autoRequests[0]?.input,
      sourceDomain: autoRequests[0]?.context.domain,
      sourceTabId: autoRequests[0]?.context.sourceTabId,
      observedEventSource: autoRequests[0]?.context.observedEventSource,
      notice: res.notice?.kind,
      noticeText: res.notice?.text,
      syncNeeded: res.siteClassificationRequestSyncNeeded,
    }, {
      access: 'allow',
      toMode: 'composite',
      reason: 'study_to_composite',
      requestInput: 'example.com',
      sourceDomain: 'example.com',
      sourceTabId: 1,
      observedEventSource: 'unit',
      notice: 'study_to_composite',
      noticeText: '已生成未归类网站访问记录 · 当前计入待归类时间 · 即将进入复合模式 · 今日待归类剩余 1小时',
      syncNeeded: true,
    });
  }

  {
    const observations = [];
    const res = await accessCase('Existing manual learning request: observe navigation without downgrade', {
      mode: 'study',
      source: 'webNavigationCommitted',
      url: 'https://manual-pending.example/lesson',
      stats: { undeterminedSeconds: 0 },
      stubs: {
        resolveSiteAccessClassification: () => ({
          classification: 'pending_composite',
          request: {
            id: 'manual-pending',
            status: 'pending',
            recordSource: 'manual_learning_request',
            requestedClassification: 'study',
          },
        }),
        recordUnclassifiedSiteAccess: async (input, context = {}) => {
          observations.push({ input, context });
          return {
            ok: true,
            alreadyPresent: true,
            observed: true,
            request: {
              id: 'manual-pending',
              status: 'pending',
              recordSource: 'manual_learning_request',
              requestedClassification: 'study',
            },
          };
        },
      },
    });
    expect('existing pending record continues receiving top-level observations', {
      observedInput: observations[0]?.input,
      observedEventSource: observations[0]?.context.observedEventSource,
      toMode: res.modeChange?.toMode,
      noticeText: res.notice?.text,
      syncNeeded: res.siteClassificationRequestSyncNeeded,
    }, {
      observedInput: 'manual-pending.example',
      observedEventSource: 'webNavigationCommitted',
      toMode: 'composite',
      noticeText: '学习网站归类申请待家长确认 · 当前仍计入待归类时间 · 即将进入复合模式 · 今日待归类剩余 1小时',
      syncNeeded: true,
    });
  }
  {
    const res = await accessCase('Rest -> Unclassified: auto pending enters composite', {
      mode: 'rest',
      url: 'https://newsite.example/path',
      stats: { undeterminedSeconds: 0 },
    });
    expect('rest unclassified no longer remains rest', {
      access: res.access,
      toMode: res.modeChange?.toMode,
      reason: res.modeChange?.reason,
      notice: res.notice?.kind,
    }, {
      access: 'allow',
      toMode: 'composite',
      reason: 'rest_to_composite',
      notice: 'rest_to_composite_success',
    });
  }

  {
    const res = await accessCase('Unclassified exhausted + Rest available: fallback Rest', {
      mode: 'study',
      url: 'https://quota.example',
      stats: { undeterminedSeconds: 3600, restSeconds: 10 },
    });
    expect('unclassified pending quota exhausted falls to rest', {
      access: res.access,
      toMode: res.modeChange?.toMode,
      reason: res.modeChange?.reason,
      notice: res.notice?.kind,
    }, {
      access: 'allow',
      toMode: 'rest',
      reason: 'composite_exhausted_to_rest',
      notice: 'composite_exhausted_to_rest',
    });
  }

  {
    const res = await accessCase('Composite exhausted + Rest available: default Rest', {
      mode: 'study',
      url: 'https://youtube.com/watch',
      stats: { undeterminedSeconds: 3600, restSeconds: 10 },
    });
    expect('composite exhausted falls to rest', {
      access: res.access,
      toMode: res.modeChange?.toMode,
      reason: res.modeChange?.reason,
      reminder: res.reminder,
      notice: res.notice?.kind,
    }, {
      access: 'allow',
      toMode: 'rest',
      reason: 'composite_exhausted_to_rest',
      reminder: null,
      notice: 'composite_exhausted_to_rest',
    });
  }

  {
    const res = await accessCase('Rest exhausted + Rest target: blocked Reminder', {
      mode: 'rest',
      url: 'https://bilibili.com/video',
      quotaState: { restLocked: true },
    });
    expect('rest locked reminder', {
      access: res.access,
      reminder: res.reminder,
    }, {
      access: 'reminder',
      reminder: { reason: 'rest_locked', params: {} },
    });
  }

  {
    let autoPendingCalled = false;
    const res = await accessCase('Rejected object: no auto pending and follows restricted path', {
      mode: 'study',
      url: 'https://rejected.example/path',
      stubs: {
        resolveSiteAccessClassification: () => ({ classification: 'rejected' }),
        recordUnclassifiedSiteAccess: async () => {
          autoPendingCalled = true;
          return { ok: true };
        },
      },
    });
    expect('rejected object does not auto-create pending request', {
      access: res.access,
      reminder: res.reminder,
      autoPendingCalled,
    }, {
      access: 'reminder',
      reminder: { reason: 'to_rest_slide_confirm', params: { originMode: 'study' } },
      autoPendingCalled: false,
    });
  }

  {
    const res = await accessCase('Unsafe: hard reminder', {
      mode: 'study',
      url: 'https://tiktok.com',
    });
    expect('unsafe reminder', {
      access: res.access,
      reminder: res.reminder,
    }, {
      access: 'reminder',
      reminder: { reason: 'unsafe', params: {} },
    });
  }

  {
    section('Quota alarm transitions through Mode Service');
    const cfg = makeConfig({ quotaState: { restLocked: true, studyLocked: false } });
    const svc = loadModeService({
      getConfig: async () => cfg,
      getSession: async () => ({ currentMode: 'rest' }),
      evaluateQuotaState: async () => ({ ok: true, config: cfg, newState: cfg.quotaState }),
    });
    const res = await svc.handleModeEvent({ type: 'EVALUATE_QUOTA_STATE', source: 'quota_alarm' });
    expect('quota decision', {
      toMode: res.modeChange?.toMode,
      reason: res.modeChange?.reason,
      recheckActiveTab: res.recheckActiveTab,
    }, {
      toMode: 'study',
      reason: 'quota_rest_exhausted',
      recheckActiveTab: true,
    });
  }

  expectTrue('matrix tests reached final assertion', passed > 0);

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} mode routing matrix tests passed`);
})();
