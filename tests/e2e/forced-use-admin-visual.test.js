const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
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
