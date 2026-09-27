import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const output = resolve('output/playwright');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route(/^https?:/, route => route.abort());
  await page.goto(pathToFileURL(resolve('pages/index.html')).href);
  await page.evaluate(() => {
    showScreen('main'); currentProfileId = 'mock-profile'; remoteConfig = { restConfig: {}, autonomyConfig: {} };
    document.querySelectorAll('.page').forEach(n => n.classList.remove('active'));
    document.getElementById('page-rules').classList.add('active');
    cloudRulesManagementActiveTab = 'autonomy'; syncRulesManagementTabs(); renderAutonomyPage();
    window.mockSaved = [];
    saveProfileConfig = async data => { window.mockSaved.push(data); remoteConfig = { ...remoteConfig, ...data }; };
    api = async () => ({ data: remoteConfig, version: 1 });
  });
  assert(await page.locator('#a-rest-weekly-enabled').isChecked());
  assert.equal(await page.locator('#a-rest-weekly-hours').inputValue(), '14');
  await page.locator('label[title="切换今日休息软限额提醒"]').click();
  assert(await page.locator('#a-rest-repeat-reminder').isEnabled());
  await page.fill('#a-rest-weekly-hours', '15'); await page.fill('#a-rest-weekly-minutes', '30');
  await page.click('#save-autonomy-btn');
  assert.deepEqual(await page.evaluate(() => [mockSaved[0].restConfig.firstReminderMinutes, mockSaved[0].restConfig.weeklyFirstReminderMinutes]), [null, 930]);
  await page.fill('#a-rest-weekly-hours', '169'); await page.click('#save-autonomy-btn');
  assert.equal(await page.evaluate(() => mockSaved.length), 1);
  await page.fill('#a-rest-weekly-hours', '14'); await page.fill('#a-rest-weekly-minutes', '60'); await page.click('#save-autonomy-btn');
  assert.equal(await page.evaluate(() => mockSaved.length), 1);
  await page.fill('#a-rest-weekly-minutes', '0');
  await page.locator('label[title="切换本周休息软配额提醒"]').click();
  assert(await page.locator('#a-rest-repeat-reminder').isDisabled());
  await page.click('#save-autonomy-btn');
  assert.equal(await page.evaluate(() => mockSaved[1].restConfig.weeklyFirstReminderMinutes), null);
  const configIo = await page.evaluate(() => {
    const wrap = value => ({ app: 'TimeOnChrome', configType: 'profile-config', configVersion: 1, quota: value });
    const missing = normalizeProfileConfigImportData(wrap({}));
    const disabled = normalizeProfileConfigImportData(wrap({ restConfig: { weeklyFirstReminderMinutes: null } }));
    const enabled = normalizeProfileConfigImportData(wrap({ restConfig: { weeklyFirstReminderMinutes: 930 } }));
    const differences = buildProfileConfigImportDiffs(enabled).filter(d => d.area === 'rest-reminder' && d.key === 'weeklyFirstReminderMinutes');
    return {
      imported: [missing.restConfig.weeklyFirstReminderMinutes, disabled.restConfig.weeklyFirstReminderMinutes, enabled.restConfig.weeklyFirstReminderMinutes],
      exported: buildProfileConfigExportData().quota.restConfig.weeklyFirstReminderMinutes,
      withoutSelection: buildProfileConfigImportPayload([]).restConfig.weeklyFirstReminderMinutes,
      selected: buildProfileConfigImportPayload(differences).restConfig.weeklyFirstReminderMinutes,
      count: differences.length,
    };
  });
  assert.deepEqual(configIo, { imported: [840, null, 930], exported: null, withoutSelection: null, selected: 930, count: 1 });
  await page.locator('label[title="切换本周休息软配额提醒"]').click();
  await page.locator('label[title="切换今日休息软限额提醒"]').click();
  await page.locator('#toast').waitFor({ state: 'hidden' });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await page.locator('[data-rules-management-panel="autonomy"]').evaluate(n => n.scrollWidth <= n.clientWidth));
    await page.screenshot({ path: resolve(output, `rest-weekly-cloud-${name}.png`), fullPage: true });
  }
  console.log('Rest weekly cloud UI: independent toggles, shared interval, valid/invalid save, config IO selection, desktop/narrow PASS');
} finally { await browser.close(); }
