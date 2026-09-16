const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const output=path.resolve('output/playwright/app-runtime-inventory');
  await fs.mkdir(output,{recursive:true});
  try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
      const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.abort());
      await page.goto(pathToFileURL(path.resolve('app-runtime-management/console/index.html')).href+'?mock=1&inventoryQuality=1');
      await page.waitForSelector('#app-category-nav button',{state:'attached'});
      if(viewport.width===390)await page.click('#mobile-menu');
      await page.click('[data-view="apps"]');
      assert.equal(await page.locator('#app-category-nav button').count(),5);
      assert.equal(await page.locator('[data-view-panel="apps"] .tabbar').count(),0);
      let visible=await page.locator('#managed-app-list').innerText();
      assert.match(visible,/已安装未使用播放器/);assert(!visible.includes('隐藏组件入口'));assert(!visible.includes('弱安装候选'));
      assert.match(await page.locator('#inventory-status').innerText(),/同步中.*1\/3.*尚未验证/s);
      await page.screenshot({path:path.join(output,`${viewport.width}-primary.png`),fullPage:true});
      await page.selectOption('#directory-scope','all');
      visible=await page.locator('#managed-app-list').innerText();assert(!visible.includes('隐藏组件入口'));assert(!visible.includes('弱安装候选'));
      await page.screenshot({path:path.join(output,`${viewport.width}-all.png`),fullPage:true});
      await page.evaluate(()=>document.querySelector('[data-view="system"]').click());await page.click('[data-system-tab="technical"]');
      const technical=await page.locator('#technical-record-list').innerText();assert.match(technical,/隐藏组件入口/);assert.match(technical,/弱安装候选/);
      assert.equal(await page.locator('#technical-record-list [data-classification]').count(),0);
      await page.evaluate(()=>document.querySelector('[data-view="apps"]').click());
      await page.selectOption('#directory-scope','unused');
      await page.locator('#managed-app-list .record-card').filter({hasText:'已安装未使用播放器'}).locator('[data-classification="restrictedEntertainment"]').click();
      await page.waitForFunction(()=>document.querySelector('#status-strip').textContent.includes('分类已保存'));
      await page.click('[data-app-category="restrictedEntertainment"]');
      assert.match(await page.locator('#managed-app-list').innerText(),/已安装未使用播放器/);
      await page.click('[data-app-category="unclassified"]');await page.selectOption('#directory-scope','usage');
      assert.match(await page.locator('#managed-app-list').innerText(),/计算器/);
      assert.equal(await page.locator('#processed-history').getAttribute('open'),null);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const text=await page.locator('[data-view-panel="apps"]').innerText();assert(!/fixture:|demo-a|opaque-a|runtimeIdentity|S-1-5-|C:\\/.test(text));
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: desktop/mobile manageable inventory scopes, technical record separation, unused classification, scan progress and privacy');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
