const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const artifacts=path.resolve('output/playwright/app-runtime-classification');await fs.mkdir(artifacts,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const name=viewport.width===390?'mobile':'desktop',context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Separate fixture'):dialog.accept());
   await page.route('https://**/*',route=>route.abort()); // Mock only, never production.
   await page.goto(pathToFileURL(path.resolve('app-runtime-management/console/index.html')).href+'?mock=1&inventoryFixtures=80');
   await page.waitForSelector('#app-category-nav .app-category-item',{state:'attached'});
   if(name==='mobile'){await page.click('#mobile-menu');}
   await page.click('[data-view="apps"]');
   assert.equal(await page.locator('.nav-item').count(),5);assert.equal(await page.locator('#app-category-nav button').count(),5);
   assert.equal(await page.locator('[data-view-panel="apps"] .tabbar').count(),0);
   await page.screenshot({path:path.join(artifacts,`${name}-directory.png`),fullPage:true});
   await page.click('#open-products');await page.waitForSelector('#product-dialog[open]');
   assert.match(await page.locator('#product-panel').innerText(),/Minecraft/);
   assert.match(await page.locator('#product-panel').innerText(),/完整已发现清单/);
   assert.equal(await page.locator('#product-panel .knowledge-child:checked').count(),1);
   assert.equal(await page.locator('#discovered-applications .knowledge-item').count(),80);
   await page.screenshot({path:path.join(artifacts,`${name}-products.png`)});
   const metrics=await page.locator('#product-dialog').evaluate(element=>({dialog:element.getBoundingClientRect().bottom,footer:element.querySelector('footer').getBoundingClientRect().bottom,scroll:element.querySelector('.knowledge-body').scrollHeight,client:element.querySelector('.knowledge-body').clientHeight,overflow:element.scrollWidth-element.clientWidth}));
   assert(metrics.dialog<=viewport.height+1&&metrics.footer<=viewport.height+1);assert(metrics.scroll>metrics.client);assert(metrics.overflow<=1);
   await page.selectOption('#confirm-observation','0');await page.fill('#confirm-name','Editor fixture');await page.selectOption('#confirm-type','other');await page.selectOption('#confirm-class','study');
   await page.click('#confirm-product');await page.waitForFunction(()=>document.querySelector('#confirmed-products').textContent.includes('Editor fixture'));
   assert.match(await page.locator('#product-notice').innerText(),/分类已保存/);
   await page.selectOption('#confirm-observation','6');await page.selectOption('#confirm-existing','0');await page.selectOption('#confirm-class','restrictedEntertainment');
   await page.click('#confirm-product');await page.waitForFunction(()=>document.querySelector('#confirmed-products').textContent.includes('2 个可信范围'));
   await page.locator('#confirmed-products details summary').first().click();
   assert.equal(await page.locator('[data-split-product="0"]').count(),2);
   await page.screenshot({path:path.join(artifacts,`${name}-variants.png`)});
   await page.click('[data-split-product="0"][data-split-selector="1"]');await page.waitForFunction(()=>document.querySelector('#confirmed-products').textContent.includes('Separate fixture'));
   await page.locator('#confirmed-products .knowledge-item').filter({hasText:'Separate fixture'}).locator('summary').click();
   await page.locator('#confirmed-products .knowledge-item').filter({hasText:'Separate fixture'}).locator('[data-unlink-product]').click();
   await page.waitForFunction(()=>!document.querySelector('#confirmed-products').textContent.includes('Separate fixture'));
   await page.locator('#discovered-applications .knowledge-item').last().scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(artifacts,`${name}-long-list.png`)});
   await page.fill('#product-search','受控应用夹具 80');assert.equal(await page.locator('#discovered-applications .knowledge-item:not([hidden])').count(),1);
   await page.click('#product-dialog footer [data-knowledge-close]');
   await page.click('#open-rules');await page.waitForSelector('#rule-dialog[open]');
   assert.match(await page.locator('#classification-rules').innerText(),/系统应用默认归为复合/);
   assert.match(await page.locator('#classification-rules').innerText(),/已确认的游戏、游戏平台和游戏工具默认归为受限娱乐/);
   assert.match(await page.locator('#classification-rules').innerText(),/家庭自定义规则/);
   await page.locator('#rule-dialog .knowledge-body').evaluate(element=>{element.scrollTop=0;});
   await page.screenshot({path:path.join(artifacts,`${name}-type-rule.png`)});
   await page.fill('#rule-name','Weak game clue');await page.selectOption('#rule-kind','type');await page.fill('#rule-product-name','Fixture video');await page.fill('#rule-reason','Name only, parent review required');
   await page.selectOption('#rule-class','restrictedEntertainment');await page.click('#save-rule');
   await page.waitForFunction(()=>document.querySelector('#classification-rules').textContent.includes('Weak game clue'));
   assert.match(await page.locator('#classification-rules').innerText(),/仅建议/);
   await page.screenshot({path:path.join(artifacts,`${name}-rules.png`)});
   const incoming={schemaVersion:1,version:0,products:[],rules:[{id:'fixture-import',name:'Imported suggestion',kind:'type',match:{operator:'all',conditions:[{field:'productName',value:'Unknown game'}]},exclude:[],mode:'suggestion',classification:'unclassified',type:'game',enabled:true,source:'AI-public-controlled-fixture',reason:'No family data'}],bindings:[]};
   await page.setInputFiles('#import-rules',{name:'rules.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
   await page.waitForSelector('#approve-rule-import');assert.equal(await page.locator('#rule-import-review input:checked').count(),0);
   await page.evaluate(()=>{const fixture=document.createElement('div');fixture.id='controlled-conflict-preview';fixture.innerHTML=AppRuntimeKnowledge.previewHitsHTML([{childIndex:0,displayName:'受控视频应用',platform:'windows',result:{classification:'study',status:'conflict',productId:'not-for-display',ruleIds:['not-for-display']}}],[{name:'小明'}]);document.querySelector('#rule-import-review').append(fixture);});
   assert.match(await page.locator('#controlled-conflict-preview').innerText(),/规则冲突，保留原有效分类/);
   await page.locator('#controlled-conflict-preview').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(artifacts,`${name}-import.png`)});
   await page.check('#rule-import-review input');await page.click('#approve-rule-import');await page.waitForFunction(()=>document.querySelector('#classification-rules').textContent.includes('Imported suggestion'));
   const visible=await page.locator('.knowledge-dialog[open]').innerText();assert(!/app:vscode|opaque-a|demo-a|runtimeIdentity|C:\\|S-1-5-|a{64}/.test(visible));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   await context.close();
  }
  console.log('PASS: five directories, 80-item inventory, variant split/unlink, conflict preview, scoped confirmation, selected import, scrolling and privacy (desktop/mobile)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
