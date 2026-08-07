import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const pagesRoot=resolve(root,'pages');
const output=resolve(root,'output','playwright');
mkdirSync(output,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
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
    if(url.pathname==='/profiles')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profiles:[{id:'profile-1',name:'Visual Test'}]})});
    if(url.pathname.includes('/task-runtime/v1/tasks'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tasks:[task],capabilitySummary:{canCreateTasks:true,onlineDeviceCount:1,unsupportedOnlineDevices:[]}})});
    return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  });
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/task/`,{waitUntil:'networkidle'});
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
  console.log('Task V1 cloud UI smoke PASS');
}finally{
  await browser?.close().catch(()=>{});
  await new Promise((resolveClose)=>server.close(resolveClose));
}
