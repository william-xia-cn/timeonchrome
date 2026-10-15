const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isolatedExtension } = require('./helpers/isolated-extension');

test('real unpacked advisory confirmation, refresh grant and policy revocation', async () => {
  test.setTimeout(60000);
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<html><body><h1>Isolated advisory test</h1></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let fixture;
  try {
    fixture = await isolatedExtension('schedule-advisory', `
      globalThis.advisoryRecheck = id => reevaluateTabById(id);
      globalThis.advisoryDisable = async id => {
        const config = await getConfig(); config.autonomyConfig.timeWindowAdvisoryEnabled = false;
        await saveConfig(config); await reevaluateTabById(id);
      };`);
    const { context, probe, worker, directory } = fixture;
    await context.route('https://**/*', route => route.abort());
    await probe.evaluate(async () => {
      const { DEFAULT_CONFIG, saveConfig } = await import('./infra/storage.js');
      const window = new Date().getHours() === 0 ? [{ start: '01:00', end: '02:00' }] : [{ start: '00:00', end: '01:00' }];
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      await saveConfig({ ...DEFAULT_CONFIG, mode: 'study', isInitialized: true, studyList: ['127.0.0.1'],
        compositeList: [], restrictedEntertainmentList: [], unsafeList: [],
        timeQuota: { accountingVersion: 1, weekly: { restMinutes: null }, daily: Object.fromEntries(days.map(day => [day,
          { studyMinutes: null, compositeMinutes: null, restMinutes: null, onlineMinutes: null }])) },
        timeWindows: { daily: Object.fromEntries(days.map(day => [day, { studyWindows: window, compositeWindows: window, restWindows: window }])) },
        restConfig: { firstReminderMinutes: null, weeklyFirstReminderMinutes: null },
        autonomyConfig: { timeWindowAdvisoryEnabled: true, restrictedEntryConfirmationRequired: true } });
    });
    const page = await context.newPage();
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url); await page.bringToFront();
    await expect(page.getByRole('heading', { name: '当前不是合适的使用时间段' })).toBeVisible({ timeout: 20000 });
    const input = page.getByRole('textbox', { name: '手动输入强行使用' });
    const confirm = page.getByRole('button', { name: '确认继续', exact: true });
    await expect(confirm).toBeDisabled();
    await input.fill('不适合使用'); await expect(confirm).toBeDisabled();
    expect(await input.evaluate(node => {
      const paste = new ClipboardEvent('paste', { cancelable: true, bubbles: true });
      const drop = new DragEvent('drop', { cancelable: true, bubbles: true });
      return !node.dispatchEvent(paste) && !node.dispatchEvent(drop);
    })).toBe(true);
    await page.screenshot({ path: path.join(directory, 'advisory-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(directory, 'advisory-mobile.png') });
    await input.fill('强行使用'); await confirm.click();
    await expect(page.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
    expect(page.url()).toBe(url);
    await page.reload(); await page.bringToFront();
    await expect(page.locator('h1')).toHaveText('Isolated advisory test');
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    await worker.evaluate(id => advisoryRecheck(id), tabId);
    await expect(page.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
    await worker.evaluate(id => advisoryDisable(id), tabId);
    await expect.poll(() => page.url()).toContain('study_schedule_locked');
    expect(fixture.errors).toEqual([]);
    console.log('Advisory real unpacked evidence: ' + directory);
    fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify({ isolated: true, originalLedgerNotModified: true,
      cases: ['typed_confirmation', 'paste_drop_rejected', 'refresh_grant', 'policy_revocation'], timingAccuracyNotClaimed: true }));
  } finally {
    if (fixture) await fixture.context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
