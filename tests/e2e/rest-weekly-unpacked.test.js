const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isolatedExtension } = require('./helpers/isolated-extension');

// Only quota amounts/date are accelerated. Chrome APIs, session, SW, Content and actions are real.
const harness = `
let restTestUsage = { ok: true, restSeconds: 0, weekRestSeconds: 0 };
let restTestDate = null;
configureRestUsageReminder({
  getConfig, getDateKey: () => restTestDate || getDateKey(), getTimingSession,
  getQuotaUsageView: async () => restTestUsage,
  canContinueRest: async ({ prompt }) => {
    const tab = await chrome.tabs.get(prompt.sourceTabId).catch(() => null);
    if (!tab?.url) return false;
    const result = await dispatchModeEvent({ type: 'ACCESS_OBSERVED', tabId: tab.id, url: tab.url, source: 'soft_reminder_continue_check' });
    return result?.ok !== false && result?.blocked !== true && result?.reminderSent !== true;
  },
  endRestUsage: async ({ prompt, reason }) => dispatchModeEvent({ type: 'REQUEST_MODE_CHANGE',
    requestedMode: 'study', source: 'rest_usage_reminder', reason: 'rest_usage_reminder_' + reason, tabId: prompt.sourceTabId }),
});
globalThis.restAcceptance = async (input = {}) => {
  if (input.usage) restTestUsage = input.usage;
  if (input.date) restTestDate = input.date;
  if (input.reset) await chrome.storage.local.remove('rest_usage_reminder_state_v1');
  if (input.evaluate) return evaluateRestUsageReminder(input.options || {});
  return { session: await getTimingSession(), state: (await chrome.storage.local.get('rest_usage_reminder_state_v1')).rest_usage_reminder_state_v1,
    config: await getConfig() };
};
globalThis.restAcceptanceContext = async () => {
  const session = await getTimingSession();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const win = tab?.windowId == null ? null : await chrome.windows.get(tab.windowId);
  return { sessionState: session?.state, quotaBucket: session?.quotaBucketAtTime,
    sessionTab: session?.tabId, sessionWindow: session?.windowId,
    activeTab: tab?.id, activeWindow: tab?.windowId, focused: win?.focused, minimized: win?.state === 'minimized' };
};
`;

function tone() {
  const rate = 8000, bytes = rate * 2, result = Buffer.alloc(44 + bytes);
  result.write('RIFF'); result.writeUInt32LE(36 + bytes, 4); result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34); result.write('data', 36); result.writeUInt32LE(bytes, 40);
  for (let i = 0; i < rate; i++) result.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 20), 44 + i * 2);
  return result;
}

const hardOnly = process.env.REST_ACCEPTANCE_HARD_ONLY === '1';
test(hardOnly ? 'real unpacked hard time window prevents soft continue'
  : 'real unpacked SW and Content deliver day/week reminders and preserve hard routing', async () => {
  test.setTimeout(180000);
  const audio = tone();
  const server = http.createServer((request, response) => {
    if (request.url === '/tone.wav') { response.setHeader('Content-Type', 'audio/wav'); response.end(audio); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<html><body><h1>Isolated Rest media acceptance</h1><audio loop controls src="/tone.wav"></audio></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let fixture;
  try {
    fixture = await isolatedExtension('rest-unpacked', harness);
    const { context, worker, probe, directory } = fixture;
    await context.route('https://**/*', route => route.abort());
    await probe.evaluate(async () => {
      const { DEFAULT_CONFIG, saveConfig } = await import('./infra/storage.js');
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      await saveConfig({ ...DEFAULT_CONFIG, mode: 'rest', isInitialized: true,
        studyList: [], compositeList: [], restrictedEntertainmentList: ['127.0.0.1'], unsafeList: [],
        timeQuota: { accountingVersion: 1, weekly: { restMinutes: null }, daily: Object.fromEntries(days.map(d => [d,
          { studyMinutes: null, restMinutes: null, compositeMinutes: null, onlineMinutes: null }])) },
        timeWindows: { daily: Object.fromEntries(days.map(d => [d, { studyWindows: null, compositeWindows: null, restWindows: null }])) },
        autonomyConfig: { restrictedEntryConfirmationRequired: false, softReminderTimeoutAction: 'continue' },
        restConfig: { firstReminderMinutes: 1, weeklyFirstReminderMinutes: 2, repeatReminderMinutes: 1 },
      });
    });
    const media = await context.newPage();
    await media.goto(url);
    await media.bringToFront();
    await media.locator('audio').evaluate(n => n.play());
    await media.mouse.click(15, 15);
    await expect.poll(async () => (await worker.evaluate(() => restAcceptance())).session?.quotaBucketAtTime,
      { timeout: 15000 }).toBe('rest');
    const beforeUrl = media.url();
    const diagnosticEvents = [];
    const contextState = () => worker.evaluate(() => restAcceptanceContext());
    const evaluate = async (rest, week, extra = {}) => {
      const result = await worker.evaluate(input => restAcceptance(input), {
        usage: { ok: true, restSeconds: rest, weekRestSeconds: week }, evaluate: true, ...extra,
      });
      const actual = await worker.evaluate(() => restAcceptance());
      const current = actual.state;
      diagnosticEvents.push({ at: Date.now(), input: { rest, week, date: extra.date || null },
        result: { ok: result?.ok, skipped: result?.skipped, error: result?.error,
          pending: result?.pending, prompted: result?.prompted, deliveryPending: result?.deliveryPending },
        config: actual.config.restConfig,
        state: { date: current?.dateKey, dailyThreshold: current?.nextThresholdSeconds,
          weeklyThreshold: current?.weekly?.nextThresholdSeconds,
          prompt: current?.prompt ? { token: current.prompt.token, deadlineAt: current.prompt.deadlineAt,
            scopes: current.prompt.reminders?.map(r => r.scope) } : null },
        context: await contextState() });
      fs.writeFileSync(path.join(directory, 'diagnostic-events.json'), JSON.stringify(diagnosticEvents, null, 2));
      return result;
    };
    const state = async () => (await worker.evaluate(() => restAcceptance())).state;
    const thumb = media.getByRole('button', { name: '滑动继续休息' });
    const keepGoing = async () => {
      await thumb.focus(); await thumb.press('End');
      await expect.poll(async () => (await state())?.prompt || null).toBe(null);
      await expect(media.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
      await expect.poll(() => media.locator('audio').evaluate(n => n.paused)).toBe(false);
    };
    if (!hardOnly) {
    const daily = await evaluate(60, 60, { reset: true, date: '2026-09-28' });
    expect(daily.prompt.reminders.map(r => r.scope)).toEqual(['daily']);
    await expect(media.getByRole('heading', { name: '已达到今日休息软配额' })).toBeVisible();
    await expect.poll(() => media.locator('audio').evaluate(n => n.paused)).toBe(true);
    await keepGoing();
    const combined = await evaluate(120, 120);
    expect(combined.prompt.reminders.map(r => r.scope)).toEqual(['daily', 'weekly']);
    await expect(media.getByRole('heading', { name: '今日与本周休息软配额提醒' })).toBeVisible();
    await media.screenshot({ path: path.join(directory, 'combined-desktop.png') });
    await media.setViewportSize({ width: 390, height: 844 });
    await media.screenshot({ path: path.join(directory, 'combined-mobile.png') });
    await keepGoing();
    expect((await state()).weekly.nextThresholdSeconds).toBe(180);
    const weekly = await evaluate(0, 180, { date: '2026-09-29' });
    expect(weekly.prompt.reminders.map(r => r.scope)).toEqual(['weekly']);
    await keepGoing();
    const newWeek = await evaluate(0, 0, { date: '2026-10-05' });
    expect(newWeek.prompted).not.toBe(true);
    expect(newWeek.state.weekly.nextThresholdSeconds).toBe(120);
    expect(media.url()).toBe(beforeUrl);

    await evaluate(60, 60);
    // Let the real Content countdown and real alarm share the same wall clock.
    await expect.poll(async () => (await state())?.lastResolution?.reason,
      { timeout: 75000, intervals: [1000] }).toBe('timeout_continue');
    await expect(media.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
    await expect.poll(() => media.locator('audio').evaluate(n => n.paused)).toBe(false);

    await expect.poll(async () => {
      const current = await contextState();
      return current.sessionState === 'ACTIVE' && current.quotaBucket === 'rest'
        && current.sessionTab === current.activeTab && current.sessionWindow === current.activeWindow
        && current.focused === true && !current.minimized;
    }, { timeout: 15000 }).toBe(true);
    const endPrompt = await evaluate(120, 120);
    expect(endPrompt.prompt?.token, JSON.stringify(diagnosticEvents.at(-1))).toBeTruthy();
    await media.getByRole('button', { name: '结束休息', exact: true }).click();
    await expect.poll(async () => (await worker.evaluate(() => restAcceptance())).config.mode).toBe('study');
    expect((await state()).lastResolution.action).toBe('end');
    }

    // Deny a real existing access route by closing its window; no ledger fixtures are written.
    await probe.evaluate(async () => {
      const { getConfig, saveConfig } = await import('./infra/storage.js');
      const config = await getConfig(); config.mode = 'rest';
      await saveConfig(config);
    });
    await media.goto(url); await media.bringToFront();
    await media.locator('audio').evaluate(n => n.play()); await media.mouse.click(15, 15);
    await expect.poll(async () => (await worker.evaluate(() => restAcceptance())).session?.quotaBucketAtTime).toBe('rest');
    await evaluate(60, 60, { reset: true, date: '2026-09-28' });
    await probe.evaluate(async () => {
      const { getConfig, saveConfig } = await import('./infra/storage.js');
      const config = await getConfig();
      // Empty arrays normalize to unrestricted. Use a valid window excluding now.
      const start = new Date().getHours() === 0 ? '01:00' : '00:00';
      const end = new Date().getHours() === 0 ? '02:00' : '01:00';
      for (const value of Object.values(config.timeWindows.daily)) value.restWindows = [{ start, end }];
      await saveConfig(config);
    });
    // Real Content action is posted before routing replaces the denied page.
    await media.getByRole('button', { name: '滑动继续休息' }).press('End').catch(() => {});
    await expect.poll(async () => (await state())?.lastResolution?.reason).toBe('hard_limit');
    await expect.poll(() => media.url()).toContain('reminder.html');
    expect(fixture.errors).toEqual([]);
    const credentials = await probe.evaluate(() => chrome.storage.local.get(['cloud_device_token', 'cloud_profile_id']));
    expect(credentials.cloud_device_token).toBeUndefined();
    expect(credentials.cloud_profile_id).toBeUndefined();
    fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify({ kind: 'real_unpacked_with_accelerated_usage',
      cases: hardOnly ? ['hard_window'] : ['daily', 'merged', 'weekly', 'day_reset', 'week_reset', 'continue', 'timeout_continue', 'end', 'hard_window'],
      noProductionCredentials: true, accountingAccuracyNotClaimed: true }, null, 2));
    console.log('Rest unpacked evidence: ' + directory);
  } finally {
    if (fixture) await fixture.context.close();
    await new Promise(resolve => server.close(resolve));
  }
});
