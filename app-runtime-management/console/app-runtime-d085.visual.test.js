const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = path.resolve('test-results', 'app-runtime-d085');
  await fs.mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = `${pathToFileURL(path.resolve(__dirname, 'index.html')).href}?mock=1`;
  await page.goto(url);
  assert.deepEqual((await page.locator('.nav-item').allTextContents()).map((value) => value.trim()),
    ['▥使用统计', '◈访问管理', '◎应用管理', '▣设备管理', '⚙系统管理']);
  await page.locator('[data-view="apps"]').click();
  assert.equal(await page.locator('#page-title').textContent(), '应用管理');
  assert.equal(await page.locator('[data-view-panel="apps"] .tabbar').count(), 0);
  assert.deepEqual(await page.locator('.app-category-item strong').allTextContents(),
    ['学习应用', '复合应用', '受限娱乐应用', '黑名单应用', '已使用未归类应用']);
  assert.equal(await page.locator('.app-category-item').count(), 5);
  assert.match(await page.locator('#managed-app-list').textContent(), /Visual Studio Code/);
  assert.doesNotMatch(await page.locator('body').innerText(), /runtimeIdentity|app:vscode|opaque-a/);
  await page.evaluate(() => {
    document.querySelector('[data-app-category="unclassified"]').click();
    window.scrollTo(0, 0);
  });
  assert.match(await page.locator('#managed-app-list').textContent(), /计算器/);
  assert.equal(await page.locator('#processed-history').isHidden(), false);
  await page.screenshot({ path: path.join(output, 'desktop-app-management.png'), fullPage: true });
  await page.locator('[data-app-category="blocked"]').click();
  await page.locator('#management-platform').selectOption('macos');
  assert.match(await page.locator('#managed-app-list').textContent(), /WeChat/);
  await page.locator('#app-search').fill('不存在的应用');
  assert.match(await page.locator('#managed-app-list').textContent(), /没有符合条件/);
  await page.locator('#management-platform').selectOption('');
  await page.locator('#app-search').fill('');

  await page.locator('[data-view="access"]').click();
  assert.equal(await page.locator('#page-title').textContent(), '应用访问管理');
  assert.deepEqual(await page.locator('[data-access-tab]').allTextContents(), ['时间配额', '时间段管理', '配置文件']);
  await page.locator('[data-access-tab="schedule"]').click();
  assert.equal(await page.locator('.schedule-day').count(), 7);
  assert.equal(await page.locator('.schedule-cell').count(), 28);
  assert.match(await page.locator('#outside-window-summary').textContent(), /13 分钟/);
  await page.locator('[data-schedule-start="monday|study|0"]').fill('08:00');
  await page.locator('[data-schedule-end="monday|study|0"]').fill('20:00');
  await page.locator('#save-schedule').click();
  assert.equal(await page.locator('[data-schedule-start="monday|study|0"]').inputValue(), '08:00');
  await page.screenshot({ path: path.join(output, 'desktop-access-schedule.png'), fullPage: true });

  await page.locator('[data-view="system"]').click();
  assert.deepEqual(await page.locator('[data-system-tab]').allTextContents(), ['主账本明细', '辅助媒体明细', '运行健康']);
  assert.equal(await page.locator('[data-system-panel="config"]').count(), 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-menu').click();
  await page.locator('[data-view="apps"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.app-category-nav').evaluate((element) => getComputedStyle(element).display), 'flex');
  await page.evaluate(() => {
    document.querySelector('[data-app-category="unclassified"]').click();
    window.scrollTo(0, 0);
  });
  const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map((element) => `${element.tagName}.${element.className}`) }));
  assert.equal(overflow.page, overflow.viewport, JSON.stringify(overflow));
  const layout = await page.evaluate(() => Object.fromEntries(['.app-management-shell', '.app-directory-main', '.app-directory-toolbar', '.app-directory-card', '.record-card'].map((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect(); return [selector, { left: rect.left, right: rect.right, width: rect.width }];
  })));
  assert.ok(Object.values(layout).every((rect) => rect.right <= 390.5), JSON.stringify(layout));
  await page.screenshot({ path: path.join(output, 'mobile-app-management.png') });
  await page.evaluate(() => document.querySelector('[data-view="access"]').click());
  await page.locator('[data-access-tab="schedule"]').click();
  assert.equal(await page.locator('.schedule-categories').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  await page.screenshot({ path: path.join(output, 'mobile-access-schedule.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(`App Runtime D-085 visual checks passed. Screenshots: ${output}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
