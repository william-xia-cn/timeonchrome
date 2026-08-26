// mode-service.test.js
// Run with: node tests/unit/mode-service.test.js

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

function loadModeService(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'product', 'mode-service.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const context = {
    console,
    Date,
    getConfig: async () => ({ mode: 'study' }),
    getSession: async () => ({}),
    saveConfig: async () => {},
    saveSession: async () => {},
    extractDomain: (url) => {
      try { return new URL(url).hostname; } catch { return null; }
    },
    isSpecialUrl: (url) => /^(chrome|about|file|data|blob):/.test(String(url || '')),
    hasTemporaryCompositePermission: async () => false,
    getSiteClassificationRequestRecords: async () => [],
    resolveSiteAccessClassification: (config, records, urlOrInput) => {
      const rawUrl = urlOrInput && typeof urlOrInput === 'object' ? (urlOrInput.url || urlOrInput.input || urlOrInput.domain || '') : urlOrInput;
      const host = (() => { try { return new URL(rawUrl).hostname; } catch { return String(rawUrl || ''); } })();
      const match = (patterns = []) => patterns.some((p) => host === p || host.endsWith(`.${p}`));
      if (match(config.unsafeList || [])) return { classification: 'blocked' };
      if (match(config.studyList || [])) return { classification: 'study' };
      if (match(config.compositeList || [])) return { classification: 'composite' };
      if (match(config.restrictedEntertainmentList || [])) return { classification: 'restricted' };
      return { classification: 'unclassified' };
    },
    getTodayStatsWithCategories: async () => ({ restSeconds: 0, undeterminedSeconds: 0 }),
    getTodayEffectiveRestLimit: () => 120,
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
    getModeWindowStatus: (cfg = {}, mode = 'study', at = new Date()) => {
      const dayKey = 'monday';
      const field = mode === 'composite' ? 'compositeWindows' : mode === 'rest' ? 'restWindows' : 'studyWindows';
      const dayCfg = cfg?.timeWindows?.daily?.[dayKey] || {};
      const windows = dayCfg[field];
      if (!Array.isArray(windows) || windows.length === 0) return { configured: !!cfg?.timeWindows?.daily, allowed: true, mode, field, dayKey, windows: null };
      const d = at instanceof Date ? at : new Date(at);
      const current = d.getHours() * 60 + d.getMinutes();
      const allowed = windows.some((w) => {
        const [sh, sm] = String(w.start).split(':').map(Number);
        const [eh, em] = String(w.end).split(':').map(Number);
        return current >= sh * 60 + sm && current < eh * 60 + em;
      });
      return { configured: true, allowed, mode, field, dayKey, windows };
    },
    reminderReasonForModeWindow: (mode) => `${mode}_schedule_locked`,
    evaluateQuotaState: async () => ({ ok: true, config: { quotaState: {} }, newState: {} }),
    enqueueModeBoundaryIntent: async (intent) => ({ ok: true, intent }),
    setCachedEffectiveMode: () => {},
    ...stubs,
  };

  vm.createContext(context);
  vm.runInContext(`${code}
this.__modeService = {
  REST_EXIT_GRACE_MS,
  normalizeMode,
  getCurrentModeSnapshot,
  isRestExitGraceActive,
  commitModeChange,
  evaluateModeRoute,
  handleModeEvent,
  evaluateQuotaModeTransition,
  evaluateScheduleModeTransition,
};`, context, { filename: 'mode-service.js' });
  return context.__modeService;
}

(async function main() {
  section('MSVC-1 mode commit writes single runtime truth and Rest Exit Grace');
  {
    const writes = [];
    const boundaries = [];
    const cached = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest', currentModeStartedAtMs: 100 }),
      saveSession: async (session) => { writes.push(session); },
      enqueueModeBoundaryIntent: async (intent) => { boundaries.push(intent); return { ok: true, id: 'b1' }; },
      setCachedEffectiveMode: (mode) => { cached.push(mode); },
    });
    const res = await svc.commitModeChange({
      toMode: 'study',
      reason: 'rest_to_study',
      source: 'auto_mode_route',
      effectiveAtMs: 1000,
      setRestExitGrace: true,
    });
    expectTrue('commit changed', res.changed === true && res.currentMode === 'study');
    expect('session write includes startedAt', writes, [{
      currentMode: 'study',
      currentModeStartedAtMs: 1000,
      modeEffectiveAtMs: 1000,
      restExitGraceUntilMs: 31_000,
    }]);
    expect('boundary queued once', boundaries, [{
      boundaryAtMs: 1000,
      fromMode: 'rest',
      toMode: 'study',
      reason: 'rest_to_study',
      source: 'auto_mode_route',
    }]);
    expect('runtime cache updated', cached, ['study']);
  }

  section('MSVC-1b manual Rest -> Study/Composite does not create Rest Exit Grace');
  {
    const writes = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest', currentModeStartedAtMs: 100 }),
      saveSession: async (session) => { writes.push(session); },
    });
    const study = await svc.commitModeChange({
      toMode: 'study',
      reason: 'manual_mode_switch',
      source: 'runtime_message',
      effectiveAtMs: 1000,
    });
    expect('manual rest -> study clears grace', {
      restExitGraceUntilMs: study.restExitGraceUntilMs,
      writeGrace: writes[0]?.restExitGraceUntilMs,
    }, {
      restExitGraceUntilMs: null,
      writeGrace: null,
    });
  }
  {
    const writes = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'rest' }),
      getSession: async () => ({ currentMode: 'rest', currentModeStartedAtMs: 100 }),
      saveSession: async (session) => { writes.push(session); },
    });
    const composite = await svc.commitModeChange({
      toMode: 'composite',
      reason: 'manual_mode_switch',
      source: 'runtime_message',
      effectiveAtMs: 1000,
    });
    expect('manual rest -> composite clears grace', {
      restExitGraceUntilMs: composite.restExitGraceUntilMs,
      writeGrace: writes[0]?.restExitGraceUntilMs,
    }, {
      restExitGraceUntilMs: null,
      writeGrace: null,
    });
  }

  section('MSVC-6 quota expiry drives mode transitions');
  {
    const svc = loadModeService();
    expect('online quota locks any active mode', svc.evaluateQuotaModeTransition({
      currentMode: 'rest',
      quotaState: { onlineLocked: true },
      source: 'quota_alarm',
    }), {
      kind: 'mode_change',
      toMode: 'locked',
      reason: 'quota_online_exhausted',
      source: 'quota_alarm',
    });
    expect('study quota locks study mode', svc.evaluateQuotaModeTransition({
      currentMode: 'study',
      quotaState: { studyLocked: true },
      source: 'quota_alarm',
    }), {
      kind: 'mode_change',
      toMode: 'locked',
      reason: 'quota_study_exhausted',
      source: 'quota_alarm',
    });
    expect('rest quota returns to study when study is available', svc.evaluateQuotaModeTransition({
      currentMode: 'rest',
      quotaState: { restLocked: true, studyLocked: false },
      source: 'quota_alarm',
    }), {
      kind: 'mode_change',
      toMode: 'study',
      reason: 'quota_rest_exhausted',
      source: 'quota_alarm',
    });
    expect('rest quota locks when study is also exhausted', svc.evaluateQuotaModeTransition({
      currentMode: 'rest',
      quotaState: { restLocked: true, studyLocked: true },
      source: 'quota_alarm',
    }), {
      kind: 'mode_change',
      toMode: 'locked',
      reason: 'quota_rest_exhausted_study_locked',
      source: 'quota_alarm',
    });
    expect('borrowed Rest locks directly when pending and Rest quotas are both exhausted', svc.evaluateQuotaModeTransition({
      currentMode: 'rest',
      activeUsageWindowMode: 'composite',
      quotaState: { undeterminedLocked: true, restLocked: true, studyLocked: false },
      source: 'quota_alarm',
    }), {
      kind: 'mode_change',
      toMode: 'locked',
      reason: 'quota_composite_and_rest',
      source: 'quota_alarm',
    });
    expect('composite quota returns to study when study is available', svc.evaluateQuotaModeTransition({
      currentMode: 'composite',
      quotaState: { undeterminedLocked: true, studyLocked: false },
      source: 'quota_alarm',
    }), {
      kind: 'mode_change',
      toMode: 'study',
      reason: 'quota_composite_exhausted',
      source: 'quota_alarm',
    });
    expect('active pending content enters Rest quota borrow directly when composite quota expires', svc.evaluateQuotaModeTransition({
      currentMode: 'composite',
      activeUsageWindowMode: 'composite',
      quotaState: { undeterminedLocked: true, restLocked: false, studyLocked: false },
      windowStatusByMode: { composite: { allowed: true } },
      source: 'quota_alarm',
    }), {
      kind: 'mode_change',
      toMode: 'rest',
      reason: 'composite_exhausted_to_rest',
      source: 'quota_alarm',
    });
    expect('daily reset unlocks locked mode', svc.evaluateQuotaModeTransition({
      currentMode: 'locked',
      quotaState: { onlineLocked: false, studyLocked: false },
      source: 'daily_cleanup',
    }), {
      kind: 'mode_change',
      toMode: 'study',
      reason: 'quota_reset_unlock',
      source: 'daily_cleanup',
    });
  }

  section('MSVC-2 same-mode no-op does not refresh startedAt or Rest Exit Grace');
  {
    const writes = [];
    const boundaries = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'study' }),
      getSession: async () => ({
        currentMode: 'study',
        currentModeStartedAtMs: 123,
        restExitGraceUntilMs: 456,
      }),
      saveSession: async (session) => { writes.push(session); },
      enqueueModeBoundaryIntent: async (intent) => { boundaries.push(intent); return { ok: true }; },
    });
    const res = await svc.commitModeChange({ toMode: 'study', effectiveAtMs: 999 });
    expectTrue('same mode ok unchanged', res.ok === true && res.changed === false);
    expect('startedAt preserved', res.currentModeStartedAtMs, 123);
    expect('rest exit grace preserved', res.restExitGraceUntilMs, 456);
    expect('no session write', writes, []);
    expect('no boundary intent', boundaries, []);
  }

  section('MSVC-2b Study/Composite does not extend Rest Exit Grace and Rest clears it');
  {
    const writes = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'study' }),
      getSession: async () => ({
        currentMode: 'study',
        currentModeStartedAtMs: 1000,
        restExitGraceUntilMs: 31_000,
      }),
      saveSession: async (session) => { writes.push(session); },
    });
    const composite = await svc.commitModeChange({ toMode: 'composite', effectiveAtMs: 30_000 });
    expect('study -> composite preserves original rest exit grace', {
      changed: composite.changed,
      restExitGraceUntilMs: composite.restExitGraceUntilMs,
      writeGrace: writes[0]?.restExitGraceUntilMs,
    }, {
      changed: true,
      restExitGraceUntilMs: 31_000,
      writeGrace: 31_000,
    });
  }
  {
    const writes = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'composite' }),
      getSession: async () => ({
        currentMode: 'composite',
        currentModeStartedAtMs: 30_000,
        restExitGraceUntilMs: 31_000,
      }),
      saveSession: async (session) => { writes.push(session); },
    });
    const study = await svc.commitModeChange({ toMode: 'study', effectiveAtMs: 45_000 });
    expect('composite -> study preserves original rest exit grace', {
      restExitGraceUntilMs: study.restExitGraceUntilMs,
      writeGrace: writes[0]?.restExitGraceUntilMs,
    }, {
      restExitGraceUntilMs: 31_000,
      writeGrace: 31_000,
    });
  }
  {
    const writes = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'study' }),
      getSession: async () => ({
        currentMode: 'study',
        currentModeStartedAtMs: 45_000,
        restExitGraceUntilMs: 31_000,
      }),
      saveSession: async (session) => { writes.push(session); },
    });
    const rest = await svc.commitModeChange({ toMode: 'rest', effectiveAtMs: 50_000 });
    expect('study -> rest clears rest exit grace', {
      restExitGraceUntilMs: rest.restExitGraceUntilMs,
      writeGrace: writes[0]?.restExitGraceUntilMs,
    }, {
      restExitGraceUntilMs: null,
      writeGrace: null,
    });
  }

  section('MSVC-3 Rest opens Study/Composite immediately');
  {
    const svc = loadModeService();
    expect('rest -> study', svc.evaluateModeRoute({
      currentMode: 'rest',
      isStudyDomain: true,
      isCompositeDomain: false,
      foreground: true,
      quotaState: {},
      nowMs: 10,
    }), {
      kind: 'mode_change',
      toMode: 'study',
      reason: 'rest_to_study',
      source: 'auto_mode_route',
      notice: 'rest_to_study_success',
      setRestExitGrace: true,
    });
    expect('rest -> composite', svc.evaluateModeRoute({
      currentMode: 'rest',
      isStudyDomain: false,
      isCompositeDomain: true,
      remainingCompositeSeconds: 60,
      foreground: true,
      quotaState: {},
      nowMs: 10,
    }), {
      kind: 'mode_change',
      toMode: 'composite',
      reason: 'rest_to_composite',
      source: 'auto_mode_route',
      notice: 'rest_to_composite_success',
      setRestExitGrace: true,
    });
  }

  section('MSVC-3a mode time windows block target mode routes');
  {
    const svc = loadModeService();
    expect('study target outside study window blocks', svc.evaluateModeRoute({
      currentMode: 'composite',
      isStudyDomain: true,
      isCompositeDomain: false,
      foreground: true,
      studyWindowAllowed: false,
      quotaState: {},
      nowMs: 10,
    }), {
      kind: 'reminder',
      reminderReason: 'study_schedule_locked',
    });
    expect('composite target outside composite window blocks', svc.evaluateModeRoute({
      currentMode: 'study',
      isStudyDomain: false,
      isCompositeDomain: true,
      remainingCompositeSeconds: 60,
      compositeWindowAllowed: false,
      quotaState: {},
      nowMs: 10,
    }), {
      kind: 'reminder',
      reminderReason: 'composite_schedule_locked',
    });
    expect('restricted rest target outside rest window blocks', svc.evaluateModeRoute({
      currentMode: 'study',
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      restWindowAllowed: false,
      quotaState: {},
      nowMs: 10,
    }), {
      kind: 'reminder',
      reminderReason: 'rest_schedule_locked',
    });
    expect('exhausted pending target borrows rest quota while composite window is open', svc.evaluateModeRoute({
      currentMode: 'study',
      isCompositeDomain: true,
      remainingCompositeSeconds: 0,
      compositeWindowAllowed: true,
      restWindowAllowed: false,
      quotaState: { restLocked: false },
      nowMs: 10,
    }), {
      kind: 'mode_change',
      toMode: 'rest',
      reason: 'composite_exhausted_to_rest',
      source: 'auto_mode_route',
      notice: 'composite_exhausted_to_rest',
    });
    expect('exhausted pending target cannot borrow through a closed composite window', svc.evaluateModeRoute({
      currentMode: 'study',
      isCompositeDomain: true,
      remainingCompositeSeconds: 0,
      compositeWindowAllowed: false,
      restWindowAllowed: true,
      quotaState: { restLocked: false },
      nowMs: 10,
    }), {
      kind: 'reminder',
      reminderReason: 'composite_schedule_locked',
    });
    expect('borrowed pending target already in rest still honors the composite window', svc.evaluateModeRoute({
      currentMode: 'rest',
      isCompositeDomain: true,
      remainingCompositeSeconds: 0,
      compositeWindowAllowed: false,
      restWindowAllowed: true,
      quotaState: { restLocked: false },
      nowMs: 10,
    }), {
      kind: 'reminder',
      reminderReason: 'composite_schedule_locked',
    });
    expect('borrowed pending target from composite mode still honors the composite window', svc.evaluateModeRoute({
      currentMode: 'composite',
      isCompositeDomain: true,
      remainingCompositeSeconds: 0,
      compositeWindowAllowed: false,
      restWindowAllowed: true,
      quotaState: { restLocked: false },
      nowMs: 10,
    }), {
      kind: 'reminder',
      reminderReason: 'composite_schedule_locked',
    });
    expect('dual quota exhaustion remains higher priority than composite window', svc.evaluateModeRoute({
      currentMode: 'study',
      isCompositeDomain: true,
      remainingCompositeSeconds: 0,
      compositeWindowAllowed: false,
      quotaState: { restLocked: true },
      nowMs: 10,
    }), {
      kind: 'reminder',
      reminderReason: 'quota_composite_and_rest',
    });
  }

  section('MSVC-3a2 access observed applies configured time windows');
  {
    const cfg = {
      enabled: true,
      mode: 'study',
      studyList: ['khanacademy.org'],
      compositeList: ['wikipedia.org'],
      restrictedEntertainmentList: [],
      unsafeList: [],
      quotaState: {},
      timeWindows: {
        daily: {
          monday: {
            studyWindows: null,
            compositeWindows: [{ start: '08:00', end: '09:00' }],
            restWindows: null,
          },
        },
      },
    };
    const svc = loadModeService({
      getConfig: async () => cfg,
      getSession: async () => ({ currentMode: 'study' }),
      evaluateQuotaState: async () => ({ ok: true, config: cfg, newState: {} }),
    });
    const result = await svc.handleModeEvent({
      type: 'ACCESS_OBSERVED',
      url: 'https://www.wikipedia.org/wiki/Test',
      domain: 'www.wikipedia.org',
      foreground: true,
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('composite access outside composite window goes to reminder', {
      access: result.access,
      reason: result.reminder?.reason,
      modeChange: result.modeChange,
    }, {
      access: 'reminder',
      reason: 'composite_schedule_locked',
      modeChange: null,
    });
  }

  section('MSVC-3a2b access observed ignores internal pseudo domains');
  {
    const cfg = {
      enabled: true,
      mode: 'study',
      quotaState: {},
      timeWindows: {
        daily: {
          monday: {
            studyWindows: null,
            compositeWindows: null,
            restWindows: [{ start: '08:00', end: '09:00' }],
          },
        },
      },
    };
    let classificationCalled = false;
    const svc = loadModeService({
      getConfig: async () => cfg,
      getSession: async () => ({ currentMode: 'study' }),
      resolveSiteAccessClassification: () => {
        classificationCalled = true;
        return { classification: 'unclassified' };
      },
    });
    const result = await svc.handleModeEvent({
      type: 'ACCESS_OBSERVED',
      url: 'unknown-page.chrome-local',
      domain: 'unknown-page.chrome-local',
      foreground: true,
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('internal pseudo domain is ignored before schedule routing', {
      access: result.access,
      reason: result.reason,
      domain: result.domain,
      classificationCalled,
    }, {
      access: 'ignore',
      reason: 'internal_pseudo_domain',
      domain: 'unknown-page.chrome-local',
      classificationCalled: false,
    });
  }

  section('MSVC-3a2c access observed uses one managed quota snapshot');
  {
    let statsReads = 0;
    const cfg = {
      enabled: true,
      mode: 'study',
      compositeList: ['portal.example'],
      restrictedEntertainmentList: [],
      unsafeList: [],
      quotaState: {},
      dailyStudyQuota: 120,
      dailyUndeterminedQuota: 10,
      dailyRestQuota: 60,
    };
    const svc = loadModeService({
      getConfig: async () => cfg,
      getSession: async () => ({ currentMode: 'study' }),
      getTodayStatsWithCategories: async () => {
        statsReads += 1;
        return { studySeconds: 60, undeterminedSeconds: 120, restSeconds: 180 };
      },
    });
    const result = await svc.handleModeEvent({
      type: 'ACCESS_OBSERVED',
      url: 'https://portal.example/path',
      domain: 'portal.example',
      foreground: true,
      nowMs: 1000,
    });
    expect('one access decision reads quota usage once', statsReads, 1);
    expect('single snapshot keeps composite transition result', {
      access: result.access,
      toMode: result.modeChange?.toMode,
      remainingCompositeSeconds: result.notice?.remainingCompositeSeconds,
    }, {
      access: 'allow',
      toMode: 'composite',
      remainingCompositeSeconds: 480,
    });
  }

  section('MSVC-3a3 rejected exact URL follows restricted rest path');
  {
    const cfg = {
      enabled: true,
      mode: 'study',
      quotaState: {},
    };
    const svc = loadModeService({
      getConfig: async () => cfg,
      getSession: async () => ({ currentMode: 'study' }),
      resolveSiteAccessClassification: () => ({ classification: 'rejected' }),
    });
    const result = await svc.handleModeEvent({
      type: 'ACCESS_OBSERVED',
      url: 'https://www.youtube.com/playlist?list=PL1',
      domain: 'www.youtube.com',
      foreground: true,
      nowMs: 1000,
    });
    expect('rejected url asks for restricted rest confirmation', {
      access: result.access,
      reason: result.reminder?.reason,
      siteType: result.reminder?.params?.siteType || null,
      modeChange: result.modeChange,
      classification: result.classification,
    }, {
      access: 'reminder',
      reason: 'to_rest_slide_confirm',
      siteType: null,
      modeChange: null,
      classification: 'rejected',
    });
  }

  section('MSVC-3b manual request mode change does not request Rest Exit Grace');
  {
    const svc = loadModeService();
    const study = await svc.handleModeEvent({
      type: 'REQUEST_MODE_CHANGE',
      requestedMode: 'study',
      source: 'popup',
      nowMs: 1000,
    });
    expect('manual study modeChange has no rest grace flag', {
      toMode: study.modeChange?.toMode,
      setRestExitGrace: study.modeChange?.setRestExitGrace === true,
      clearRestExitGrace: study.modeChange?.clearRestExitGrace === true,
    }, {
      toMode: 'study',
      setRestExitGrace: false,
      clearRestExitGrace: true,
    });
    const rest = await svc.handleModeEvent({
      type: 'REMINDER_CONFIRMED',
      requestedMode: 'rest',
      source: 'reminder',
      nowMs: 1000,
    });
    expect('reminder confirmed has no rest grace flag', {
      toMode: rest.modeChange?.toMode,
      setRestExitGrace: rest.modeChange?.setRestExitGrace === true,
      clearRestExitGrace: rest.modeChange?.clearRestExitGrace === true,
    }, {
      toMode: 'rest',
      setRestExitGrace: false,
      clearRestExitGrace: false,
    });
  }

  section('MSVC-3b2 requested mode changes synchronously honor exhausted quotas');
  {
    const svc = loadModeService({
      evaluateQuotaState: async () => ({
        ok: true,
        config: { quotaState: { studyLocked: true, restLocked: true, undeterminedLocked: true } },
        newState: { studyLocked: true, restLocked: true, undeterminedLocked: true },
      }),
    });
    const study = await svc.handleModeEvent({
      type: 'REQUEST_MODE_CHANGE',
      requestedMode: 'study',
      source: 'reminder',
      nowMs: 1000,
    });
    expect('study exhausted blocks study request', {
      ok: study.ok,
      access: study.access,
      reason: study.reminder?.reason,
      modeChange: study.modeChange,
    }, {
      ok: false,
      access: 'reminder',
      reason: 'quota_study',
      modeChange: null,
    });
    const composite = await svc.handleModeEvent({
      type: 'REQUEST_MODE_CHANGE',
      requestedMode: 'composite',
      source: 'reminder',
      nowMs: 1000,
    });
    expect('composite exhausted blocks composite request', {
      ok: composite.ok,
      access: composite.access,
      reason: composite.reminder?.reason,
      modeChange: composite.modeChange,
    }, {
      ok: false,
      access: 'reminder',
      reason: 'quota_undetermined',
      modeChange: null,
    });
    const rest = await svc.handleModeEvent({
      type: 'REQUEST_MODE_CHANGE',
      requestedMode: 'rest',
      source: 'reminder',
      nowMs: 1000,
    });
    expect('rest exhausted blocks rest request', {
      ok: rest.ok,
      access: rest.access,
      reason: rest.reminder?.reason,
      modeChange: rest.modeChange,
    }, {
      ok: false,
      access: 'reminder',
      reason: 'rest_locked',
      modeChange: null,
    });
  }

  section('MSVC-3b3 requested mode changes synchronously honor time windows');
  {
    const restrictedConfig = {
      quotaState: {},
      timeWindows: {
        daily: {
          monday: {
            studyWindows: [{ start: '08:00', end: '09:00' }],
            compositeWindows: [{ start: '08:00', end: '09:00' }],
            restWindows: [{ start: '08:00', end: '09:00' }],
          },
        },
      },
    };
    const svc = loadModeService({
      evaluateQuotaState: async () => ({
        ok: true,
        config: restrictedConfig,
        newState: {},
      }),
    });
    const study = await svc.handleModeEvent({
      type: 'REQUEST_MODE_CHANGE',
      requestedMode: 'study',
      source: 'reminder',
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('study request outside study window is blocked', {
      ok: study.ok,
      access: study.access,
      reason: study.reminder?.reason,
      modeChange: study.modeChange,
    }, {
      ok: false,
      access: 'reminder',
      reason: 'study_schedule_locked',
      modeChange: null,
    });
    const composite = await svc.handleModeEvent({
      type: 'REQUEST_MODE_CHANGE',
      requestedMode: 'composite',
      source: 'reminder',
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('composite request outside composite window is blocked', {
      ok: composite.ok,
      access: composite.access,
      reason: composite.reminder?.reason,
      modeChange: composite.modeChange,
    }, {
      ok: false,
      access: 'reminder',
      reason: 'composite_schedule_locked',
      modeChange: null,
    });
    const rest = await svc.handleModeEvent({
      type: 'REQUEST_MODE_CHANGE',
      requestedMode: 'rest',
      source: 'reminder',
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('rest request outside rest window is blocked', {
      ok: rest.ok,
      access: rest.access,
      reason: rest.reminder?.reason,
      modeChange: rest.modeChange,
    }, {
      ok: false,
      access: 'reminder',
      reason: 'rest_schedule_locked',
      modeChange: null,
    });
  }

  section('MSVC-6a time-window expiry drives mode transitions');
  {
    const restExpiredConfig = {
      quotaState: {},
      timeWindows: {
        daily: {
          monday: {
            studyWindows: null,
            compositeWindows: null,
            restWindows: [{ start: '08:00', end: '09:00' }],
          },
        },
      },
    };
    const restSvc = loadModeService({
      evaluateQuotaState: async () => ({ ok: true, config: restExpiredConfig, newState: {} }),
      getSession: async () => ({ currentMode: 'rest' }),
    });
    const restResult = await restSvc.handleModeEvent({
      type: 'EVALUATE_QUOTA_STATE',
      source: 'quota_alarm',
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('rest window expiry switches to study during quota evaluation', {
      access: restResult.access,
      toMode: restResult.modeChange?.toMode,
      reason: restResult.modeChange?.reason,
      recheckActiveTab: restResult.recheckActiveTab,
    }, {
      access: 'allow',
      toMode: 'study',
      reason: 'rest_schedule_expired_to_study',
      recheckActiveTab: true,
    });

    const allExpiredConfig = {
      quotaState: {},
      timeWindows: {
        daily: {
          monday: {
            studyWindows: [{ start: '08:00', end: '09:00' }],
            compositeWindows: [{ start: '08:00', end: '09:00' }],
            restWindows: [{ start: '08:00', end: '09:00' }],
          },
        },
      },
    };
    const compositeSvc = loadModeService({
      evaluateQuotaState: async () => ({ ok: true, config: allExpiredConfig, newState: {} }),
      getSession: async () => ({ currentMode: 'composite' }),
    });
    const compositeResult = await compositeSvc.handleModeEvent({
      type: 'EVALUATE_QUOTA_STATE',
      source: 'quota_alarm',
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('current mode outside all windows locks during quota evaluation', {
      access: compositeResult.access,
      toMode: compositeResult.modeChange?.toMode,
      reason: compositeResult.modeChange?.reason,
      recheckActiveTab: compositeResult.recheckActiveTab,
    }, {
      access: 'allow',
      toMode: 'locked',
      reason: 'composite_schedule_window_expired',
      recheckActiveTab: true,
    });

    const borrowedRestConfig = {
      quotaState: { undeterminedLocked: true, restLocked: false, studyLocked: false },
      timeWindows: {
        daily: {
          monday: {
            studyWindows: null,
            compositeWindows: null,
            restWindows: [{ start: '08:00', end: '09:00' }],
          },
        },
      },
    };
    let borrowedRuntimeMode = 'composite';
    const borrowedRestSvc = loadModeService({
      evaluateQuotaState: async () => ({
        ok: true,
        config: borrowedRestConfig,
        newState: borrowedRestConfig.quotaState,
      }),
      getSession: async () => ({ currentMode: borrowedRuntimeMode }),
    });
    const borrowedChecks = [];
    let borrowedNoticeText = null;
    for (let i = 0; i < 60; i++) {
      const result = await borrowedRestSvc.handleModeEvent({
        type: 'EVALUATE_QUOTA_STATE',
        source: 'quota_alarm',
        activeUsageWindowMode: 'composite',
        nowMs: new Date(2026, 4, 18, 10, i, 0).getTime(),
      });
      if (i === 0) borrowedNoticeText = result.notice?.text || null;
      borrowedChecks.push(result.modeChange?.toMode || null);
      if (result.modeChange?.toMode) borrowedRuntimeMode = result.modeChange.toMode;
    }
    expect('60 quota checks enter borrowed rest once without transient study or repeated boundaries', {
      changes: borrowedChecks.filter(Boolean).length,
      uniqueTargets: [...new Set(borrowedChecks.filter(Boolean))],
      firstNoticeText: borrowedNoticeText,
    }, {
      changes: 1,
      uniqueTargets: ['rest'],
      firstNoticeText: '待归类时间配额已用完 · 正在借用休息配额',
    });

    const closedCompositeConfig = {
      quotaState: {},
      timeWindows: {
        daily: {
          monday: {
            studyWindows: null,
            compositeWindows: [{ start: '08:00', end: '09:00' }],
            restWindows: null,
          },
        },
      },
    };
    const closedCompositeSvc = loadModeService({
      evaluateQuotaState: async () => ({ ok: true, config: closedCompositeConfig, newState: {} }),
      getSession: async () => ({ currentMode: 'rest' }),
    });
    const closedCompositeResult = await closedCompositeSvc.handleModeEvent({
      type: 'EVALUATE_QUOTA_STATE',
      source: 'quota_alarm',
      activeUsageWindowMode: 'composite',
      nowMs: new Date(2026, 4, 18, 10, 0, 0).getTime(),
    });
    expect('closed active composite window leaves borrowed rest for study before tab recheck', {
      toMode: closedCompositeResult.modeChange?.toMode,
      reason: closedCompositeResult.modeChange?.reason,
    }, {
      toMode: 'study',
      reason: 'composite_schedule_expired_to_study',
    });
  }

  section('MSVC-3c manual Study/Composite request clears existing Rest Exit Grace');
  {
    const writes = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'study' }),
      getSession: async () => ({
        currentMode: 'study',
        currentModeStartedAtMs: 1000,
        restExitGraceUntilMs: 31_000,
      }),
      saveSession: async (session) => { writes.push(session); },
    });
    const sameMode = await svc.commitModeChange({
      toMode: 'study',
      reason: 'manual_mode_switch',
      source: 'runtime_message',
      effectiveAtMs: 10_000,
      clearRestExitGrace: true,
    });
    expect('manual same-mode clears grace without boundary change', {
      changed: sameMode.changed,
      startedAt: sameMode.currentModeStartedAtMs,
      restExitGraceUntilMs: sameMode.restExitGraceUntilMs,
      writeGrace: writes[0]?.restExitGraceUntilMs,
    }, {
      changed: false,
      startedAt: 1000,
      restExitGraceUntilMs: null,
      writeGrace: null,
    });
  }
  {
    const writes = [];
    const svc = loadModeService({
      getConfig: async () => ({ mode: 'study' }),
      getSession: async () => ({
        currentMode: 'study',
        currentModeStartedAtMs: 1000,
        restExitGraceUntilMs: 31_000,
      }),
      saveSession: async (session) => { writes.push(session); },
    });
    const composite = await svc.commitModeChange({
      toMode: 'composite',
      reason: 'manual_mode_switch',
      source: 'runtime_message',
      effectiveAtMs: 10_000,
      clearRestExitGrace: true,
    });
    expect('manual study -> composite clears grace', {
      changed: composite.changed,
      restExitGraceUntilMs: composite.restExitGraceUntilMs,
      writeGrace: writes[0]?.restExitGraceUntilMs,
    }, {
      changed: true,
      restExitGraceUntilMs: null,
      writeGrace: null,
    });
  }

  section('MSVC-4 Rest Exit Grace returns Rest target to Rest without Reminder');
  {
    const svc = loadModeService();
    expect('study restricted grace -> rest', svc.evaluateModeRoute({
      currentMode: 'study',
      currentModeStartedAtMs: 1000,
      restExitGraceUntilMs: 31_000,
      nowMs: 30_000,
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      quotaState: { restLocked: false },
    }), {
      kind: 'mode_change',
      toMode: 'rest',
      reason: 'mode_grace_to_rest',
      source: 'auto_mode_route',
      notice: 'mode_grace_to_rest',
    });
    expect('composite grace -> rest', svc.evaluateModeRoute({
      currentMode: 'composite',
      currentModeStartedAtMs: 30_000,
      restExitGraceUntilMs: 31_000,
      nowMs: 30_000,
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      quotaState: { restLocked: false },
    }), {
      kind: 'mode_change',
      toMode: 'rest',
      reason: 'mode_grace_to_rest',
      source: 'auto_mode_route',
      notice: 'mode_grace_to_rest',
    });
  }

  section('MSVC-5 missing/expired Rest Exit Grace uses Reminder');
  {
    const svc = loadModeService();
    expect('missing startedAt -> restricted reminder', svc.evaluateModeRoute({
      currentMode: 'study',
      currentModeStartedAtMs: 29_000,
      restExitGraceUntilMs: null,
      nowMs: 30_000,
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      quotaState: { restLocked: false },
    }), {
      kind: 'reminder',
      reminderReason: 'to_rest_slide_confirm',
      extraParams: { originMode: 'study' },
    });
    expect('expired startedAt -> composite reminder', svc.evaluateModeRoute({
      currentMode: 'composite',
      currentModeStartedAtMs: 31_900,
      restExitGraceUntilMs: 31_000,
      nowMs: 32_000,
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      quotaState: { restLocked: false },
    }), {
      kind: 'reminder',
      reminderReason: 'to_rest_confirm',
      extraParams: { siteType: 'restricted' },
    });
  }

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} mode-service tests passed`);
})();
