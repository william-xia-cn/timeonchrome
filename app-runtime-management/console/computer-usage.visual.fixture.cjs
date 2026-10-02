// Local-only visual fixture server: no real credentials, no external API calls.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
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
if(url.pathname==='/mock-computer-usage'){
const data=url.searchParams.has('mapped')?snapshot:url.searchParams.has('partial')?partialSnapshot:readableSnapshot;
const detail=url.searchParams.get('detail')||'summary';try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(computerUsageReadPage(data,detail,url.searchParams.get('revision')||undefined,Number(url.searchParams.get('offset')||0),100,url.searchParams.get('product')||undefined)));}catch{res.writeHead(409);res.end('{}');}return;
}
const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
const publicRoots=[path.join(root,'pages')+path.sep,path.join(root,'app-runtime-management','console')+path.sep];
if(!publicRoots.some(prefix=>file.startsWith(prefix))||url.pathname.split('/').some(part=>part.startsWith('.'))||!['.html','.js','.css','.svg','.png','.jpg','.webp','.ico'].includes(path.extname(file))){res.writeHead(404);res.end();return;}
if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
let body=fs.readFileSync(file);
if(file.endsWith('console'+path.sep+'app-runtime.js'))body=String(body).replace("const $ =",'window.__mockRuntimeState=state; const $ =');
res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css':'application/octet-stream');
if(file.endsWith('console'+path.sep+'index.html'))body=String(body).replace('<script src="computer-usage-view.js">','<script>window.__readComputerUsageMock=async params=>(await fetch("/mock-computer-usage?"+params)).json();</script><script src="computer-usage-view.js">');
if(file===path.join(root,'pages','index.html')){
body=String(body).replace('<head>','<head><script>localStorage.setItem("toc_session",JSON.stringify({token:"isolated-mock",email:"demo@example.invalid"}));</script>');
body=body.replace("async function api(path, method='GET', body=null) {",`async function api(path, method='GET', body=null) {
if(path.includes('computer-usage')){const params=new URLSearchParams(path.split('?')[1]);if(params.has('source'))return {source:params.get('source'),fromDate:params.get('from'),toDate:params.get('to'),totalDurationMs:5134000,categories:[{classification:'study',durationMs:5134000}],buckets:[{startAtMs:${day},durationMs:5134000}],applications:[{displayName:'演示办公应用',classification:'study',durationMs:5134000}]};return (await fetch('/mock-computer-usage?'+params)).json();}
if(path==='/profiles')return {profiles:[{id:'mock-child',name:'演示孩子',avatar_color:'#168d72'}]};
if(path.endsWith('/config'))return {config:{},version:1};
if(path.includes('devices'))return {devices:[]};
if(path.includes('stats'))return {stats:[{date:'2026-10-01',hour:0,channel:'active',mode:'study',target_key:'domain:learning.example',target_classification_at_time:'study',duration_seconds:5134,managed_target_label_at_time:'演示学习网站',domain:'learning.example'}]};
return {};`);
}
res.end(body);
});
server.listen(47629,'127.0.0.1',()=>console.log('Local fixture http://127.0.0.1:47629; Ctrl-C to stop'));
})().catch(error=>{console.error(error);process.exitCode=1;});
