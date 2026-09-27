const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('Admin real markup renders weekly reminder read-only with isolated mock config', async ({ page }) => {
  const html = fs.readFileSync('extension/admin/admin.html', 'utf8');
  const source = ts.createSourceFile('admin.js', fs.readFileSync('extension/admin/admin.js', 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['getAdminRestReminderView', 'getAdminAutonomyView', 'renderAutonomySection', 'formatQuotaText'];
  const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  expect(functions.length).toBe(4);
  const panel = html.slice(html.indexOf('<div class="rules-panel" data-rules-panel="autonomy-management">'),
    html.indexOf('<div class="rules-panel" data-rules-panel="schedule-management">'));
  const styles = html.match(/<style>[\s\S]*?<\/style>/g).join('\n');
  const content = panel.replace(/src="\.\.\/([^\"]+)"/g, (_, file) => {
    const image = fs.readFileSync(path.join('extension', file)).toString('base64');
    return `src="data:image/svg+xml;base64,${image}"`;
  });
  await page.setContent(`<html><head>${styles}</head><body><main style="max-width:1100px;margin:24px auto;padding:16px">${content}</main></body></html>`);
  await page.addScriptTag({ content: `let config={restConfig:{firstReminderMinutes:120,weeklyFirstReminderMinutes:840,repeatReminderMinutes:60}};\n${functions.map(n => n.getText(source)).join('\n')}\nrenderAutonomySection();` });
  await page.locator('[data-rules-panel]').evaluate(n => n.classList.add('active'));
  const panelLocator = page.locator('[data-rules-panel="autonomy-management"]');
  await expect(panelLocator).toContainText('本周休息软配额');
  await expect(panelLocator).toContainText('14小时');
  await expect(panelLocator.locator('input,select,button')).toHaveCount(0);
  const directory = fs.mkdtempSync(path.resolve('.tmp/rest-admin-visual-'));
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  console.log(`Admin mock-render visual evidence: ${directory}`);
});
