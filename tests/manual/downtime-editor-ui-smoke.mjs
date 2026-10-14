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
    showScreen('main'); currentProfileId = 'fixture-downtime'; remoteConfigVersion = 7;
    remoteConfig = { downtimeConfig: TimeOnChromeDowntime.defaultConfig() };
    window.fixtureCloud = structuredClone(remoteConfig); window.fixtureVersion = 7;
    window.fixtureWrites = []; window.fixtureReadMode = 'normal';
    api = async (_path, method, body) => {
      if (method === 'PUT') {
        if (body.expectedVersion !== window.fixtureVersion) throw Object.assign(Error('conflict'), { status: 409, code: 'PROFILE_CONFIG_VERSION_CONFLICT' });
        window.fixtureWrites.push(structuredClone(body));
        window.fixtureCloud = { ...window.fixtureCloud, ...structuredClone(body.data) };
        return { version: ++window.fixtureVersion };
      }
      if (window.fixtureReadMode === 'fail') throw Error('fixture read unavailable');
      return { data: structuredClone(window.fixtureCloud), version: window.fixtureVersion + (window.fixtureReadMode === 'later' ? 1 : 0) };
    };
    document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
    document.getElementById('page-rules').classList.add('active');
    cloudRulesManagementActiveTab = 'downtime'; renderRulesManagementPage();
  });
  const group = day => page.locator(`[data-downtime-windows="${day}"]`);
  assert(await page.locator('#downtime-fields').isEnabled(), 'disabled policy remains editable');
  await page.locator('[data-downtime-add="monday"]').click();
  await group('monday').locator('[data-downtime-start]').fill('22:00');
  await group('monday').locator('[data-downtime-end]').fill('07:00');
  assert.equal(await group('monday').locator('[data-downtime-next-day]').textContent(), '次日');
  await page.locator('[data-downtime-copy="weekdays"]').click();
  assert.equal(await group('friday').locator('[data-downtime-start]').inputValue(), '22:00');
  assert.equal(await group('saturday').locator('.downtime-window').count(), 0);
  await page.locator('[data-downtime-copy="all"]').click();
  assert.equal(await group('sunday').locator('[data-downtime-start]').inputValue(), '22:00');

  await group('monday').locator('[data-downtime-start]').fill('23:00');
  await page.evaluate(() => { cloudRulesManagementActiveTab = 'autonomy'; renderRulesManagementPage(); cloudRulesManagementActiveTab = 'downtime'; renderRulesManagementPage(); });
  assert.equal(await group('monday').locator('[data-downtime-start]').inputValue(), '23:00', 'tab changes preserve draft');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-downtime-copy="weekdays"]').click();
  assert.equal(await group('tuesday').locator('[data-downtime-start]').inputValue(), '22:00');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-downtime-copy="weekdays"]').click();
  assert.equal(await group('tuesday').locator('[data-downtime-start]').inputValue(), '23:00');
  assert.equal(await group('saturday').locator('[data-downtime-start]').inputValue(), '22:00');
  await page.locator('label[title="启用停用时间"]').click();
  assert(await page.locator('#downtime-enabled').isChecked());
  await page.locator('[data-downtime-type="allowedWebsiteTypes"][value="study"]').check();
  await page.locator('#save-downtime-btn').click();
  await page.waitForFunction(() => !downtimeSaving);
  assert.equal(await page.evaluate(() => fixtureWrites.length), 1);
  assert.equal(await page.evaluate(() => fixtureWrites[0].expectedVersion), 7);
  assert.equal(await page.evaluate(() => fixtureWrites[0].data.downtimeConfig.enabled), true);

  await group('monday').locator('[data-downtime-start]').fill('21:00');
  await page.evaluate(() => { remoteConfigVersion = ++window.fixtureVersion; });
  await page.locator('#save-downtime-btn').click();
  assert.equal(await page.evaluate(() => fixtureWrites.length), 1, 'stale draft cannot overwrite cloud');
  assert((await page.locator('#downtime-config-error').textContent()).includes('云端配置已变化'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reload-downtime-btn').click();
  await page.waitForFunction(() => downtimeDraft === null);
  assert.equal(await group('monday').locator('[data-downtime-start]').inputValue(), '23:00');

  await group('monday').locator('[data-downtime-midnight]').check();
  assert(await group('monday').locator('[data-downtime-end]').isDisabled());
  assert.equal(await group('monday').locator('[data-downtime-next-day]').textContent(), '');
  await page.locator('#save-downtime-btn').click();
  await page.waitForFunction(() => !downtimeSaving);
  assert.equal(await page.evaluate(() => fixtureWrites.at(-1).data.downtimeConfig.windowsByWeekday.monday[0].end), '24:00');

  await page.locator('[data-downtime-add="tuesday"]').click();
  await page.locator('#save-downtime-btn').click();
  await page.waitForFunction(() => !downtimeSaving);
  assert.equal(await page.evaluate(() => fixtureWrites.at(-1).data.downtimeConfig.windowsByWeekday.tuesday.length), 1, 'entirely blank new row is ignored');
  await page.locator('[data-downtime-add="tuesday"]').click();
  await group('tuesday').locator('[data-downtime-start]').last().fill('10:00');
  const before = await page.evaluate(() => fixtureWrites.length);
  await page.locator('#save-downtime-btn').click();
  assert.equal(await page.evaluate(() => fixtureWrites.length), before);
  assert((await group('tuesday').locator('[data-downtime-row-error]').last().textContent()).length > 0);
  await group('tuesday').locator('[data-downtime-remove]').last().click();

  await page.evaluate(() => { window.fixtureReadMode = 'fail'; });
  await page.locator('label[title="启用停用时间"]').click();
  assert(!await page.locator('#downtime-enabled').isChecked());
  await page.locator('#save-downtime-btn').click();
  await page.waitForFunction(() => !downtimeSaving);
  assert((await page.locator('#downtime-config-error').textContent()).includes('保存已成功'));
  assert.equal(await page.evaluate(() => fixtureWrites.at(-1).data.downtimeConfig.enabled), false);
  assert(await page.locator('#downtime-fields').isEnabled());

  await page.evaluate(() => { window.fixtureReadMode = 'normal'; });
  await page.locator('#reload-downtime-btn').click();
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert(await page.locator('[data-rules-management-panel="downtime"]').evaluate(node => node.scrollWidth <= node.clientWidth), 'no panel overflow');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow');
    await page.waitForTimeout(3500);
    await page.locator('#downtime-enabled').evaluate(node => node.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: resolve(output, `downtime-editor-${name}.png`) });
    await page.locator('#reload-downtime-btn').scrollIntoViewIfNeeded();
    assert(await page.locator('#reload-downtime-btn').evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.screenshot({ path: resolve(output, `downtime-editor-${name}-save.png`) });
  }
  console.log('Downtime real page: disabled editing/copy/24:00/draft/CAS/blank/error/readback/mobile PASS');
} finally { await browser.close(); }
