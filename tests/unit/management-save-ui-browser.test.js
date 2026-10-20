// 本地静态页面与内存配置；禁止外部网络，覆盖共享组件的两个消费者。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'app-runtime-management/console');
const {scripts,styles}=require('../../app-runtime-management/console/stage-management-component.cjs');
const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
const template=html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
(async()=>{
 const output=path.join(os.tmpdir(),'toc-management-save-visual');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  for(const embedded of [false,true]){
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='isolated.test')return route.abort();
    let rel=url.pathname.slice(1),content;
    if(rel==='runtime-management-component/manifest.json')content=JSON.stringify({schemaVersion:1,scripts,styles,template});
    else{
     const file=rel.startsWith('runtime-management-component/')?path.join(source,path.basename(rel))
      :path.join(root,rel);
     if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
     content=fs.readFileSync(file);
     if(rel==='app-runtime-management/console/index.html')content=content.toString().replace('src="app-runtime.js"','data-runtime-component="true" src="app-runtime.js"');
    }
    return route.fulfill({body:content,contentType:rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':rel.endsWith('.json')?'application/json':rel.endsWith('.svg')?'image/svg+xml':'text/html'});
   });
   await page.goto('http://isolated.test/'+(embedded?'pages/index.html':'app-runtime-management/console/index.html'));
   await page.evaluate(async embedded=>{
    const objects=['first','second'].map((nativeId,index)=>({target:{machineId:'machine-'+index,nativeId},presentations:[{name:'同名测试应用',origin:'scan'}]}));
    let policy;
    const request=async(url,options={})=>{
     if(!policy)policy=AppRuntimePolicy.defaultPolicy();
     if(url.includes('/machines'))return {machines:[{id:'machine-0',displayName:'测试电脑甲'},{id:'machine-1',displayName:'测试电脑乙'}]};
     if(url.includes('/shared-access-policy'))return {policy:null};
     if(url.includes('/applications?'))return {state:'available',childId:'fixture',policyVersion:policy.version,items:objects,nextOffset:null};
     if(url.includes('/app-policy')){
      if(options.method==='PUT'){
       const body=JSON.parse(options.body);window.testWrites.push(body);
       if(Object.keys(body).join()!=='nativeApplicationChanges')throw Error('非局部请求');
       const patch=body.nativeApplicationChanges[0],same=x=>JSON.stringify(x.target)===JSON.stringify(patch.target);
       const previous=policy.nativeApplications?.find(same)||{classification:'unclassified',specialApplication:false,dailyQuotaMinutes:null};
       policy={...policy,version:policy.version+1,nativeApplications:[...(policy.nativeApplications||[]).filter(x=>!same(x)),{...previous,...patch}]};
      }
      window.testPolicy=policy;return structuredClone(policy);
     }
     throw Error('意外请求 '+url);
    };
    window.testWrites=[];
    if(embedded){
     showScreen('main');document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
     document.getElementById('page-rules').classList.add('active');
     currentProfileId='fixture';profiles=[{id:'fixture',name:'隔离孩子'}];cloudRulesManagementActiveTab='quota';
     document.querySelectorAll('[data-rules-management-panel]').forEach(x=>x.hidden=x.dataset.rulesManagementPanel!=='quota');
     api=async(url,method,body,headers)=>request(url,{method,body:body?JSON.stringify(body):undefined,headers});
     await renderRuntimeManagement('limits');
    }else{
     window.testController=AppRuntimeManagement.mount({root:document,view:'access',children:[{id:'fixture',name:'隔离孩子'}],childId:'fixture',request});
     await window.testController.ready;
     document.querySelector('[data-access-tab="schedule"]')?.click();
    }
   },embedded);
   const scope=embedded?page.locator('#runtime-limits-host'):page.locator('body');
   // Shadow DOM locator 自动穿透；独立页点击现有“单应用限制”页签。
   if(!embedded)await page.locator('[data-access-tab="schedule"]').click();
   await scope.locator('[data-native-limit="0"]').waitFor({state:'visible'});
   assert.equal(await scope.locator('[data-native-limit]').count(),2);
   assert.match(await scope.locator('#app-quota-list').innerText(),/测试电脑甲/);
   await scope.locator('[data-native-limit="0"]').fill('25');
   await scope.locator('[data-native-limit-save="0"]').click();
   await page.waitForFunction(()=>window.testWrites.length===1);
   assert.deepEqual(await page.evaluate(()=>window.testWrites[0].nativeApplicationChanges[0]),{target:{machineId:'machine-0',nativeId:'first'},dailyQuotaMinutes:25});
   assert.equal(await page.evaluate(()=>window.testPolicy.nativeApplications[0].classification),'unclassified');
   await scope.locator('#native-limit-search').fill('不存在');
   assert.equal(await scope.locator('[data-native-limit]').count(),0);
   await scope.locator('#native-limit-search').fill('');
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:950});
    if(!embedded&&width===390)await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().right<=0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await scope.locator('#native-limits-panel').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`${embedded?'main':'runtime'}-${width}.png`),fullPage:true});
   }
   if(!embedded){
    await page.setViewportSize({width:1440,height:950});
    await page.locator('[data-view="apps"]').click();
    assert.equal(await page.locator('#directory-scope').count(),0);
    assert.equal(await page.locator('[data-native-quota]').count(),0);
    await page.locator('[data-native-class="0"]').selectOption('other');
    await page.locator('[data-native-save="0"]').click();
    await page.waitForFunction(()=>window.testWrites.length===2);
    assert.equal(await page.evaluate(()=>window.testPolicy.nativeApplications.find(x=>x.target.nativeId==='first').dailyQuotaMinutes),25);
    assert(!('dailyQuotaMinutes' in await page.evaluate(()=>window.testWrites[1].nativeApplicationChanges[0])));
   }
   await page.close();
  }
  console.log('PASS 主控制台及独立Runtime当前身份限额、局部保存、同名隔离、搜索、桌面窄屏');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
