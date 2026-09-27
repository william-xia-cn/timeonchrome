import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const pagesRoot=resolve(root,'pages');
const output=resolve(root,'output','playwright');
mkdirSync(output,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
function assert(value,message){if(!value)throw new Error(message);console.log('PASS '+message)}
const server=createServer((request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  const relativePath=pathname==='/'?'index.html':pathname.endsWith('/')?pathname.slice(1)+'index.html':pathname.slice(1);
  const target=normalize(join(pagesRoot,relativePath));
  if(!target.startsWith(pagesRoot)||!existsSync(target)){response.writeHead(404);response.end('Not found');return}
  response.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream'});
  response.end(readFileSync(target));
});
await new Promise((resolveListen)=>server.listen(0,'127.0.0.1',resolveListen));
const port=server.address().port;
const now=Date.now();
const task={id:'visual-task',name:'SAT Visual Test',lifecycleStatus:'open',plannedStartAt:now-60000,requiredSeconds:3600,completedSeconds:600,revision:2,resourceSpec:{hosts:['collegeboard.org','khanacademy.org'],urlRules:[{url:'https://example.com/practice',match:'exact'},{url:'https://example.com/course',match:'path_prefix'}],specialTargets:[{platform:'youtube',type:'video',canonicalTarget:'https://youtube.com/watch?v=video123'}]}};
let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1366,height:900}});
  await context.addInitScript(()=>{localStorage.setItem('toc_session',JSON.stringify({token:'visual-token',refreshToken:'visual-refresh'}));localStorage.setItem('toc_currentProfileId',JSON.stringify('profile-1'))});
  await context.route('https://guardian-api.william-xia-cn.workers.dev/**',async(route)=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/profiles')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profiles:[{id:'profile-1',name:'Visual Test'},{id:'profile-2',name:'Other Test'}]})});
    if(url.pathname.includes('/task-runtime/v1/tasks'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tasks:[task],capabilitySummary:{canCreateTasks:true,onlineDeviceCount:1,unsupportedOnlineDevices:[]}})});
    return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  });
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/task/`,{waitUntil:'networkidle'});
  const vectors=JSON.parse(readFileSync(join(root,'tests/fixtures/task-resource-canonical-v1.json'),'utf8'));
  for(const vector of vectors.cases){
    const actual=await page.evaluate(async input=>(await import('/task/resource-editor.js')).normalizeTaskResourceSpec(input),vector.input);
    assert(actual.ok&&JSON.stringify(actual.spec)===JSON.stringify(vector.expected),`shared canonical vector: ${vector.name}`);
  }
  assert(await page.locator('#active-list .resource-row').count()===5,'cloud Task card displays all five saved resources');
  const body=await page.locator('body').innerText();
  assert(['collegeboard.org','khanacademy.org','https://example.com/practice','https://example.com/course','https://youtube.com/watch?v=video123'].every((value)=>body.includes(value)),'cloud Task card shows every normalized resource value');
  await page.screenshot({path:join(output,'task-v1-cloud-desktop.png'),fullPage:true});
  await page.setViewportSize({width:430,height:900});
  await page.screenshot({path:join(output,'task-v1-cloud-narrow.png'),fullPage:true});
  await page.selectOption('#resource-kind','host');
  await page.fill('#resource-input','example.org\nwww.example.net');
  await page.click('#add-resource-btn');
  assert(await page.locator('#resource-draft-list .resource-row').count()===2,'cloud editor adds multiple domains as separate rows');
  await page.fill('#resource-input','not a host');await page.click('#add-resource-btn');assert((await page.locator('#resource-message').innerText()).includes('第 1 行'),'cloud editor identifies an invalid input line');
  await page.fill('#resource-input','www.example.org');await page.click('#add-resource-btn');assert(await page.locator('#resource-draft-list .resource-row').count()===2&&(await page.locator('#resource-message').innerText()).includes('跳过 1 个重复项'),'cloud editor skips canonical duplicates');
  await page.selectOption('#resource-kind','url');
  await page.selectOption('#url-match','path_prefix');
  await page.fill('#resource-input','https://example.org/course/?chapter=1');
  await page.click('#add-resource-btn');
  await page.selectOption('#resource-kind','youtube');
  await page.fill('#resource-input','https://www.youtube.com/playlist?list=PL123');
  await page.click('#add-resource-btn');
  assert(await page.locator('#resource-draft-list .resource-row').count()===4,'cloud editor displays host URL and YouTube draft resources separately');
  await page.screenshot({path:join(output,'task-v1-cloud-editor-narrow.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'narrow page has no horizontal overflow');
  let releaseOld;
  const held=new Promise(resolve=>releaseOld=resolve);
  let oldStarted;
  const started=new Promise(resolve=>oldStarted=resolve);
  await page.route('**/profiles/profile-1/task-runtime/v1/tasks?*',async route=>{
    oldStarted();await held;
    await route.fulfill({json:{tasks:[{...task,name:'STALE PROFILE'}],capabilitySummary:{canCreateTasks:true}}});
  });
  await page.route('**/profiles/profile-2/task-runtime/v1/tasks?*',route=>route.fulfill({json:{tasks:[],capabilitySummary:{canCreateTasks:false}}}));
  await page.click('#refresh-btn');await started;
  assert(await page.locator('#create-btn').isDisabled(),'refresh disables creation until capability is known');
  await page.selectOption('#profile-select','profile-2');
  await page.waitForFunction(()=>document.getElementById('active-list').textContent.includes('没有当前任务'));
  const oldResponse=page.waitForResponse(response=>response.url().includes('/profiles/profile-1/task-runtime/'));
  releaseOld();await oldResponse;
  await page.waitForTimeout(100);
  assert(!(await page.locator('body').innerText()).includes('STALE PROFILE')&&await page.locator('#create-btn').isDisabled(),'late previous-profile response cannot replace list or capability');
  await page.route('**/profiles/profile-2/task-runtime/v1/tasks?*',route=>route.fulfill({status:503,json:{error:'MOCK_UNAVAILABLE'}}));
  await page.click('#refresh-btn');
  await page.waitForFunction(()=>document.getElementById('capability-notice').textContent.includes('MOCK_UNAVAILABLE'));
  assert(await page.locator('#create-btn').isDisabled(),'network failure remains visible and cannot enable creation');
  await page.screenshot({path:join(output,'task-v1-cloud-error-narrow.png'),fullPage:true});
  const actionsPage=await context.newPage();
  let actionTask={...task};const actionRequests=[];
  await actionsPage.route('**/profiles/*/task-runtime/v1/tasks**',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      const body=request.postDataJSON();actionRequests.push({url:request.url(),body});
      if(request.url().endsWith('/actions')){
        assert(body.expectedRevision===actionTask.revision,'lifecycle action carries current revision');
        assert(typeof body.actionId==='string'&&body.actionId.length>20,'lifecycle action carries unique action ID');
        actionTask={...actionTask,revision:actionTask.revision+1,lifecycleStatus:{pause:'paused',resume:'open',complete:'completed',cancel:'cancelled'}[body.action]};
      }
      return route.fulfill({json:{task:actionTask}});
    }
    return route.fulfill({json:{tasks:[actionTask],capabilitySummary:{canCreateTasks:true,onlineDeviceCount:1}}});
  });
  await actionsPage.goto(`http://127.0.0.1:${port}/task/`,{waitUntil:'networkidle'});
  for(const action of ['pause','resume','complete']){
    await actionsPage.locator(`[data-action="${action}"]`).click();
    if(action==='pause')await actionsPage.locator('[data-action="resume"]').waitFor();
    if(action==='resume')await actionsPage.locator('[data-action="pause"]').waitFor();
    if(action==='complete')await actionsPage.waitForFunction(()=>document.getElementById('history-count').textContent==='(1)');
  }
  assert(await actionsPage.locator('#active-list [data-action]').count()===0&&await actionsPage.locator('#history-list [data-action]').count()===0,'completed history has no mutation or delete controls');
  actionTask={...task};await actionsPage.click('#refresh-btn');
  await actionsPage.locator('[data-action="cancel"]').click();
  await actionsPage.waitForFunction(()=>document.getElementById('history-count').textContent==='(1)');
  assert(actionTask.lifecycleStatus==='cancelled','cancel action preserves history');
  let releaseCreate,startCreate;
  const createHeld=new Promise(resolve=>releaseCreate=resolve),createStarted=new Promise(resolve=>startCreate=resolve);
  await actionsPage.route('**/profiles/profile-1/task-runtime/v1/tasks',async route=>{
    startCreate();await createHeld;await route.fulfill({json:{task:{...task,id:'created'}}});
  });
  await actionsPage.fill('#resource-input','before.example');await actionsPage.click('#add-resource-btn');
  await actionsPage.click('#create-btn');await createStarted;
  assert(await actionsPage.locator('#create-btn').isDisabled(),'creation is disabled while POST is outstanding');
  await actionsPage.selectOption('#profile-select','profile-2');
  await actionsPage.waitForFunction(()=>!document.getElementById('create-btn').disabled);
  await actionsPage.fill('#resource-input','after.example');await actionsPage.click('#add-resource-btn');
  const createResponse=actionsPage.waitForResponse(response=>response.request().method()==='POST');releaseCreate();await createResponse;
  await actionsPage.waitForTimeout(100);
  assert((await actionsPage.locator('#resource-draft-list').innerText()).includes('after.example'),'old creation response cannot clear new profile draft');
  assert(actionRequests.every(entry=>entry.url.includes('/profiles/profile-1/')),'lifecycle mutations stay on their owning profile');
  await actionsPage.close();
  const modulesPage=await context.newPage();
  await modulesPage.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  assert(await modulesPage.locator('.sidebar-nav a[href="/modules/"]').isVisible(),'desktop main navigation exposes generic module entry');
  assert(await modulesPage.locator('.sidebar-nav a[href="/task/"]').count()===0,'main navigation does not embed Task-specific entry');
  await modulesPage.locator('#toast').waitFor({state:'hidden'});
  await modulesPage.screenshot({path:join(output,'task-v1-cloud-module-navigation-desktop.png'),fullPage:true});
  await modulesPage.setViewportSize({width:430,height:900});
  await modulesPage.click('#mobile-more-btn');
  assert(await modulesPage.locator('.mobile-more-action[href="/modules/"]').isVisible(),'mobile More exposes generic module entry');
  await modulesPage.screenshot({path:join(output,'task-v1-cloud-module-navigation-narrow.png'),fullPage:true});
  await modulesPage.locator('.mobile-more-action[href="/modules/"]').click();
  await modulesPage.locator('#modules .card').waitFor();
  assert(await modulesPage.locator('#modules .card').count()===1&&await modulesPage.locator('#modules .card').getAttribute('href')==='/task/','module directory restores independent Task link');
  assert(await modulesPage.locator('main > a').getAttribute('href')==='/','module directory has return to parent console');
  await modulesPage.setViewportSize({width:1366,height:900});
  await modulesPage.screenshot({path:join(output,'task-v1-cloud-module-directory-desktop.png'),fullPage:true});
  let directoryStatus=200,directoryPayload=[];
  await modulesPage.route('**/optional-modules.json',route=>route.fulfill({status:directoryStatus,json:directoryPayload}));
  await modulesPage.reload();
  await modulesPage.waitForFunction(()=>document.getElementById('status').textContent.includes('没有可用模块'));
  assert(await modulesPage.locator('#modules .card').count()===0&&!(await modulesPage.locator('#retry').isVisible()),'empty directory is distinct from failure');
  for(const payload of [{invalid:true},[{id:'x',label:'x',description:'x',href:'https://example.com/'}],[{id:'x',label:'x',description:'x',href:'//example.com/'}],[{id:'x',label:3,description:'x',href:'/task/'}]]){
    directoryPayload=payload;await modulesPage.reload();await modulesPage.locator('#retry').waitFor();
    assert(await modulesPage.locator('#modules .card').count()===0,'invalid directory fails closed without partial cards');
  }
  directoryStatus=503;directoryPayload=[];await modulesPage.reload();await modulesPage.locator('#retry').waitFor();
  assert((await modulesPage.locator('#status').innerText()).includes('暂不可用'),'HTTP error does not masquerade as empty directory');
  directoryStatus=200;directoryPayload=[{id:'long',label:'长名称模块'.repeat(12),description:'独立边界与模块说明'.repeat(18),href:'/task/'}];
  await modulesPage.click('#retry');await modulesPage.locator('#modules .card').waitFor();
  await modulesPage.setViewportSize({width:430,height:900});
  assert(await modulesPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'long module labels remain reachable without horizontal overflow');
  await modulesPage.screenshot({path:join(output,'task-v1-cloud-module-directory-narrow.png'),fullPage:true});
  assert(!(await modulesPage.locator('#retry').isVisible()),'retry recovers a valid directory');
  await modulesPage.close();
  console.log('Task V1 cloud UI smoke PASS');
}finally{
  await browser?.close().catch(()=>{});
  await new Promise((resolveClose)=>server.close(resolveClose));
}
