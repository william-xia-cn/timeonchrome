// 只在本地测试服务器注入状态入口，产品脚本不增加测试接口。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {chromium}=require('@playwright/test');
const root=path.resolve('.');
const output=path.join(os.tmpdir(),'toc-classification-unified');
(async()=>{
 const server=http.createServer((req,res)=>{
  const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
   let data=fs.readFileSync(filename);
   if(filename.endsWith(path.join('console','app-runtime.js'))){
    data=String(data).replace('return {ready,refresh:', 'globalThis.__classificationTest={state,renderAppDirectory,ready}; return {ready,refresh:');
   }
   res.setHeader('content-type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html');
   res.end(data);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  fs.mkdirSync(output,{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('https://**/*',route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/app-runtime-management/console/index.html?mock=1&view=apps`);
  await page.waitForFunction(()=>Boolean(globalThis.__classificationTest));
  await page.evaluate(async()=>{
   const t=globalThis.__classificationTest;await t.ready;
   t.state.nativeDirectory=['未配置示例','既存未归类示例','学习示例','其他时间示例'].map((name,i)=>({
    target:{machineId:'isolated-machine',nativeId:'app-'+i},platform:'windows',
    presentations:[{name,origin:'scan',status:'identified'}]
   }));
   t.state.policy.nativeApplications=[['1','unclassified'],['2','study'],['3','other']].map(([i,classification])=>({
    target:{machineId:'isolated-machine',nativeId:'app-'+i},classification,specialApplication:false,dailyQuotaMinutes:null
   }));
   t.renderAppDirectory();
  });
  assert.equal(await page.locator('#app-category-nav button').count(),7);
  assert.match(await page.locator('[data-app-category="unclassified"]').innerText(),/未归类应用\s*2/);
  assert.equal(await page.locator('[data-app-category="following"]').count(),0);
  assert.equal(await page.locator('#managed-app-list [data-native-object]').count(),2);
  assert.equal(await page.locator('#managed-app-list option[value="unclassified"]').count(),0);
  assert.equal(await page.locator('#managed-app-list option[value=""]:disabled').count(),2);
  const before=await page.evaluate(()=>JSON.stringify(__classificationTest.state.policy));
  await page.screenshot({path:path.join(output,'applications-desktop.png'),fullPage:true});
  await page.click('[data-app-category="study"]');
  assert.equal(await page.locator('#managed-app-list option[value=""]').count(),0);
  assert.equal(await page.locator('#managed-app-list option[value="other"]').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify(__classificationTest.state.policy)),before);
  await page.click('[data-app-category="unclassified"]');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'applications-mobile.png'),fullPage:true});
  console.log('native-classification-view: PASS; screenshots: '+output);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
