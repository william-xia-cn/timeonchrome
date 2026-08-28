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
    'evaluateRestUsageReminder',
    'handleRestUsageReminderAction',
    'restoreRestUsageReminderForTab',
  ];
  const factory = new Function('__injected', `
    const { getEffectiveQuotaForDate, budgetedLocalSet } = __injected;
    ${code}
    return { ${names.join(', ')} };
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
          return deliveryMode === 'show_fail' ? null : { ok: true, visible: true };
        }
        if (payload.type === 'ACTIVATE_REST_USAGE_REMINDER') {
          return deliveryMode === 'activate_fail' ? null : { ok: true, visible: true };
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
  let timingSession = { state: 'ACTIVE', quotaBucketAtTime: 'rest', tabId: 11 };
  const endCalls = [];
  const deps = {
    getConfig: async () => config,
    getDateKey: () => dateKey,
    getQuotaUsageView: async () => usage,
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
  equal('repeat interval accepts lower boundary', module.restUsageReminderRepeatConfigValue({ restConfig: { repeatReminderMinutes: 1 } }), 1);
  equal('repeat interval accepts upper boundary', module.restUsageReminderRepeatConfigValue({ restConfig: { repeatReminderMinutes: 1440 } }), 1440);
  equal('legacy fields remain ignored', module.restUsageReminderConfigValue({ restConfig: { reminderInterval: 5, maxRestDuration: 3 } }), 120);

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

  result = await module.handleRestUsageReminderAction({
    token: result.prompt.token,
    action: 'continue',
  }, { tab: { id: 11 } }, { deps, now: 1_780_000_002_000 });
  equal('slide continue succeeds', result.action, 'continue');
  equal('configured 30-minute repeat interval is applied', result.nextThresholdSeconds, 9000);
  equal('continue does not end Rest', endCalls.length, 0);

  usage = { ok: true, restSeconds: 8999, weekRestSeconds: 21_799 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_001_000_000 });
  equal('repeat waits for configured interval', result.skipped, 'below_threshold');
  usage = { ok: true, restSeconds: 9000, weekRestSeconds: 21_800 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_001_001_000 });
  equal('repeat prompt kind is explicit', result.prompt.reminderKind, 'repeat');
  equal('repeat prompt shows cumulative overage', result.prompt.overageSeconds, 1800);

  const activePrompt = result.prompt;
  config = { restConfig: { firstReminderMinutes: null, repeatReminderMinutes: 5 } };
  result = await module.evaluateRestUsageReminder({ deps, now: activePrompt.shownAt + 10_000 });
  check('visible prompt survives config changes', result.pending === true && result.state.prompt.token === activePrompt.token);
  result = await module.evaluateRestUsageReminder({ deps, now: activePrompt.deadlineAt, reason: 'deadline_alarm' });
  equal('visible prompt timeout ends Rest', result.action, 'end');

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
  equal('repeat config change rebases from current settled usage', result.state.nextThresholdSeconds, 4300);
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
  config = { restConfig: { firstReminderMinutes: null, repeatReminderMinutes: 60 } };
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
  equal('profile-provided three-minute repeat is used', local.data[module.REST_USAGE_REMINDER_STATE_KEY].nextThresholdSeconds, 480);
  dateKey = '2026-08-30';
  usage = { ok: true, restSeconds: 0, weekRestSeconds: 300 };
  result = await module.evaluateRestUsageReminder({ deps, now: 1_780_126_400_000 });
  equal('new local date resets threshold', result.state.nextThresholdSeconds, 300);

  const content = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'content.js'), 'utf8');
  check('content uses modal top-layer dialog', content.includes('restReminderDialog.showModal()'));
  check('content distinguishes first and repeat wording', content.includes('已达到今日休息软限额') && content.includes('已超过今日休息软限额'));
  check('content renders four quota values', ['本周已用', '本周剩余', '今日已用', '今日剩余'].every(label => content.includes(label)));
  check('content uses separate activation message', content.includes("msg.type === 'ACTIVATE_REST_USAGE_REMINDER'"));

  const background = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
  check('background handles retry alarm', background.includes('REST_USAGE_REMINDER_RETRY_ALARM') && background.includes("reason: 'delivery_retry'"));
  check('background fallback reason reaches existing mode path', background.includes('rest_usage_reminder_${reason}'));

  const pages = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'index.html'), 'utf8');
  check('Pages exposes soft-limit toggle and numeric inputs', ['q-rest-reminder-enabled', 'q-rest-first-reminder', 'q-rest-repeat-reminder'].every(id => pages.includes(`id="${id}"`)));
  check('Pages uses one-to-1440 validation', pages.includes('validRestReminderMinutes') && pages.includes('number <= 1440'));
  check('Pages saves and exports repeat reminder', pages.includes('repeatReminderMinutes: quotaFiniteNumber') && pages.includes('repeatReminderMinutes,'));

  const worker = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'profiles.ts'), 'utf8');
  check('Worker validates both reminder fields', worker.includes('restConfig.repeatReminderMinutes') && worker.includes('1-1440 的整数分钟'));
  check('Worker deep merges restConfig', worker.includes("key === 'restConfig'") && worker.includes('mergedConfig.restConfig ='));

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'product', 'rest-usage-reminder.js'), 'utf8');
  check('temporary unpacked ID override is removed', !source.includes('LOCAL_ACCEPTANCE_EXTENSION_ID') && !source.includes('mfmmfemipnmbccecemahcpbiolofcppm'));

  console.log(`rest-usage-reminder: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
