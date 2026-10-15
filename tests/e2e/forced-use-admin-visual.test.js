const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const ts = require('typescript');

test('Admin autonomy is four read-only sections; downtime contains no quota controls', async ({ page }) => {
  const html = fs.readFileSync('extension/admin/admin.html', 'utf8');
  const source = ts.createSourceFile('admin.js', fs.readFileSync('extension/admin/admin.js', 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['formatQuotaText','getAdminRestReminderView','getAdminAutonomyView','renderAutonomySection'];
  const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  expect(functions).toHaveLength(names.length);
  const start = html.indexOf('<div class="rules-panel" data-rules-panel="autonomy-management">');
  const end = html.indexOf('<div class="rules-panel" data-rules-panel="schedule-management">', start);
  const styles = html.match(/<style>[\s\S]*?<\/style>/g).join('\n');
  await page.setContent(`<html><head>${styles}<style>.rules-panel{display:block!important}</style></head><body><main style="max-width:1020px;margin:auto;padding:20px">${html.slice(start,end)}</main></body></html>`);
  await page.addScriptTag({ content: `
    let config = { timeQuota:{accountingVersion:2}, autonomyConfig:{timeWindowAdvisoryEnabled:true},
      forcedUsePolicyV1:{enabled:true,reminderIntervalMinutes:30,quotaOverrunMinutes:{dailyStudy:0,dailyComposite:30,dailyRest:null,dailyOnline:60,weeklyRest:90,domain:15}} };
    const readForcedUsePolicy = cfg => cfg.forcedUsePolicyV1;
    ${functions.map(n=>n.getText(source)).join('\n')}
    renderAutonomySection();
  `});
  const panel = page.locator('[data-rules-panel="autonomy-management"]');
  await expect(panel.locator('.rules-autonomy-setting')).toHaveCount(4);
  await expect(panel.locator('input,select,button')).toHaveCount(0);
  await expect(panel).toContainText('不设时间段累计使用上限');
  await expect(panel).toContainText('多个原因同时到期只确认一次');
  await expect(panel).toContainText('无限制');
  for (const [name,width,height] of [['desktop',1280,900],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`unified-autonomy-admin-${name}.png`),fullPage:true});
  }
  await page.evaluate(()=>{config.autonomyConfig.quotaOverrunConfirmationRequired=false;renderAutonomySection();});
  await expect(panel).toContainText('余量保留但不生效');
  await page.evaluate(()=>{config.timeQuota.accountingVersion=1;renderAutonomySection();});
  await expect(panel).toContainText('需要V2配额计算');
  await expect(panel.locator('details')).toHaveCount(1);
  const downtimeStart=html.indexOf('<div class="rules-panel" data-rules-panel="downtime-management">');
  expect(html.slice(downtimeStart,html.indexOf('data-rules-panel="classification-requests"',downtimeStart))).not.toContain('rules-force-limits');
});
