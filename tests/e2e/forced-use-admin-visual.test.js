const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('Admin renders forced-use final limits as read-only on desktop and mobile', async ({ page }) => {
  const html = fs.readFileSync('extension/admin/admin.html', 'utf8');
  const source = ts.createSourceFile('admin.js', fs.readFileSync('extension/admin/admin.js', 'utf8'),
    ts.ScriptTarget.Latest, true);
  const names = ['formatQuotaText', 'renderDowntimeSection'];
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node)
    && names.includes(node.name?.text));
  expect(functions).toHaveLength(2);
  const start = html.indexOf('<div class="card" id="rules-force-limits-card" hidden>');
  const end = html.indexOf('<div class="card-header"><div><div class="card-title">停用时间</div>', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const card = html.slice(start, end);
  const styles = html.match(/<style>[\s\S]*?<\/style>/g).join('\n');
  await page.setContent(`<html><head>${styles}</head><body><main style="max-width:1100px;margin:24px auto;padding:16px">${card}</main></body></html>`);
  await page.addScriptTag({ content: `
    const config = { timeQuota: { accountingVersion: 2 } };
    const readForcedUsePolicy = () => ({ enabled: true, reason: 'enabled',
      quotaOverrunMinutes: { dailyStudy: 0, dailyComposite: 30, dailyRest: null,
        dailyOnline: 60, weeklyRest: 90, domain: 15 },
      advisoryWindowDailyMaxMinutes: null });
    ${functions.map(node => node.getText(source)).join('\n')}
    renderDowntimeSection();
  ` });
  const panel = page.locator('#rules-force-limits-card');
  await expect(panel).toBeVisible();
  for (const label of ['每日学习', '每日复合', '每日休息', '每日在线', '每周休息',
    '单站点', '建议时段当日强行使用', 'Native共享路径仍使用旧规则']) {
    await expect(panel).toContainText(label);
  }
  await expect(panel.locator('input,select,button')).toHaveCount(0);
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`forced-use-admin-${name}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('Admin shows one autonomy model and collapses legacy values without claiming V1 is active', async ({ page }) => {
  const html = fs.readFileSync('extension/admin/admin.html', 'utf8');
  const source = ts.createSourceFile('admin.js', fs.readFileSync('extension/admin/admin.js', 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['formatQuotaText', 'getAdminRestReminderView', 'getAdminAutonomyView', 'renderAutonomySection'];
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  expect(functions).toHaveLength(names.length);
  const start = html.indexOf('<div class="rules-panel" data-rules-panel="autonomy-management">');
  const end = html.indexOf('<div class="rules-panel" data-rules-panel="schedule-management">', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const styles = html.match(/<style>[\s\S]*?<\/style>/g).join('\n');
  const extensionRoot = path.resolve('extension');
  await page.route('http://admin.fixture/**', route => {
    const asset = path.resolve(extensionRoot, '.' + new URL(route.request().url()).pathname);
    if (!asset.startsWith(extensionRoot + path.sep) || !fs.existsSync(asset)) return route.abort();
    return route.fulfill({ body: fs.readFileSync(asset), contentType: asset.endsWith('.svg') ? 'image/svg+xml' : 'image/png' });
  });
  await page.setContent(`<html><head><base href="http://admin.fixture/admin/">${styles}<style>.rules-panel{display:block!important}</style></head><body><main style="max-width:1100px;margin:24px auto;padding:16px">${html.slice(start, end)}</main></body></html>`);
  await page.addScriptTag({ content: `
    let config = { timeQuota: { accountingVersion: 1 }, restConfig: { firstReminderMinutes: 120, weeklyFirstReminderMinutes: 840 },
      autonomyConfig: { timeWindowAdvisoryEnabled: true }, forcedUsePolicyV1: { enabled: true, reminderIntervalMinutes: 30 } };
    const readForcedUsePolicy = cfg => cfg.forcedUsePolicyV1 || { enabled: false };
    ${functions.map(node => node.getText(source)).join('\n')}
    renderAutonomySection();
  ` });
  const panel = page.locator('[data-rules-panel="autonomy-management"]');
  await expect(panel).toContainText('需要V2配额计算');
  expect(await panel.locator('details').getAttribute('open')).toBeNull();
  expect(await panel.innerText()).not.toContain('本周休息独立提醒线');
  await expect(panel.locator('input,select,button')).toHaveCount(0);
  await expect.poll(() => panel.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('autonomy-pending-desktop.png'), fullPage: true });
  await page.evaluate(() => { config.timeQuota.accountingVersion = 2; renderAutonomySection(); });
  await expect(panel).toContainText('新增30分钟网页用量');
  await expect(panel).toContainText('多个原因同时到期只确认一次');
  await expect(panel.locator('details')).toHaveCount(0);
  expect(await panel.innerText()).not.toContain('软限额');
  expect(await panel.innerText()).not.toContain('软配额');
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`unified-autonomy-admin-${name}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
