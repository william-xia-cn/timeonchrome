import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const output = resolve('output/playwright');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route(/^https?:/, route => route.abort());
  await page.goto(pathToFileURL(resolve('pages/index.html')).href);
  await page.waitForFunction(() => !!window.TimeOnChromeDowntime);
  await page.evaluate(() => {
    showScreen('main');
    currentProfileId = 'mock-profile';
    window.initialConfig = {
      timeQuota: { accountingVersion: 1, daily: { monday: { restMinutes: 240, compositeMinutes: 60 } }, weekly: { restMinutes: 840 } },
      domainQuotas: { 'test.example': 90 }, restConfig: { firstReminderMinutes: 120, weeklyFirstReminderMinutes: 840 },
      autonomyConfig: { timeWindowAdvisoryEnabled: true, restrictedEntryConfirmationRequired: true },
    };
    window.mockServerConfig = structuredClone(initialConfig);
    window.mockVersion = 1;
    applyProfileConfigResponse({ data: structuredClone(mockServerConfig), version: mockVersion });
    document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
    document.getElementById('page-rules').classList.add('active');
    cloudRulesManagementActiveTab = 'autonomy'; syncRulesManagementTabs(); renderAutonomyPage(); renderForcedUseLimits();
    window.mockSaved = []; window.mockConfirms = []; window.mockAllowMigration = false;
    window.confirm = message => { mockConfirms.push(message); return mockAllowMigration; };
    api = async (url, method, body) => {
      if (method === 'PUT') {
        if (body.expectedVersion !== mockVersion) throw Object.assign(Error('conflict'), { status: 409, code: 'PROFILE_CONFIG_VERSION_CONFLICT' });
        mockSaved.push(structuredClone(body));
        mockServerConfig = { ...mockServerConfig, ...structuredClone(body.data) };
        mockVersion++;
        if (window.mockSwitchProfileOnWrite) {
          currentProfileId = 'other-profile'; remoteConfig = { otherProfile: true }; remoteConfigVersion = 99;
        }
        return { success: true, version: mockVersion };
      }
      if (window.mockReadFailure) throw Error('read unavailable');
      return { data: structuredClone(mockServerConfig), version: window.mockStaleRead ? mockVersion - 1 : mockVersion };
    };
  });
  const panel = page.locator('[data-rules-management-panel="autonomy"]');
  assert(!(await panel.innerText()).includes('软限额'));
  assert(!(await panel.innerText()).includes('软配额'));
  assert.equal(await panel.locator('input[type="number"]').count(), 1);
  assert.equal(await page.locator('#a-forced-use-enabled, #a-rest-reminder-enabled, #a-schedule-reminder-interval').count(), 0);
  assert((await page.locator('#autonomy-config-status').innerText()).includes('尚未切换'));
  await page.screenshot({ path: resolve(output, 'unified-autonomy-pending-desktop.png'), fullPage: true });
  await page.click('#save-autonomy-btn');
  assert.equal(await page.evaluate(() => mockSaved.length), 0, 'cancel migration must not write');
  assert((await page.evaluate(() => mockConfirms[0])).includes('V2'));
  for (const invalid of ['0', '1441', '1.5']) {
    await page.fill('#a-forced-use-interval', invalid); await page.click('#save-autonomy-btn');
    assert.equal(await page.evaluate(() => mockSaved.length), 0);
  }
  await page.fill('#a-forced-use-interval', '45');
  await page.locator('label[title="切换进入受限内容确认"]').click();
  await page.evaluate(() => { mockAllowMigration = true; });
  await page.click('#save-autonomy-btn');
  const migrated = await page.evaluate(() => ({ saved: mockSaved[0], current: remoteConfig, version: remoteConfigVersion,
    original: initialConfig, confirms: mockConfirms.length }));
  assert.equal(migrated.saved.data.forcedUsePolicyV1.enabled, true);
  assert.equal(migrated.saved.data.forcedUsePolicyV1.reminderIntervalMinutes, 45);
  assert.equal(migrated.saved.data.timeQuota.accountingVersion, 2);
  assert.deepEqual(migrated.saved.data.timeQuota.daily, migrated.original.timeQuota.daily);
  assert.deepEqual(migrated.saved.data.timeQuota.weekly, migrated.original.timeQuota.weekly);
  assert.equal(migrated.saved.data.restConfig, undefined);
  assert.deepEqual(migrated.current.restConfig, migrated.original.restConfig);
  assert.deepEqual(migrated.current.domainQuotas, migrated.original.domainQuotas);
  assert.equal(migrated.version, 2);
  assert((await page.locator('#autonomy-config-status').innerText()).includes('统一规则已保存'));
  assert((await page.locator('#autonomy-summary-reminder').innerText()).includes('45分钟'));
  await page.locator('#toast').waitFor({ state: 'hidden' });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#forced-use-autonomy-card').scrollIntoViewIfNeeded();
    assert(await panel.evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.screenshot({ path: resolve(output, `unified-autonomy-${name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '强制限制', exact: true }).click();
  await page.selectOption('#force-limit-dailyRest', 'unlimited');
  await page.click('#save-forced-use-limits-btn');
  const final = await page.evaluate(() => ({ current: remoteConfig, confirms: mockConfirms.length, saves: mockSaved.length }));
  assert.equal(final.saves, 2);
  assert.equal(final.confirms, migrated.confirms, 'already migrated config must not ask for another migration');
  assert.equal(final.current.forcedUsePolicyV1.quotaOverrunMinutes.dailyRest, null);
  assert.equal(final.current.forcedUsePolicyV1.reminderIntervalMinutes, 45);
  assert.equal(final.current.timeQuota.weekly.restMinutes, 840);
  await page.getByRole('button', { name: '自主度配置', exact: true }).click();
  await page.fill('#a-forced-use-interval', '50');
  await page.evaluate(() => { mockReadFailure = true; });
  await page.click('#save-autonomy-btn');
  assert((await page.locator('#toast').innerText()).includes('配置已保存，但重新读取失败'));
  assert.equal(await page.evaluate(() => mockServerConfig.forcedUsePolicyV1.reminderIntervalMinutes), 50);
  assert.equal(await page.evaluate(() => remoteConfig.forcedUsePolicyV1.reminderIntervalMinutes), 45);
  await page.evaluate(() => { mockReadFailure = false; mockStaleRead = true; });
  await page.click('#save-autonomy-btn');
  assert((await page.locator('#toast').innerText()).includes('配置已保存，但重新读取失败'));
  assert.equal(await page.evaluate(() => remoteConfig.forcedUsePolicyV1.reminderIntervalMinutes), 45, 'stale read cannot replace configuration');
  await page.evaluate(() => { mockStaleRead = false; mockSwitchProfileOnWrite = true; });
  await page.click('#save-autonomy-btn');
  assert.deepEqual(await page.evaluate(() => remoteConfig), { otherProfile: true }, 'late save cannot overwrite another profile');
  console.log('Unified autonomy UI: single editor/cancel/atomic V2/limits preserved/readback/stale/profile isolation/desktop/narrow PASS');
} finally { await browser.close(); }
