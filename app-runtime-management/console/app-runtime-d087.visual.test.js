const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = path.resolve('test-results', 'app-runtime-d087');
  await fs.mkdir(output, { recursive: true });
  const unauthenticated = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await unauthenticated.goto(pathToFileURL(path.resolve(__dirname, 'index.html')).href);
  await unauthenticated.locator('[data-view="apps"]').click();
  assert.equal(await unauthenticated.locator('#load-empty-state').isVisible(), true);
  assert.match(await unauthenticated.locator('#load-empty-state').innerText(), /无法加载电脑应用管理.*从 TimeOnChrome 家长控制台.*\?mock=1/s);
  assert.equal(await unauthenticated.locator('#child-select').inputValue(), '未登录');
  assert.equal(await unauthenticated.locator('#child-select').isDisabled(), true);
  assert.equal(await unauthenticated.locator('.view:visible').count(), 0);
  assert.equal(await unauthenticated.locator('#app-category-nav').isVisible(), false);
  await unauthenticated.screenshot({ path: path.join(output, 'desktop-unauthenticated.png'), fullPage: true });
  await unauthenticated.close();

  const sso = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const sessionToken = 'A'.repeat(43);
  await sso.route('https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev/**', async (route) => {
    if (route.request().url().endsWith('/v2/auth/browser-sessions')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        token: sessionToken, tokenType: 'RuntimeSession', expiresAt: Date.now() + 8 * 3600000,
        children: [{ id: 'child-a', name: 'Child' }],
      }) });
      return;
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'mock stop after exchange' } }) });
  });
  await sso.goto(`${pathToFileURL(path.resolve(__dirname, 'index.html')).href}#ticket=header.payload.signature`);
  await sso.waitForFunction(() => sessionStorage.getItem('timeonchrome_runtime_browser_session_v1'));
  assert.equal(new URL(sso.url()).hash, '');
  const stored = await sso.evaluate(() => ({
    session: JSON.parse(sessionStorage.getItem('timeonchrome_runtime_browser_session_v1')),
    localKeys: Object.keys(localStorage),
  }));
  assert.equal(stored.session.token, sessionToken);
  assert.deepEqual(stored.localKeys.filter((key) => /runtime/i.test(key)), []);
  assert.doesNotMatch(JSON.stringify(stored), /header\.payload\.signature/);
  await sso.close();

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
  assert.deepEqual(await page.locator('[data-app-category="study"] .app-category-stat').allTextContents(),
    ['应用1', 'Windows1', 'macOS0']);
  assert.deepEqual(await page.locator('[data-app-category="unclassified"] .app-category-stat').allTextContents(),
    ['待处理1', '窗口最近 30 天']);
  assert.equal(await page.locator('[data-app-category="study"] .app-category-stat').count(), 3);
  assert.equal(await page.locator('[data-app-category="unclassified"] .app-category-stat').count(), 2);
  assert.match(await page.locator('#managed-app-list').textContent(), /OBS Studio/);
  assert.equal(await page.locator('#managed-app-list .record-actions button').count(), 5);
  assert.match(await page.locator('#managed-app-list').textContent(), /1 台电脑.*1 个本机账户/);
  assert.equal(await page.locator('#ordinary-app-count').textContent(), '1 个');
  await page.locator('[data-app-category="restrictedEntertainment"]').click();
  assert.equal(await page.locator('#game-app-count').textContent(), '3 个');
  assert.match(await page.locator('#game-app-list').textContent(), /Aimlabs.*游戏 · 受限娱乐/s);
  assert.match(await page.locator('#game-app-list').textContent(), /Game Bar.*游戏工具 · 受限娱乐/s);
  assert.match(await page.locator('#game-app-list').textContent(), /游戏默认归为受限娱乐/);
  await page.locator('[data-app-category="composite"]').click();
  assert.equal(await page.locator('#ordinary-app-count').textContent(), '1 个');
  assert.equal(await page.locator('#system-tool-count').textContent(), '2 个');
  assert.equal(await page.locator('#system-tool-group').getAttribute('open'), null);
  await page.locator('#app-search').fill('快速助手');
  await page.waitForTimeout(150);
  assert.notEqual(await page.locator('#system-tool-group').getAttribute('open'), null);
  assert.match(await page.locator('#system-tool-list').textContent(), /快速助手.*系统应用/s);
  assert.match(await page.locator('#system-tool-list').textContent(), /系统应用 · 复合/);
  assert.match(await page.locator('#system-tool-list').textContent(), /系统应用默认归为复合/);
  assert.equal(await page.locator('#system-tool-list .app-icon').first().getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('#system-tool-list .app-icon').first().evaluate((element) => getComputedStyle(element).userSelect), 'none');
  assert.match(await page.locator('#managed-app-list').textContent(), /没有符合条件的普通应用/);
  await page.screenshot({ path: path.join(output, 'desktop-system-app-search.png'), fullPage: true });
  await page.locator('#system-tool-list [data-classification="study"]').click();
  assert.match(await page.locator('#status-message').textContent(), /快速助手 分类已保存/);
  await page.locator('#app-search').fill('');
  await page.waitForTimeout(150);
  assert.doesNotMatch(await page.locator('body').innerText(), /runtimeIdentity|app:vscode|opaque-a/);
  assert.equal(await page.locator('#processed-history').isHidden(), false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'desktop-app-management.png'), fullPage: true });
  await page.locator('[data-app-category="study"]').click();
  assert.match(await page.locator('#managed-app-list').textContent(), /Visual Studio Code/);
  assert.equal(await page.locator('#system-tool-count').textContent(), '1 个');
  await page.locator('#system-tool-group summary').click();
  assert.match(await page.locator('#system-tool-list').textContent(), /快速助手/);
  assert.deepEqual(await page.locator('[data-app-category="study"] .app-category-stat').allTextContents(),
    ['应用2', 'Windows2', 'macOS0']);
  await page.locator('[data-app-category="blocked"]').click();
  await page.locator('#management-platform').selectOption('macos');
  assert.match(await page.locator('#managed-app-list').textContent(), /WeChat/);
  assert.match(await page.locator('#managed-app-list').textContent(), /最近 30 天无使用/);
  await page.locator('#app-search').fill('不存在的应用');
  await page.waitForTimeout(150);
  assert.match(await page.locator('#managed-app-list').textContent(), /没有符合条件/);
  await page.locator('#management-platform').selectOption('');
  await page.locator('#app-search').fill('');
  await page.waitForTimeout(150);

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
  assert.deepEqual(await page.locator('[data-system-tab]').allTextContents(), ['系统日志', '技术进程记录', '主账本明细', '辅助媒体明细', '运行健康']);
  assert.equal(await page.locator('[data-system-panel="config"]').count(), 0);
  assert.equal(await page.locator('.runtime-log-row').count(), 4);
  assert.match(await page.locator('#runtime-log-summary').textContent(), /error 1.*warning 1.*info 2/);
  assert.equal(await page.locator('#logging-machine').inputValue(), 'machine-a');
  assert.match(await page.locator('#remote-log-status').textContent(), /远程日志已开启/);
  assert.match(await page.locator('#remote-log-detail').textContent(), /有效至.*已生效/);
  assert.equal(await page.locator('.logging-categories input:checked').count(), 7);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#disable-remote-logging').click();
  assert.match(await page.locator('#remote-log-status').textContent(), /远程日志已关闭/);
  assert.match(await page.locator('#remote-log-detail').textContent(), /新日志不会上传/);
  await page.locator('#enable-remote-logging').click();
  assert.match(await page.locator('#remote-log-status').textContent(), /远程日志已开启/);
  assert.doesNotMatch(await page.locator('[data-system-panel="logs"]').innerText(), /app:|opaque-/);
  await page.screenshot({ path: path.join(output, 'desktop-system-logs.png'), fullPage: true });
  await page.locator('[data-system-tab="technical"]').click();
  assert.equal(await page.locator('.technical-record').count(), 2);
  assert.match(await page.locator('[data-system-panel="technical"]').innerText(), /wixstdba.*只读/s);
  assert.match(await page.locator('[data-system-panel="technical"]').innerText(), /只有技术进程或历史使用身份/);
  assert.equal(await page.locator('[data-system-panel="technical"] [data-classification]').count(), 0);
  assert.doesNotMatch(await page.locator('[data-system-panel="technical"]').innerText(), /runtimeIdentity|opaque-|app:/);
  await page.screenshot({ path: path.join(output, 'desktop-system-technical-records.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-menu').click();
  await page.locator('[data-view="apps"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.app-category-nav').evaluate((element) => getComputedStyle(element).display), 'flex');
  await page.evaluate(() => {
    document.querySelector('[data-app-category="study"]').click();
    document.querySelector('#system-tool-group').open = true;
    window.scrollTo(0, 0);
  });
  const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map((element) => `${element.tagName}.${element.className}`) }));
  assert.equal(overflow.page, overflow.viewport, JSON.stringify(overflow));
  const layout = await page.evaluate(() => Object.fromEntries(['.app-management-shell', '.app-directory-main', '.app-directory-toolbar', '.app-directory-card', '.record-card'].map((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect(); return [selector, { left: rect.left, right: rect.right, width: rect.width }];
  })));
  assert.ok(Object.values(layout).every((rect) => rect.right <= 390.5), JSON.stringify(layout));
  await page.screenshot({ path: path.join(output, 'mobile-app-management.png'), fullPage: true });
  await page.evaluate(() => document.querySelector('[data-view="system"]').click());
  await page.locator('[data-system-tab="technical"]').click();
  assert.equal(await page.locator('.technical-record').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2);
  await page.screenshot({ path: path.join(output, 'mobile-system-technical-records.png'), fullPage: true });
  await page.locator('[data-system-tab="logs"]').click();
  assert.equal(await page.locator('.remote-log-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  assert.equal(await page.locator('.runtime-log-row').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2);
  await page.screenshot({ path: path.join(output, 'mobile-system-logs.png'), fullPage: true });
  await page.evaluate(() => document.querySelector('[data-view="access"]').click());
  await page.locator('[data-access-tab="schedule"]').click();
  assert.equal(await page.locator('.schedule-categories').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  await page.screenshot({ path: path.join(output, 'mobile-access-schedule.png'), fullPage: true });
  assert.deepEqual(errors, []);

  const qualityPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const qualityErrors = [];
  qualityPage.on('pageerror', (error) => qualityErrors.push(error.message));
  await qualityPage.goto(`${pathToFileURL(path.resolve(__dirname, 'index.html')).href}?mock=1&inventoryQuality=1`);
  await qualityPage.locator('[data-view="apps"]').click();
  await qualityPage.locator('[data-app-category="composite"]').click();
  await qualityPage.locator('#app-search').fill('记事本');
  await qualityPage.waitForTimeout(150);
  assert.equal(await qualityPage.locator('#system-tool-list .product-record').count(), 1);
  assert.match(await qualityPage.locator('#system-tool-list').innerText(), /记事本.*系统应用/s);
  assert.doesNotMatch(await qualityPage.locator('#system-tool-list').innerText(), /1 个变体/);
  assert.equal(await qualityPage.locator('#system-tool-list .product-variants').count(), 0);
  await qualityPage.screenshot({ path: path.join(output, 'desktop-single-main-variant.png'), fullPage: true });
  await qualityPage.locator('[data-app-category="unclassified"]').click();
  await qualityPage.locator('#app-search').fill('LibreOffice');
  await qualityPage.waitForTimeout(150);
  assert.equal(await qualityPage.locator('#managed-app-list .product-record').count(), 1);
  assert.match(await qualityPage.locator('#managed-app-list').innerText(), /3 个变体/);
  assert.equal(await qualityPage.locator('#managed-app-list .product-variants').count(), 1);
  await qualityPage.screenshot({ path: path.join(output, 'desktop-suite-variants.png'), fullPage: true });
  await qualityPage.setViewportSize({ width: 390, height: 844 });
  await qualityPage.evaluate(() => {
    document.querySelector('#sidebar').classList.remove('open');
    document.querySelector('#mobile-backdrop').hidden = true;
  });
  await qualityPage.waitForTimeout(300);
  await qualityPage.locator('#app-search').fill('记事本');
  await qualityPage.waitForTimeout(150);
  const qualityOverflow = await qualityPage.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  assert.equal(qualityOverflow.page, qualityOverflow.viewport, JSON.stringify(qualityOverflow));
  await qualityPage.screenshot({ path: path.join(output, 'mobile-single-main-variant.png'), fullPage: true });
  assert.deepEqual(qualityErrors, []);
  await qualityPage.close();
  await browser.close();
  console.log(`App Runtime D-087 visual checks passed. Screenshots: ${output}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
