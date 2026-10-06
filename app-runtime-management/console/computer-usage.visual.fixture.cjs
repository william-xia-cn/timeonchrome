// Local-only visual fixture server: no real credentials, no external API calls.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const component=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'toc-component-visual-'));
require('./stage-management-component.cjs').stageRuntimeManagementComponent(__dirname,path.join(component,'assets'));
(async()=>{
const {mergeComputerUsage,withComputerUsageRevision,computerUsageReadPage}=await import(pathToFileURL(path.join(root,'app-runtime-management/contracts/dist/computer-usage.js')));
const day=Date.parse('2026-10-01T00:00:00+08:00');
const base={computerKey:'mock-computer',computerName:'演示电脑',revision:'mock-r1',correctionRevision:'mock-c1',settledAtMs:day+120000,complete:true,reasons:[]};
const bundle={fromDate:'2026-10-01',toDate:'2026-10-01',web:[{...base,key:'mock-web',totalMs:60000,categoriesMs:{study:60000},intervals:[{startMs:day,endMs:day+60000,creditedMs:60000,classification:'study',subjectKey:'mock-site',label:'learning.example'}]}],applications:[{...base,key:'mock-app',associationVersion:'mock-p1',totalMs:120000,categoriesMs:{composite:60000,study:60000},intervals:[{startMs:day,endMs:day+60000,classification:'composite',subjectKey:'mock-chrome',label:'Chrome',special:true},{startMs:day+60000,endMs:day+120000,classification:'study',subjectKey:'mock-excel',label:'Excel',special:false}]}]};
const snapshot=await withComputerUsageRevision(mergeComputerUsage(bundle));
const readableBundle={...bundle,web:bundle.web.map(source=>({...source,computerKey:null,sourceGroupKey:'mock-web-device',statisticsComplete:true})),applications:[...bundle.applications.map(source=>({...source,statisticsComplete:true})),{...base,key:'mock-legacy',computerKey:null,computerName:'旧版应用来源',complete:false,statisticsComplete:true,historyQuality:'bestEffort',reasons:['LEGACY_APPLICATION_BEST_EFFORT'],associationVersion:'legacy-p1',totalMs:1501,categoriesMs:{composite:1501},intervals:[{startMs:day+120000,endMs:day+121501,classification:'composite',subjectKey:'legacy-tool',label:'历史办公应用',special:false}]}]};
const readableSnapshot=await withComputerUsageRevision(mergeComputerUsage(readableBundle));
const partialSnapshot=await withComputerUsageRevision(mergeComputerUsage({...readableBundle,applications:[...readableBundle.applications,{...base,key:'mock-legacy-unavailable',computerKey:null,computerName:'不可读旧版来源',complete:false,statisticsComplete:false,historyQuality:'bestEffort',reasons:['LEGACY_APPLICATION_SOURCE_UNAVAILABLE'],associationVersion:'missing',totalMs:null,categoriesMs:{},intervals:[]}]}));
const server=http.createServer(async(req,res)=>{
const url=new URL(req.url,'http://127.0.0.1');
if(url.pathname==='/mock-v3-application'){
const current=url.searchParams.has('current');
const fixture={source:'application',durationUnit:'seconds',fromDate:'2026-10-07',toDate:'2026-10-07',
  complete:current,totalDuration:current?51:null,availableTotalDuration:current?51:null,
  days:[{date:'2026-10-07',reasonCodes:current?[]:['APPLICATION_V3_RECORDS_NOT_AVAILABLE']}],
  categories:current?[{classification:'study',duration:51}]:[],buckets:[],applications:current?[{displayName:'演示应用',classifications:['study'],duration:51}]:[],
  statistics:{producer:'native',stale:!current,computedAtMs:day,missingDates:current?[]:['2026-10-07']}};
res.setHeader('Content-Type','text/html; charset=utf-8');
res.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app-runtime-management/console/app-runtime.css"><link rel="stylesheet" href="/app-runtime-management/console/app-runtime-v2.css"><title>隔离新版应用统计</title></head><body><main class="computer-view" id="fixture"></main><script src="/app-runtime-management/console/computer-usage-view.js"></script><script>document.getElementById("fixture").innerHTML=ComputerUsageView.independentSummary('+JSON.stringify(fixture)+');</script></body></html>');return;
}
if(url.pathname.startsWith('/runtime-management-component/')){
const name=url.pathname.slice('/runtime-management-component/'.length);
if(!/^[a-z0-9-]+\.(js|css|json)$/.test(name)){res.writeHead(404);res.end();return;}
const asset=path.join(component,'assets',name);if(!fs.existsSync(asset)){res.writeHead(404);res.end();return;}
res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(asset));return;
}
if(url.pathname==='/mock-computer-usage'){
const data=url.searchParams.has('mapped')?snapshot:url.searchParams.has('partial')?partialSnapshot:readableSnapshot;
const detail=url.searchParams.get('detail')||'summary';try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(computerUsageReadPage(data,detail,url.searchParams.get('revision')||undefined,Number(url.searchParams.get('offset')||0),100,url.searchParams.get('product')||undefined)));}catch{res.writeHead(409);res.end('{}');}return;
}
const publicPath=url.pathname.startsWith('/assets/')?'/pages'+url.pathname:url.pathname;
const file=path.resolve(root,'.'+decodeURIComponent(publicPath));
const publicRoots=[path.join(root,'pages')+path.sep,path.join(root,'app-runtime-management','console')+path.sep];
if(!publicRoots.some(prefix=>file.startsWith(prefix))||url.pathname.split('/').some(part=>part.startsWith('.'))||!['.html','.js','.css','.svg','.png','.jpg','.webp','.ico'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
let body=fs.readFileSync(file);
if(file.endsWith('console'+path.sep+'app-runtime.js'))body=String(body).replace("const $ =",'window.__mockRuntimeState=state; const $ =');
res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');
if(file.endsWith('console'+path.sep+'index.html'))body=String(body).replace('<script src="computer-usage-view.js">','<script>window.__readComputerUsageMock=async params=>(await fetch("/mock-computer-usage?"+params)).json();</script><script src="computer-usage-view.js">');
if(file===path.join(root,'pages','index.html')){
body=String(body).replace('<head>','<head><script>localStorage.setItem("toc_session",JSON.stringify({token:"isolated-mock",email:"demo@example.invalid"}));</script>');
body=body.replace("async function api(path, method='GET', body=null, conditionalHeaders=null) {",`async function api(path, method='GET', body=null, conditionalHeaders=null) {
if(path.startsWith('/app-runtime/manage/v1/')){
if(path.endsWith('/machines'))return {machines:[{id:'fixture-machine',displayName:'演示 Windows 电脑',platform:'windows',osVersion:'11',architecture:'x64',status:'online',policyState:'applied',serviceVersion:'mock-only',defaultChildId:'mock-child',desiredPolicyVersion:1,appliedPolicyVersion:1}]};
if(path.endsWith('/users'))return {users:[{localUserId:'fixture-user',displayName:'演示账户',protected:true,childId:'mock-child',policyState:'applied'}]};
if(path.includes('/app-catalog'))return {items:[],technicalItems:[],classificationRecords:{pending:[],processed:[],technical:[]}};
if(path.includes('/app-policy'))return {version:1,classifications:{},quotas:{perApplicationDailyMinutes:{}}};
if(path.includes('/shared-access-policy'))return {policy:null};
if(path.includes('/app-classification-records'))return {pending:[],processed:[],technical:[]};
if(path.includes('/application-knowledge'))return {schemaVersion:2,version:0,products:[],associations:[],bindings:[],rules:[]};
if(path.includes('/application-inventory'))return {items:[]};
if(path.includes('/logging-policy'))return {version:1,enabled:false,minLevel:'error',categories:['service'],expiresAtMs:null};
if(path.includes('/runtime-logs'))return {items:[{timestampMs:1790899200000,level:'info',category:'service',eventCode:'MOCK_READY',source:'terminal',machineName:'演示电脑',module:'service',message:'隔离夹具：服务正常'}],nextCursor:null};
if(path.includes('/segment-diagnostics'))return {items:[{startAtMs:1790899200000,endAtMs:1790899260000,durationMs:60000,displayName:'演示办公应用',applicationClassification:'study',estimated:false,mediaKind:'video',presentation:'foreground'}],hasMore:true};
return {};
}
if(path.includes('computer-usage')){const params=new URLSearchParams(path.split('?')[1]);if(params.has('source'))return {source:params.get('source'),fromDate:params.get('from'),toDate:params.get('to'),totalDurationMs:5134000,categories:[{classification:'study',durationMs:5134000}],buckets:[{startAtMs:${day},durationMs:5134000}],applications:[{displayName:'演示办公应用',classification:'study',durationMs:5134000}]};return (await fetch('/mock-computer-usage?'+params)).json();}
if(path==='/profiles')return {profiles:[{id:'mock-child',name:'演示孩子',avatar_color:'#168d72'},{id:'mock-child-b',name:'第二个孩子',avatar_color:'#168d72'}]};
if(path.endsWith('/config'))return {config:{},version:1};
if(path.includes('devices'))return {devices:[]};
if(path.includes('stats'))return {stats:[{date:'2026-10-01',hour:0,channel:'active',mode:'study',target_key:'domain:learning.example',target_classification_at_time:'study',duration_seconds:5134,managed_target_label_at_time:'演示学习网站',domain:'learning.example'}]};
return {};`);
}
res.end(body);
});
server.listen(47629,'127.0.0.1',()=>console.log('Local fixture http://127.0.0.1:47629; Ctrl-C to stop'));
})().catch(error=>{console.error(error);process.exitCode=1;});
