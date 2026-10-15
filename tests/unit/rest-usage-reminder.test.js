// Run with: node tests/unit/rest-usage-reminder.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    return;
  }
  failed++;
  console.error(`  FAIL ${label}${detail ? `: ${detail}` : ''}`);
}

function equal(label, actual, expected) {
  check(label, actual === expected, `expected=${String(expected)} actual=${String(actual)}`);
}

class MockStorage {
  constructor() { this.data = {}; }
  async get(keys) {
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, this.data[key]]));
    return { ...this.data };
  }
  async set(items) { Object.assign(this.data, items); }
}

function loadModule(injected) {
  const sourcePath = path.join(__dirname, '..', '..', 'extension', 'product', 'rest-usage-reminder.js');
  let code = fs.readFileSync(sourcePath, 'utf8');
  code = code.replace(/^import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  const names = [
    'REST_USAGE_REMINDER_STATE_KEY',
    'REST_USAGE_REMINDER_DEADLINE_ALARM',
    'REST_USAGE_REMINDER_RETRY_ALARM',
    'REST_USAGE_REMINDER_TIMEOUT_MS',
    'REST_USAGE_REMINDER_RETRY_MS',
    'restUsageReminderConfigValue',
    'restUsageReminderRepeatConfigValue',
    'restUsageReminderWeeklyConfigValue',
    'restUsageReminderTimeoutAction',
    'evaluateRestUsageReminder',
    'handleRestUsageReminderAction',
    'restoreRestUsageReminderForTab',
    'suspendLegacyRestUsageReminder',
    'requestScheduleUsageConfirmation',
  ];
  const factory = new Function('__injected', `
    const { getEffectiveQuotaForDate, budgetedLocalSet } = __injected;
    const isAutonomyConfirmationText = value => value === '适合使用';
    const softReminderRepeatMinutes = count => count > 0 ? 30 : 60;
    const grantScheduleConfirmation = async () => {};
    const revokeScheduleConfirmation = async () => {};
    const readScheduleConfirmationScope = async () => 'isolated-child-scope';
    ${code}
    const api = { ${names.join(', ')} };
    api.handleRestUsageReminderAction = (message, sender, options) => handleRestUsageReminderAction({ confirmationText: '适合使用', ...message }, sender, options);
    return api;
  `);
  return factory(injected);
}

async function main() {
  const local = new MockStorage();
  const alarms = new Map();
  const messages = [];
  let deliveryMode = 'success';
  let activeTab = { id: 11, windowId: 7, active: true };
  let activeWindow = { id: 7, focused: true, state: 'normal' };

  global.chrome = {
    storage: { local },
    tabs: {
      query: async () => activeTab ? [activeTab] : [],
      sendMessage: async (_tabId, payload, options) => {
        messages.push({ ...payload, deliveryOptions: options || null });
        if (payload.type === 'SHOW_REST_USAGE_REMINDER') {
          return deliveryMode === 'show_fail' ? null : { ok: true, visible: true, confirmationVersion: deliveryMode === 'old_content' ? undefined : 1 };
        }
        if (payload.type === 'ACTIVATE_REST_USAGE_REMINDER') {
          return deliveryMode === 'activate_fail' ? null : { ok: true, visible: true, confirmationVersion: 1 };
        }
        return { ok: true };
      },
    },
    windows: { get: async () => activeWindow },
    alarms: {
      create: async (name, options) => { alarms.set(name, options); },
      clear: async (name) => alarms.delete(name),
    },
  };

  const module = loadModule({
    getEffectiveQuotaForDate: () => ({
      todayEffectiveQuota: { restMinutes: 180, weeklyRestMinutes: 600 },
    }),
    budgetedLocalSet: async (items) => local.set(items),
  });

  let dateKey = '2026-08-29';
  let config = { restConfig: { firstReminderMinutes: 120, repeatReminderMinutes: 30 } };
  let usage = { ok: true, restSeconds: 0, weekRestSeconds: 0 };
  let usageReadError = null;
  let timingSession = { state: 'ACTIVE', quotaBucketAtTime: 'rest', tabId: 11 };
  const endCalls = [];
  const deps = {
    getConfig: async () => config,
    getDateKey: () => dateKey,
    getQuotaUsageView: async () => {
      if (usageReadError) throw usageReadError;
      return usage;
    },
    getTimingSession: async () => timingSession,
    endRestUsage: async (input) => { endCalls.push(input); return { ok: true }; },
  };
  const reset = () => {
    local.data = {};
    alarms.clear();
    messages.length = 0;
    deliveryMode = 'success';
    activeTab = { id: 11, windowId: 7, active: true };
    activeWindow = { id: 7, focused: true, state: 'normal' };
    timingSession = { state: 'ACTIVE', quotaBucketAtTime: 'rest', tabId: 11 };
    usageReadError = null;
    endCalls.length = 0;
    dateKey = '2026-08-29';
  };

  equal('missing soft limit defaults to 120', module.restUsageReminderConfigValue({}), 120);
  equal('null soft limit disables reminder', module.restUsageReminderConfigValue({ restConfig: { firstReminderMinutes: null } }), null);
  equal('soft limit accepts lower boundary', module.restUsageReminderConfigValue({ restConfig: { firstReminderMinutes: 1 } }), 1);
  equal('soft limit accepts upper boundary', module.restUsageReminderConfigValue({ restConfig: { firstReminderMinutes: 1440 } }), 1440);
  equal('soft limit rejects decimal', module.restUsageReminderConfigValue({ restConfig: { firstReminderMinutes: 1.5 } }), 120);
  equal('soft limit rejects out of range', module.restUsageReminderConfigValue({ restConfig: { firstReminderMinutes: 1441 } }), 120);
  equal('missing repeat interval defaults to 60', module.restUsageReminderRepeatConfigValue({ restConfig: {} }), 60);
  equal('legacy lower interval is ignored', module.restUsageReminderRepeatConfigValue({ restConfig: { repeatReminderMinutes: 1 } }), 60);
  equal('legacy upper interval is ignored', module.restUsageReminderRepeatConfigValue({ restConfig: { repeatReminderMinutes: 1440 } }), 60);
  equal('legacy fields remain ignored', module.restUsageReminderConfigValue({ restConfig: { reminderInterval: 5, maxRestDuration: 3 } }), 120);
  equal('missing autonomy config defaults timeout to end Rest', module.restUsageReminderTimeoutAction({}), 'end_rest');
  equal('old continue never bypasses confirmation', module.restUsageReminderTimeoutAction({ autonomyConfig: { softReminderTimeoutAction: 'continue' } }), 'end_rest');
  equal('invalid timeout action preserves safe default', module.restUsageReminderTimeoutAction({ autonomyConfig: { softReminderTimeoutAction: 'invalid' } }), 'end_rest');

  usage = { ok: true, restSeconds: 7199, weekRestSeconds: 20_000 };
  let result = await module.evaluateRestUsageReminder({ deps, now: 1_780_000_000_000 });
  equal('below soft limit does not prompt', result.skipped, 'below_threshold');

  usage = { ok: true, restSeconds: 7200, weekRestSeconds: 20_000 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_000_001_000 });
  check('first soft-limit prompt is visible', result.prompted === true && result.visible === true);
  const firstShow = messages.find(item => item.type === 'SHOW_REST_USAGE_REMINDER');
  equal('first prompt kind is explicit', firstShow.reminderKind, 'first');
  equal('first prompt includes soft limit', firstShow.softLimitMinutes, 120);
  equal('first prompt overage starts at zero', firstShow.overageSeconds, 0);
  equal('prompt shows true daily remaining quota', firstShow.todayRemainingSeconds, 3600);
  equal('prompt shows true weekly remaining quota', firstShow.weekRemainingSeconds, 16_000);
  equal('prompt UI targets top frame', firstShow.deliveryOptions?.frameId, 0);
  check('delivery order is show, activate, pause', messages.slice(-3).map(item => item.type).join(',') === 'SHOW_REST_USAGE_REMINDER,ACTIVATE_REST_USAGE_REMINDER,PAUSE_REST_USAGE_MEDIA');
  check('visible delivery creates deadline alarm', alarms.has(module.REST_USAGE_REMINDER_DEADLINE_ALARM));
  equal('visible deadline is sixty seconds', result.prompt.deadlineAt - result.prompt.shownAt, module.REST_USAGE_REMINDER_TIMEOUT_MS);
  const firstToken = result.prompt.token;
  const missingText = await module.handleRestUsageReminderAction({ token: firstToken, action: 'continue', confirmationText: undefined },
    { tab: { id: 11 } }, { deps, now: 1_780_000_001_100 });
  equal('missing confirmation text never continues', missingText.error, 'confirmation_text_required');
  const wrongFrame = await module.handleRestUsageReminderAction({ token: firstToken, action: 'continue' },
    { tab: { id: 11 }, frameId: 2 }, { deps, now: 1_780_000_001_100 });
  equal('iframe cannot confirm top-frame prompt', wrongFrame.error, 'invalid_prompt_sender');

  result = await module.handleRestUsageReminderAction({
    token: result.prompt.token,
    action: 'continue',
  }, { tab: { id: 11 } }, { deps, now: 1_780_000_002_000 });
  equal('slide continue succeeds', result.action, 'continue');
  equal('first confirmation adds sixty minutes', result.nextThresholdSeconds, 10800);
  equal('continue does not end Rest', endCalls.length, 0);

  usage = { ok: true, restSeconds: 10799, weekRestSeconds: 21_799 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_001_000_000 });
  equal('repeat waits for configured interval', result.skipped, 'below_threshold');
  usage = { ok: true, restSeconds: 10800, weekRestSeconds: 21_800 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_001_001_000 });
  equal('repeat prompt kind is explicit', result.prompt.reminderKind, 'repeat');
  equal('repeat prompt shows cumulative overage', result.prompt.overageSeconds, 3600);
  result = await module.handleRestUsageReminderAction({ token: result.prompt.token, action: 'continue' },
    { tab: { id: 11 } }, { deps, now: 1_780_001_002_000 });
  equal('second confirmation adds thirty minutes', result.nextThresholdSeconds, 12600);
  usage.restSeconds = 12600;
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_001_003_000 });

  const activePrompt = result.prompt;
  config = { restConfig: { firstReminderMinutes: null, repeatReminderMinutes: 5 } };
  result = await module.evaluateRestUsageReminder({ deps, now: activePrompt.shownAt + 10_000 });
  check('visible prompt survives config changes', result.pending === true && result.state.prompt.token === activePrompt.token);
  result = await module.evaluateRestUsageReminder({ deps, now: activePrompt.deadlineAt, reason: 'deadline_alarm' });
  equal('visible prompt timeout ends Rest', result.action, 'end');

  reset();
  config = {
    restConfig: { firstReminderMinutes: 1, repeatReminderMinutes: 3 },
    autonomyConfig: { softReminderTimeoutAction: 'continue' },
  };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 60 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_005_000_000 });
  equal('timeout always ends', result.prompt.timeoutAction, 'end_rest');
  result = await module.evaluateRestUsageReminder({ deps, now: result.prompt.deadlineAt, reason: 'deadline_alarm' });
  equal('visible prompt timeout blocks despite old configuration', result.action, 'end');
  equal('timeout records explicit confirmation reason', result.state.lastResolution.reason, 'confirmation_timeout');
  equal('timeout does not acknowledge a threshold', result.state.nextThresholdSeconds, 60);
  equal('timeout ends Rest', endCalls.length, 1);
  check('timeout never resumes paused media', !messages.some(item => item.type === 'RESUME_REST_USAGE_MEDIA'));

  reset();
  config = {
    restConfig: { firstReminderMinutes: 1, repeatReminderMinutes: 3 },
    autonomyConfig: { softReminderTimeoutAction: 'continue' },
  };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 60 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_006_000_000 });
  usageReadError = new Error('quota view unavailable');
  result = await module.evaluateRestUsageReminder({ deps, now: result.prompt.deadlineAt, reason: 'deadline_alarm' });
  equal('timeout blocks even when quota cannot be reread', result.action, 'end');
  equal('failed quota read cannot acknowledge', result.state.nextThresholdSeconds, 60);
  equal('quota read failure still ends', endCalls.length, 1);

  reset();
  config = { restConfig: { firstReminderMinutes: 120, repeatReminderMinutes: 60 } };
  usage = { ok: true, restSeconds: 3600, weekRestSeconds: 3600 };
  await module.evaluateRestUsageReminder({ deps, now: 1_780_010_000_000 });
  config = { restConfig: { firstReminderMinutes: 30, repeatReminderMinutes: 60 } };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_010_001_000 });
  equal('lowering soft limit recomputes a first reminder', result.prompt.reminderKind, 'first');
  equal('recomputed first reminder shows current overage', result.prompt.overageSeconds, 1800);

  await module.handleRestUsageReminderAction({
    token: result.prompt.token,
    action: 'continue',
  }, { tab: { id: 11 } }, { deps, now: 1_780_010_002_000 });
  usage = { ok: true, restSeconds: 3700, weekRestSeconds: 3700 };
  config = { restConfig: { firstReminderMinutes: 30, repeatReminderMinutes: 10 } };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_010_003_000 });
  equal('old repeat setting cannot alter the sixty-minute threshold', result.state.nextThresholdSeconds, 7200);
  equal('rebased reminder waits for new interval', result.skipped, 'below_threshold');

  reset();
  config = { restConfig: { firstReminderMinutes: 1, repeatReminderMinutes: 3 } };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 60 };
  deliveryMode = 'show_fail';
  const failedAt = 1_780_020_000_000;
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt });
  check('first failed delivery remains due', result.deliveryPending === true && result.visible === false);
  check('failed delivery has no deadline alarm', !alarms.has(module.REST_USAGE_REMINDER_DEADLINE_ALARM));
  equal('failed delivery schedules ten-second retry', alarms.get(module.REST_USAGE_REMINDER_RETRY_ALARM)?.when, failedAt + module.REST_USAGE_REMINDER_RETRY_MS);
  check('failed delivery never pauses media', !messages.some(item => item.type === 'PAUSE_REST_USAGE_MEDIA'));

  deliveryMode = 'success';
  result = await module.restoreRestUsageReminderForTab(11, { deps });
  check('Content ready restores due prompt', result.prompted === true && result.visible === true);
  check('restored visible prompt now has deadline', alarms.has(module.REST_USAGE_REMINDER_DEADLINE_ALARM));

  reset();
  config = { restConfig: { firstReminderMinutes: 1, repeatReminderMinutes: 3 } };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 60 };
  deliveryMode = 'activate_fail';
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt });
  check('activation failure also has no deadline', result.deliveryPending === true && !alarms.has(module.REST_USAGE_REMINDER_DEADLINE_ALARM));
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt + module.REST_USAGE_REMINDER_RETRY_MS, reason: 'delivery_retry' });
  equal('second failed delivery enters end path', result.action, 'end');
  equal('delivery fallback reason is stable', endCalls[0]?.reason, 'delivery_failed');
  check('delivery fallback clears retry alarm', !alarms.has(module.REST_USAGE_REMINDER_RETRY_ALARM));

  reset();
  config = {
    restConfig: { firstReminderMinutes: 1, repeatReminderMinutes: 3 },
    autonomyConfig: { softReminderTimeoutAction: 'continue' },
  };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 60 };
  deliveryMode = 'show_fail';
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt });
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt + module.REST_USAGE_REMINDER_RETRY_MS, reason: 'delivery_retry' });
  equal('second failed delivery blocks despite old continue setting', result.action, 'end');
  equal('failed delivery reason is stable', result.state.lastResolution.reason, 'delivery_failed');
  equal('failed delivery never acknowledges threshold', result.state.nextThresholdSeconds, 60);
  equal('failed delivery ends Rest', endCalls.length, 1);
  check('failed invisible delivery does not resume media that was never paused', !messages.some(item => item.type === 'RESUME_REST_USAGE_MEDIA'));

  reset();
  config = { restConfig: { firstReminderMinutes: null, repeatReminderMinutes: 60, weeklyFirstReminderMinutes: null } };
  usage = { ok: true, restSeconds: 7200, weekRestSeconds: 7200 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_030_000_000 });
  equal('disabled soft limit does not prompt', result.skipped, 'disabled');

  reset();
  config = { restConfig: { firstReminderMinutes: 5, repeatReminderMinutes: 3 } };
  usage = { ok: true, restSeconds: 300, weekRestSeconds: 300 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_040_000_000 });
  equal('profile-provided five-minute setting triggers', result.prompt.softLimitMinutes, 5);
  await module.handleRestUsageReminderAction({
    token: result.prompt.token,
    action: 'continue',
  }, { tab: { id: 11 } }, { deps, now: 1_780_040_001_000 });
  equal('old three-minute setting is ignored', local.data[module.REST_USAGE_REMINDER_STATE_KEY].nextThresholdSeconds, 3900);
  dateKey = '2026-08-30';
  usage = { ok: true, restSeconds: 0, weekRestSeconds: 300 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_126_400_000 });
  equal('new local date resets threshold', result.state.nextThresholdSeconds, 300);

  equal('weekly defaults to fourteen hours', module.restUsageReminderWeeklyConfigValue({}), 840);
  for (const value of [1, 10080, null]) equal('weekly boundary ' + value, module.restUsageReminderWeeklyConfigValue({ restConfig: { weeklyFirstReminderMinutes: value } }), value);
  for (const value of [0, 10081, 1.5, '840']) equal('weekly rejects ' + value, module.restUsageReminderWeeklyConfigValue({ restConfig: { weeklyFirstReminderMinutes: value } }), 840);
  reset();
  config = { restConfig: { firstReminderMinutes: 120, weeklyFirstReminderMinutes: 840, repeatReminderMinutes: 60 } };
  usage = { ok: true, restSeconds: 7200, weekRestSeconds: 50400 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_050_000_000 });
  equal('daily and weekly combine into one dialog', result.prompt.reminders.length, 2);
  equal('only one SHOW is delivered for both periods', messages.filter(m => m.type === 'SHOW_REST_USAGE_REMINDER').length, 1);
  result = await module.handleRestUsageReminderAction({ token: result.prompt.token, action: 'continue' }, { tab: { id: 11 } }, { deps, now: 1_780_050_001_000 });
  equal('daily covered threshold advances', result.state.nextThresholdSeconds, 10800);
  equal('weekly covered threshold advances', result.state.weekly.nextThresholdSeconds, 54000);
  dateKey = '2026-08-30'; usage = { ok: true, restSeconds: 0, weekRestSeconds: 51000 };
  result = await module.evaluateRestUsageReminder({ deps });
  equal('weekly acknowledgement survives midnight', result.state.weekly.nextThresholdSeconds, 54000);
  equal('daily acknowledgement resets at midnight', result.state.lastAcknowledgedUsageSeconds, null);
  usage.weekRestSeconds = 54000;
  result = await module.evaluateRestUsageReminder({ deps });
  equal('only weekly is due after midnight', result.prompt.reminders[0].scope, 'weekly');
  equal('weekly repeat is explicit', result.prompt.reminders[0].reminderKind, 'repeat');
  await module.handleRestUsageReminderAction({ token: result.prompt.token, action: 'continue' }, { tab: { id: 11 } }, { deps });
  dateKey = '2026-08-31'; usage = { ok: true, restSeconds: 0, weekRestSeconds: 0 };
  result = await module.evaluateRestUsageReminder({ deps });
  equal('weekly resets Monday in Beijing calendar', result.state.weekly.nextThresholdSeconds, 50400);
  equal('weekly new week is first reminder', result.state.weekly.lastAcknowledgedUsageSeconds, null);

  reset();
  config = { restConfig: { firstReminderMinutes: 1, weeklyFirstReminderMinutes: 10, repeatReminderMinutes: 3 } };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 500 };
  result = await module.evaluateRestUsageReminder({ deps });
  const token = result.prompt.token;
  usage.weekRestSeconds = 600;
  result = await module.evaluateRestUsageReminder({ deps });
  equal('new weekly due cannot change active daily prompt', result.state.prompt.reminders.length, 1);
  result = await module.handleRestUsageReminderAction({ token, action: 'continue' }, { tab: { id: 11 } }, { deps });
  equal('unshown weekly threshold is not acknowledged', result.state.weekly.lastAcknowledgedUsageSeconds, null);
  result = await module.evaluateRestUsageReminder({ deps });
  equal('weekly due is shown on next evaluation', result.prompt.reminders[0].scope, 'weekly');
  deps.canContinueRest = async () => false;
  messages.length = 0;
  result = await module.handleRestUsageReminderAction({ token: result.prompt.token, action: 'continue' }, { tab: { id: 11 } }, { deps });
  equal('hard restriction prevents soft continue', result.action, 'end');
  check('hard restriction does not resume media', !messages.some(m => m.type === 'RESUME_REST_USAGE_MEDIA'));
  delete deps.canContinueRest;

  reset();
  config = { restConfig: { firstReminderMinutes: null, weeklyFirstReminderMinutes: 1, repeatReminderMinutes: 3 }, autonomyConfig: { softReminderTimeoutAction: 'continue' } };
  usage = { ok: true, restSeconds: 0, weekRestSeconds: 60 };
  deliveryMode = 'show_fail';
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt });
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt + module.REST_USAGE_REMINDER_RETRY_MS });
  equal('weekly-only failed delivery blocks', result.action, 'end');
  equal('weekly-only failed delivery does not acknowledge', result.state.weekly.nextThresholdSeconds, 60);
  equal('weekly-only does not enable daily reminders', result.state.nextThresholdSeconds, null);

  const content = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'content.js'), 'utf8');
  check('content uses modal top-layer dialog', content.includes('restReminderDialog.showModal()'));
  check('content distinguishes first and repeat wording', content.includes('已达到今日休息软限额') && content.includes('已超过今日休息软限额'));
  check('content renders four quota values', ['本周已用', '本周剩余', '今日已用', '今日剩余'].every(label => content.includes(label)));
  check('content uses separate activation message', content.includes("msg.type === 'ACTIVATE_REST_USAGE_REMINDER'"));
  const resumeBranch = content.split("msg.type === 'RESUME_REST_USAGE_MEDIA'")[1].split('\n  });')[0];
  const applyResume = new Function('msg', 'restReminderToken', 'clearRestUsageReminder', 'resumeMediaAfterRestReminder', 'sendResponse', resumeBranch.slice(resumeBranch.indexOf('{') + 1, resumeBranch.lastIndexOf('}')));
  const resumed = [];
  applyResume({ token: 'current' }, 'current', options => resumed.push(options), () => resumed.push('media'), () => {});
  equal('matching resume closes prompt and restores media', JSON.stringify(resumed), JSON.stringify([{ resumeMedia: true }]));
  resumed.length = 0;
  applyResume({ token: 'old' }, 'current', options => resumed.push(options), () => resumed.push('media'), () => {});
  equal('stale resume does not close or resume a newer prompt', resumed.length, 0);
  applyResume({ token: 'current' }, null, options => resumed.push(options), () => resumed.push('media'), () => {});
  equal('frame without prompt keeps media resume behavior', resumed[0], 'media');

  const background = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
  check('background handles retry alarm', background.includes('REST_USAGE_REMINDER_RETRY_ALARM') && background.includes("reason: 'delivery_retry'"));
  check('background fallback reason reaches existing mode path', background.includes('rest_usage_reminder_${reason}'));

  const cloudRoot = process.env.TOC_CLOUD_TEST_ROOT || path.join(__dirname, '..', '..');
  const pages = fs.readFileSync(path.join(cloudRoot, 'pages', 'index.html'), 'utf8');
  check('Pages exposes soft-limit and advisory controls without obsolete interval input', ['a-rest-reminder-enabled', 'a-rest-first-reminder', 'a-time-window-advisory'].every(id => pages.includes(`id="${id}"`)) && !pages.includes('id="a-rest-repeat-reminder"'));
  check('Pages keeps mandatory timeout instead of default-continue controls', pages.includes('60秒未确认') && !/<input\b[^>]*\bname="a-rest-timeout-action"/i.test(pages));
  check('Pages uses one-to-1440 validation', pages.includes('validRestReminderMinutes') && pages.includes('number <= 1440'));
  check('Pages saves and exports fixed compatibility interval', pages.includes('repeatReminderMinutes: 60') && pages.includes('repeatReminderMinutes,'));
  check('content timeout only blocks', content.includes("const timeoutAction = 'end'") && content.includes("restReminderResolveAction?.(timeoutAction)"));

  const worker = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'profiles.ts'), 'utf8');
  check('Worker validates both reminder fields', worker.includes('restConfig.repeatReminderMinutes') && worker.includes('1-1440 的整数分钟'));
  check('Worker validates autonomy boolean and timeout enum', worker.includes('autonomyConfig.restrictedEntryConfirmationRequired 必须是布尔值') && worker.includes('autonomyConfig.softReminderTimeoutAction 必须是 end_rest 或 continue'));
  check('Worker allows autonomy config in controlled profile writes', /'restConfig',\s*'autonomyConfig',\s*(?:'downtimeConfig',\s*)?'autoStudyConfig'/.test(worker));
  check('Worker deep merges rest and autonomy config', worker.includes("key === 'restConfig' || key === 'autonomyConfig'") && worker.includes('mergedConfig[key] ='));

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'product', 'rest-usage-reminder.js'), 'utf8');
  reset();
  config = { restConfig: { firstReminderMinutes: 1, weeklyFirstReminderMinutes: 1 } };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 60 };
  timingSession = { state: 'ACTIVE', quotaBucketAtTime: 'study', tabId: 11 };
  const schedule = { tabId: 11, host: 'fixture.test', key: 'fixed-gap', mode: 'study' };
  deps.getScheduleContext = async () => schedule;
  deps.blockSchedule = async input => { endCalls.push(input); return { ok: true, blocked: true }; };
  result = await module.requestScheduleUsageConfirmation(schedule, { deps, now: 1_780_060_000_000 });
  equal('schedule combines daily and weekly in one prompt', result.prompt.reminders.length, 2);
  equal('schedule accepts a non-Rest foreground session', result.prompt.schedule.key, 'fixed-gap');
  result = await module.handleRestUsageReminderAction({ token: result.prompt.token, action: 'continue' },
    { tab: { id: 11 } }, { deps, now: 1_780_060_001_000 });
  equal('combined confirmation advances both periods', result.state.nextThresholdSeconds, 3660);
  equal('combined confirmation advances weekly', result.state.weekly.nextThresholdSeconds, 3660);
  reset(); config = { restConfig: { firstReminderMinutes: null, weeklyFirstReminderMinutes: null } };
  deliveryMode = 'show_fail';
  result = await module.requestScheduleUsageConfirmation(schedule, { deps, now: failedAt });
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt + module.REST_USAGE_REMINDER_RETRY_MS });
  equal('disabled soft reminders do not cancel schedule delivery', result.action, 'end');
  equal('failed schedule delivery blocks explicitly', endCalls[0]?.reason, 'delivery_failed');
  reset(); deliveryMode = 'success';
  result = await module.requestScheduleUsageConfirmation(schedule, { deps, now: Date.now() });
  deps.getScheduleContext = async () => null;
  result = await module.restoreRestUsageReminderForTab(11, { deps });
  equal('changed schedule is not restored onto a new page', result.skipped, 'confirmation_context_changed');
  equal('stale schedule restoration does not end new usage', endCalls.length, 0);
  equal('stale schedule deadline removed', alarms.has(module.REST_USAGE_REMINDER_DEADLINE_ALARM), false);
  equal('stale schedule prompt removed', local.data[module.REST_USAGE_REMINDER_STATE_KEY].prompt, null);
  delete deps.getScheduleContext; delete deps.blockSchedule;
  reset(); config = { restConfig: { firstReminderMinutes: 1, weeklyFirstReminderMinutes: null } };
  usage = { ok: true, restSeconds: 60, weekRestSeconds: 60 }; deliveryMode = 'old_content';
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt });
  check('old Content does not start a confirmation deadline', result.deliveryPending === true && !alarms.has(module.REST_USAGE_REMINDER_DEADLINE_ALARM));
  reset(); usage = { ok: true, restSeconds: 3660, weekRestSeconds: 3660 };
  local.data[module.REST_USAGE_REMINDER_STATE_KEY] = { version: 2, dateKey, firstReminderMinutes: 1,
    repeatReminderMinutes: 60, nextThresholdSeconds: 3660, lastAcknowledgedUsageSeconds: 60 };
  result = await module.evaluateRestUsageReminder({ deps, now: failedAt });
  result = await module.handleRestUsageReminderAction({ token: result.prompt.token, action: 'continue' }, { tab: { id: 11 } }, { deps, now: failedAt + 1 });
  equal('legacy acknowledged state uses subsequent 30 minute cadence', result.state.nextThresholdSeconds, 5460);
  check('temporary unpacked ID override is removed', !source.includes('LOCAL_ACCEPTANCE_EXTENSION_ID') && !source.includes('mfmmfemipnmbccecemahcpbiolofcppm'));
  const endCount = endCalls.length;
  local.data[module.REST_USAGE_REMINDER_STATE_KEY] = { prompt: { token: 'migration-prompt', sourceTabId: 11 }, nextThresholdSeconds: 7200 };
  await module.suspendLegacyRestUsageReminder(true);
  equal('shared transition clears legacy prompt', local.data[module.REST_USAGE_REMINDER_STATE_KEY].prompt, null);
  equal('shared transition preserves legacy threshold', local.data[module.REST_USAGE_REMINDER_STATE_KEY].nextThresholdSeconds, 7200);
  equal('shared transition does not end rest', endCalls.length, endCount);
  equal('legacy evaluation suspended during shared runtime', (await module.evaluateRestUsageReminder({ deps })).skipped, 'shared_runtime_active');
  check('shared transition dismisses and restores media', messages.some(m => m.type === 'DISMISS_REST_USAGE_REMINDER' && m.token === 'migration-prompt')
    && messages.some(m => m.type === 'RESUME_REST_USAGE_MEDIA' && m.token === 'migration-prompt'));
  await module.suspendLegacyRestUsageReminder(false);

  console.log(`rest-usage-reminder: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
