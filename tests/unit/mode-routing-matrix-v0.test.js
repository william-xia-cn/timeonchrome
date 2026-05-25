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
    resolveSiteAccessClassification: (cfg, _records, url) => {
      const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
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
        weeklyRestMinutes: cfg.weeklyRestQuota === 0 ? null : (cfg.weeklyRestQuota ?? ((cfg.dailyRestQuota ?? 120) * 7)),
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
  });
  return await svc.handleModeEvent({
    type: 'ACCESS_OBSERVED',
    source: 'unit',
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
      noticeText: '你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 1小时',
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
    const res = await accessCase('Study -> Rest target inside Rest Exit Grace: no Reminder', {
      mode: 'study',
      startedAt: 1000,
      restExitGraceUntilMs: 31_000,
      nowMs: 30_000,
      url: 'https://example.com',
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
    const res = await accessCase('Study -> Rest target after Rest Exit Grace: Reminder', {
      mode: 'study',
      startedAt: 31_500,
      restExitGraceUntilMs: 31_000,
      nowMs: 32_000,
      url: 'https://example.com',
    });
    expect('stable study needs reminder', {
      access: res.access,
      modeChange: res.modeChange,
      reminder: res.reminder,
    }, {
      access: 'reminder',
      modeChange: null,
      reminder: { reason: 'study_mode', params: { originMode: 'study' } },
    });
  }

  {
    const res = await accessCase('Fresh current mode start does not extend expired Rest Exit Grace', {
      mode: 'composite',
      startedAt: 31_500,
      restExitGraceUntilMs: 31_000,
      nowMs: 32_000,
      url: 'https://example.com',
    });
    expect('expired rest exit grace still needs reminder', {
      access: res.access,
      modeChange: res.modeChange,
      reminder: res.reminder,
    }, {
      access: 'reminder',
      modeChange: null,
      reminder: { reason: 'to_rest_confirm', params: { siteType: 'unclassified' } },
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
      url: 'https://example.com',
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
