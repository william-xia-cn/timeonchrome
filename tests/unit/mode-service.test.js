// mode-service.test.js
// Run with: node tests/unit/mode-service.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder } = require('util');

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
  const downtimeSource = fs.readFileSync(path.join(__dirname, '../../extension/core/downtime.js'), 'utf8');
  const downtime = new Function(`${downtimeSource.replace(/export (function|const) /g, '$1 ')}\nreturn { readDowntimeConfig, evaluateWebsiteDowntime };`)();
  const windowsSource = fs.readFileSync(path.join(__dirname, '../../extension/core/time-windows.js'), 'utf8');
  const windows = new Function(`${windowsSource.replace(/export (function|const) /g, '$1 ')}\nreturn { getModeWindowStatus };`)();
  const autonomySource = fs.readFileSync(path.join(__dirname, '../../extension/core/autonomy-confirmation.js'), 'utf8');
  const autonomy = new Function('getModeWindowStatus', 'URL', `${autonomySource.replace(/^import .*;$/gm, '').replace(/export (function|const) /g, '$1 ')}\nreturn { scheduleConfirmationContext };`)(windows.getModeWindowStatus, URL);
  const abs = path.join(__dirname, '..', '..', 'extension', 'product', 'mode-service.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const context = {
    ...downtime,
    ...autonomy,
    scheduleConfirmationRuleIdentity: (_classification, host) => ['host', host],
    hasScheduleConfirmation: async () => false,
    readScheduleConfirmationScope: async () => JSON.stringify(['profile-a', 'device-a']),
    readForcedUsePolicy: () => ({ enabled: false }),
    prepareForcedUseAdmission: () => ({ ok: true, action: 'legacy' }),
    buildForcedUseQuotaFacts: () => ({ ok: false }),
    forcedCompositeFinalRemainingSeconds: () => ({ ok: false }),
    readForcedUseDay: async () => ({ ok: true, seconds: 0, byCauseSeconds: {} }),
    ensureForcedUseContributions: async () => ({ ok: true }),
    readForcedUsePromptProgress: async () => null,
    chrome: { storage: { local: { get: async () => ({ cloud_profile_id: 'profile-a', cloud_device_id: 'device-a' }) } } },
    isSharedAccessRuntimeEnabled: () => false,
    console,
    Date,
    crypto: webcrypto,
    TextEncoder,
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
    restQuotaReminderReason: (quotaState = {}) => quotaState.weeklyRestLocked
      ? 'weekly_rest_locked'
      : quotaState.dailyRestLocked ? 'daily_rest_locked' : 'rest_locked',
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
  section('Downtime website gate before quota; exceptions do not bypass existing restrictions');
  {
    const nowMs = Date.parse('2026-10-12T14:00:00Z');
    const cfg = { enabled: true, mode: 'study', studyList: ['study.test'], compositeList: ['composite.test'],
      restrictedEntertainmentList: ['rest.test'], unsafeList: ['blocked.test'], quotaState: {},
      downtimeConfig: { schemaVersion: 1, enabled: true, windowsByWeekday: { monday: [{ start: '22:00', end: '07:00' }] },
        allowedWebsiteTypes: ['study', 'composite'], allowedApplicationTypes: [] } };
    let quotaReads = 0;
    const svc = loadModeService({ getConfig: async () => cfg,
      evaluateQuotaState: async () => { quotaReads++; throw new Error('unavailable'); } });
    cfg.timeQuota = { accountingVersion: 2 };
    const access = host => svc.handleModeEvent({ type: 'ACCESS_OBSERVED', url: `https://${host}`, tabId: 7, nowMs });
    const denied = await access('rest.test');
    expect('restricted denied independently of quota', denied.reminder?.reason, 'downtime');
    expect('no quota read on downtime denial', quotaReads, 0);
    expect('blocked result has no mode change', denied.modeChange, null);
    expect('blacklist remains higher priority', (await access('blocked.test')).reminder?.reason, 'unsafe');
    expect('unknown is not composite exception', (await access('unknown.test')).reminder?.reason, 'downtime');
    cfg.quotaState = { onlineLocked: true };
    cfg.timeQuota = {};
    expect('study exception still checks online quota', (await access('study.test')).reminder?.reason, 'quota_online');
    expect('composite exception still checks online quota', (await access('composite.test')).reminder?.reason, 'quota_online');
    const scan = await svc.handleModeEvent({ type: 'ACCESS_OBSERVED', url: 'https://study.test', nowMs, downtimeOnly: true });
    expect('background exception does not enter routing', scan.access, 'ignore');
    cfg.downtimeConfig.enabled = false;
    expect('disabled retains existing route', (await access('rest.test')).reminder?.reason, 'quota_online');
    cfg.downtimeConfig.enabled = true;
    expect('end exclusive', (await svc.handleModeEvent({ type: 'ACCESS_OBSERVED', url: 'https://rest.test', nowMs: Date.parse('2026-10-12T23:00:00Z') })).reminder?.reason, 'quota_online');
  }
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

  section('MSVC-3a2d V2 access uses one unified account result');
  {
    let quotaReads = 0;
    let legacyReads = 0;
    const cfg = {
      enabled: true,
      mode: 'study',
      compositeList: ['portal.example'],
      restrictedEntertainmentList: ['video.example'],
      unsafeList: [],
      quotaState: { onlineLocked: true },
      timeQuota: { accountingVersion: 2 },
      dailyStudyQuota: 120,
      dailyUndeterminedQuota: 10,
      dailyRestQuota: 60,
    };
    const svc = loadModeService({
      getConfig: async () => cfg,
      getSession: async () => ({ currentMode: 'study' }),
      getTodayStatsWithCategories: async () => { legacyReads += 1; return {}; },
      evaluateQuotaState: async () => {
        quotaReads += 1;
        return {
          ok: true,
          accountingVersion: 2,
          config: cfg,
          newState: {},
          lockedDomains: [],
          usage: { studySeconds: 60, compositeSeconds: 120, undeterminedSeconds: 120, restSeconds: 180, totalSeconds: 360 },
        };
      },
    });
    const result = await svc.handleModeEvent({
      type: 'ACCESS_OBSERVED', url: 'https://portal.example/path', domain: 'portal.example', foreground: true, nowMs: 1000,
    });
    expect('V2 access reads unified model once and ignores persisted lock', {
      quotaReads,
      legacyReads,
      access: result.access,
      toMode: result.modeChange?.toMode,
      remainingCompositeSeconds: result.notice?.remainingCompositeSeconds,
    }, { quotaReads: 1, legacyReads: 0, access: 'allow', toMode: 'composite', remainingCompositeSeconds: 480 });

    const unavailableSvc = loadModeService({
      getConfig: async () => cfg,
      resolveSiteAccessClassification: () => ({ classification: 'restricted' }),
      evaluateQuotaState: async () => ({
        ok: true, accountingVersion: 2, accountingUnavailable: true, config: cfg,
        newState: { accountingUnavailable: true }, lockedDomains: [], usage: { ok: false },
      }),
    });
    const unavailable = await unavailableSvc.handleModeEvent({
      type: 'ACCESS_OBSERVED', url: 'https://video.example/watch', domain: 'video.example', foreground: true, nowMs: 1000,
    });
    expect('V2 unreadable local account blocks restricted with explicit reason', {
      access: unavailable.access,
      reason: unavailable.reminder?.reason,
    }, { access: 'reminder', reason: 'accounting_unavailable' });
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

  section('MSVC-5a autonomy can skip entry confirmation without bypassing hard rules');
  {
    const svc = loadModeService();
    const base = {
      currentMode: 'study',
      nowMs: 30_000,
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      quotaState: { restLocked: false },
    };
    expect('missing autonomy config preserves full confirmation', svc.evaluateModeRoute(base), {
      kind: 'reminder',
      reminderReason: 'to_rest_slide_confirm',
      extraParams: { originMode: 'study' },
    });
    expect('disabled entry confirmation moves Study directly to Rest', svc.evaluateModeRoute({
      ...base,
      restrictedEntryConfirmationRequired: false,
    }), {
      kind: 'mode_change',
      toMode: 'rest',
      reason: 'restricted_entry_direct',
      source: 'auto_mode_route',
      notice: 'restricted_entry_direct',
    });
    expect('disabled entry confirmation moves Composite directly to Rest', svc.evaluateModeRoute({
      ...base,
      currentMode: 'composite',
      restrictedEntryConfirmationRequired: false,
    }), {
      kind: 'mode_change',
      toMode: 'rest',
      reason: 'restricted_entry_direct',
      source: 'auto_mode_route',
      notice: 'restricted_entry_direct',
    });
    expect('disabled entry confirmation cannot bypass Rest schedule', svc.evaluateModeRoute({
      ...base,
      restWindowAllowed: false,
      restrictedEntryConfirmationRequired: false,
    }), {
      kind: 'reminder',
      reminderReason: 'rest_schedule_locked',
    });
    expect('disabled entry confirmation cannot bypass Rest quota', svc.evaluateModeRoute({
      ...base,
      restrictedEntryConfirmationRequired: false,
      quotaState: { restLocked: true, weeklyRestLocked: true },
    }), {
      kind: 'reminder',
      reminderReason: 'weekly_rest_locked',
    });
    expect('disabled entry confirmation cannot bypass blacklist', svc.evaluateModeRoute({
      ...base,
      isUnsafe: true,
      restrictedEntryConfirmationRequired: false,
    }), {
      kind: 'reminder',
      reminderReason: 'unsafe',
    });
  }

  section('MSVC-7 Rest lock reason preserves daily/weekly source');
  {
    const svc = loadModeService();
    expect('weekly Rest lock uses weekly reminder', svc.evaluateModeRoute({
      currentMode: 'study',
      nowMs: 30_000,
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      quotaState: { restLocked: true, weeklyRestLocked: true },
    }), {
      kind: 'reminder',
      reminderReason: 'weekly_rest_locked',
    });
    expect('daily Rest lock uses daily reminder', svc.evaluateModeRoute({
      currentMode: 'study',
      nowMs: 30_000,
      isStudyDomain: false,
      isCompositeDomain: false,
      isRestricted: true,
      quotaState: { restLocked: true, dailyRestLocked: true },
    }), {
      kind: 'reminder',
      reminderReason: 'daily_rest_locked',
    });
  }

  section('D-114 shared actual ACCESS_OBSERVED consumer');
  {
    const { pathToFileURL } = require('node:url');
    const common = await import(pathToFileURL(path.resolve(__dirname, '../../extension/core/shared-contracts/1.30.0/shared-access.js')).href);
    const at = Date.parse('2026-09-28T04:00:00Z');
    for (const test of [
      { name: 'composite borrows Rest inside Composite window with Rest window closed', nature: 'composite', access: 'allow', mode: 'rest' },
      { name: 'unclassified borrows Rest with same Composite window', nature: 'pending_composite', access: 'allow', mode: 'rest' },
      { name: 'closed Composite cannot borrow', nature: 'composite', close: true, reason: 'composite_schedule_locked' },
      { name: 'restricted stays subject to Rest window', nature: 'restricted', reason: 'rest_schedule_locked' },
      { name: 'weekly exhausted', nature: 'composite', week: 0, reason: 'weekly_rest_locked' },
      { name: 'blacklist wins even for other', nature: 'blocked', reason: 'unsafe' },
      { name: 'other bypasses category windows', nature: 'other', access: 'allow' },
      { name: 'other still has object daily limit', nature: 'other', siteLocked: true, reason: 'quota' },
    ]) {
      const policy = { ...common.projectLegacySharedAccessPolicy({}, 1, 0), stage: 'shared' };
      policy.timeWindows.monday.composite = test.close ? [{ start: '13:00', end: '14:00' }] : [{ start: '12:00', end: '13:00' }];
      policy.timeWindows.monday.rest = [{ start: '13:00', end: '14:00' }];
      const cfg = { enabled: true, mode: 'study', timeQuota: { accountingVersion: 2 }, dailyUndeterminedQuota: 1,
        dailyRestQuota: 120, timeWindows: { daily: {} }, autonomyConfig: { restrictedEntryConfirmationRequired: false } };
      let reads = 0;
      const svc = loadModeService({
        isInternalPseudoDomain: () => false, recordUnclassifiedSiteAccess: async () => ({ ok: false }),
        isSharedAccessRuntimeEnabled: () => true, sharedAccessAdmissionV1: common.sharedAccessAdmissionV1,
        resolveManagedTargetAttribution: () => ({ targetClassificationAtTime: test.nature }),
        resolveSiteAccessClassification: () => ({ classification: test.nature }),
        getConfig: async () => cfg, getSession: async () => ({ currentMode: 'study' }),
        evaluateQuotaState: async () => { reads++; return { sharedRuntime: true, accountingVersion: 2, config: cfg,
          newState: {}, lockedDomains: test.siteLocked ? ['fixture.test'] : [],
          usage: { studySeconds: 0, undeterminedSeconds: 60, restSeconds: 0, totalSeconds: 60 },
          sharedModel: { policy, preparation: { projection: { complete: true,
            days: [{ date: '2026-09-28', complete: true, remainingMs: { study: null, composite: 0, rest: 60000 } }],
            week: { restRemainingMs: test.week ?? null } } } } }; },
      });
      const result = await svc.handleModeEvent({ type: 'ACCESS_OBSERVED', url: 'https://fixture.test/page',
        foreground: true, nowMs: at });
      expect(test.name, { access: result.access, reason: result.reminder?.reason, mode: result.modeChange?.toMode },
        { access: test.access ?? 'reminder', reason: test.reason, mode: test.mode });
      expect('quota snapshot only after blacklist: ' + test.name, reads, test.nature === 'blocked' ? 0 : 1);
    }
  }
  section('Advisory windows: actual access consumer and hard gates');
  for (const nature of ['study', 'composite', 'pending_composite', 'restricted']) {
    const cfg = { enabled: true, mode: 'study', timeQuota: { accountingVersion: 2 }, autonomyConfig: { timeWindowAdvisoryEnabled: true },
      timeWindows: { daily: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day,
        { studyWindows: [{ start: '07:00', end: '22:00' }], compositeWindows: [{ start: '07:00', end: '22:00' }], restWindows: [{ start: '07:00', end: '22:00' }] }])) } };
    let grantedKey = null, hard = false;
    const svc = loadModeService({ getConfig: async () => cfg, resolveSiteAccessClassification: () => ({ classification: nature,
      source: 'fixtureList', pattern: 'fixture.test' }),
      hasScheduleConfirmation: async context => context.key === grantedKey,
      evaluateQuotaState: async () => ({ ok: true, config: cfg, newState: { onlineLocked: hard }, usage: { restSeconds: 0, undeterminedSeconds: 0, studySeconds: 0 } }) });
    const event = { type: 'ACCESS_OBSERVED', tabId: 8, foreground: true, url: 'https://fixture.test/page', nowMs: Date.parse('2026-10-15T02:00:00+08:00') };
    const originalTimezone = process.env.TZ; process.env.TZ = 'Asia/Shanghai';
    const beforeGrant = await svc.handleModeEvent(event);
    expect(nature + ' prompts before any mode change', beforeGrant.access, 'confirmation');
    grantedKey = beforeGrant.confirmation.key;
    expectTrue(nature + ' granted window does not repeatedly block', (await svc.handleModeEvent(event)).access !== 'reminder');
    expectTrue(nature + ' grant is reused in another tab', (await svc.handleModeEvent({ ...event, tabId: 9,
      url: 'https://fixture.test/another' })).access !== 'confirmation');
    hard = true;
    expect(nature + ' hard quota still blocks after confirmation in another tab',
      (await svc.handleModeEvent({ ...event, tabId: 9 })).reminder?.reason, 'quota_online');
    process.env.TZ = originalTimezone;
  }
  section('Manual advisory mode entry: no commit before confirmation');
  for (const nature of ['study', 'composite', 'pending_composite', 'restricted']) {
    const requested = nature === 'study' ? 'study' : nature === 'restricted' ? 'rest' : 'composite';
    const cfg = { enabled: true, mode: requested === 'study' ? 'rest' : 'study', timeQuota: { accountingVersion: 2 },
      autonomyConfig: { timeWindowAdvisoryEnabled: true },
      timeWindows: { daily: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day,
        { studyWindows: [{ start: '07:00', end: '22:00' }], compositeWindows: [{ start: '07:00', end: '22:00' }], restWindows: [{ start: '07:00', end: '22:00' }] }])) } };
    let session = { currentMode: cfg.mode }, granted = false, hard = false, unsafe = false;
    const writes = [], boundaries = [];
    const svc = loadModeService({ getConfig: async () => cfg, getSession: async () => session,
      saveSession: async value => { writes.push('session'); session = value; },
      saveConfig: async value => { writes.push('config'); Object.assign(cfg, value); },
      enqueueModeBoundaryIntent: async intent => { boundaries.push(intent); return { ok: true, intent }; },
      resolveSiteAccessClassification: () => ({ classification: unsafe ? 'blocked' : nature }),
      hasScheduleConfirmation: async () => granted,
      evaluateQuotaState: async () => ({ ok: true, config: cfg, newState: { onlineLocked: hard },
        usage: { restSeconds: 0, undeterminedSeconds: 0, studySeconds: 0 } }) });
    const event = { type: 'REQUEST_MODE_CHANGE', requestedMode: requested, tabId: 8,
      url: 'https://fixture.test/page', source: 'popup', nowMs: Date.parse('2026-10-15T02:00:00+08:00') };
    const originalTimezone = process.env.TZ; process.env.TZ = 'Asia/Shanghai';
    const pending = await svc.handleModeEvent(event);
    expect(nature + ' manual uses website confirmation', pending.access, 'confirmation');
    expect(nature + ' manual has no mode intent before confirmation', pending.modeChange, null);
    expect(nature + ' confirmation has no persistent mode writes', writes.length, 0);
    expect(nature + ' confirmation enqueues no accounting boundary', boundaries.length, 0);
    const reminderPage = await svc.handleModeEvent({ ...event, fromReminderPage: true });
    expect(nature + ' extension Reminder defers website confirmation to navigation', reminderPage.modeChange?.toMode, requested);
    expect(nature + ' extension page does not create a webpage grant', reminderPage.access, 'allow');
    granted = true;
    const allowed = await svc.handleModeEvent(event);
    expect(nature + ' confirmed manual selection uses existing mode commit', allowed.modeChange?.toMode, requested);
    await svc.commitModeChange(allowed.modeChange);
    await svc.commitModeChange(allowed.modeChange);
    expect(nature + ' identical confirmed commits enqueue only one boundary', boundaries.length, 1);
    hard = true;
    expect(nature + ' manual hard quota remains higher priority', (await svc.handleModeEvent(event)).reminder?.reason, 'quota_locked');
    hard = false; unsafe = true;
    expect(nature + ' manual confirmation cannot bypass blacklist', (await svc.handleModeEvent(event)).reminder?.reason, 'unsafe');
    process.env.TZ = originalTimezone;
  }
  section('Forced-use V2 access routes through one confirmation and final hard point');
  {
    const cfg = { enabled: true, mode: 'study', timeQuota: { accountingVersion: 2 },
      compositeList: ['fixture.test'], autonomyConfig: { restrictedEntryConfirmationRequired: false } };
    let final = false, accepted = false, reads = 0;
    const svc = loadModeService({ getConfig: async () => cfg,
      readForcedUsePolicy: () => ({ enabled: true, reminderIntervalMinutes: 30,
        advisoryWindowDailyMaxMinutes: null, quotaOverrunMinutes: {} }),
      evaluateQuotaState: async () => ({ ok: true, config: cfg, accountingVersion: 2,
        newState: { undeterminedLocked: final }, usage: { ok: true, compositeSeconds: 3600,
          undeterminedSeconds: 3600, restSeconds: 0, studySeconds: 0, totalSeconds: 3600,
          weekRestSeconds: 0, domainSeconds: {} } }),
      prepareForcedUseAdmission: input => { reads++; return final
        ? { ok: true, action: 'block', reasons: ['dailyComposite'] }
        : accepted ? { ok: true, action: 'allow', reasons: ['dailyComposite'] }
          : { ok: true, action: 'confirm', reasons: ['dailyComposite'],
            identityKey: input.identityKey, dateKey: input.dateKey, ruleKey: input.ruleKey,
            quotaBucket: input.quotaBucket, policySignature: 'test' }; },
      buildForcedUseQuotaFacts: () => ({ ok: true, quotas: [] }),
      forcedCompositeFinalRemainingSeconds: () => ({ ok: true, seconds: 900 }) });
    const event = { type: 'ACCESS_OBSERVED', tabId: 8, foreground: true,
      url: 'https://fixture.test/page', nowMs: Date.parse('2026-10-15T02:00:00+08:00') };
    const before = await svc.handleModeEvent(event);
    expect('standard line enters unified confirmation', before.access, 'forced_confirmation');
    expect('confirmation does not commit mode', before.modeChange, null);
    expect('confirmation uses composite charge bucket', before.forcedAdmission.quotaBucket, 'composite');
    const manual = { type: 'REQUEST_MODE_CHANGE', requestedMode: 'composite', tabId: 8,
      foreground: true, url: event.url, nowMs: event.nowMs, source: 'popup' };
    const manualBefore = await svc.handleModeEvent(manual);
    expect('manual mode entry uses the same confirmation', manualBefore.access, 'forced_confirmation');
    expect('manual mode remains uncommitted', manualBefore.modeChange, null);
    accepted = true;
    const after = await svc.handleModeEvent(event);
    expect('confirmed access carries grant evidence', after.forcedAdmission?.reasons, ['dailyComposite']);
    expectTrue('confirmed Composite does not borrow Rest at standard line', after.modeChange?.toMode !== 'rest');
    expectTrue('confirmed access used final Composite remaining', reads >= 2);
    final = true;
    expect('final Composite point blocks', (await svc.handleModeEvent(event)).reminder?.reason, 'quota_undetermined');
  }
  section('Shared V2 first entry and unknown statistics without applicable quota');
  {
    const sharedCore = await import(require('node:url').pathToFileURL(path.join(__dirname, '../../extension/core/shared-forced-use-admission.js')).href);
    const forcedCore = await import(require('node:url').pathToFileURL(path.join(__dirname, '../../extension/core/forced-use-policy.js')).href);
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const cfg = { enabled: true, mode: 'study', restrictedEntertainmentList: ['fixture.test'],
      autonomyConfig: { restrictedEntryConfirmationRequired: true, quotaOverrunConfirmationRequired: true },
      timeQuota: { accountingVersion: 2, weekly: { restMinutes: null }, daily: Object.fromEntries(days.map(day => [day,
        { studyMinutes: null, compositeMinutes: null, restMinutes: null, onlineMinutes: null }])) },
      forcedUsePolicyV1: { schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
        quotaOverrunMinutes: { dailyStudy: null, dailyComposite: null, dailyRest: null, dailyOnline: null, weeklyRest: null, domain: null },
        advisoryWindowDailyMaxMinutes: null } };
    let confirmed = false;
    const svc = loadModeService({ getConfig: async () => cfg, isSharedAccessRuntimeEnabled: () => true,
      readForcedUsePolicy: forcedCore.readForcedUsePolicy,
      prepareSharedForcedUseAdmission: sharedCore.prepareSharedForcedUseAdmission,
      hasApplicableSharedQuota: sharedCore.hasApplicableSharedQuota,
      hasSharedForcedUseConfirmation: () => confirmed,
      ensureForcedUseContributions: async () => { throw Error('shared runtime cannot read an independent reminder counter'); },
      evaluateQuotaState: async () => ({ ok: true, accountingVersion: 2, sharedRuntime: true,
        sharedModel: { policy: { schemaVersion: 2 }, policyIdentity: { schemaVersion: 2, policyHash: 'a'.repeat(64) } },
        config: cfg, calendar: { date: '2026-10-16' }, newState: {}, accountingUnavailable: true, usage: { ok: false } }) });
    const event = { type: 'ACCESS_OBSERVED', tabId: 8, windowId: 9, foreground: true,
      url: 'https://fixture.test/page', nowMs: Date.parse('2026-10-16T12:15:00+08:00') };
    const entry = await svc.handleModeEvent(event);
    expect('no applicable quota still requests normal entry confirmation', entry.access, 'forced_confirmation');
    expect('normal entry has its own real reason', entry.forcedAdmission.reasons, ['restrictedEntry']);
    expect('shared first entry does not commit mode before confirmation', entry.modeChange, null);
    confirmed = true;
    const entered = await svc.handleModeEvent(event);
    expect('Service confirmation resumes existing Rest mode routing', entered.modeChange?.toMode, 'rest');
    expect('unknown usage is not filled with synthetic quota values', entered.forcedAdmission.presentation.quotas, []);
    cfg.timeQuota.daily.friday.restMinutes = 120;
    expect('an applicable unknown quota stays distinguishable', (await svc.handleModeEvent(event)).reminder?.reason, 'accounting_unavailable');
    cfg.unsafeList = ['fixture.test'];
    expect('blacklist remains enforceable with unknown statistics', (await svc.handleModeEvent(event)).reminder?.reason, 'unsafe');
  }
  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} mode-service tests passed`);
})();
