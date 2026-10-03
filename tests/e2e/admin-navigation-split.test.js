const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('Admin split navigation preserves read-only panels and independent tabs', async ({ page }) => {
  const sourceText = fs.readFileSync('extension/admin/admin.js', 'utf8');
  const source = ts.createSourceFile('admin.js', sourceText, ts.ScriptTarget.Latest, true);
  const names = ['syncRulesTabs', 'setupNavigation', 'refreshPageByNav', 'isLatestAdminRefreshRequest'];
  const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  expect(functions.length).toBe(names.length);
  let html = fs.readFileSync('extension/admin/admin.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  html = html.replace(/src="\.\.\/([^"]+)"/g, (match, file) => {
    const asset = path.join('extension', file);
    if (!fs.existsSync(asset)) return match;
    const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    return `src="data:${mime};base64,${fs.readFileSync(asset).toString('base64')}"`;
  });
  await page.setContent(html);
  await page.addScriptTag({ content: `
    ${sourceText.slice(sourceText.indexOf("let rulesActiveSection ="), sourceText.indexOf('let rulesSiteActivePolicy'))}
    let systemManagementActiveTab='device-status', adminPageRefreshSeq=0, config={};
    window.reads=0; window.failRead=false;
    async function sendMsg(){window.reads++; if(window.failRead)throw new Error('配置暂不可用');return {revision:window.reads};}
    function renderRulesPage(){syncRulesTabs(); document.getElementById('rules-mode-desc').textContent='本设备仅展示当前生效规则';document.querySelector('.rules-cloud-summary-meta').textContent='隔离只读配置 v'+config.revision;}
    function setRulesPageError(message){document.getElementById('rules-mode-desc').textContent='规则加载失败：'+message;}
    async function renderStatsPage(){} async function renderSystemManagementPage(){}
    ${functions.map(n => n.getText(source)).join('\n')}
    document.getElementById('login-screen').style.display='none';
    document.getElementById('main-screen').style.display='block';
    setupNavigation();
  ` });
  await expect(page.locator('.sidebar > .nav-item')).toHaveText(['使用分析', '访问管理', '网站管理', '系统管理']);
  await page.locator('[data-page="rules"]').click();
  await expect(page.locator('#rules-page-title')).toHaveText('访问管理');
  await expect(page.locator('[data-rules-tab]:visible')).toHaveText(['时间配额', '自主度配置', '时间段管理']);
  await expect(page.locator('[data-rules-panel="quota-management"]')).toBeVisible();
  await page.locator('[data-rules-tab="autonomy-management"]').click();
  await page.locator('[data-page="sites"]').click();
  await expect(page.locator('#rules-page-title')).toHaveText('网站管理');
  await expect(page.locator('[data-rules-tab]:visible')).toHaveText(['网站清单', '网站归类记录']);
  await expect(page.locator('[data-rules-panel="site-management"]')).toBeVisible();
  await page.locator('[data-rules-tab="classification-requests"]').click();
  await page.locator('[data-page="rules"]').click();
  await expect(page.locator('[data-rules-panel="autonomy-management"]')).toBeVisible();
  await page.locator('[data-page="sites"]').click();
  await expect(page.locator('[data-rules-panel="classification-requests"]')).toBeVisible();
  expect(await page.evaluate(() => window.reads)).toBe(4);
  await page.evaluate(() => { window.failRead=true; });
  await page.locator('[data-page="rules"]').click();
  await expect(page.locator('#rules-mode-desc')).toContainText('规则加载失败');
  await page.evaluate(() => { window.failRead=false; });
  const directory=fs.mkdtempSync(path.resolve('.tmp/admin-navigation-split-'));
  for(const [name,width,height] of [['desktop',1280,900],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    for(const section of ['rules','sites']){
      await page.locator('[data-page="'+section+'"]').click();
      const tabs=section==='rules'?['quota-management','autonomy-management','schedule-management']:['site-management','classification-requests'];
      for(const tab of tabs){
        await page.locator('[data-rules-tab="'+tab+'"]').click();
        await expect(page.locator('[data-rules-panel="'+tab+'"]')).toBeVisible();
        await expect(page.locator('[data-rules-panel="'+tab+'"] input,[data-rules-panel="'+tab+'"] select')).toHaveCount(0);
        await page.screenshot({path:path.join(directory,name+'-'+tab+'.png'),fullPage:true});
        expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      }
    }
  }
  console.log('Isolated real-markup/navigation mock evidence: '+directory);
});
