const { test, expect } = require('@playwright/test');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { isolatedExtension } = require('./helpers/isolated-extension');

test('non-shared V2 forced use confirms once and retires the host grant when the window opens', async () => {
  test.setTimeout(90000);
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<html><body><h1>Forced use test page</h1></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let fixture;
  try {
    fixture = await isolatedExtension('forced-use', `
      globalThis.forcedUseRecheck = id => reevaluateTabById(id);
      globalThis.forcedUseOpenWindow = async id => {
        const config = await getConfig();
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        config.timeWindows = { daily: Object.fromEntries(days.map(day => [day, {
          studyWindows: [{ start: '00:00', end: '24:00' }],
          compositeWindows: [{ start: '00:00', end: '24:00' }],
          restWindows: [{ start: '00:00', end: '24:00' }],
        }])) };
        await saveConfig(config);
        return reevaluateTabById(id);
      };`);
    const { context, probe, worker, errors } = fixture;
    await probe.evaluate(async () => {
      const { DEFAULT_CONFIG, saveConfig } = await import('./infra/storage.js');
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const beijingHour = Number(new Intl.DateTimeFormat('en-US', {
        hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Shanghai',
      }).format(new Date()));
      const allowedHour = (beijingHour + 2) % 24;
      const allowedWindow = {
        start: `${String(allowedHour).padStart(2, '0')}:00`,
        end: `${String(allowedHour + 1).padStart(2, '0')}:00`,
      };
      await chrome.storage.local.set({ cloud_profile_id: 'isolated-profile', cloud_device_id: 'isolated-device' });
      await saveConfig({ ...DEFAULT_CONFIG, mode: 'study', isInitialized: true, studyList: ['127.0.0.1'],
        compositeList: [], restrictedEntertainmentList: [], unsafeList: [],
        timeQuota: { accountingVersion: 2, weekly: { restMinutes: null }, daily: Object.fromEntries(days.map(day => [day,
          { studyMinutes: null, compositeMinutes: null, restMinutes: null, onlineMinutes: null }])) },
        timeWindows: { daily: Object.fromEntries(days.map(day => [day, {
          studyWindows: [allowedWindow],
          compositeWindows: [allowedWindow],
          restWindows: [allowedWindow],
        }])) },
        restConfig: { firstReminderMinutes: null, weeklyFirstReminderMinutes: null },
        autonomyConfig: { timeWindowAdvisoryEnabled: true, restrictedEntryConfirmationRequired: true },
        forcedUsePolicyV1: { schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
          quotaOverrunMinutes: { dailyStudy: null, dailyComposite: null, dailyRest: null,
            dailyOnline: null, weeklyRest: null, domain: null },
          advisoryWindowDailyMaxMinutes: null } });
    });
    const page = await context.newPage();
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url);
    await page.bringToFront();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    await worker.evaluate(id => forcedUseRecheck(id), tabId);
    await expect(page.getByRole('heading', { name: '当前不在允许使用时段' })).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: test.info().outputPath('forced-use-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: test.info().outputPath('forced-use-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    const input = page.getByRole('textbox', { name: '手动输入强行使用' });
    await input.fill('强行使用');
    await page.getByRole('button', { name: '确认继续', exact: true }).click();
    await expect(page.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
    const before = await worker.evaluate(async () => (await chrome.storage.session.get('forced_use_prompt_state_v1'))
      .forced_use_prompt_state_v1?.grants || []);
    expect(before.some(row => row.domain === '127.0.0.1' && row.endMs === null)).toBe(true);
    await page.waitForTimeout(2500);
    await page.goto('about:blank');
    const readForcedSeconds = () => worker.evaluate(async () => {
      const data = await chrome.storage.local.get(['usage_segments_v1', 'forced_use_contributions_v1']);
      const raw = Object.values(data.usage_segments_v1 || {}).filter(row => row.domain === '127.0.0.1'
        && row.channel === 'active');
      const derived = Object.values(data.forced_use_contributions_v1?.bySegment || {});
      return raw.length > 0 ? derived.reduce((sum, row) => sum + row.seconds, 0) : 0;
    });
    await expect.poll(readForcedSeconds, { timeout: 10000 }).toBeGreaterThan(0);
    const forcedSeconds = await readForcedSeconds();
    await worker.evaluate(id => forcedUseOpenWindow(id), tabId);
    await expect(page.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
    await page.goto(`${url}normal`);
    await page.bringToFront();
    await worker.evaluate(async id => {
      const tab = await chrome.tabs.get(id);
      await chrome.windows.update(tab.windowId, { state: 'normal', focused: true });
    }, tabId);
    await expect.poll(async () => worker.evaluate(async id => {
      const tab = await chrome.tabs.get(id);
      const window = await chrome.windows.get(tab.windowId);
      return window.focused === true && window.state !== 'minimized';
    }, tabId), { timeout: 10000 }).toBe(true);
    await worker.evaluate(id => forcedUseRecheck(id), tabId);
    await expect.poll(async () => worker.evaluate(async () => (await chrome.storage.session.get('forced_use_prompt_state_v1'))
      .forced_use_prompt_state_v1?.grants?.filter(row => row.domain === '127.0.0.1' && row.endMs == null).length || 0)).toBe(0);
    try {
      await expect.poll(async () => worker.evaluate(async () => {
        const session = (await chrome.storage.session.get('session_v1')).session_v1;
        return session?.state === 'ACTIVE' && session?.domain === '127.0.0.1' && !!session.startTime;
      }), { timeout: 10000 }).toBe(true);
    } catch (error) {
      const navigationDiagnostic = await worker.evaluate(async id => {
        const session = (await chrome.storage.session.get('session_v1')).session_v1;
        const tab = await chrome.tabs.get(id);
        const window = await chrome.windows.get(tab.windowId);
        const config = (await chrome.storage.local.get('guardian_config')).guardian_config;
        const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Shanghai' })
          .format(new Date()).toLowerCase();
        return { tabUrl: tab.url, tabActive: tab.active, windowFocused: window.focused,
          windowState: window.state, sessionState: session?.state, sessionDomain: session?.domain,
          sessionStartPresent: !!session?.startTime, studyWindows: config?.timeWindows?.daily?.[day]?.studyWindows,
          monitoringEnabled: (await chrome.storage.local.get('monitoringEnabled')).monitoringEnabled };
      }, tabId);
      console.log('Isolated normal-navigation diagnostic: ' + JSON.stringify({ pageUrl: page.url(), ...navigationDiagnostic }));
      throw error;
    }
    await page.waitForTimeout(2500);
    await page.goto('about:blank');
    await expect.poll(async () => worker.evaluate(async () => {
      const data = await chrome.storage.local.get('usage_segments_v1');
      return Object.values(data.usage_segments_v1 || {}).filter(row => row.domain === '127.0.0.1'
        && row.channel === 'active').length;
    }), { timeout: 10000 }).toBeGreaterThan(1);
    const normal = await worker.evaluate(async () => {
      const data = await chrome.storage.local.get(['usage_segments_v1', 'forced_use_contributions_v1']);
      return { raw: Object.values(data.usage_segments_v1 || {}).filter(row => row.domain === '127.0.0.1'
        && row.channel === 'active').length,
      forced: Object.values(data.forced_use_contributions_v1?.bySegment || {})
        .reduce((sum, row) => sum + row.seconds, 0) };
    });
    expect(normal.raw).toBeGreaterThan(1);
    expect(normal.forced).toBe(forcedSeconds);
    expect(errors).toEqual([]);

    const extensionPageUrl = worker.url().replace('background.js', 'privacy-consent.html');
    const evidence = await worker.evaluate(async () => {
      const data = await chrome.storage.local.get('forced_use_grant_journal_v1');
      return data.forced_use_grant_journal_v1?.grants || [];
    });
    expect(evidence.some(row => row.domain === '127.0.0.1' && row.closeIntentAt != null)).toBe(true);
    await worker.evaluate(() => chrome.storage.local.remove([
      'forced_use_confirmed_intervals_v1', 'forced_use_contributions_v1',
    ]));
    await context.close();
    const extension = path.join(fixture.directory, 'extension');
    fixture.context = await chromium.launchPersistentContext(path.join(fixture.directory, 'profile'), {
      channel: 'chromium', headless: false, timezoneId: 'Asia/Shanghai',
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
        '--autoplay-policy=no-user-gesture-required'],
    });
    const restartedProbe = await fixture.context.newPage();
    await restartedProbe.goto(extensionPageUrl);
    const restartedWorker = fixture.context.serviceWorkers()[0]
      || await fixture.context.waitForEvent('serviceworker');
    await expect.poll(() => restartedWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('forced_use_contributions_v1');
      return Object.values(data.forced_use_contributions_v1?.bySegment || {})
        .reduce((sum, row) => sum + row.seconds, 0);
    }), { timeout: 15000 }).toBe(forcedSeconds);
  } finally {
    if (fixture) await fixture.context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
